// Writes what the app's own code makes of a set of sample inputs, as JSON, for the iOS port
// (journal-stack-ios) to test against. Each file pairs inputs with the outputs they produced.
// Run: npm run fixtures -- <output directory>
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { buildInstitutionUrl, type Institution } from "@/lib/institutions";
import { getArticleRoutes, resolveAccess } from "@/lib/resolver";
import {
  articleFromCrossrefWork,
  crossrefWorksFrom,
  type CrossrefWork,
} from "@/lib/sources/crossref";
import {
  abstractFromInvertedIndex,
  enrichmentFromOpenAlexWork,
  type OpenAlexEnrichment,
  type OpenAlexWork,
} from "@/lib/sources/openalex";
import {
  articleFromFeedItem,
  extractDoi,
  parseFeedItems,
} from "@/lib/sources/rss";
import { defaultTheme, themeCounterpart, themes } from "@/lib/themes";
import type { NormalizedArticleInput } from "@/lib/types";
import {
  buildSourceId,
  decodeEntities,
  formatDate,
  isPdfUrl,
  joinAuthors,
  normalizeDoi,
  parseDate,
  safeHttpUrl,
  stripHtml,
} from "@/lib/utils";
import { institutionFormSchema, journalFormSchema } from "@/lib/validation";

if (!process.argv[2]) {
  console.error("Usage: npm run fixtures -- <output directory>");
  process.exit(1);
}

const outDir = resolve(process.argv[2]);
mkdirSync(outDir, { recursive: true });

function write(name: string, data: unknown) {
  const text = `${JSON.stringify(data, null, 1)}\n`;
  writeFileSync(join(outDir, `${name}.json`), text);
  console.log(`${name}.json  ${(text.length / 1024).toFixed(0)} KB`);
}

// Each input with what the function returned for it.
function cases<In, Out>(inputs: In[], run: (input: In) => Out) {
  return inputs.map((input) => ({ in: input, out: run(input) }));
}

const iso = (date: Date | null) => date?.toISOString() ?? null;
const withIsoDate = (article: NormalizedArticleInput) => ({
  ...article,
  publicationDate: iso(article.publicationDate),
});

// ---------------------------------------------------------------- text helpers

const long = "x".repeat(170);

