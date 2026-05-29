import type { Article, Journal } from "@prisma/client";

import { buildGeorgiaTechLibraryRoute, buildGeorgiaTechSearchUrl } from "@/lib/gt";
import type { AccessAlternate, AccessResult } from "@/lib/types";
import { isPdfUrl, normalizeDoi } from "@/lib/utils";

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
  georgiaTechUrl: string;
  titleSearchUrl: string;
  openAccessUrl: string | null;
  directPdfUrl: string | null;
};

export function getArticleRoutes(article: ArticleForResolution): ArticleRoutes {
  const doi = normalizeDoi(article.doi);
  const publisherUrl =
    article.publisherLandingUrl ?? (doi ? `https://doi.org/${doi}` : null);
  const georgiaTechUrl = buildGeorgiaTechLibraryRoute({
    doi,
    title: article.title,
    journalTitle: article.journal?.title,
    issn: article.journal?.issnElectronic ?? article.journal?.issnPrint ?? null,
    publicationDate: article.publicationDate?.toISOString().slice(0, 10) ?? null,
  });
  const titleSearchUrl = buildGeorgiaTechSearchUrl(
    [article.title, article.journal?.title].filter(Boolean).join(" "),
  );

  return {
    doi,
    publisherUrl,
    georgiaTechUrl,
    titleSearchUrl,
    openAccessUrl: article.openAccessUrl ?? null,
    directPdfUrl: article.directPdfUrl ?? null,
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

export function resolveAccess(article: ArticleForResolution): AccessResult {
  const {
    doi,
    publisherUrl,
    georgiaTechUrl,
    titleSearchUrl,
    openAccessUrl,
    directPdfUrl,
  } = getArticleRoutes(article);

  const alternates: AccessAlternate[] = [];

  if (publisherUrl) {
    alternates.push({ label: "Open publisher page", url: publisherUrl });
  }

  alternates.push({
    label: "Open via Institution",
    url: georgiaTechUrl,
  });

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

  if (doi || article.title) {
    return {
      status: "gt_route",
      url: georgiaTechUrl,
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
        "No stronger route was found, so the safest fallback is the article's publisher landing page.",
      alternates: withUniqueAlternates([
        { label: "Try library search", url: titleSearchUrl },
      ]),
    };
  }

  return {
    status: "library_fallback",
    url: titleSearchUrl,
    label: "Try library link",
    explanation:
      "Metadata is thin, so the fallback is a direct search in the library discovery interface.",
    alternates: [],
  };
}
