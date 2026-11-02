import { normalizeDoi, safeHttpUrl } from "@/lib/utils";

type OpenAlexWork = {
  ids?: {
    doi?: string;
  };
  primary_location?: {
    landing_page_url?: string | null;
    pdf_url?: string | null;
  } | null;
  best_oa_location?: {
    landing_page_url?: string | null;
    pdf_url?: string | null;
  } | null;
};

export async function enrichWithOpenAlex(doi: string | null) {
  const normalizedDoi = normalizeDoi(doi);

  if (!normalizedDoi) {
    return null;
  }

  const params = new URLSearchParams({
    filter: `doi:${normalizedDoi}`,
    per_page: "1",
  });

  if (process.env.OPENALEX_MAILTO) {
    params.set("mailto", process.env.OPENALEX_MAILTO);
  }

  const response = await fetch(`https://api.openalex.org/works?${params}`, {
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as {
    results?: OpenAlexWork[];
  };
  const work = payload.results?.[0];

  if (!work) {
    return null;
  }

  return {
    doi: normalizeDoi(work.ids?.doi ?? normalizedDoi),
    openAccessUrl:
      safeHttpUrl(work.best_oa_location?.pdf_url) ??
      safeHttpUrl(work.best_oa_location?.landing_page_url),
    publisherLandingUrl:
      safeHttpUrl(work.primary_location?.landing_page_url) ??
      safeHttpUrl(work.best_oa_location?.landing_page_url),
    directPdfUrl:
      safeHttpUrl(work.primary_location?.pdf_url) ??
      safeHttpUrl(work.best_oa_location?.pdf_url),
  };
}
