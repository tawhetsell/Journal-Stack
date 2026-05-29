const GT_DISCOVERY_BASE =
  "https://galileo-gatech.primo.exlibrisgroup.com/discovery/search";
const GT_OPENURL_BASE =
  "https://galileo-gatech.primo.exlibrisgroup.com/discovery/openurl";
const GT_DISCOVERY_HOST = "galileo-gatech.primo.exlibrisgroup.com";

export function buildGeorgiaTechSearchUrl(query: string) {
  const params = new URLSearchParams({
    vid: "01GALI_GIT:GT",
    lang: "en",
    query: `any,contains,${query}`,
  });

  return `${GT_DISCOVERY_BASE}?${params.toString()}`;
}

export function buildGeorgiaTechResolverUrl(options: {
  doi?: string | null;
  title: string;
  journalTitle?: string | null;
  issn?: string | null;
  publicationDate?: string | null;
}) {
  const params = new URLSearchParams({
    institution: "01GALI_GIT",
    vid: "01GALI_GIT:GT",
    ctx_ver: "Z39.88-2004",
    url_ver: "Z39.88-2004",
    rft_val_fmt: "info:ofi/fmt:kev:mtx:journal",
    genre: "article",
    "rft.atitle": options.title,
  });

  if (options.doi?.trim()) {
    params.set("rft_id", `info:doi/${options.doi.trim()}`);
  }

  if (options.journalTitle?.trim()) {
    params.set("rft.jtitle", options.journalTitle.trim());
  }

  if (options.issn?.trim()) {
    params.set("rft.issn", options.issn.trim());
  }

  if (options.publicationDate?.trim()) {
    params.set("rft.date", options.publicationDate.trim());
  }

  params.set("rfr_id", "info:sid/literature-access-app");

  return `${GT_OPENURL_BASE}?${params.toString()}`;
}

export function buildGeorgiaTechLibraryRoute(options: {
  doi?: string | null;
  title: string;
  journalTitle?: string | null;
  issn?: string | null;
  publicationDate?: string | null;
}) {
  if (options.title.trim()) {
    return buildGeorgiaTechResolverUrl({
      doi: options.doi,
      title: options.title,
      journalTitle: options.journalTitle,
      issn: options.issn,
      publicationDate: options.publicationDate,
    });
  }

  return buildGeorgiaTechSearchUrl(options.doi?.trim() || options.title);
}

export function isGeorgiaTechResolverPageUrl(urlString: string) {
  try {
    const url = new URL(urlString);
    return (
      url.hostname === GT_DISCOVERY_HOST && url.pathname === "/discovery/openurl"
    );
  } catch {
    return false;
  }
}

export function isGeorgiaTechDirectTargetUrl(urlString: string) {
  try {
    const url = new URL(urlString);

    if (url.hostname !== GT_DISCOVERY_HOST) {
      return true;
    }

    return !url.pathname.startsWith("/discovery/");
  } catch {
    return false;
  }
}
