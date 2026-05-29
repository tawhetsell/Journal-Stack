import { db } from "@/lib/db";

export async function getJournalDirectory() {
  const journals = await db.journal.findMany({
    orderBy: [{ active: "desc" }, { title: "asc" }],
    include: {
      follow: true,
      _count: {
        select: {
          articles: true,
        },
      },
    },
  });

  return journals;
}

export async function getFollowedJournals() {
  return db.journal.findMany({
    where: {
      follow: {
        isNot: null,
      },
      active: true,
    },
    orderBy: {
      title: "asc",
    },
  });
}
