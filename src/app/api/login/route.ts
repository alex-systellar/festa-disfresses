import { NextResponse } from "next/server";
import { isValidEmail, isValidName } from "@/lib/assign";
import { login, NoCountryError, NoMatchError } from "@/lib/concurs";
import { currentPhase } from "@/lib/phase";
import { phaseGuard } from "@/lib/phase-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Log in with the name and email the guest signed up with. Answers their
 * country and, while the contest is open, what they may vote for.
 *
 * This is the only way to look a country up once the draw is over — `lookup`
 * closes with the draw, because it answers to an email alone. It reads and
 * never writes, and unlike `precheck` it sets no device cookie: nobody is being
 * registered, so there is nothing to fingerprint.
 *
 * Both a wrong email and a wrong name answer `401 no_match`, identically, so
 * the endpoint cannot be used to ask whether an address is on the list.
 */
export async function POST(request: Request) {
  const closed = phaseGuard("/api/login");
  if (closed) return closed;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { email, name } = (body ?? {}) as { email?: unknown; name?: unknown };
  if (typeof email !== "string" || !isValidEmail(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  if (typeof name !== "string" || !isValidName(name)) {
    return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  }

  try {
    const result = await login(email, name, currentPhase() === "concurs");
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    if (err instanceof NoMatchError) {
      return NextResponse.json({ error: "no_match" }, { status: 401 });
    }
    // Only reachable with a right email *and* a right name, so it says why.
    if (err instanceof NoCountryError) {
      return NextResponse.json({ error: "no_country" }, { status: 403 });
    }
    console.error("[login] failed", err);
    return NextResponse.json({ error: "storage_unavailable" }, { status: 500 });
  }
}
