import { db } from "@/lib/db";
import { fetchArticlesFromCrossref } from "@/lib/sources/crossref";
import { enrichWithOpenAlex } from "@/lib/sources/openalex";
import { fetchArticlesFromRss } from "@/lib/sources/rss";
import type { NormalizedArticleInput, SourceJournal } from "@/lib/types";
import { normalizeDoi, serializeAuthors } from "@/lib/utils";

async function fetchFromSource(journal: SourceJournal) {
  if (journal.sourceType === "crossref") {
    return fetchArticlesFromCrossref(journal);
  }

  return fetchArticlesFromRss(journal);
}

async function upsertArticle(journalId: string, article: NormalizedArticleInput) {
  const normalizedDoi = normalizeDoi(article.doi);
  const existing = await db.article.findFirst({
    where: {
      OR: [
        { sourceId: article.sourceId },
        ...(normalizedDoi ? [{ doi: normalizedDoi }] : []),
      ],
    },
  });

  const data = {
    journalId,
    sourceId: article.sourceId,
    doi: normalizedDoi,
    title: article.title,
    abstract: article.abstract,
    publicationDate: article.publicationDate,
    authorsJson: serializeAuthors(article.authors),
    publisherLandingUrl: article.publisherLandingUrl,
    openAccessUrl: article.openAccessUrl,
    directPdfUrl: article.directPdfUrl,
    sourcePayload: article.sourcePayload,
  };

  if (!existing) {
    await db.article.create({ data });
    return "created";
  }

  await db.article.update({
    where: { id: existing.id },
    data,
  });

  return "updated";
}

export async function refreshJournal(journalId: string) {
  const journal = await db.journal.findUnique({
    where: { id: journalId },
  });

  if (!journal) {
    throw new Error("Journal not found");
  }

  const items = await fetchFromSource(journal);
  let created = 0;
  let updated = 0;

  for (const item of items) {
    if (!item.sourceId) {
      continue;
    }

    const outcome = await upsertArticle(journal.id, item);
    if (outcome === "created") {
      created += 1;
    } else {
      updated += 1;
    }
  }

  return {
    journalId,
    created,
    updated,
    total: items.length,
  };
}

export async function refreshFollowedJournals(journalId?: string) {
  const journals = await db.journal.findMany({
    where: journalId
      ? { id: journalId }
      : {
          follow: {
            isNot: null,
          },
          active: true,
        },
    orderBy: { title: "asc" },
  });

  const results = [];

  for (const journal of journals) {
    try {
      results.push(await refreshJournal(journal.id));
    } catch (error) {
      results.push({
        journalId: journal.id,
        created: 0,
        updated: 0,
        total: 0,
        error: error instanceof Error ? error.message : "Refresh failed",
      });
    }
  }

  return {
    refreshedJournals: journals.length,
    results,
  };
}

export async function backfillArticleOpenAccess(articleId: string) {
  const article = await db.article.findUnique({ where: { id: articleId } });

  if (!article?.doi) {
    return null;
  }

  const enrichment = await enrichWithOpenAlex(article.doi);

  if (!enrichment) {
    return null;
  }

  return db.article.update({
    where: { id: article.id },
    data: {
      openAccessUrl: article.openAccessUrl ?? enrichment.openAccessUrl,
      directPdfUrl: article.directPdfUrl ?? enrichment.directPdfUrl,
      publisherLandingUrl:
        article.publisherLandingUrl ?? enrichment.publisherLandingUrl,
    },
  });
}
