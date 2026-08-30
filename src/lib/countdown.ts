/**
 * The pre-party gate. While `COUNT_DOWN` is in the future the app is closed:
 * `src/proxy.ts` sends every guest-facing route to the countdown page and
 * refuses the API outright.
 *
 * Unset means open. That is deliberate — the variable is removed once the
 * party opens, and a missing value must not lock the app out for good. It also
 * means the gate does nothing on Vercel until the variable is set there.
 */

/**
 * Parsed `COUNT_DOWN`, or null when unset or unparseable. A bare date like
 * `2026-09-11` is midnight **UTC**, which in Barcelona is 02:00 the same
 * morning; pin the offset (`2026-09-11T00:00:00+02:00`) when that matters.
 *
 * An unparseable value opens the app rather than closing it, for the same
 * reason as above — a typo should not brick the site.
 */
export function countdownTarget(): Date | null {
  const raw = process.env.COUNT_DOWN?.trim();
  if (!raw) return null;
  const target = new Date(raw);
  return Number.isNaN(target.getTime()) ? null : target;
}

/** True while the party has not opened yet. */
export function isLocked(now: number = Date.now()): boolean {
  const target = countdownTarget();
  return target !== null && now < target.getTime();
}
