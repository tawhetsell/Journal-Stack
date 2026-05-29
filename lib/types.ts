export type SourceType = "rss" | "crossref";

export type SourceJournal = {
  id: string;
  title: string;
  publisher: string | null;
  homepageUrl: string | null;
  issnPrint: string | null;
  issnElectronic: string | null;
  sourceType: string;
  sourceUrl: string | null;
};

export type NormalizedArticleInput = {
  sourceId: string;
  doi: string | null;
  title: string;
  abstract: string | null;
  publicationDate: Date | null;
  authors: string[];
  publisherLandingUrl: string | null;
  openAccessUrl: string | null;
  directPdfUrl: string | null;
  sourcePayload: string | null;
};

export type AccessAlternate = {
  label: string;
  url: string;
};

export type AccessResult = {
  status:
    | "open_access"
    | "gt_route"
    | "publisher_page"
    | "library_fallback"
    | "unavailable";
  url: string | null;
  label: string;
  explanation: string;
  alternates: AccessAlternate[];
};
