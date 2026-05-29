import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getArticleRoutes } from "@/lib/resolver";

export const runtime = "nodejs";

function getRouteSelection(target: string) {
  if (target === "publisher") {
    return {
      selectedRoute: "publisher_link",
      outcome: "publisher_redirect",
    } as const;
  }

  return {
    selectedRoute: "institution_link",
    outcome: "institution_redirect",
  } as const;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const article = await db.article.findUnique({
    where: { id },
    include: { journal: true },
  });

  if (!article) {
    return NextResponse.json({ error: "Article not found." }, { status: 404 });
  }

  const target = new URL(request.url).searchParams.get("target");
  const routes = getArticleRoutes(article);
  const destination =
    target === "publisher"
      ? routes.publisherUrl ?? routes.georgiaTechUrl
      : routes.georgiaTechUrl;
  const tracking = getRouteSelection(target ?? "institution");

  await db.accessAttempt.create({
    data: {
      articleId: article.id,
      selectedRoute: tracking.selectedRoute,
      resolvedUrl: destination,
      outcome: tracking.outcome,
    },
  });

  return NextResponse.redirect(destination);
}
