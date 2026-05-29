import fs from "node:fs/promises";
import path from "node:path";

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const seedPath = path.join(process.cwd(), "data", "journals.example.json");
  const raw = await fs.readFile(seedPath, "utf8");
  const journals = JSON.parse(raw);

  for (const journal of journals) {
    const created = await prisma.journal.upsert({
      where: {
        title: journal.title,
      },
      update: {
        publisher: journal.publisher ?? null,
        homepageUrl: journal.homepageUrl ?? null,
        issnPrint: journal.issnPrint ?? null,
        issnElectronic: journal.issnElectronic ?? null,
        sourceType: journal.sourceType,
        sourceUrl: journal.sourceUrl ?? null,
        active: true,
      },
      create: {
        title: journal.title,
        publisher: journal.publisher ?? null,
        homepageUrl: journal.homepageUrl ?? null,
        issnPrint: journal.issnPrint ?? null,
        issnElectronic: journal.issnElectronic ?? null,
        sourceType: journal.sourceType,
        sourceUrl: journal.sourceUrl ?? null,
        active: true,
      },
    });

    if (journal.followed) {
      await prisma.followedJournal.upsert({
        where: {
          journalId: created.id,
        },
        update: {},
        create: {
          journalId: created.id,
        },
      });
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
