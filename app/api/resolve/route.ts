import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { resolveAccess } from "@/lib/resolver";
import { getInstitutionSetting } from "@/lib/settings";
import { resolveRequestSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = resolveRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid resolve payload." },
      { status: 400 },
    );
  }

  const setting = await getInstitutionSetting();
  const institution = setting.status === "set" ? setting.institution : null;

  if (parsed.data.articleId) {
    const article = await db.article.findUnique({
      where: { id: parsed.data.articleId },
      include: { journal: true },
    });

    if (!article) {
      return NextResponse.json({ error: "Article not found." }, { status: 404 });
    }

    const access = resolveAccess(article, institution);

    await db.accessAttempt.create({
      data: {
        articleId: article.id,
        selectedRoute: access.status,
        resolvedUrl: access.url,
        outcome: access.url ? "api_resolved" : "unavailable",
      },
    });

    return NextResponse.json(access);
  }

  const access = resolveAccess({
    title: parsed.data.title ?? parsed.data.doi ?? "Untitled article",
    doi: parsed.data.doi ?? null,
    publicationDate: null,
    openAccessUrl: null,
    directPdfUrl: null,
    publisherLandingUrl: null,
    journal: parsed.data.journalTitle
      ? {
          title: parsed.data.journalTitle,
          issnElectronic: null,
          issnPrint: null,
        }
      : null,
  }, institution);

  return NextResponse.json(access);
}
