import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Accept optional CLI args: apply-migration.mjs [dbPath] [migrationsDir]
// Falls back to repo-local paths so `npm run db:migrate` still works unchanged.
const dbPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, "..", "prisma", "dev.db");

const migrationsDir = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.join(__dirname, "..", "prisma", "migrations");

await fs.mkdir(path.dirname(dbPath), { recursive: true });

const migrationEntries = await fs.readdir(migrationsDir, { withFileTypes: true });
const migrationFolders = migrationEntries
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

if (migrationFolders.length === 0) {
  console.log("No migration folders found.");
  process.exit(0);
}

const database = new DatabaseSync(dbPath);

try {
  database.exec(`
    CREATE TABLE IF NOT EXISTS __manual_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  for (const folder of migrationFolders) {
    const alreadyApplied = database
      .prepare("SELECT 1 FROM __manual_migrations WHERE name = ? LIMIT 1")
      .get(folder);

    if (alreadyApplied) {
      continue;
    }

    const sql = await fs.readFile(
      path.join(migrationsDir, folder, "migration.sql"),
      "utf8",
    );

    database.exec(sql);
    database
      .prepare("INSERT INTO __manual_migrations (name) VALUES (?)")
      .run(folder);
    console.log(`Applied migration: ${folder}`);
  }
} finally {
  database.close();
}
