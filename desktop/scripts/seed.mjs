// First-run seed shim for the desktop app: accepts [dbPath] [seedJsonPath]
// as CLI args. Called by the Tauri Rust shell on first launch only. Uses the
// built-in node:sqlite module so no extra dependencies are bundled.
import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const dbPath = process.argv[2];
const seedJsonPath = process.argv[3];

if (!dbPath || !seedJsonPath) {
  console.error("Usage: seed.mjs <dbPath> <seedJsonPath>");
  process.exit(1);
}

const raw = await fs.readFile(path.resolve(seedJsonPath), "utf8");
const journals = JSON.parse(raw);

const db = new DatabaseSync(path.resolve(dbPath));

const upsertJournal = db.prepare(`
  INSERT INTO Journal (id, title, publisher, homepageUrl, issnPrint, issnElectronic,
    sourceType, sourceUrl, sourceConfig, active, createdAt, updatedAt)
  VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, NULL, 1,
    datetime('now'), datetime('now'))
  ON CONFLICT(title) DO UPDATE SET
    publisher = excluded.publisher,
    homepageUrl = excluded.homepageUrl,
    issnPrint = excluded.issnPrint,
    issnElectronic = excluded.issnElectronic,
    sourceType = excluded.sourceType,
    sourceUrl = excluded.sourceUrl,
    active = 1,
    updatedAt = datetime('now')
  RETURNING id
`);

const upsertFollow = db.prepare(`
  INSERT INTO FollowedJournal (id, journalId, addedAt)
  VALUES (lower(hex(randomblob(16))), ?, datetime('now'))
  ON CONFLICT(journalId) DO NOTHING
`);

for (const j of journals) {
  const row = upsertJournal.get(
    j.title ?? null,
    j.publisher ?? null,
    j.homepageUrl ?? null,
    j.issnPrint ?? null,
    j.issnElectronic ?? null,
    j.sourceType ?? "rss",
    j.sourceUrl ?? null,
  );
  if (row && j.followed) {
    upsertFollow.run(row.id);
  }
}

db.close();
console.log(`Seeded ${journals.length} journals.`);
