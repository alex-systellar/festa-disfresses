import { NextResponse } from "next/server";
import { isValidEmail, lookup } from "@/lib/assign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What we already know about an email, on page load.
 *
 * Answers the same shape as `/api/precheck` but enforces nothing and writes
 * nothing: it is a read for a browser that already has a stored guest, so it
 * must never refuse anybody or set a device cookie.
 */
export async function GET(request: Request) {
  const email = new URL(request.url).searchParams.get("email") ?? "";
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  try {
    const state = await lookup(email);
    return NextResponse.json(state, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("[lookup] failed", err);
    return NextResponse.json({ error: "storage_unavailable" }, { status: 500 });
  }
}