write("text", {
  // Dates with no time zone in them were read as UTC.
  timeZone: process.env.TZ,
  normalizeDoi: cases(
    [
      null,
      "",
      "   ",
      "10.1000/ABC.def",
      " https://doi.org/10.1000/Abc ",
      "http://dx.doi.org/10.1/x",
      "HTTPS://DOI.ORG/10.1/X",
      "doi: 10.1/x",
      "DOI:10.1/X",
      "doi:https://doi.org/10.1/x",
      "https://doi.org/doi:10.1/x",
      "10.1/x ",
      "https://example.org/10.1/x",
    ],
    normalizeDoi,
  ),
  decodeEntities: cases(
    [
      "",
      "no entities",
      "Fish &amp; Chips",
      "&amp;lt;",
      "&lt;b&gt;",
      "&quot;x&quot; &apos;y&apos;",
      "&#8217;",
      "&#x2019;",
      "&#X2019;",
      "&#128512;",
      "&#0;",
      "&#x110000;",
      "&#99999999;",
      "a&nbsp;b",
      "&NBSP;&Amp;",
      "&ndash;&mdash;&hellip;&lsquo;&rsquo;&ldquo;&rdquo;",
      "&eacute;&unknown;",
      "&amp",
      "& amp;",
      "&#;",
      "&#x;",
    ],
    decodeEntities,
  ),
  stripHtml: cases(
    [
      null,
      "",
      "   ",
      "<p></p>",
      "<p>Hello</p>",
      "H<sub>2</sub>O and E=mc<sup>2</sup>",
      "<jats:p>The <jats:italic>E. coli</jats:italic> genome</jats:p>",
      "<jats:sec><jats:title>Background</jats:title><jats:p>Text</jats:p></jats:sec>",
      "line one<br/>line two",
      "  many   spaces\n\tand\r\nlines ",
      "Fish &amp; Chips",
      "1 &lt; 2 &gt; 0",
      "&lt;i&gt;not a tag&lt;/i&gt;",
      "<b>bold</b>text and <strong>strong</strong>er",
      "<span class='x'>s</span>pan",
      "<scp>N</scp>ASA and <sc>small caps</sc>",
      "<I>upper</I>case <EM CLASS=\"a\">tags</EM>",
      "<img src=\"a.png\">caption",
      "<italic>plain</italic> <bold>jats</bold> <u>names</u>",
      "<ins>not inline</ins>here",
      "if a < b and c > d then",
      "<i>unclosed",
      "trailing <",
      "a&nbsp;&nbsp;b",
      "<p>caf&#233; &#x2014; na&iuml;ve</p>",
      "<![CDATA[inside]]>",
    ],
    stripHtml,
  ),
  parseDate: cases(
    [
      null,
      "",
      "not a date",
      "2024-03-05",
      "2024-03",
      "2024",
      "2024-03-05T10:20:30Z",
      "2024-03-05T10:20:30.123Z",
      "2024-03-05T10:20:30+02:00",
      "2024-03-05T10:20:30-0500",
      "2024-03-05T10:20:30",
      "2024-03-05 10:20:30",
      "2024-03-05T10:20Z",
      "2024-13-45",
      "2024-02-30",
      "2024/03/05",
      "03/05/2024",
      "Tue, 05 Mar 2024 10:20:30 GMT",
      "Tue, 05 Mar 2024 10:20:30 +0000",
      "Tue, 5 Mar 2024 10:20:30 -0500",
      "Tue, 05 Mar 2024 10:20:30 EST",
      "Tue, 05 Mar 2024 10:20:30 PDT",
      "Tue, 05 Mar 2024 10:20:30 Z",
      "05 Mar 2024 10:20:30 GMT",
      "Tue, 05 Mar 2024 10:20 GMT",
      "Tue, 05 Mar 2024",
      "Wed, 05 Mar 2024 10:20:30 GMT",
      "March 5, 2024",
      "Mar 5, 2024",
      "5 March 2024",
      "05 March 2024",
      "March 2024",
      "1709634030000",
    ],
    (value) => iso(parseDate(value)),
  ),
  formatDate: cases(
    [null, "2024-03-05T12:00:00.000Z", "2024-12-31T23:59:59.000Z", "2001-01-01T00:00:00.000Z"],
    (value) => formatDate(value ? new Date(value) : null),
  ),
  buildSourceId: cases<Array<string | null | undefined>, string>(
    [
      [],
      [null, null],
      ["journal1", "10.1/x", "https://example.org/a", "A title"],
      ["journal1", null, "", "  ", " padded "],
      ["journal1", long, "tail-that-is-cut-off"],
      // Accents written as letter + combining mark, around the 180 cut
      ["journal1", long, "café résumé"],
      ["journal1", `${long}e`, "́ after the cut"],
    ],
    buildSourceId,
  ),
  joinAuthors: cases(
    [[], ["One"], ["One", "Two"], ["One", "Two", "Three"], ["One", "Two", "Three", "Four"]],
    joinAuthors,
  ),
  isPdfUrl: cases(
    [
      null,
      "",
      "https://example.org/a.pdf",
      "https://example.org/a.PDF?download=1",
      "https://example.org/a.pdf#page=2",
      "https://example.org/a.pdfx",
      "https://example.org/pdf/a",
      "https://example.org/a.pdf/view",
    ],
    isPdfUrl,
  ),
  safeHttpUrl: cases(
    [
      null,
      "",
      "   ",
      "https://example.org/a",
      " https://example.org/a ",
      "http://example.org",
      "HTTPS://EXAMPLE.ORG/A",
      "ftp://example.org/a",
      "javascript:alert(1)",
      "file:///etc/hosts",
      "search-ms:query=x",
      "//example.org/a",
      "example.org/a",
      "/relative/path",
      "https://",
      "https://exa mple.org/a",
      "https://example.org/a b",
      "https://example.org/café",
      "https://example.org/a?q=1&r=<2>",
      "https:example.org",
      "https:/example.org",
    ],
    safeHttpUrl,
  ),
});

// ------------------------------------------------------------------- OpenAlex

