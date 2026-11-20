import presets from "@/data/institutions.json";

// A library whose link resolver "Open via Institution" sends articles to.
// `resolverUrl` is the library's OpenURL base address, including any codes the
// library needs in it; the article's details are appended to it.
export type Institution = {
  name: string;
  resolverUrl: string;
};

// What the user has told us: nothing yet, that they have no library access,
// or which library to use.
export type InstitutionSetting =
  | { status: "unset" }
  | { status: "none" }
  | { status: "set"; institution: Institution };

// The built-in choices (data/institutions.json), in alphabetical order.
// Addresses come from Zotero's OpenURL resolver directory; each answered a
// sample lookup when added, which shows the address is live but not that it
// reaches full text.
export const institutionPresets: Institution[] = presets;

export function findInstitutionPreset(resolverUrl: string) {
  return institutionPresets.find(
    (preset) => preset.resolverUrl === resolverUrl,
  );
}

type ArticleDetails = {
  doi?: string | null;
  title: string;
  journalTitle?: string | null;
  issn?: string | null;
  publicationDate?: string | null;
};

// Builds the library link for one article, in the OpenURL 1.0 format library
// resolvers share. The base address is kept exactly as given: some carry
// required codes in their query string, and some wrap a second address after a
// trailing "?" (proxy logins), so it cannot be rebuilt with URL().
export function buildInstitutionUrl(
  resolverUrl: string,
  article: ArticleDetails,
) {
  const params = new URLSearchParams({
    ctx_ver: "Z39.88-2004",
    url_ver: "Z39.88-2004",
    rft_val_fmt: "info:ofi/fmt:kev:mtx:journal",
    genre: "article",
  });

  if (article.title.trim()) {
    params.set("rft.atitle", article.title.trim());
  }

  if (article.doi?.trim()) {
    params.set("rft_id", `info:doi/${article.doi.trim()}`);
  }

  if (article.journalTitle?.trim()) {
    params.set("rft.jtitle", article.journalTitle.trim());
  }

  if (article.issn?.trim()) {
    params.set("rft.issn", article.issn.trim());
  }

  if (article.publicationDate?.trim()) {
    params.set("rft.date", article.publicationDate.trim());
  }

  params.set("rfr_id", "info:sid/literature-access-app");

  const base = resolverUrl.trim();
  const joiner = !base.includes("?") ? "?" : /[?&]$/.test(base) ? "" : "&";

  return `${base}${joiner}${params.toString()}`;
}
