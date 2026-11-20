// Assembles everything Tauri bundles into the desktop app:
//   desktop/resources/app         the Next.js standalone server
//   desktop/resources/migrations  SQL migrations applied on every launch
//   desktop/resources/seed        journals seeded on first launch
//   desktop/src-tauri/binaries    the Node binary that runs the server
//
// Run from anywhere after `npm run build` in the repo root:
//   node desktop/scripts/prepare-resources.mjs
//
// The Node binary that runs this script is the one that gets bundled, so run
// it with the same Node that ran `npm install` (native modules such as
// better-sqlite3 are compiled against it).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(desktopDir, "..");

const standalone = path.join(repoRoot, ".next", "standalone");
const resources = path.join(desktopDir, "resources");
const appDir = path.join(resources, "app");
const binariesDir = path.join(desktopDir, "src-tauri", "binaries");

if (!fs.existsSync(path.join(standalone, "server.js"))) {
  console.error(
    "No .next/standalone/server.js found. Run `npm run build` in the repo root first.",
  );
  process.exit(1);
}

// Symlinks are copied as the files they point to. The standalone output links
// some packages by relative path, and neither a moved bundle nor Tauri's
// resource copier can be relied on to keep those links intact.
function copyDir(from, to) {
  fs.cpSync(from, to, { recursive: true, dereference: true });
}

// Tauri names sidecar binaries after the Rust target they are built for.
function targetTriple() {
  try {
    const info = execFileSync("rustc", ["-vV"], { encoding: "utf8" });
    const host = info.match(/^host:\s*(\S+)$/m)?.[1];
    if (host) return host;
  } catch {
    // rustc is not on PATH: fall back to the platform Node reports.
  }

  const arch = { arm64: "aarch64", x64: "x86_64" }[process.arch];
  const os = {
    darwin: "apple-darwin",
    win32: "pc-windows-msvc",
    linux: "unknown-linux-gnu",
  }[process.platform];

  if (!arch || !os) {
    console.error(
      `Cannot work out the Rust target for ${process.platform}/${process.arch}. Put rustc on PATH and retry.`,
    );
    process.exit(1);
  }
  return `${arch}-${os}`;
}

// Start from a clean payload so files from an older build never linger.
fs.rmSync(resources, { recursive: true, force: true });

copyDir(standalone, appDir);
copyDir(
  path.join(repoRoot, ".next", "static"),
  path.join(appDir, ".next", "static"),
);

// public/ is optional (the repo ships without one).
const publicDir = path.join(repoRoot, "public");
if (fs.existsSync(publicDir)) {
  copyDir(publicDir, path.join(appDir, "public"));
}

copyDir(
  path.join(repoRoot, "prisma", "migrations"),
  path.join(resources, "migrations"),
);

fs.mkdirSync(path.join(resources, "seed"), { recursive: true });
fs.copyFileSync(
  path.join(repoRoot, "data", "journals.example.json"),
  path.join(resources, "seed", "journals.example.json"),
);

fs.mkdirSync(path.join(appDir, "scripts"), { recursive: true });
fs.copyFileSync(
  path.join(repoRoot, "scripts", "apply-migration.mjs"),
  path.join(appDir, "scripts", "apply-migration.mjs"),
);
fs.copyFileSync(
  path.join(desktopDir, "scripts", "seed.mjs"),
  path.join(appDir, "scripts", "seed.mjs"),
);

const extension = process.platform === "win32" ? ".exe" : "";
const nodeTarget = path.join(binariesDir, `node-${targetTriple()}${extension}`);
fs.rmSync(binariesDir, { recursive: true, force: true });
fs.mkdirSync(binariesDir, { recursive: true });
fs.copyFileSync(fs.realpathSync(process.execPath), nodeTarget);
fs.chmodSync(nodeTarget, 0o755);

console.log(`Server payload: ${path.relative(repoRoot, appDir)}`);
console.log(
  `Node ${process.version}: ${path.relative(repoRoot, nodeTarget)}`,
);