const openAlexWorks: Array<{ name: string; doi: string; work: OpenAlexWork }> = [
  {
    name: "open access with a PDF",
    doi: "10.1/oa",
    work: {
      ids: { doi: "https://doi.org/10.1/OA" },
      primary_location: {
        landing_page_url: "https://publisher.example.org/oa",
        pdf_url: "https://publisher.example.org/oa.pdf",
      },
      best_oa_location: {
        landing_page_url: "https://repository.example.org/oa",
        pdf_url: "https://repository.example.org/oa.pdf",
      },
      abstract_inverted_index: { Abstract: [0], We: [1], study: [2], things: [3] },
    },
  },
  {
    name: "open access landing page only",
    doi: "10.1/landing",
    work: {
      primary_location: { landing_page_url: null, pdf_url: null },
      best_oa_location: {
        landing_page_url: "https://repository.example.org/landing",
        pdf_url: null,
      },
    },
  },
  {
    name: "closed",
    doi: "10.1/closed",
    work: {
      ids: {},
      primary_location: { landing_page_url: "https://publisher.example.org/closed" },
      best_oa_location: null,
      abstract_inverted_index: null,
    },
  },
  {
    name: "addresses that are not web links",
    doi: "10.1/unsafe",
    work: {
      primary_location: { landing_page_url: "ftp://publisher.example.org/x", pdf_url: " " },
      best_oa_location: { landing_page_url: "javascript:alert(1)", pdf_url: "file:///x.pdf" },
    },
  },
  { name: "empty record", doi: "10.1/empty", work: {} },
];

const invertedIndexes: Array<Record<string, number[]> | null> = [
  null,
  {},
  { Hello: [0], world: [1] },
  { the: [0, 2], cat: [1], dog: [3] },
  { gaps: [0], skipped: [3], here: [6] },
  { Abstract: [0], Results: [1], follow: [2] },
  { "Abstract:": [0], Lower: [1] },
  { abstract: [0], lower: [1], case: [2] },
  { "ABSTRACT.": [0], Upper: [1] },
  { Abstract: [0] },
  { "H<sub>2</sub>O": [0], "&amp;": [1], "<i>italic</i>": [2] },
  { ok: [0], negative: [-1], huge: [20000], edge: [19999], fraction: [1.5] },
  { bad: "not a list" as unknown as number[], good: [0] },
];

write("openalex", {
  abstractFromInvertedIndex: cases(invertedIndexes, abstractFromInvertedIndex),
  enrichmentFromOpenAlexWork: openAlexWorks.map(({ name, doi, work }) => ({
    name,
    doi,
    work,
    out: enrichmentFromOpenAlexWork(work, doi),
  })),
});

// What OpenAlex is taken to have answered in the source fixtures below, by DOI.
const enrichments: Record<string, OpenAlexEnrichment> = {
  "10.1111/sample.13001": {
    doi: "10.1111/sample.13001",
    abstract: "Abstract from OpenAlex.",
    openAccessUrl: "https://repository.example.org/13001.pdf",
    publisherLandingUrl: "https://publisher.example.org/doi/10.1111/sample.13001",
    directPdfUrl: "https://publisher.example.org/doi/pdf/10.1111/sample.13001",
  },
  "10.1016/j.sample.2024.01.005": {
    doi: "10.1016/j.sample.2024.01.005",
    abstract: "Elsevier deposits no abstract, so this one came from OpenAlex.",
    openAccessUrl: null,
    publisherLandingUrl: null,
    directPdfUrl: null,
  },
  "10.1371/journal.sone.0300001": {
    doi: "10.1371/journal.sone.0300001",
    abstract: "Not used: the feed has its own summary.",
    openAccessUrl: "https://journals.example.net/sampleone/article/file?id=10.1371/journal.sone.0300001&type=printable",
    publisherLandingUrl: "https://journals.example.net/from-openalex",
    directPdfUrl: null,
  },
  "10.5555/jss.2024.43": {
    doi: "10.5555/jss.2024.43-corrected",
    abstract: "The feed item has no text, so this is used.",
    openAccessUrl: null,
    publisherLandingUrl: "https://publisher.example.org/43",
    directPdfUrl: "https://publisher.example.org/43.pdf",
  },
};
const enrichmentFor = (doi: string | null) => (doi ? (enrichments[doi] ?? null) : null);

// ------------------------------------------------------------------- Crossref

