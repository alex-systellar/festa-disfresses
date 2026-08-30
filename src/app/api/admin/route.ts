import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { COUNTRIES, getCountry } from "@/data/countries";
import { clearAll, isValidEmail, removeGuest } from "@/lib/assign";
import { activeDriver, ConflictError, readStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const expected = process.env.ADMIN_KEY;
  if (!expected) return false; // No key configured => admin stays closed.
  // Header first. A destructive call should not have to carry the key in the
  // query string, where it lands in browser history and server access logs;
  // GET keeps accepting ?key= so an ops bookmark still works.
  const provided =
    request.headers.get("x-admin-key") ?? new URL(request.url).searchParams.get("key") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data } = await readStore();
  const taken = new Set(data.assignments.map((a) => a.countryCode));

  /**
   * Group emails by IP and by device, so the host sees *which* entries collide
   * rather than just a count.
   *
   * Guests register from home ahead of the party, so a repeated IP is a real
   * signal — but housemates and couples legitimately share one, and anyone on
   * mobile data sits behind carrier NAT with strangers. The device cookie is
   * the stronger signal: it survives a change of network and only repeats when
   * the same browser profile registers twice.
   */
  const byIp = new Map<string, string[]>();
  const byDevice = new Map<string, string[]>();
  for (const a of data.assignments) {
    if (a.ip) byIp.set(a.ip, [...(byIp.get(a.ip) ?? []), a.email]);
    if (a.deviceId) {
      byDevice.set(a.deviceId, [...(byDevice.get(a.deviceId) ?? []), a.email]);
    }
  }

  // Guests who answered but hold no country: every "no" and "maybe", plus
  // anyone whose claim never completed. They are invisible in the assignments
  // table by construction, and they are exactly who the host needs for a
  // headcount.
  const holders = new Set(data.assignments.map((a) => a.email));
  const withoutCountry = data.guests
    .filter((g) => !holders.has(g.email))
    .sort((a, b) => b.rsvpAt.localeCompare(a.rsvpAt))
    .map((g) => ({ email: g.email, name: g.name, rsvp: g.rsvp, rsvpAt: g.rsvpAt }));

  const rsvpCounts = { yes: 0, maybe: 0, no: 0 };
  for (const g of data.guests) rsvpCounts[g.rsvp] += 1;

  return NextResponse.json(
    {
      driver: activeDriver(),
      total: COUNTRIES.length,
      assigned: data.assignments.length,
      rsvpCounts,
      withoutCountry,
      /** Groups of more than one email sharing a single IP / browser. */
      duplicateIpGroups: [...byIp.values()].filter((emails) => emails.length > 1),
      duplicateDeviceGroups: [...byDevice.values()].filter((emails) => emails.length > 1),
      remaining: COUNTRIES.filter((c) => !taken.has(c.code)).map((c) => ({
        code: c.code,
        name: c.name,
        flag: c.flag,
        flagImage: c.flagImage ?? null,
      })),
      assignments: [...data.assignments]
        .sort((a, b) => b.assignedAt.localeCompare(a.assignedAt))
        .map((a) => {
          const country = getCountry(a.countryCode);
          const previous = a.previousCountryCode ? getCountry(a.previousCountryCode) : undefined;
          return {
            email: a.email,
            name: a.name,
            assignedAt: a.assignedAt,
            duplicate: Boolean(a.duplicate),
            rerolled: Boolean(a.rerolled),
            previousName: previous?.name ?? null,
            ip: a.ip ?? null,
            /** How many guests share this IP. 1 means nobody else does. */
            ipCount: a.ip ? (byIp.get(a.ip)?.length ?? 1) : null,
            /** Other emails registered from this same IP. */
            sharedIpWith: a.ip ? (byIp.get(a.ip) ?? []).filter((e) => e !== a.email) : [],
            /** Short, display-friendly slice of the device id. */
            device: a.deviceId ? a.deviceId.slice(0, 8) : null,
            /** Other emails from this same browser — the strongest signal. */
            sharedDeviceWith: a.deviceId
              ? (byDevice.get(a.deviceId) ?? []).filter((e) => e !== a.email)
              : [],
            code: a.countryCode,
            country: country?.name ?? a.countryCode,
            flag: country?.flag ?? "🏳️",
            flagImage: country?.flagImage ?? null,
          };
        }),
    },
    { headers: { "cache-control": "no-store" } },
  );
}

/**
 * Ops deletion: one guest, or the whole party.
 *
 * There is no ambient credential anywhere in this app — the key lives in React
 * state and is attached explicitly per request — so a cross-site caller has
 * nothing to ride on and this needs no CSRF token of its own.
 */
export async function DELETE(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { email, all } = (body ?? {}) as { email?: unknown; all?: unknown };

  try {
    // Wiping everything is spelled out explicitly, so a malformed body can
    // never be mistaken for "delete the lot".
    if (all === true) {
      const removed = await clearAll();
      return NextResponse.json({ removed }, { headers: { "cache-control": "no-store" } });
    }

    if (typeof email !== "string" || !isValidEmail(email)) {
      return NextResponse.json({ error: "invalid_email" }, { status: 400 });
    }

    const deleted = await removeGuest(email);
    if (!deleted) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ removed: 1 }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("[admin] delete failed", err);
    // A write conflict is not the storage being down: the document is there
    // and readable, we just could not commit over it. Saying 503 tells the
    // operator to retry, where 500 storage_unavailable sent them looking at
    // the Blob store.
    if (err instanceof ConflictError) {
      return NextResponse.json({ error: "conflict", detail: err.message }, { status: 409 });
    }
    return NextResponse.json({ error: "storage_unavailable" }, { status: 500 });
  }
}
