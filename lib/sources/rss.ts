import Parser from "rss-parser";

import type { NormalizedArticleInput, SourceJournal } from "@/lib/types";
import {
  FETCH_TIMEOUT_MS,
  buildSourceId,
  normalizeDoi,
  parseDate,
  safeHttpUrl,
  stripHtml,
} from "@/lib/utils";
import {
  enrichWithOpenAlex,
  type OpenAlexEnrichment,
} from "@/lib/sources/openalex";

// rss-parser only copies a fixed list of item fields and keeps just the first
// <dc:creator>. These custom fields expose every author element plus the DOI
// fields publishers commonly use. The explicit type arguments stop rss-parser
// from inferring an item shape out of the field names; items are read as
// untyped records below.
export type FeedRecord = Record<string, unknown>;

const parser = new Parser<FeedRecord, FeedRecord>({
  customFields: {
    item: [
      ["dc:creator", "creators", { keepArray: true }],
      ["author", "authors", { keepArray: true }],
      ["prism:doi", "prismDoi"],
      ["dc:identifier", "dcIdentifier"],
    ],
  },
});

const DOI_PATTERN = /10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i;

function getFirstString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

// xml2js gives a plain string, `{ _: text }` for an element with attributes,
// or `{ name: [text] }` for an Atom <author>.
function textOf(value: unknown): string | null {
  if (typeof value === "string") {
    return getFirstString(value);
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const name = Array.isArray(record.name) ? record.name[0] : record.name;
    return textOf(record._) ?? textOf(name);
  }

  return null;
}

function textList(value: unknown) {
  const values = Array.isArray(value) ? value : [value];
  return values.map(textOf).filter((text): text is string => text !== null);
}

// A single author element sometimes holds the whole byline.
function splitByline(value: string) {
  // Semicolon-separated lists keep "Last, First" names intact.
  if (value.includes(";")) {
    return value.split(";");
  }

  const parts = value
    .split(/,|\s+and\s+|\s+&\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
  const commaCount = value.split(",").length - 1;

  // "Smith, Jane" is one author written surname-first, not two authors.
  if (parts.length === 2 && commaCount === 1 && !/\s/.test(parts[0])) {
    return [`${parts[1]} ${parts[0]}`];
  }

  return parts;
}

function extractAuthors(item: Record<string, unknown>) {
  const creators = textList(item.creators);
  const authors = textList(item.authors);
  const names =
    creators.length > 0
      ? creators
      : authors.length > 0
        ? authors
        : textList([item.creator, item.author]);
  const unique = Array.from(new Set(names));
  // One element per author is taken as written; a lone element may be a byline.
  const split = unique.length === 1 ? splitByline(unique[0]) : unique;

  return Array.from(new Set(split.map((name) => name.trim()).filter(Boolean)));
}

function findDoi(value: unknown) {
  return getFirstString(value)?.match(DOI_PATTERN)?.[0] ?? null;
}

function urlCandidates(item: Record<string, unknown>) {
  return [item.guid, item.id, item.link];
}

// A DOI lifted out of a URL can drag along a trailing path segment or
// punctuation ("…/10.3389/fpsyg.2024.1/full").
function trimUrlDoi(doi: string) {
  return doi
    .replace(/\/(?:full|abstract|pdf|epdf|html|meta|summary)$/i, "")
    .replace(/[.,;:]+$/, "");
}

export function extractDoi(item: Record<string, unknown>) {
  // Explicit DOI fields are exact, so prefer them over anything URL-derived.
  for (const candidate of [item.prismDoi, item.dcIdentifier]) {
    const doi = findDoi(candidate);

    if (doi) {
      return normalizeDoi(doi);
    }
  }

  for (const candidate of urlCandidates(item)) {
    const doi = findDoi(candidate);

    if (doi) {
      return normalizeDoi(trimUrlDoi(doi));
    }
  }

  return null;
}

// Frozen on purpose: sourceId has always embedded the raw URL-derived DOI, and
// it is the key existing rows are matched on. Building it from the improved
// extractDoi() would change the key and duplicate every cached RSS article.
function sourceKeyDoi(item: Record<string, unknown>) {
  for (const candidate of urlCandidates(item)) {
    const doi = findDoi(candidate);

    if (doi) {
      return normalizeDoi(doi);
    }
  }

  return null;
}

// The two steps below need no network, and are kept apart from the request so
// they can be run over saved feeds (scripts/export-fixtures.ts).

// The items of a feed that the app reads: the first 18.
export async function parseFeedItems(xml: string): Promise<FeedRecord[]> {
  const feed = await parser.parseString(xml);
  return feed.items.slice(0, 18);
}

// One article from one feed item, with whatever OpenAlex added.
export function articleFromFeedItem(
  journal: Pick<SourceJournal, "id" | "sourceUrl">,
  item: FeedRecord,
  enrichment: OpenAlexEnrichment | null,
): NormalizedArticleInput {
  const doi = extractDoi(item);
  const publisherLandingUrl =
    safeHttpUrl(getFirstString(item.link)) ??
    enrichment?.publisherLandingUrl ??
    (doi ? `https://doi.org/${doi}` : null);

  return {
    sourceId: buildSourceId([
      journal.id,
      sourceKeyDoi(item),
      getFirstString(item.guid),
      getFirstString(item.link),
      getFirstString(item.title),
    ]),
    doi: enrichment?.doi ?? doi,
    title: stripHtml(getFirstString(item.title)) ?? "Untitled article",
    abstract:
      stripHtml(getFirstString(item.contentSnippet)) ??
      stripHtml(getFirstString(item.content)) ??
      stripHtml(getFirstString(item.summary)) ??
      enrichment?.abstract ??
      null,
    publicationDate:
      parseDate(getFirstString(item.isoDate)) ??
      parseDate(getFirstString(item.pubDate)),
    authors: extractAuthors(item),
    publisherLandingUrl,
    openAccessUrl: enrichment?.openAccessUrl ?? null,
    directPdfUrl: enrichment?.directPdfUrl ?? null,
    sourcePayload: JSON.stringify({
      sourceType: "rss",
      sourceUrl: journal.sourceUrl,
    }),
  };
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
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`RSS feed returned HTTP ${response.status}`);
  }

  const items = await parseFeedItems(await response.text());

  return Promise.all(
    items.map(async (item) => {
      const enrichment = await enrichWithOpenAlex(extractDoi(item)).catch(
        () => null,
      );

      return articleFromFeedItem(journal, item, enrichment);
    }),
  );
}