const crossrefWorks: CrossrefWork[] = [
  {
    DOI: "10.1111/SAMPLE.13001",
    title: ["Managing <i>public</i> value &amp; trust: evidence from 12 cities"],
    abstract:
      "<jats:title>Abstract</jats:title><jats:p>Trust in H<jats:sub>2</jats:sub>O utilities rose.</jats:p><jats:p>Second paragraph.</jats:p>",
    author: [
      { given: "Ada", family: "Okafor" },
      { given: "Liu", family: "Wei" },
      { name: "The Sample Consortium" },
      { family: "Mononym" },
      {},
    ],
    URL: "https://doi.org/10.1111/sample.13001",
    link: [
      { URL: "https://publisher.example.org/xml/13001", "content-type": "application/xml" },
      { URL: "https://publisher.example.org/pdf/13001", "content-type": "application/pdf" },
    ],
    published: { "date-parts": [[2024, 3, 5]] },
    issued: { "date-parts": [[2023, 1, 1]] },
  },
  { DOI: "10.1111/sample.13002", title: ["Issue Information"], URL: "https://doi.org/10.1111/sample.13002" },
  { DOI: "10.1111/sample.13003", title: ["  front matter "] },
  { DOI: "10.1111/sample.13004", title: ["Contents of a toolbox for evaluators"] },
  {
    DOI: "10.1016/j.sample.2024.01.005",
    title: ["An article with no abstract in Crossref"],
    URL: "https://doi.org/10.1016/j.sample.2024.01.005",
    author: [{ given: "María José", family: "Pérez" }],
    issued: { "date-parts": [[2024, 2]] },
  },
  {
    DOI: "10.1111/sample.13006",
    title: [""],
    abstract: "<p>   </p>",
    published: { "date-parts": [[2024]] },
    link: [{ URL: "ftp://publisher.example.org/13006.pdf", "content-type": "application/pdf" }],
  },
  {
    title: ["No DOI, and an address that is not a web link"],
    URL: "urn:example:13007",
    published: { "date-parts": [[]] },
  },
  {
    DOI: "10.1111/sample.13008",
    title: ["A first title", "A second title that is ignored"],
    abstract: "<jats:sec><jats:title>ABSTRACT</jats:title><jats:title>Aims</jats:title><jats:p>We aim.</jats:p></jats:sec>",
    published: { "date-parts": [[2024, 12, 31]] },
  },
  {},
];
const crossrefPayload = { status: "ok", message: { "total-results": 9, items: crossrefWorks } };
const crossrefJournal = { id: "journal-crossref-1", issn: "1540-6210" };

write("crossref", [
  {
    name: "a response with every kind of record",
    journalId: crossrefJournal.id,
    issn: crossrefJournal.issn,
    payload: crossrefPayload,
    enrichments,
    // One entry per work that is kept, in order.
    articles: crossrefWorksFrom(crossrefPayload).map((work) => {
      const enrichment = enrichmentFor(normalizeDoi(work.DOI ?? null));
      return {
        enriched: withIsoDate(
          articleFromCrossrefWork(crossrefJournal.id, crossrefJournal.issn, work, enrichment),
        ),
        withoutOpenAlex: withIsoDate(
          articleFromCrossrefWork(crossrefJournal.id, crossrefJournal.issn, work, null),
        ),
      };
    }),
  },
  {
    name: "responses with nothing in them",
    journalId: crossrefJournal.id,
    issn: crossrefJournal.issn,
    payloads: cases([{}, { message: {} }, { message: { items: [] } }], (payload) =>
      crossrefWorksFrom(payload).length,
    ),
  },
]);

// ------------------------------------------------------------------------ RSS

const feeds = [];
const sampleFeeds: Array<{ name: string; file: string; xml: string }> = [];

for (const file of ["rss2.xml", "rdf.xml", "atom.xml", "tricky-rss.xml", "tricky-atom.xml"]) {
  const xml = readFileSync(new URL(`./fixture-samples/${file}`, import.meta.url), "utf8");
  sampleFeeds.push({ name: file, file, xml });

  // The feed reader keeps Windows line endings in the text, and they change what its
  // tag-stripping does, so the awkward feeds are read both ways.
  if (file.startsWith("tricky")) {
    sampleFeeds.push({ name: `${file} with Windows line endings`, file, xml: xml.replace(/\n/g, "\r\n") });
  }
}

for (const { name, file, xml } of sampleFeeds) {
  const journal = { id: `journal-${file}`, sourceUrl: `https://feeds.example.org/${file}` };
  const items = await parseFeedItems(xml);

  feeds.push({
    name,
    journal,
    xml,
    enrichments,
    // One entry per item, in order.
    items: items.map((item) => {
      // The DOI the app asks OpenAlex about, before any answer.
      const lookupDoi = extractDoi(item);
      return {
        lookupDoi,
        enriched: withIsoDate(articleFromFeedItem(journal, item, enrichmentFor(lookupDoi))),
        withoutOpenAlex: withIsoDate(articleFromFeedItem(journal, item, null)),
      };
    }),
  });
}

