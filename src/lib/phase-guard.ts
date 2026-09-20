import { NextResponse } from "next/server";
import { apiRefusal, currentPhase } from "@/lib/phase";

/**
 * The route's own check that it is open in the current phase, so a handler
 * never depends on the proxy having run. Returns the response to send, or null
 * to carry on:
 *
 *     const closed = phaseGuard("/api/claim");
 *     if (closed) return closed;
 */
export function phaseGuard(pathname: string): NextResponse | null {
  const refused = apiRefusal(pathname, currentPhase());
  if (!refused) return null;
  return NextResponse.json(
    { error: refused.error },
    { status: refused.status, headers: { "cache-control": "no-store" } },
  );
}
