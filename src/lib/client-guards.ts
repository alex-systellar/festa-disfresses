/**
 * Checks for what comes back over the wire, shared by every page that talks to
 * the API. `response.json()` is `unknown` for a reason: a proxy error page or a
 * stale deploy answers with something else, and the UI must not crash on it.
 */
import type { ClaimResult } from "@/components/PartyApp";

export function isClaimResult(value: unknown): value is ClaimResult {
  if (typeof value !== "object" || value === null) return false;
  const result = value as Record<string, unknown>;
  if (typeof result.remaining !== "number") return false;
  if (typeof result.canReroll !== "boolean") return false;
  const country = result.country;
  if (typeof country !== "object" || country === null) return false;
  const fields = country as Record<string, unknown>;
  return (
    typeof fields.code === "string" &&
    typeof fields.name === "string" &&
    typeof fields.flagImage === "string" &&
    Array.isArray(fields.colors) &&
    fields.colors.length === 2 &&
    typeof fields.anthem === "object" &&
    fields.anthem !== null
  );
}

/** The `error` code of a failed response, or null if it did not carry one. */
export function errorCode(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const code = (value as Record<string, unknown>).error;
  return typeof code === "string" ? code : null;
}