const manyItems = `<rss version="2.0"><channel><title>Long</title>${Array.from(
  { length: 25 },
  (_, index) => `<item><title>Item ${index + 1}</title><guid>long-${index + 1}</guid></item>`,
).join("")}</channel></rss>`;

write("rss", {
  feeds,
  // Only the first 18 items of a feed are read.
  itemLimit: { xml: manyItems, count: (await parseFeedItems(manyItems)).length },
});

// ---------------------------------------------------------------------- links

const libraries: Institution[] = [
  { name: "Plain address", resolverUrl: "https://library.example.edu/openurl" },
  { name: "Address with its own codes", resolverUrl: "https://library.example.edu/openurl?vid=01EX:MAIN&lang=en" },
  { name: "Address ending in a question mark", resolverUrl: "https://login.example.edu/login?" },
  { name: "Address ending in an ampersand", resolverUrl: "https://library.example.edu/openurl?vid=01EX&" },
  { name: "Proxy login wrapping a second address", resolverUrl: "https://login.example.edu/login?url=https://resolver.example.com/?" },
  { name: "Spaces around the address", resolverUrl: "  https://library.example.edu/openurl  " },
];

const articleDetails = [
  {
    doi: "10.1111/sample.13001",
    title: "Managing public value & trust: evidence from 12 cities",
    journalTitle: "Journal of Sample Studies",
    issn: "1540-6210",
    publicationDate: "2024-03-05",
  },
  { title: "Only a title" },
  { doi: "  ", title: "   ", journalTitle: " ", issn: "", publicationDate: null },
  {
    doi: " 10.1002/(SICI)1099-0000(199901)1:1<1::AID-X>3.0.CO;2-#  ",
    title: "Symbols: café – 100% + “quotes” / ~tilde* (parens) 'apostrophe'",
    journalTitle: "Zeitschrift für Beispiele",
    issn: " 0033-3352 ",
    publicationDate: " 2024 ",
  },
];

const storedArticles = [
  {
    name: "open-access PDF, publisher page and DOI",
    article: {
      doi: "https://doi.org/10.1111/SAMPLE.13001",
      title: "Managing public value",
      openAccessUrl: "https://repository.example.org/13001.pdf",
      directPdfUrl: "https://publisher.example.org/pdf/13001",
      publisherLandingUrl: "https://publisher.example.org/doi/10.1111/sample.13001",
      publicationDate: "2024-03-05T12:00:00.000Z",
      journal: { title: "Journal of Sample Studies", issnElectronic: "1540-6210", issnPrint: "0033-3352" },
    },
  },
  {
    name: "open-access copy that is not a PDF",
    article: {
      doi: "10.1/landing",
      title: "Landing page copy",
      openAccessUrl: "https://repository.example.org/landing",
      directPdfUrl: null,
      publisherLandingUrl: null,
      publicationDate: null,
      journal: { title: "Journal of Sample Studies", issnElectronic: null, issnPrint: "0033-3352" },
    },
  },
  {
    name: "direct PDF only",
    article: {
      doi: null,
      title: "Direct PDF",
      openAccessUrl: null,
      directPdfUrl: "https://publisher.example.org/direct.pdf",
      publisherLandingUrl: "https://publisher.example.org/direct",
      publicationDate: "2024-01-01T03:00:00.000Z",
      journal: null,
    },
  },
  {
    name: "DOI only",
    article: {
      doi: "10.1/closed",
      title: "Closed article",
      openAccessUrl: null,
      directPdfUrl: null,
      publisherLandingUrl: null,
      publicationDate: "2023-12-31T23:30:00.000Z",
      journal: { title: "Journal of Sample Studies", issnElectronic: null, issnPrint: null },
    },
  },
  {
    name: "nothing to open",
    article: {
      doi: null,
      title: "No links at all",
      openAccessUrl: "javascript:alert(1)",
      directPdfUrl: "file:///x.pdf",
      publisherLandingUrl: "ftp://publisher.example.org/x",
      publicationDate: null,
    },
  },
];

