use std::io::Write;
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_shell::ShellExt;

struct SidecarHandle(Arc<Mutex<Option<tauri_plugin_shell::process::CommandChild>>>);

impl Drop for SidecarHandle {
    fn drop(&mut self) {
        if let Ok(mut guard) = self.0.lock() {
            if let Some(child) = guard.take() {
                let _ = child.kill();
            }
        }
    }
}

/// Append a line to the startup log next to the database, and to stderr.
fn log(log_path: &Path, msg: &str) {
    eprintln!("[journal-stack] {msg}");
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
    {
        let _ = writeln!(f, "{msg}");
    }
}

/// Strip the Windows `\\?\` verbatim prefix and use forward slashes, so the
/// path is safe to pass to Node (its module resolver rejects `\\?\C:\...`).
fn clean_path(p: &Path) -> String {
    let s = p.to_string_lossy();
    let stripped = s.strip_prefix(r"\\?\").unwrap_or(&s);
    stripped.replace('\\', "/")
}

#[derive(Debug, PartialEq)]
enum Navigation {
    Stay,
    OpenInBrowser,
    Block,
}

/// Keep internal URLs (Tauri protocol + our loopback server) inside the
/// webview and send http(s) links to the OS browser. Anything else is blocked:
/// handing `file:`, `search-ms:`, `ms-*:` etc. to the OS can launch programs.
fn classify_navigation(url: &tauri::Url) -> Navigation {
    let host = url.host_str().unwrap_or("");
    let is_web = matches!(url.scheme(), "http" | "https");
    let is_loopback = host == "127.0.0.1" || host == "localhost" || host.ends_with(".localhost");

    if url.scheme() == "tauri" || (is_web && is_loopback) {
        Navigation::Stay
    } else if is_web {
        Navigation::OpenInBrowser
    } else {
        Navigation::Block
    }
}

fn pick_free_port() -> u16 {
    let listener = TcpListener::bind("127.0.0.1:0").expect("failed to bind for port selection");
    listener.local_addr().unwrap().port()
}

fn wait_for_server(port: u16) -> bool {
    let deadline = Instant::now() + Duration::from_secs(60);
    while Instant::now() < deadline {
        if std::net::TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    false
}

/// Run the bundled Node with the given args, blocking until it exits.
fn run_node(app: &AppHandle, log_path: &Path, label: &str, args: Vec<String>) {
    let result = tauri::async_runtime::block_on(async {
        app.shell()
            .sidecar("node")
            .expect("node sidecar not configured")
            .args(args)
            .output()
            .await
    });

    match result {
        Ok(out) if out.status.success() => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            log(log_path, &format!("{label} ok: {}", stdout.trim()));
        }
        Ok(out) => {
            log(
                log_path,
                &format!(
                    "{label} FAILED (exit {:?})\nstdout: {}\nstderr: {}",
                    out.status.code(),
                    String::from_utf8_lossy(&out.stdout).trim(),
                    String::from_utf8_lossy(&out.stderr).trim()
                ),
            );
        }
        Err(e) => log(log_path, &format!("{label} ERROR: {e}")),
    }
}

/// Kill a sidecar recorded in the PID file (an orphan from a previous run that
/// didn't exit cleanly), then remove the file. The IMAGENAME filter guards
/// against killing an unrelated process that reused the PID.
fn reap_orphan_sidecar(pid_file: &Path, log_path: &Path) {
    if let Ok(contents) = std::fs::read_to_string(pid_file) {
        if let Ok(pid) = contents.trim().parse::<u32>() {
            let _ = std::process::Command::new("taskkill")
                .args([
                    "/F",
                    "/FI",
                    &format!("PID eq {pid}"),
                    "/FI",
                    "IMAGENAME eq node.exe",
                ])
                .output();
            log(log_path, &format!("reaped orphan sidecar pid {pid}"));
        }
    }
    let _ = std::fs::remove_file(pid_file);
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();

            // ── Resolve writable data dir + log file ──────────────────────
            let data_dir: PathBuf = handle.path().app_data_dir().expect("no app data dir");
            std::fs::create_dir_all(&data_dir)?;
            let db_path = data_dir.join("dev.db");
            let log_path = data_dir.join("startup.log");

            // ── Open window immediately with the loading placeholder ──────
            let handle_for_nav = handle.clone();
            let nav_log_path = log_path.clone();
            let window = WebviewWindowBuilder::new(
                &handle,
                "main",
                WebviewUrl::App("index.html".into()),
            )
            .title("Journal Stack")
            .inner_size(1280.0, 860.0)
            .resizable(true)
            .on_navigation(move |url| match classify_navigation(url) {
                Navigation::Stay => true,
                Navigation::OpenInBrowser => {
                    let url_str = url.to_string();
                    let h = handle_for_nav.clone();
                    std::thread::spawn(move || {
                        let _ = h.opener().open_url(&url_str, None::<String>);
                    });
                    false
                }
                Navigation::Block => {
                    log(&nav_log_path, &format!("blocked non-http(s) link: {url}"));
                    false
                }
            })
            .build()
            .expect("failed to create webview window");

            // ── Do all heavy lifting off the main thread ──────────────────
            let bg_handle = handle.clone();
            std::thread::spawn(move || {
                let resource_dir =
                    bg_handle.path().resource_dir().expect("no resource dir");
                let app_dir = resource_dir.join("resources").join("app");
                let migrations_dir =
                    resource_dir.join("resources").join("migrations");
                let seed_json = resource_dir
                    .join("resources")
                    .join("seed")
                    .join("journals.example.json");

                let migrate_script =
                    clean_path(&app_dir.join("scripts").join("apply-migration.mjs"));
                let seed_script = clean_path(&app_dir.join("scripts").join("seed.mjs"));
                let server_js = clean_path(&app_dir.join("server.js"));
                let app_dir_clean = clean_path(&app_dir);

                // All paths handed to Node must have the `\\?\` prefix stripped.
                let db_str = clean_path(&db_path);
                let migrations_str = clean_path(&migrations_dir);
                let seed_str = clean_path(&seed_json);

                log(&log_path, "─── startup ───");
                log(&log_path, &format!("db: {db_str}"));
                log(&log_path, &format!("app_dir: {app_dir_clean}"));
                log(&log_path, &format!("server_js: {server_js}"));

                // Reap any sidecar orphaned by a previous unclean exit.
                let pid_file = db_path.with_file_name("sidecar.pid");
                reap_orphan_sidecar(&pid_file, &log_path);

                // Seed only when the DB is brand new (missing or empty file).
                let needs_seed = std::fs::metadata(&db_path)
                    .map(|m| m.len() == 0)
                    .unwrap_or(true);

                // Migration is idempotent → run it on every launch.
                run_node(
                    &bg_handle,
                    &log_path,
                    "migrate",
                    vec![migrate_script, db_str.clone(), migrations_str],
                );

                if needs_seed && seed_json.exists() {
                    run_node(
                        &bg_handle,
                        &log_path,
                        "seed",
                        vec![seed_script, db_str.clone(), seed_str],
                    );
                }

                // ── Spawn the Next.js standalone server ───────────────────
                let port = pick_free_port();
                log(&log_path, &format!("spawning server on port {port}"));

                match bg_handle
                    .shell()
                    .sidecar("node")
                    .expect("node sidecar not configured")
                    .args([server_js.as_str()])
                    .env("PORT", port.to_string())
                    .env("HOSTNAME", "127.0.0.1")
                    .env("DATABASE_URL", format!("file:{db_str}"))
                    .env("NODE_ENV", "production")
                    .current_dir(&app_dir)
                    .spawn()
                {
                    Ok((_, child)) => {
                        let _ = std::fs::write(&pid_file, child.pid().to_string());
                        bg_handle.manage(SidecarHandle(Arc::new(Mutex::new(Some(child)))));
                    }
                    Err(e) => {
                        log(&log_path, &format!("server spawn FAILED: {e}"));
                        return;
                    }
                }

                if wait_for_server(port) {
                    log(&log_path, "server ready, navigating");
                } else {
                    log(&log_path, "TIMEOUT waiting for server");
                }

                let url = format!("http://127.0.0.1:{port}/feed");
                let _ = window.navigate(url.parse().expect("invalid server url"));
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit = event {
                // Kill the sidecar on clean exit so it never outlives the app.
                if let Some(state) = app_handle.try_state::<SidecarHandle>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(child) = guard.take() {
                            let _ = child.kill();
                        }
                    }
                }
                if let Ok(dir) = app_handle.path().app_data_dir() {
                    let _ = std::fs::remove_file(dir.join("sidecar.pid"));
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn nav(url: &str) -> Navigation {
        classify_navigation(&tauri::Url::parse(url).unwrap())
    }

    #[test]
    fn internal_urls_stay_in_the_webview() {
        assert_eq!(nav("http://127.0.0.1:2796/feed"), Navigation::Stay);
        assert_eq!(nav("http://tauri.localhost/index.html"), Navigation::Stay);
        assert_eq!(nav("http://localhost:3000/feed"), Navigation::Stay);
        assert_eq!(nav("tauri://localhost/index.html"), Navigation::Stay);
    }

    #[test]
    fn web_links_open_in_the_browser() {
        assert_eq!(nav("https://doi.org/10.1111/puar.70149"), Navigation::OpenInBrowser);
        assert_eq!(nav("http://example.com/"), Navigation::OpenInBrowser);
        // Hosts that merely end in "localhost" are not ours.
        assert_eq!(nav("https://evillocalhost/"), Navigation::OpenInBrowser);
    }

    #[test]
    fn other_schemes_are_blocked() {
        assert_eq!(nav("file:///C:/Windows/System32/calc.exe"), Navigation::Block);
        assert_eq!(nav("file://localhost/C:/Windows/System32/calc.exe"), Navigation::Block);
        assert_eq!(nav(r"search-ms:query=invoice&crumb=location:\\evil\share"), Navigation::Block);
        assert_eq!(nav("ms-settings:privacy"), Navigation::Block);
        assert_eq!(nav("javascript:alert(1)"), Navigation::Block);
    }
}
