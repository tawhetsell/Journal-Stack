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

/// Kill `pid` if it is a Node process, and report whether anything was killed.
/// The IMAGENAME filter guards against killing an unrelated process that
/// reused the PID.
#[cfg(windows)]
fn kill_node_sidecar(pid: u32) -> bool {
    let pid_filter = format!("PID eq {pid}");
    // With /FI filters taskkill exits 0 even when nothing matched. Only its
    // success line names the PID, in every display language.
    std::process::Command::new("taskkill")
        .args([
            "/F",
            "/FI",
            pid_filter.as_str(),
            "/FI",
            "IMAGENAME eq node.exe",
        ])
        .output()
        .map(|out| String::from_utf8_lossy(&out.stdout).contains(&pid.to_string()))
        .unwrap_or(false)
}

/// Whether a `ps -o comm=` value names our sidecar. Before the server starts it
/// is plain `node` (macOS prints the full executable path, Linux just the
/// name). Once running, Next retitles the process `next-server (v…)`, which
/// Linux truncates to 15 characters.
#[cfg(any(not(windows), test))]
fn is_sidecar_command(comm: &str) -> bool {
    let comm = comm.trim();
    comm.starts_with("next-server") || comm.rsplit('/').next() == Some("node")
}

/// Kill `pid` if it is a Node process, and report whether anything was killed.
/// The command-name check guards against killing an unrelated process that
/// reused the PID.
#[cfg(not(windows))]
fn kill_node_sidecar(pid: u32) -> bool {
    let pid = pid.to_string();
    let is_node = std::process::Command::new("ps")
        .args(["-p", pid.as_str(), "-o", "comm="])
        .output()
        .map(|out| is_sidecar_command(&String::from_utf8_lossy(&out.stdout)))
        .unwrap_or(false);

    is_node
        && std::process::Command::new("kill")
            .args(["-9", pid.as_str()])
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
}

/// Kill a sidecar recorded in the PID file (an orphan from a previous run that
/// didn't exit cleanly), then remove the file. Safe only because the
/// single-instance plugin guarantees the PID cannot belong to a live copy of
/// the app.
fn reap_orphan_sidecar(pid_file: &Path, log_path: &Path) {
    if let Ok(contents) = std::fs::read_to_string(pid_file) {
        if let Ok(pid) = contents.trim().parse::<u32>() {
            if kill_node_sidecar(pid) {
                log(log_path, &format!("reaped orphan sidecar pid {pid}"));
            } else {
                log(log_path, &format!("stale sidecar pid {pid}: nothing to reap"));
            }
        }
    }
    let _ = std::fs::remove_file(pid_file);
}

/// Colour themes as (id, menu label, is dark). Must mirror `themes` in
/// lib/themes.ts; a test below fails if the two drift apart.
#[cfg(any(target_os = "macos", test))]
const THEMES: &[(&str, &str, bool)] = &[
    ("light", "Journal Stack Light", false),
    ("flexoki-light", "Flexoki Light", false),
    ("modus-operandi-tinted", "Modus Operandi Tinted", false),
    ("dark", "Journal Stack Dark", true),
    ("flexoki-dark", "Flexoki Dark", true),
    ("modus-vivendi-tinted", "Modus Vivendi Tinted", true),
];

/// The theme a fresh install starts in. Must equal `defaultTheme` in
/// lib/themes.ts; the same test checks it.
#[cfg(any(target_os = "macos", test))]
const DEFAULT_THEME: &str = "modus-operandi-tinted";

/// Journal Stack > Settings in the macOS menu bar: Appearance (the colour
/// themes) and Institution (which opens the web app's chooser).
///
/// The chosen theme is kept in settings.json next to the database, so the menu
/// can show a tick at launch and the choice never depends on the webview's own
/// storage. Menu to page: `window.journalStackSetTheme`, which the web app
/// defines (lib/themes.ts). Page to menu: the page fetches
/// `journalstack://localhost/theme/<id>` whenever its theme is set, which is
/// how the light/dark button in the page keeps the tick and the file current.
#[cfg(target_os = "macos")]
mod appearance {
    use super::{log, DEFAULT_THEME, THEMES};
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Mutex;
    use tauri::menu::{
        CheckMenuItem, CheckMenuItemBuilder, Menu, MenuItem, MenuItemKind, PredefinedMenuItem,
        Submenu,
    };
    use tauri::{AppHandle, Manager, Wry};

    const MENU_ID_PREFIX: &str = "theme:";
    const INSTITUTION_MENU_ID: &str = "institution";
    pub const SCHEME: &str = "journalstack";