write("links", {
  buildInstitutionUrl: libraries.flatMap((library) =>
    articleDetails.map((article) => ({
      resolverUrl: library.resolverUrl,
      article,
      out: buildInstitutionUrl(library.resolverUrl, article),
    })),
  ),
  // Each stored article with no library set, and with one.
  routes: storedArticles.flatMap(({ name, article }) =>
    [null, libraries[1]].map((institution) => {
      const stored = {
        ...article,
        publicationDate: article.publicationDate ? new Date(article.publicationDate) : null,
      };
      return {
        name,
        article,
        institution,
        routes: getArticleRoutes(stored, institution),
        access: resolveAccess(stored, institution),
      };
    }),
  ),
});

// ----------------------------------------------------------------- validation

type Check = { ok: true; data: unknown } | { ok: false; errors: Array<{ field: string; message: string }> };

function check(schema: typeof journalFormSchema | typeof institutionFormSchema, input: unknown): Check {
  const result = schema.safeParse(input);

  return result.success
    ? { ok: true, data: result.data }
    : {
        ok: false,
        errors: result.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      };
}

write("validation", {
  // Only the messages written in lib/validation.ts are shown to the reader; the others are
  // the validation library's own wording.
  journalForm: cases<unknown, Check>(
    [
      { title: "Journal of Sample Studies", sourceType: "crossref", issnElectronic: "1540-6210" },
      { title: "  Padded Title  ", sourceType: "crossref", issnPrint: " 0033-3352 ", publisher: " Wiley ", followNow: true },
      { title: "Feed Journal", sourceType: "rss", sourceUrl: " https://feeds.example.org/feed.xml " },
      { title: "Plain http feed", sourceType: "rss", sourceUrl: "http://feeds.example.org/feed.xml" },
      { title: "J", sourceType: "crossref", issnElectronic: "1540-6210" },
      { title: "   ", sourceType: "crossref", issnElectronic: "1540-6210" },
      { title: "No feed address", sourceType: "rss" },
      { title: "Blank feed address", sourceType: "rss", sourceUrl: "   " },
      { title: "No ISSN", sourceType: "crossref" },
      { title: "Blank ISSNs", sourceType: "crossref", issnPrint: " ", issnElectronic: "" },
      { title: "Bad feed address", sourceType: "rss", sourceUrl: "feeds.example.org/feed.xml" },
      { title: "Bad homepage", sourceType: "crossref", issnPrint: "0033-3352", homepageUrl: "ftp://example.org" },
      { title: "Unknown source", sourceType: "atom" },
      { title: "Missing source" },
      { title: "X", sourceType: "rss", homepageUrl: "nope", sourceUrl: "nope" },
      { title: "Crossref with a feed address too", sourceType: "crossref", issnPrint: "0033-3352", sourceUrl: "https://feeds.example.org/feed.xml" },
    ],
    (input) => check(journalFormSchema, input),
  ),
  institutionForm: cases<unknown, Check>(
    [
      { choice: "none" },
      { choice: "preset", resolverUrl: "https://library.example.edu/openurl" },
      { choice: "preset", resolverUrl: "   " },
      { choice: "preset" },
      { choice: "custom", name: "  My Library ", resolverUrl: " https://library.example.edu/openurl?vid=1 " },
      { choice: "custom", resolverUrl: "http://library.example.edu/openurl" },
      { choice: "custom", resolverUrl: "" },
      { choice: "custom", resolverUrl: "library.example.edu/openurl" },
      { choice: "custom", name: "n".repeat(121), resolverUrl: "https://library.example.edu/openurl" },
      { choice: "custom", resolverUrl: `https://library.example.edu/${"a".repeat(2000)}` },
      { choice: "other" },
      {},
    ],
    (input) => check(institutionFormSchema, input),
  ),
});

// --------------------------------------------------------------------- themes

write("themes", { themes, defaultTheme, themeCounterpart });

// ---------------------------------------------------------------------- store
// The rules that need a database: how a refreshed article is merged with a stored one, and
// the order and limits of the feed, the saved list and the journal list. They run against a
// throwaway database, made the way "npm run db:migrate" makes the real one.

const storeDir = mkdtempSync(join(tmpdir(), "journal-stack-fixtures-"));
const databasePath = join(storeDir, "fixtures.db");
execFileSync(process.execPath, [new URL("./apply-migration.mjs", import.meta.url).pathname, databasePath], {
  stdio: "ignore",
});
process.env.DATABASE_URL = `file:${databasePath}`;

const { db } = await import("@/lib/db");
const { upsertArticle } = await import("@/lib/refresh");
const { getFeedArticles, getFeedJournalGroups, getSavedArticles } = await import("@/lib/articles");
const { getFollowedJournals, getJournalDirectory } = await import("@/lib/journals");
const { parseAuthors } = await import("@/lib/utils");

