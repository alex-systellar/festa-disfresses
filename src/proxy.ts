import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { isLocked } from "@/lib/countdown";
import { apiRefusal, currentPhase, type Phase } from "@/lib/phase";

/** Where the gate sends everything it closes. */
const COUNTDOWN_PATH = "/aviat";

/**
 * Reachable while the gate is up. `/com-funciona` is the one guest-facing page
 * that stays open — people can read the rules before the draw. `/admin` stays
 * open too: it is the organiser's own dashboard, already behind ADMIN_KEY, and
 * closing it would lock them out of the tool they need most before the party.
 */
const ALLOWED = ["/com-funciona", "/admin", "/api/admin"];

/**
 * What `/` becomes once the draw is over. `draw` is absent because it is the
 * page itself. Reached by rewrite, so the address stays `/` — the link people
 * were given on day one is still the link.
 */
const PHASE_VIEW: Record<Exclude<Phase, "draw">, string> = {
  over: "/repartiment",
  concurs: "/concurs",
};

/**
 * The routes those rewrites land on. Nobody is meant to type them, and in the
 * wrong phase they would show the wrong thing, so a direct visit goes home
 * and `/` picks the view. A rewrite does not run the proxy a second time, so
 * this cannot loop with the rewrite above.
 */
const PHASE_VIEW_PATHS = new Set(Object.values(PHASE_VIEW));

/**
 * Metadata routes answer even while the gate is up. A link shared during the
 * countdown previews from `/opengraph-image` (and `/aviat/opengraph-image`),
 * and those have no file extension for the matcher to skip — rewriting them
 * hands WhatsApp an HTML page where it asked for a poster.
 */
const METADATA = /\/(opengraph-image|twitter-image)(-[\w-]+)?(\/|$)/;

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isLocked()) {
    // Once the party opens there is nothing behind the countdown page.
    if (pathname === COUNTDOWN_PATH) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return routeByPhase(request);
  }

  if (pathname === COUNTDOWN_PATH || METADATA.test(pathname)) {
    return NextResponse.next();
  }
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

/**
 * The open party: `/` and the API depend on how far along it is. The countdown
 * gate above always wins, so a flag flipped early changes nothing until the
 * date has passed.
 */
function routeByPhase(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const phase = currentPhase();

  if (pathname.startsWith("/api/")) {
    const refused = apiRefusal(pathname, phase);
    if (refused) {
      return NextResponse.json(
        { error: refused.error },
        { status: refused.status, headers: { "cache-control": "no-store" } },
      );
    }
    return NextResponse.next();
  }

  if (pathname === "/" && phase !== "draw") {
    return NextResponse.rewrite(new URL(PHASE_VIEW[phase], request.url));
  }
  if (PHASE_VIEW_PATHS.has(pathname)) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  /*
   * Without a matcher this runs on every request including CSS, JS and the
   * flags, and the gate would blank the countdown page's own styling.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|flags/|anthems/|intro/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp3|mp4|ico|txt|xml)$).*)",
  ],
};