    struct ThemeMenu {
        items: Vec<(&'static str, CheckMenuItem<Wry>)>,
        current: Mutex<&'static str>,
        page_has_reported: AtomicBool,
        settings_path: PathBuf,
        log_path: PathBuf,
    }

    fn known_theme(id: &str) -> Option<&'static str> {
        THEMES.iter().map(|(known, ..)| *known).find(|known| *known == id)
    }

    /// The saved theme id, or the default when nothing valid is saved. Only
    /// ids from `THEMES` are ever returned, so the result is safe to embed in
    /// a script.
    pub fn saved_theme(settings_path: &Path) -> &'static str {
        std::fs::read_to_string(settings_path)
            .ok()
            .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
            .and_then(|settings| known_theme(settings.get("theme")?.as_str()?))
            .unwrap_or(DEFAULT_THEME)
    }

    /// Runs at the start of every page load. It marks the page as running
    /// inside this shell, and on the first load of each launch copies the
    /// saved theme into the cookie the web app reads, before the page paints.
    /// Later loads leave the cookie alone so a change made during this launch
    /// sticks.
    pub fn init_script(theme: &str) -> String {
        format!(
            r#"(function () {{
  try {{
    if (location.hostname !== "127.0.0.1") return;
    window.journalStackShell = true;
    if (sessionStorage.getItem("themeSeeded")) return;
    document.cookie = "theme={theme}; path=/; max-age=31536000; samesite=lax";
    sessionStorage.setItem("themeSeeded", "1");
  }} catch (e) {{}}
}})();"#
        )
    }

    /// Make `theme` the current one: move the tick and save it. Returns false
    /// when the menu is not installed yet.
    fn record(app: &AppHandle, theme: &'static str) -> bool {
        let Some(state) = app.try_state::<ThemeMenu>() else {
            return false;
        };

        // Clicking a menu item toggles its own tick, so always set every tick
        // explicitly, even when the theme has not changed.
        for (id, item) in &state.items {
            let _ = item.set_checked(*id == theme);
        }

        let mut current = state.current.lock().unwrap_or_else(|e| e.into_inner());
        if *current != theme {
            *current = theme;
            let settings = serde_json::json!({ "theme": theme });
            if let Err(e) = std::fs::write(&state.settings_path, settings.to_string()) {
                log(&state.log_path, &format!("could not save theme: {e}"));
            }
        }
        true
    }

    /// Handles `journalstack://localhost/theme/<id>` from the page. Anything
    /// other than a known theme id is ignored.
    pub fn handle_page_request(app: &AppHandle, path: &str) -> tauri::http::StatusCode {
        let Some(theme) = path.strip_prefix("/theme/").and_then(known_theme) else {
            return tauri::http::StatusCode::NOT_FOUND;
        };
        if !record(app, theme) {
            return tauri::http::StatusCode::SERVICE_UNAVAILABLE;
        }
        if let Some(state) = app.try_state::<ThemeMenu>() {
            if !state.page_has_reported.swap(true, Ordering::Relaxed) {
                log(&state.log_path, &format!("page theme: {theme}"));
            }
        }
        tauri::http::StatusCode::NO_CONTENT
    }

    /// Add Settings > Appearance to the default menu, under the app's name.
    pub fn install(
        app: &AppHandle,
        settings_path: PathBuf,
        log_path: PathBuf,
        current: &'static str,
    ) -> tauri::Result<()> {
        let appearance = Submenu::new(app, "Appearance", true)?;
        let mut items = Vec::new();
        let mut in_dark_group = false;

        for (id, label, is_dark) in THEMES {
            if *is_dark && !in_dark_group {
                appearance.append(&PredefinedMenuItem::separator(app)?)?;
                in_dark_group = true;
            }
            let item = CheckMenuItemBuilder::with_id(format!("{MENU_ID_PREFIX}{id}"), *label)
                .checked(*id == current)
                .build(app)?;
            appearance.append(&item)?;
            items.push((*id, item));
        }

        // Opens the web app's institution chooser (components/institution.tsx).
        let institution =
            MenuItem::with_id(app, INSTITUTION_MENU_ID, "Institution…", true, None::<&str>)?;
        let settings =
            Submenu::with_items(app, "Settings", true, &[&appearance, &institution])?;

        // Keep the standard menus (Edit is what makes copy and paste work).
        let menu = Menu::default(app)?;
        if let Some(MenuItemKind::Submenu(app_menu)) = menu.items()?.into_iter().next() {
            // After "About Journal Stack" and its separator.
            app_menu.insert(&settings, 2)?;
            app_menu.insert(&PredefinedMenuItem::separator(app)?, 3)?;
        }
        app.set_menu(menu)?;

        app.manage(ThemeMenu {
            items,
            current: Mutex::new(current),
            page_has_reported: AtomicBool::new(false),
            settings_path,
            log_path,
        });

        app.on_menu_event(|app, event| {
            if event.id().as_ref() == INSTITUTION_MENU_ID {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.eval(
                        r#"window.dispatchEvent(new CustomEvent("journalstack:choose-institution"));"#,
                    );
                }
                return;
            }

            let Some(theme) = event
                .id()
                .as_ref()
                .strip_prefix(MENU_ID_PREFIX)
                .and_then(known_theme)
            else {
                return;
            };

            record(app, theme);

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.eval(format!(
                    r#"window.journalStackSetTheme && window.journalStackSetTheme("{theme}");"#
                ));
            }
        });

        Ok(())
    }
}