async function storedRows() {
  const rows = await db.article.findMany({ orderBy: { createdAt: "asc" } });
  return rows.map((row) => ({
    journalId: row.journalId,
    sourceId: row.sourceId,
    doi: row.doi,
    title: row.title,
    abstract: row.abstract,
    publicationDate: iso(row.publicationDate),
    authors: parseAuthors(row.authorsJson),
    publisherLandingUrl: row.publisherLandingUrl,
    openAccessUrl: row.openAccessUrl,
    directPdfUrl: row.directPdfUrl,
    sourcePayload: row.sourcePayload,
  }));
}

const blankArticle = {
  doi: null,
  abstract: null,
  publicationDate: null as string | null,
  authors: [] as string[],
  publisherLandingUrl: null,
  openAccessUrl: null,
  directPdfUrl: null,
  sourcePayload: null,
};

// Each step is one article arriving in a refresh of the named journal.
const mergeSteps: Array<{ note: string; journalId: string; article: Omit<NormalizedArticleInput, "publicationDate"> & { publicationDate: string | null } }> = [
  {
    note: "a new article with everything filled in",
    journalId: "merge-a",
    article: {
      sourceId: "merge-a::one",
      doi: "10.1/One",
      title: "One",
      abstract: "The first abstract.",
      publicationDate: "2024-03-05T12:00:00.000Z",
      authors: ["Ada Okafor", "", "Liu Wei"],
      publisherLandingUrl: "https://publisher.example.org/one",
      openAccessUrl: "https://repository.example.org/one.pdf",
      directPdfUrl: "https://publisher.example.org/one.pdf",
      sourcePayload: "{\"sourceType\":\"crossref\",\"issn\":\"1111-1111\"}",
    },
  },
  {
    note: "the same article again, thinner: nothing already known is lost except the DOI and the source note",
    journalId: "merge-a",
    article: { ...blankArticle, sourceId: "merge-a::one", title: "One, retitled" },
  },
  {
    note: "a second article",
    journalId: "merge-a",
    article: { ...blankArticle, sourceId: "merge-a::two", doi: "10.1/two", title: "Two" },
  },
  {
    note: "a different key but the DOI of a stored article, written as an address: the stored one is updated and takes the new key",
    journalId: "merge-a",
    article: {
      ...blankArticle,
      sourceId: "merge-a::two-again",
      doi: "https://doi.org/10.1/TWO",
      title: "Two again",
      abstract: "An abstract arrives later.",
      authors: ["Second Author"],
    },
  },
  {
    note: "links that are not web links are not stored",
    journalId: "merge-a",
    article: {
      ...blankArticle,
      sourceId: "merge-a::three",
      title: "Three",
      publisherLandingUrl: "ftp://publisher.example.org/three",
      openAccessUrl: "javascript:alert(1)",
      directPdfUrl: " https://publisher.example.org/three.pdf ",
    },
  },
  {
    note: "and are filled in when good ones arrive",
    journalId: "merge-a",
    article: {
      ...blankArticle,
      sourceId: "merge-a::three",
      title: "Three",
      publisherLandingUrl: "https://publisher.example.org/three",
      publicationDate: "2024-01-02T12:00:00.000Z",
    },
  },
  {
    note: "the same key arriving under another journal moves the article there",
    journalId: "merge-b",
    article: { ...blankArticle, sourceId: "merge-a::three", doi: "10.1/three", title: "Three, moved" },
  },
  {
    note: "new authors replace old ones; an empty list does not",
    journalId: "merge-a",
    article: { ...blankArticle, sourceId: "merge-a::one", title: "One", authors: ["New Author"], abstract: "A newer abstract." },
  },
];

await db.journal.createMany({
  data: [
    { id: "merge-a", title: "Merge Journal A", sourceType: "crossref" },
    { id: "merge-b", title: "Merge Journal B", sourceType: "rss" },
  ],
});

const mergeResults = [];

for (const step of mergeSteps) {
  const outcome = await upsertArticle(step.journalId, {
    ...step.article,
    publicationDate: step.article.publicationDate ? new Date(step.article.publicationDate) : null,
  });
  mergeResults.push({ ...step, outcome, stored: await storedRows() });
}

await db.journal.deleteMany();

