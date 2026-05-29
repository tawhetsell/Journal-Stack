import { NextResponse } from "next/server";
import Parser from "rss-parser";

export const runtime = "nodejs";

const parser = new Parser();

type CrossrefJournal = {
  title?: string;
  publisher?: string;
  "issn-type"?: Array<{ value?: string; type?: string }>;
};

async function lookupCrossref(issn: string) {
  const response = await fetch(
    `https://api.crossref.org/journals/${encodeURIComponent(issn)}`,
    {
      headers: { "User-Agent": "literature-access-app/0.1" },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    return NextResponse.json(
      { error: "No journal found for that ISSN." },
      { status: 404 },
    );
  }

  const payload = (await response.json()) as { message?: CrossrefJournal };
  const message = payload.message ?? {};
  const issnTypes = message["issn-type"] ?? [];

  return NextResponse.json({
    title: message.title ?? null,
    publisher: message.publisher ?? null,
    issnPrint: issnTypes.find((i) => i.type === "print")?.value ?? null,
    issnElectronic: issnTypes.find((i) => i.type === "electronic")?.value ?? null,
  });
}

function isHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function lookupRss(feedUrl: string) {
  if (!isHttpUrl(feedUrl)) {
    return NextResponse.json(
      { error: "RSS URL must start with http:// or https://." },
      { status: 400 },
    );
  }

  const response = await fetch(feedUrl, {
    headers: {
      Accept: "application/rss+xml, application/xml, text/xml;q=0.9",
      "User-Agent": "literature-access-app/0.1",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: "Could not fetch that RSS URL." },
      { status: 404 },
    );
  }

  const xml = await response.text();
  const feed = await parser.parseString(xml);

  return NextResponse.json({
    title: feed.title ?? null,
    homepageUrl: feed.link ?? null,
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = url.searchParams.get("type");

  try {
    if (type === "crossref") {
      const issn = url.searchParams.get("issn")?.trim();
      if (!issn) {
        return NextResponse.json({ error: "Enter an ISSN first." }, { status: 400 });
      }
      return await lookupCrossref(issn);
    }

    const feedUrl = url.searchParams.get("url")?.trim();
    if (!feedUrl) {
      return NextResponse.json({ error: "Enter an RSS URL first." }, { status: 400 });
    }
    return await lookupRss(feedUrl);
  } catch {
    return NextResponse.json(
      { error: "Lookup failed. Check the URL or ISSN and try again." },
      { status: 422 },
    );
  }
}
