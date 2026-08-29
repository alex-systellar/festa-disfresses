import { NextResponse } from "next/server";
import { isValidEmail, NotFoundError, reroll, RerollUsedError } from "@/lib/assign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The guest's one and only second attempt. The new country is final. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { email } = (body ?? {}) as { email?: unknown };
  if (typeof email !== "string" || !isValidEmail(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  try {
    const result = await reroll(email);
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    if (err instanceof NotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (err instanceof RerollUsedError) {
      return NextResponse.json({ error: "reroll_used" }, { status: 409 });
    }
    console.error("[reroll] failed", err);
    return NextResponse.json({ error: "storage_unavailable" }, { status: 500 });
  }
}
