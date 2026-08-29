import { NextResponse } from "next/server";
import {
  DeviceLimitError,
  IpLimitError,
  isValidEmail,
  isValidName,
  precheck,
} from "@/lib/assign";
import { deviceCookie, newDeviceId, readDeviceId } from "@/lib/device";
import { checkEmailDomain } from "@/lib/email";
import { clientIp } from "@/lib/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Everything the gate needs to know the moment the details are submitted.
 *
 * This exists so a guest learns about a bad domain or an already-registered
 * browser *there*, with their cursor still in the field that caused it —
 * rather than answering the RSVP first and being thrown back two screens.
 *
 * It runs every check `/api/claim` runs, but assigns nothing: the country is
 * still only handed out once somebody says they are coming.
 */
export async function POST(request: Request) {
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
  if (!(await checkEmailDomain(email))) {
    return NextResponse.json({ error: "invalid_email_domain" }, { status: 400 });
  }

  // Issued here rather than at claim time, so the browser is already carrying
  // its id by the time it matters and the second registration from one device
  // is caught on this very request.
  const deviceId = readDeviceId(request) ?? newDeviceId();

  try {
    const state = await precheck(email, clientIp(request), deviceId);
    const response = NextResponse.json(state, {
      headers: { "cache-control": "no-store" },
    });
    response.cookies.set(deviceCookie(deviceId));
    return response;
  } catch (err) {
    // 403, not 429: this is a refusal, not a rate limit. Retrying never helps.
    if (err instanceof DeviceLimitError) {
      return NextResponse.json({ error: "device_limit" }, { status: 403 });
    }
    if (err instanceof IpLimitError) {
      return NextResponse.json({ error: "ip_limit" }, { status: 403 });
    }
    console.error("[precheck] failed", err);
    return NextResponse.json({ error: "storage_unavailable" }, { status: 500 });
  }
}
