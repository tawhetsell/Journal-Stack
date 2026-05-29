import { NextResponse } from "next/server";

import { refreshFollowedJournals } from "@/lib/refresh";
import { refreshRequestSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = refreshRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid refresh payload." },
      { status: 400 },
    );
  }

  const result = await refreshFollowedJournals(parsed.data.journalId);
  return NextResponse.json(result);
}