pub fn run() {
    let builder = tauri::Builder::default();

    // Lets the page tell the menu bar which theme is showing.
    #[cfg(target_os = "macos")]
    let builder = builder.register_uri_scheme_protocol(appearance::SCHEME, |ctx, request| {
        let status = appearance::handle_page_request(ctx.app_handle(), request.uri().path());
        tauri::http::Response::builder()
            .status(status)
            .header("Access-Control-Allow-Origin", "*")
            .body(Vec::<u8>::new())
            .expect("static response")
    });

    builder
        // Registered first, as the plugin requires. A second launch focuses
        // the running window and exits instead of starting up; without this
        // it would reap the first instance's live server via sidecar.pid.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();

            // ── Resolve writable data dir + log file ──────────────────────
            let data_dir: PathBuf = handle.path().app_data_dir().expect("no app data dir");
            std::fs::create_dir_all(&data_dir)?;
            let db_path = data_dir.join("dev.db");
            let log_path = data_dir.join("startup.log");

            // ── Settings > Appearance in the menu bar (macOS) ─────────────
            #[cfg(target_os = "macos")]
            let saved_theme = {
                let settings_path = data_dir.join("settings.json");
                let theme = appearance::saved_theme(&settings_path);
                if let Err(e) =
                    appearance::install(&handle, settings_path, log_path.clone(), theme)
                {
                    log(&log_path, &format!("settings menu FAILED: {e}"));
                }
                theme
            };

            // ── Open window immediately with the loading placeholder ──────
            let handle_for_nav = handle.clone();
            let nav_log_path = log_path.clone();
            let window_builder = WebviewWindowBuilder::new(
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
            });

            #[cfg(target_os = "macos")]
            let window_builder =
                window_builder.initialization_script(appearance::init_script(saved_theme));

            let window = window_builder
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
                    // The web app hides its own settings button when the
                    // menu bar already offers Settings.
                    .env(
                        "JOURNAL_STACK_NATIVE_SETTINGS",
                        if cfg!(target_os = "macos") { "1" } else { "0" },
                    )
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
    fn sidecar_is_recognised_before_and_after_next_retitles_it() {
        assert!(is_sidecar_command("node"));
        assert!(is_sidecar_command(
            "/Applications/Journal Stack.app/Contents/MacOS/node\n"
        ));
        assert!(is_sidecar_command("next-server (v16.4.3)"));
        assert!(is_sidecar_command("next-server (v1"));
        // An unrelated process that reused the PID must be left alone.
        assert!(!is_sidecar_command("/usr/bin/nodejs-helper"));
        assert!(!is_sidecar_command("Safari"));
        assert!(!is_sidecar_command(""));
    }

    #[test]
    fn theme_list_matches_the_web_app() {
        let web = include_str!("../../../lib/themes.ts");
        for (id, label, is_dark) in THEMES {
            let mode = if *is_dark { "dark" } else { "light" };
            let entry = format!(r#"{{ id: "{id}", label: "{label}", mode: "{mode}" }}"#);
            assert!(web.contains(&entry), "lib/themes.ts is missing {entry}");
        }
        assert_eq!(
            web.matches("{ id: \"").count(),
            THEMES.len(),
            "lib/themes.ts lists a theme that the desktop menu does not"
        );
        let default = format!(r#"defaultTheme: ThemeId = "{DEFAULT_THEME}";"#);
        assert!(web.contains(&default), "lib/themes.ts does not have {default}");
        assert!(THEMES.iter().any(|(id, ..)| *id == DEFAULT_THEME));
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