// A library of journals and articles for the lists. Dates, opens and saves follow fixed
// patterns so that every ordering rule has ties to break and rows to leave out.
const minute = 60_000;
const day = 24 * 60 * minute;
const createdBase = Date.UTC(2024, 5, 1);
const publishedBase = Date.UTC(2024, 0, 1, 12);

const listJournals = [
  { id: "list-1", title: "beta studies (lower case sorts after capitals)", active: true, followed: true, articles: 45 },
  { id: "list-2", title: "Alpha Review", active: true, followed: true, articles: 50 },
  { id: "list-3", title: "Gamma Letters, not followed", active: true, followed: false, articles: 5 },
  { id: "list-4", title: "Delta Quarterly, followed but inactive", active: false, followed: true, articles: 3 },
  { id: "list-5", title: "Epsilon Annals, followed with no articles", active: true, followed: true, articles: 0 },
  { id: "list-6", title: "\u00c9tudes, inactive and not followed", active: false, followed: false, articles: 1 },
];

const listArticles: Array<{
  sourceId: string;
  journalId: string;
  publicationDate: string | null;
  createdAt: string;
  opens: number;
  savedAt: string | null;
  openedAt: string | null;
}> = [];
let counter = 0;

for (const journal of listJournals) {
  for (let index = 0; index < journal.articles; index += 1) {
    counter += 1;
    listArticles.push({
      sourceId: `${journal.id}::${String(index + 1).padStart(2, "0")}`,
      journalId: journal.id,
      // Every seventh article has no date; the rest are scattered over about a year
      publicationDate: counter % 7 === 0 ? null : new Date(publishedBase + ((counter * 37) % 331) * day).toISOString(),
      createdAt: new Date(createdBase + ((counter * 53) % 211) * minute + counter).toISOString(),
      opens: counter % 5 === 0 ? (counter % 4) + 1 : counter % 11 === 0 ? 2 : 0,
      savedAt: counter % 9 === 0 ? new Date(createdBase + ((counter * 17) % 50) * day).toISOString() : null,
      openedAt: counter % 27 === 0 ? new Date(createdBase + counter * day).toISOString() : null,
    });
  }
}

await db.journal.createMany({
  data: listJournals.map((journal, index) => ({
    id: journal.id,
    title: journal.title,
    active: journal.active,
    sourceType: "crossref",
    createdAt: new Date(createdBase + index * minute),
  })),
});
await db.followedJournal.createMany({
  data: listJournals.filter((journal) => journal.followed).map((journal) => ({ journalId: journal.id })),
});
await db.article.createMany({
  data: listArticles.map((article) => ({
    id: article.sourceId,
    journalId: article.journalId,
    sourceId: article.sourceId,
    title: `Article ${article.sourceId}`,
    publicationDate: article.publicationDate ? new Date(article.publicationDate) : null,
    createdAt: new Date(article.createdAt),
  })),
});
await db.accessAttempt.createMany({
  data: listArticles.flatMap((article) =>
    Array.from({ length: article.opens }, () => ({
      articleId: article.sourceId,
      selectedRoute: "publisher_link",
      outcome: "publisher_redirect",
    })),
  ),
});
await db.savedArticle.createMany({
  data: listArticles
    .filter((article) => article.savedAt)
    .map((article) => ({
      articleId: article.sourceId,
      savedAt: new Date(article.savedAt!),
      openedAt: article.openedAt ? new Date(article.openedAt) : null,
    })),
});

const lists: Record<string, unknown> = {};

for (const sort of ["recent", "viewed"] as const) {
  lists[sort] = {
    articleView: (await getFeedArticles(sort)).map((article) => article.sourceId),
    journalView: (await getFeedJournalGroups(sort)).map((group) => ({
      journalId: group.journalId,
      journalTitle: group.journalTitle,
      totalArticles: group.totalArticles,
      articles: group.articles.map((article) => article.sourceId),
    })),
  };
}

write("store", {
  merge: mergeResults,
  lists: {
    journals: listJournals,
    articles: listArticles,
    feed: lists,
    saved: (await getSavedArticles()).map((saved) => saved.article.sourceId),
    journalDirectory: (await getJournalDirectory()).map((journal) => ({
      id: journal.id,
      followed: journal.follow !== null,
      articles: journal._count.articles,
    })),
    journalsToRefresh: (await getFollowedJournals()).map((journal) => journal.id),
  },
});

await db.$disconnect();
rmSync(storeDir, { recursive: true, force: true });
