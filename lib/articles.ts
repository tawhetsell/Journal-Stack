import { db } from "@/lib/db";

export type FeedSort = "recent" | "viewed";

function compareArticleDates(
  left: { publicationDate: Date | null; createdAt: Date },
  right: { publicationDate: Date | null; createdAt: Date },
) {
  const leftDate = left.publicationDate ?? left.createdAt;
  const rightDate = right.publicationDate ?? right.createdAt;

  return rightDate.getTime() - leftDate.getTime();
}

export async function getFeedArticles(sortBy: FeedSort = "recent") {
  const articles = await db.article.findMany({
    where: {
      journal: {
        follow: {
          isNot: null,
        },
      },
    },
    include: {
      journal: true,
      savedArticle: true,
      _count: {
        select: {
          accessAttempts: true,
        },
      },
    },
    orderBy: [{ publicationDate: "desc" }, { createdAt: "desc" }],
    take: 80,
  });

  if (sortBy === "viewed") {
    return articles.sort((left, right) => {
      const countDelta =
        right._count.accessAttempts - left._count.accessAttempts;

      if (countDelta !== 0) {
        return countDelta;
      }

      return compareArticleDates(left, right);
    });
  }

  return articles.sort(compareArticleDates);
}

export async function getSavedArticles() {
  return db.savedArticle.findMany({
    include: {
      article: {
        include: {
          journal: true,
        },
      },
    },
    orderBy: [{ openedAt: "desc" }, { savedAt: "desc" }],
  });
}

export async function getArticleById(id: string) {
  return db.article.findUnique({
    where: { id },
    include: {
      journal: true,
      savedArticle: true,
    },
  });
}
