import { randomBytes } from "node:crypto";

export const DEVICE_COOKIE = "fd_device";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * A per-browser identifier, set on first claim and sent back on every later
 * request.
 *
 * This is the signal that actually catches one person registering twice, which
 * the IP cannot: at a party every guest shares one WiFi NAT address, so IPs all
 * collapse to the same value. The cookie is per-browser-profile, so a second
 * email from the same phone reuses it and shows up in the admin view.
 *
 * It is evadable on purpose-built effort — clearing site data, a private
 * window, or a second device all produce a fresh id — so it is a strong hint
 * for the host, not an authorisation mechanism.
 */
export function readDeviceId(request: Request): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;

  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== DEVICE_COOKIE) continue;
    const value = decodeURIComponent(part.slice(eq + 1).trim());
    // Only accept our own shape; anything else gets replaced.
    return /^[0-9a-f]{32}$/.test(value) ? value : undefined;
  }
  return undefined;
}

export function newDeviceId(): string {
  return randomBytes(16).toString("hex");
}

export function deviceCookie(id: string) {
  return {
    name: DEVICE_COOKIE,
    value: id,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  };
}
