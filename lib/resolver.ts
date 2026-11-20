import type { Article, Journal } from "@prisma/client";

import { buildInstitutionUrl, type Institution } from "@/lib/institutions";
import type { AccessAlternate, AccessResult } from "@/lib/types";
import { isPdfUrl, normalizeDoi, safeHttpUrl } from "@/lib/utils";

type ArticleForResolution = Pick<
  Article,
  | "doi"
  | "title"
  | "openAccessUrl"
  | "directPdfUrl"
  | "publisherLandingUrl"
  | "publicationDate"
> & {
  id?: string;
  journal?: Pick<Journal, "title" | "issnElectronic" | "issnPrint"> | null;
};

export type ArticleRoutes = {
  doi: string | null;
  publisherUrl: string | null;
  // Null when no institution was passed in.
  institutionUrl: string | null;
  openAccessUrl: string | null;
  directPdfUrl: string | null;
};

export function getArticleRoutes(
  article: ArticleForResolution,
  institution: Institution | null = null,
): ArticleRoutes {
  const doi = normalizeDoi(article.doi);
  const publisherUrl =
    safeHttpUrl(article.publisherLandingUrl) ??
    (doi ? `https://doi.org/${doi}` : null);
  const institutionUrl = institution
    ? buildInstitutionUrl(institution.resolverUrl, {
        doi,
        title: article.title,
        journalTitle: article.journal?.title,
        issn:
          article.journal?.issnElectronic ?? article.journal?.issnPrint ?? null,
        publicationDate:
          article.publicationDate?.toISOString().slice(0, 10) ?? null,
      })
    : null;

  return {
    doi,
    publisherUrl,
    institutionUrl,
    openAccessUrl: safeHttpUrl(article.openAccessUrl),
    directPdfUrl: safeHttpUrl(article.directPdfUrl),
  };
}

function withUniqueAlternates(alternates: AccessAlternate[]) {
  const seen = new Set<string>();

  return alternates.filter((alternate) => {
    if (seen.has(alternate.url)) {
      return false;
    }

    seen.add(alternate.url);
    return true;
  });
}

export function resolveAccess(
  article: ArticleForResolution,
  institution: Institution | null = null,
): AccessResult {
  const { publisherUrl, institutionUrl, openAccessUrl, directPdfUrl } =
    getArticleRoutes(article, institution);

  const alternates: AccessAlternate[] = [];

  if (publisherUrl) {
    alternates.push({ label: "Open publisher page", url: publisherUrl });
  }

  if (institutionUrl) {
    alternates.push({ label: "Open via Institution", url: institutionUrl });
  }

  if (openAccessUrl) {
    return {
      status: "open_access",
      url: openAccessUrl,
      label: isPdfUrl(openAccessUrl) ? "Open OA PDF" : "Open OA copy",
      explanation:
        "A legal open-access route is available, so the app prefers that before any institution or publisher fallback.",
      alternates: withUniqueAlternates(alternates),
    };
  }

  if (directPdfUrl) {
    return {
      status: "open_access",
      url: directPdfUrl,
      label: "Open direct PDF",
      explanation:
        "A directly reachable PDF link was found in the article metadata. Use this if it opens cleanly.",
      alternates: withUniqueAlternates(alternates),
    };
  }

  if (institutionUrl) {
    return {
      // Named for the first institution the app supported; kept because the
      // value is stored in AccessAttempt.selectedRoute.
      status: "gt_route",
      url: institutionUrl,
      label: "Open via Institution",
      explanation:
        "This sends you to the institution resolver with article metadata, which is closer to the library link-resolver workflow than a generic site search.",
      alternates: withUniqueAlternates(alternates),
    };
  }

  if (publisherUrl) {
    return {
      status: "publisher_page",
      url: publisherUrl,
      label: "Open publisher page",
      explanation:
        "No open-access copy was found and no institution is set, so the route is the article's publisher landing page.",
      alternates: [],
    };
  }

  return {
    status: "unavailable",
    url: null,
    label: "No link available",
    explanation:
      "The article has no DOI or publisher link, and no institution is set to search through.",
    alternates: [],
  };
}
