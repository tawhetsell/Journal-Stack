import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getArticleRoutes } from "@/lib/resolver";
import { getInstitutionSetting } from "@/lib/settings";
import { safeHttpUrl } from "@/lib/utils";

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
  const setting = await getInstitutionSetting();
  const routes = getArticleRoutes(
    article,
    setting.status === "set" ? setting.institution : null,
  );

  // The page asks the user to choose an institution before linking here, so
  // this is only reached by a stale tab or a hand-typed address.
  if (target !== "publisher" && !routes.institutionUrl) {
    return NextResponse.json(
      { error: "No institution is set. Choose one in Settings first." },
      { status: 409 },
    );
  }

  const destination = safeHttpUrl(
    target === "publisher"
      ? routes.publisherUrl ?? routes.institutionUrl
      : routes.institutionUrl,
  );

  if (!destination) {
    return NextResponse.json(
      { error: "This article has no http(s) link to open." },
      { status: 400 },
    );
  }

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
