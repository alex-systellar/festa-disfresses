import { NextResponse } from "next/server";
import { isValidEmail, lookup } from "@/lib/assign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Returning guests: read their country back without ever assigning a new one. */
export async function GET(request: Request) {
  const email = new URL(request.url).searchParams.get("email") ?? "";
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  try {
    const result = await lookup(email);
    if (!result) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("[lookup] failed", err);
    return NextResponse.json({ error: "storage_unavailable" }, { status: 500 });
  }
}
