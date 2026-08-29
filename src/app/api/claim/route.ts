import { NextResponse } from "next/server";
import { claim, IpLimitError, isValidEmail, isValidName } from "@/lib/assign";
import { deviceCookie, newDeviceId, readDeviceId } from "@/lib/device";
import { checkEmailDomain } from "@/lib/email";
import { clientIp } from "@/lib/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  // Does this domain accept mail at all? Catches typo-squats and invented
  // domains before a guest walks off with a country nobody can trace back to
  // them. It says nothing about whether the mailbox itself exists, and it
  // fails open on DNS trouble — see lib/email.ts.
  if (!(await checkEmailDomain(email))) {
    return NextResponse.json({ error: "invalid_email_domain" }, { status: 400 });
  }

  // Reuse the browser's existing id where there is one, so a second email from
  // the same device is visibly linked to the first.
  const deviceId = readDeviceId(request) ?? newDeviceId();

  try {
    const result = await claim(email, name, clientIp(request), deviceId);
    const response = NextResponse.json(result, {
      headers: { "cache-control": "no-store" },
    });
    response.cookies.set(deviceCookie(deviceId));
    return response;
  } catch (err) {
    if (err instanceof IpLimitError) {
      return NextResponse.json({ error: "ip_limit" }, { status: 429 });
    }
    console.error("[claim] failed", err);
    return NextResponse.json({ error: "storage_unavailable" }, { status: 500 });
  }
}
