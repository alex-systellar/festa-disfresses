import { NextResponse } from "next/server";
import { isValidEmail, isValidName } from "@/lib/assign";
import {
  castVote,
  NoCountryError,
  NoMatchError,
  OwnCountryError,
  RepeatedCountryError,
  UnknownCategoryError,
  UnknownCountryError,
} from "@/lib/concurs";
import { isCategoryId } from "@/data/categories";
import { phaseGuard } from "@/lib/phase-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cast, change or take back a vote in one category.
 *
 *   { email, name, category, country }   country is a code, or null to clear
 *
 * Every call carries the guest's name and email and is checked afresh: there is
 * no session, so a browser that remembers a login is only remembering what to
 * send. A guest has one vote per category — sending another replaces it — and
 * cannot pick the same country in two categories. Answers `{ myVotes }`, the
 * whole ballot as it now stands.
 *
 *   401 no_match             the email or the name is not on file
 *   403 no_country           they are on file but answered no or maybe
 *   403 own_country          a guest cannot vote for what they are wearing
 *   400 invalid_category     not one of the categories
 *   400 invalid_country      not a country in the list
 *   409 country_repeated     already picked in another category: `{ category }`
 */
export async function POST(request: Request) {
  const closed = phaseGuard("/api/vote");
  if (closed) return closed;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { email, name, category, country } = (body ?? {}) as {
    email?: unknown;
    name?: unknown;
    category?: unknown;
    country?: unknown;
  };
  if (typeof email !== "string" || !isValidEmail(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  if (typeof name !== "string" || !isValidName(name)) {
    return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  }
  if (!isCategoryId(category)) {
    return NextResponse.json({ error: "invalid_category" }, { status: 400 });
  }
  if (country !== null && (typeof country !== "string" || country.length === 0 || country.length > 8)) {
    return NextResponse.json({ error: "invalid_country" }, { status: 400 });
  }

  try {
    const result = await castVote(email, name, category, country);
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    if (err instanceof NoMatchError) {
      return NextResponse.json({ error: "no_match" }, { status: 401 });
    }
    if (err instanceof NoCountryError) {
      return NextResponse.json({ error: "no_country" }, { status: 403 });
    }
    if (err instanceof OwnCountryError) {
      return NextResponse.json({ error: "own_country" }, { status: 403 });
    }
    if (err instanceof UnknownCountryError) {
      return NextResponse.json({ error: "invalid_country" }, { status: 400 });
    }
    if (err instanceof UnknownCategoryError) {
      return NextResponse.json({ error: "invalid_category" }, { status: 400 });
    }
    if (err instanceof RepeatedCountryError) {
      return NextResponse.json({ error: "country_repeated", category: err.category }, { status: 409 });
    }
    console.error("[vote] failed", err);
    return NextResponse.json({ error: "storage_unavailable" }, { status: 500 });
  }
}
