/**
 * Which part of the party the app is in, read from two environment flags.
 *
 *   draw     both flags off. Guests sign up, answer the RSVP and are handed a
 *            country. This is the app as it started.
 *   over     `REPARTIMENT_OVER` is on. The draw is finished: nobody new can sign
 *            up, and a guest logs in with the name and email they used to see
 *            what they got. `/` becomes the wall of every country.
 *   concurs  `IS_CONCURS` is on. The public prize is open: a logged-in guest
 *            votes for the best costume.
 *
 * `IS_CONCURS` wins over `REPARTIMENT_OVER`, and it implies it — voting on a
 * party whose countries are still being handed out makes no sense, so the
 * contest does not need both flags to be set. Turning `IS_CONCURS` back off
 * drops to `over`, not to `draw`.
 *
 * Read per request, never at build time: `src/proxy.ts` and the route handlers
 * call this on every request, so flipping a variable on Vercel and redeploying
 * (or restarting `next dev`) is all it takes.
 *
 * Both default to off. A missing or misspelt value leaves the draw open, which
 * is the state that can be recovered from: a guest who signed up during a
 * botched flip still has a country, where a wrongly-closed draw would send
 * them away with nothing.
 */

export type Phase = "draw" | "over" | "concurs";

const TRUE = new Set(["true", "1", "yes", "on", "si", "sí"]);

/** `true`, `1`, `yes`, `on` and `si`, in any case. Everything else is off. */
export function flagOn(raw: string | undefined): boolean {
  return raw !== undefined && TRUE.has(raw.trim().toLowerCase());
}

export function currentPhase(): Phase {
  if (flagOn(process.env.IS_CONCURS)) return "concurs";
  if (flagOn(process.env.REPARTIMENT_OVER)) return "over";
  return "draw";
}

/**
 * Which API routes are open in which phase.
 *
 * The page a guest sees is only half of a phase. A page that swaps to the wall
 * of countries while `POST /api/claim` still answers curl has not closed the
 * draw, and a country handed out after the fact cannot be handed back — the
 * same reasoning as the `COUNT_DOWN` gate. So `src/proxy.ts` refuses these
 * before the route runs, and each handler asks again through `phase-guard.ts`,
 * because a route should not depend on a matcher staying correct.
 *
 *   claim, precheck, rsvp, reroll, lookup   the draw only. Once it is over,
 *       `lookup` closes too: it answers to an email alone, and the login that
 *       replaces it is the one that also asks for the name.
 *   login   once the draw is over.
 *   vote    only while the contest is open.
 *
 * `/api/admin` is deliberately not here: it has its own key and works in
 * every phase.
 */
const DRAW_ONLY = new Set([
  "/api/claim",
  "/api/precheck",
  "/api/rsvp",
  "/api/reroll",
  "/api/lookup",
]);

export type ApiRefusal = { error: string; status: number };

/** Null when the route is open in this phase, otherwise what to answer. */
export function apiRefusal(pathname: string, phase: Phase): ApiRefusal | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;

  if (DRAW_ONLY.has(path)) {
    // 410, not 403: the draw is not being withheld, it has finished.
    return phase === "draw" ? null : { error: "repartiment_over", status: 410 };
  }
  if (path === "/api/login") {
    return phase === "draw" ? { error: "repartiment_open", status: 403 } : null;
  }
  if (path === "/api/vote") {
    return phase === "concurs" ? null : { error: "concurs_closed", status: 403 };
  }
  return null;
}
