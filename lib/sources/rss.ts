import Parser from "rss-parser";

import type { NormalizedArticleInput, SourceJournal } from "@/lib/types";
import {
  buildSourceId,
  normalizeDoi,
  parseDate,
  stripHtml,
} from "@/lib/utils";
import { enrichWithOpenAlex } from "@/lib/sources/openalex";

const parser = new Parser();

function getFirstString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function extractAuthors(item: Record<string, unknown>) {
  const candidates = [
    item.creator,
    item.author,
    item["dc:creator"],
    item["dc:creator[]"],
  ];

  const authors = candidates
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .flatMap((value) => (typeof value === "string" ? value.split(/,|;| and /i) : []))
    .map((value) => value.trim())
    .filter(Boolean);

  return Array.from(new Set(authors));
}

function extractDoi(item: Record<string, unknown>) {
  const candidates = [
    getFirstString(item.doi),
    getFirstString(item["prism:doi"]),
    getFirstString(item.guid),
    getFirstString(item.id),
    getFirstString(item.link),
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const match = candidate.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);

    if (match) {
      return normalizeDoi(match[0]);
    }
  }

  return null;
}

export async function fetchArticlesFromRss(
  journal: SourceJournal,
): Promise<NormalizedArticleInput[]> {
  if (!journal.sourceUrl) {
    return [];
  }

  const response = await fetch(journal.sourceUrl, {
    headers: {
      Accept: "application/rss+xml, application/xml, text/xml;q=0.9",
      "User-Agent": "literature-access-app/0.1",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`RSS fetch failed for ${journal.title}`);
  }

  const xml = await response.text();
  const feed = await parser.parseString(xml);
  const items = feed.items.slice(0, 18);

  return Promise.all(
    items.map(async (item) => {
      const typedItem = item as Record<string, unknown>;
      const doi = extractDoi(typedItem);
      const enrichment = await enrichWithOpenAlex(doi).catch(() => null);
      const publisherLandingUrl =
        getFirstString(typedItem.link) ??
        enrichment?.publisherLandingUrl ??
        (doi ? `https://doi.org/${doi}` : null);

      return {
        sourceId: buildSourceId([
          journal.id,
          doi,
          getFirstString(typedItem.guid),
          getFirstString(typedItem.link),
          getFirstString(typedItem.title),
        ]),
        doi: enrichment?.doi ?? doi,
        title: getFirstString(typedItem.title) ?? "Untitled article",
        abstract:
          stripHtml(getFirstString(typedItem.contentSnippet)) ??
          stripHtml(getFirstString(typedItem.content)) ??
          stripHtml(getFirstString(typedItem.summary)),
        publicationDate:
          parseDate(getFirstString(typedItem.isoDate)) ??
          parseDate(getFirstString(typedItem.pubDate)),
        authors: extractAuthors(typedItem),
        publisherLandingUrl,
        openAccessUrl: enrichment?.openAccessUrl ?? null,
        directPdfUrl: enrichment?.directPdfUrl ?? null,
        sourcePayload: JSON.stringify({
          sourceType: "rss",
          sourceUrl: journal.sourceUrl,
        }),
      };
    }),
  );
}
