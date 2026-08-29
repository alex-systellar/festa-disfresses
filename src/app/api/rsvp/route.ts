import { NextResponse } from "next/server";
import { isValidEmail, isValidName, recordRsvp, type RsvpAnswer } from "@/lib/assign";
import { deviceCookie, newDeviceId, readDeviceId } from "@/lib/device";
import { clientIp } from "@/lib/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ANSWERS: readonly RsvpAnswer[] = ["maybe", "no"];

/**
 * Records a no or a maybe.
 *
 * A yes deliberately does not come through here: `/api/claim` writes the
 * answer and the country in one transaction, so the two can never disagree.
 * Storing the other two means a guest who declines is not asked again on their
 * next visit, and the host gets a headcount of everyone who replied rather
 * than only of those who took a country.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { email, name, answer } = (body ?? {}) as {
    email?: unknown;
    name?: unknown;
    answer?: unknown;
  };

  if (typeof email !== "string" || !isValidEmail(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  if (typeof name !== "string" || !isValidName(name)) {
    return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  }
  if (typeof answer !== "string" || !(ANSWERS as readonly string[]).includes(answer)) {
    return NextResponse.json({ error: "invalid_answer" }, { status: 400 });
  }

  const deviceId = readDeviceId(request) ?? newDeviceId();

  try {
    await recordRsvp(email, name, answer as RsvpAnswer, clientIp(request), deviceId);
    const response = NextResponse.json(
      { ok: true },
      { headers: { "cache-control": "no-store" } },
    );
    response.cookies.set(deviceCookie(deviceId));
    return response;
  } catch (err) {
    console.error("[rsvp] failed", err);
    return NextResponse.json({ error: "storage_unavailable" }, { status: 500 });
  }
}
