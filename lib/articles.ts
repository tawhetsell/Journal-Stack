import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

export type FeedSort = "recent" | "viewed";

// Article View is one flat list, so it is capped overall. Journal View is
// capped per journal instead, so a busy journal cannot crowd out a quiet one.
const ARTICLE_VIEW_LIMIT = 80;
const PER_JOURNAL_LIMIT = 20;

type SortableArticle = {
  publicationDate: Date | null;
  createdAt: Date;
  _count: { accessAttempts: number };
};

function compareArticleDates(left: SortableArticle, right: SortableArticle) {
  const leftDate = left.publicationDate ?? left.createdAt;
  const rightDate = right.publicationDate ?? right.createdAt;

  return rightDate.getTime() - leftDate.getTime();
}

function compareArticles(sortBy: FeedSort) {
  return (left: SortableArticle, right: SortableArticle) => {
    if (sortBy === "viewed") {
      const countDelta =
        right._count.accessAttempts - left._count.accessAttempts;

      if (countDelta !== 0) {
        return countDelta;
      }
    }

    return compareArticleDates(left, right);
  };
}

// The database picks which rows make the cut, so "Most Viewed" ranks every
// cached article rather than only the newest ones.
function feedOrder(sortBy: FeedSort): Prisma.ArticleOrderByWithRelationInput[] {
  const byDate: Prisma.ArticleOrderByWithRelationInput[] = [
    { publicationDate: "desc" },
    { createdAt: "desc" },
  ];

  return sortBy === "viewed"
    ? [{ accessAttempts: { _count: "desc" } }, ...byDate]
    : byDate;
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
    orderBy: feedOrder(sortBy),
    take: ARTICLE_VIEW_LIMIT,
  });

  return articles.sort(compareArticles(sortBy));
}

export async function getFeedJournalGroups(sortBy: FeedSort = "recent") {
  const journals = await db.journal.findMany({
    where: {
      follow: {
        isNot: null,
      },
    },
    include: {
      _count: {
        select: {
          articles: true,
        },
      },
      articles: {
        include: {
          savedArticle: true,
          _count: {
            select: {
              accessAttempts: true,
            },
          },
        },
        orderBy: feedOrder(sortBy),
        take: PER_JOURNAL_LIMIT,
      },
    },
  });

  const compare = compareArticles(sortBy);

  return journals
    .filter((journal) => journal.articles.length > 0)
    .map(({ articles, _count, ...journal }) => ({
      journalId: journal.id,
      journalTitle: journal.title,
      totalArticles: _count.articles,
      articles: articles
        .map((article) => ({ ...article, journal }))
        .sort(compare),
    }))
    .sort((left, right) => compare(left.articles[0], right.articles[0]));
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
