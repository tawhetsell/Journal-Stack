export function normalizeDoi(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return value
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .trim()
    .toLowerCase();
}

// Applied to every outbound metadata request so one hung server cannot stall
// a whole refresh.
export const FETCH_TIMEOUT_MS = 15_000;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "\u2013",
  mdash: "\u2014",
  hellip: "\u2026",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201c",
  rdquo: "\u201d",
};

// Single pass, so "&amp;lt;" decodes to "&lt;" rather than "<".
export function decodeEntities(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body.startsWith("#")) {
      const code =
        body[1].toLowerCase() === "x"
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);

      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }

    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

// Inline formatting (<i>, <sub>, <jats:italic>, ...) is removed without leaving
// a gap, so "H<sub>2</sub>O" stays "H2O"; block tags become spaces.
const INLINE_TAG_PATTERN =
  /<\/?(?:[a-z]+:)?(?:i|b|u|em|strong|sub|sup|sc|scp|italic|bold)\b[^>]*>/gi;

export function stripHtml(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const text = decodeEntities(
    value.replace(INLINE_TAG_PATTERN, "").replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();

  return text || null;
}

export function parseDate(value: string | Date | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function safeJsonParse<T>(value: string | null | undefined, fallback: T) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function serializeAuthors(authors: string[]) {
  return JSON.stringify(authors.filter(Boolean));
}

export function parseAuthors(value: string | null | undefined) {
  return safeJsonParse<string[]>(value, []);
}

export function formatDate(value: Date | null | undefined) {
  if (!value) {
    return "Date unavailable";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

export function buildSourceId(parts: Array<string | null | undefined>) {
  const joined = parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join("::");

  return joined.length > 180 ? joined.slice(0, 180) : joined;
}

export function joinAuthors(authors: string[]) {
  if (authors.length === 0) {
    return "Author metadata unavailable";
  }

  if (authors.length <= 3) {
    return authors.join(", ");
  }

  return `${authors.slice(0, 3).join(", ")} et al.`;
}

export function isPdfUrl(value: string | null | undefined) {
  return !!value && /\.pdf($|\?)/i.test(value);
}

// Links come from feeds and APIs we don't control. Only http(s) is allowed:
// other schemes (file:, search-ms:, ms-*:) can launch local programs.
export function safeHttpUrl(value: string | null | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const { protocol } = new URL(trimmed);
    return protocol === "http:" || protocol === "https:" ? trimmed : null;
  } catch {
    return null;
  }
}
