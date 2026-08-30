import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { isLocked } from "@/lib/countdown";

/** Where the gate sends everything it closes. */
const COUNTDOWN_PATH = "/aviat";

/**
 * Reachable while the gate is up. `/com-funciona` is the one guest-facing page
 * that stays open — people can read the rules before the draw. `/admin` stays
 * open too: it is the organiser's own dashboard, already behind ADMIN_KEY, and
 * closing it would lock them out of the tool they need most before the party.
 */
const ALLOWED = ["/com-funciona", "/admin", "/api/admin"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isLocked()) {
    // Once the party opens there is nothing behind the countdown page.
    if (pathname === COUNTDOWN_PATH) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (pathname === COUNTDOWN_PATH) return NextResponse.next();
  if (ALLOWED.some((base) => pathname === base || pathname.startsWith(`${base}/`))) {
    return NextResponse.next();
  }

  /*
   * The API has to close as well. A gate that only swaps the page out still
   * leaves POST /api/claim answering curl, and a country handed out early
   * cannot be handed back.
   */
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "not_open_yet" }, { status: 503 });
  }

  // Rewrite, not redirect: a link someone shared keeps the URL it was given.
  return NextResponse.rewrite(new URL(COUNTDOWN_PATH, request.url));
}

export const config = {
  /*
   * Without a matcher this runs on every request including CSS, JS and the
   * flags, and the gate would blank the countdown page's own styling.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|flags/|anthems/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp3|ico|txt|xml)$).*)",
  ],
};
