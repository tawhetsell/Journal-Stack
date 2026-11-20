import {
  FETCH_TIMEOUT_MS,
  normalizeDoi,
  safeHttpUrl,
  stripHtml,
} from "@/lib/utils";

export type OpenAlexWork = {
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
  abstract_inverted_index?: Record<string, number[]> | null;
};

// What a lookup contributes to an article.
export type OpenAlexEnrichment = {
  doi: string | null;
  abstract: string | null;
  openAccessUrl: string | null;
  publisherLandingUrl: string | null;
  directPdfUrl: string | null;
};

// OpenAlex publishes abstracts as a word -> positions index rather than text.
export function abstractFromInvertedIndex(
  index: Record<string, number[]> | null | undefined,
) {
  if (!index) {
    return null;
  }

  const words: string[] = [];

  for (const [word, positions] of Object.entries(index)) {
    if (!Array.isArray(positions)) {
      continue;
    }

    for (const position of positions) {
      if (Number.isInteger(position) && position >= 0 && position < 20_000) {
        words[position] = word;
      }
    }
  }

  // Array.from fills positions the index skipped, which join() then drops.
  const text = stripHtml(Array.from(words, (word) => word ?? "").join(" "));

  // Some records keep the section heading as the first word.
  return text?.replace(/^abstract[:.]?\s+(?=[A-Z])/i, "") || null;
}

// OpenAlex answers 429 when a burst arrives at once, and a refresh looks up
// every article of a journal together. Lookups therefore share a few slots,
// and a 429 is retried after the wait the server asks for.
const MAX_CONCURRENT = 3;
const MAX_ATTEMPTS = 4;
const MAX_RETRY_WAIT_MS = 5_000;

let activeRequests = 0;
const waiting: Array<() => void> = [];

async function withSlot<T>(task: () => Promise<T>) {
  if (activeRequests >= MAX_CONCURRENT) {
    // The finishing request hands its slot over, so the count stays as it is.
    await new Promise<void>((resolve) => waiting.push(resolve));
  } else {
    activeRequests += 1;
  }

  try {
    return await task();
  } finally {
    const next = waiting.shift();

    if (next) {
      next();
    } else {
      activeRequests -= 1;
    }
  }
}

function retryWaitMs(response: Response, attempt: number) {
  const seconds = Number(response.headers.get("retry-after"));

  return Number.isFinite(seconds) && seconds > 0
    ? seconds * 1000
    : 500 * attempt;
}

async function fetchPaced(url: string) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const response = await withSlot(() =>
      fetch(url, {
        headers: {
          Accept: "application/json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }),
    );

    if (response.status !== 429 || attempt === MAX_ATTEMPTS) {
      return response;
    }

    const wait = retryWaitMs(response, attempt);

    // A long wait means the allowance is spent, not a burst; enrichment is
    // optional, so give up rather than hold the refresh.
    if (wait > MAX_RETRY_WAIT_MS) {
      return response;
    }

    // Wait outside the slot so other lookups keep moving.
    await new Promise((resolve) => setTimeout(resolve, wait));
  }

  return null;
}

// The part of a lookup that needs no network: what is taken from one record.
// Kept apart from the request so it can be run over saved records
// (scripts/export-fixtures.ts).
export function enrichmentFromOpenAlexWork(
  work: OpenAlexWork,
  normalizedDoi: string,
): OpenAlexEnrichment {
  return {
    doi: normalizeDoi(work.ids?.doi ?? normalizedDoi),
    abstract: abstractFromInvertedIndex(work.abstract_inverted_index),
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

export async function enrichWithOpenAlex(
  doi: string | null,
): Promise<OpenAlexEnrichment | null> {
  const normalizedDoi = normalizeDoi(doi);

  if (!normalizedDoi) {
    return null;
  }

  const params = new URLSearchParams({
    select: "ids,primary_location,best_oa_location,abstract_inverted_index",
  });

  if (process.env.OPENALEX_MAILTO) {
    params.set("mailto", process.env.OPENALEX_MAILTO);
  }

  // The single-work address is free. The `?filter=doi:` search this used to
  // call is metered against a small daily allowance shared by everyone on the
  // same IP address, and a few full refreshes used it up.
  const response = await fetchPaced(
    `https://api.openalex.org/works/doi:${encodeURIComponent(normalizedDoi)}?${params}`,
  );

  if (!response?.ok) {
    return null;
  }

  const work = (await response.json()) as OpenAlexWork | null;

  if (!work) {
    return null;
  }

  return enrichmentFromOpenAlexWork(work, normalizedDoi);
}
