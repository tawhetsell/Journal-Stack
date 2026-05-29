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

export function stripHtml(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
