import type { NormalizedArticleInput, SourceJournal } from "@/lib/types";
import {
  FETCH_TIMEOUT_MS,
  buildSourceId,
  normalizeDoi,
  parseDate,
  safeHttpUrl,
  stripHtml,
} from "@/lib/utils";
import { enrichWithOpenAlex } from "@/lib/sources/openalex";

type CrossrefWork = {
  DOI?: string;
  title?: string[];
  abstract?: string;
  author?: Array<{
    given?: string;
    family?: string;
    name?: string;
  }>;
  URL?: string;
  link?: Array<{
    URL?: string;
    "content-type"?: string;
  }>;
  published?: {
    "date-parts"?: number[][];
  };
  issued?: {
    "date-parts"?: number[][];
  };
};

function buildDate(work: CrossrefWork) {
  const parts =
    work.published?.["date-parts"]?.[0] ?? work.issued?.["date-parts"]?.[0];

  if (!parts || parts.length === 0) {
    return null;
  }

  const [year, month = 1, day = 1] = parts;
  // Crossref gives a calendar date, not an instant. Noon UTC keeps it on the
  // same day in every timezone, both when displayed locally and when the
  // resolver link takes the UTC date.
  return parseDate(new Date(Date.UTC(year, month - 1, day, 12)));
}

// JATS abstracts open with a literal "Abstract" heading element.
const ABSTRACT_HEADING = /<(?:jats:)?title>\s*abstract\s*<\/(?:jats:)?title>/i;

// Publishers deposit issue furniture as ordinary journal articles.
const NON_ARTICLE_TITLE =
  /^(?:issue information|front matter|back matter|front cover|back cover|cover image|cover picture|editorial board|masthead|table of contents|contents)$/i;

function fetchWorks(issn: string) {
  return fetch(
    `https://api.crossref.org/journals/${issn}/works?filter=type:journal-article&sort=published&order=desc&rows=15`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "literature-access-app/0.1 (mailto:local-first@example.com)",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    },
  );
}

export async function fetchArticlesFromCrossref(
  journal: SourceJournal,
): Promise<NormalizedArticleInput[]> {
  const issns = [journal.issnElectronic, journal.issnPrint].filter(
    (value): value is string => Boolean(value),
  );

  if (issns.length === 0) {
    return [];
  }

  // Crossref files some journals under only one of their ISSNs (Elsevier
  // titles are known by the print ISSN alone) and answers 404 for the other.
  let issn = issns[0];
  let response = await fetchWorks(issn);

  for (const fallback of issns.slice(1)) {
    if (response.status !== 404) {
      break;
    }

    issn = fallback;
    response = await fetchWorks(issn);
  }

  if (!response.ok) {
    throw new Error(`Crossref returned HTTP ${response.status}`);
  }

  const payload = (await response.json()) as {
    message?: {
      items?: CrossrefWork[];
    };
  };

  const works = (payload.message?.items ?? []).filter(
    (work) => !NON_ARTICLE_TITLE.test(work.title?.[0]?.trim() ?? ""),
  );

  return Promise.all(
    works.map(async (work) => {
      const doi = normalizeDoi(work.DOI ?? null);
      const enrichment = await enrichWithOpenAlex(doi).catch(() => null);
      const directPdfUrl =
        safeHttpUrl(
          work.link?.find((link) => link["content-type"]?.includes("pdf"))?.URL,
        ) ??
        enrichment?.directPdfUrl ??
        null;

      return {
        sourceId: buildSourceId([journal.id, doi, work.URL, work.title?.[0]]),
        doi: enrichment?.doi ?? doi,
        // sourceId above keeps the raw title so existing rows still match.
        title: stripHtml(work.title?.[0]) ?? "Untitled article",
        // Several publishers (Elsevier among them) deposit no abstract with
        // Crossref, so OpenAlex fills the gap when it has one.
        abstract:
          stripHtml(work.abstract?.replace(ABSTRACT_HEADING, "")) ??
          enrichment?.abstract ??
          null,
        publicationDate: buildDate(work),
        authors:
          work.author?.map((author) => {
            const fullName = [author.given, author.family]
              .filter(Boolean)
              .join(" ")
              .trim();
            return fullName || author.name || "";
          }).filter(Boolean) ?? [],
        publisherLandingUrl:
          enrichment?.publisherLandingUrl ??
          safeHttpUrl(work.URL) ??
          (doi ? `https://doi.org/${doi}` : null),
        openAccessUrl: enrichment?.openAccessUrl ?? null,
        directPdfUrl,
        sourcePayload: JSON.stringify({
          sourceType: "crossref",
          issn,
        }),
      };
    }),
  );
}
