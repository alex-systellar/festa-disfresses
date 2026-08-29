import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { COUNTRIES, getCountry } from "@/data/countries";
import { activeDriver, readStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const expected = process.env.ADMIN_KEY;
  if (!expected) return false; // No key configured => admin stays closed.
  const provided = new URL(request.url).searchParams.get("key") ?? "";
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

  return NextResponse.json(
    {
      driver: activeDriver(),
      total: COUNTRIES.length,
      assigned: data.assignments.length,
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
