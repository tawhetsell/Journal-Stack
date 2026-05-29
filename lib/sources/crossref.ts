import type { NormalizedArticleInput, SourceJournal } from "@/lib/types";
import {
  buildSourceId,
  normalizeDoi,
  parseDate,
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
  return parseDate(new Date(year, month - 1, day));
}

export async function fetchArticlesFromCrossref(
  journal: SourceJournal,
): Promise<NormalizedArticleInput[]> {
  const issn = journal.issnElectronic ?? journal.issnPrint;

  if (!issn) {
    return [];
  }

  const response = await fetch(
    `https://api.crossref.org/journals/${issn}/works?sort=published&order=desc&rows=15`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "literature-access-app/0.1 (mailto:local-first@example.com)",
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`Crossref fetch failed for ${journal.title}`);
  }

  const payload = (await response.json()) as {
    message?: {
      items?: CrossrefWork[];
    };
  };

  return Promise.all(
    (payload.message?.items ?? []).map(async (work) => {
      const doi = normalizeDoi(work.DOI ?? null);
      const enrichment = await enrichWithOpenAlex(doi).catch(() => null);
      const directPdfUrl =
        work.link?.find((link) => link["content-type"]?.includes("pdf"))?.URL ??
        enrichment?.directPdfUrl ??
        null;

      return {
        sourceId: buildSourceId([journal.id, doi, work.URL, work.title?.[0]]),
        doi: enrichment?.doi ?? doi,
        title: work.title?.[0] ?? "Untitled article",
        abstract: stripHtml(work.abstract),
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
          work.URL ??
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
