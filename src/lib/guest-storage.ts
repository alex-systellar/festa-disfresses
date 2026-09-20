/**
 * What this browser remembers about the guest, so nobody retypes their details
 * on every visit. Client-only: every function touches `window`.
 *
 * One key for the whole app. The draw writes it when somebody answers, and the
 * pages that follow it (the wall, the contest) read the same record back — so a
 * browser that signed up is recognised afterwards without asking again. It is a
 * convenience, never an authority: whatever it holds is sent to the server, and
 * the server decides.
 */

export type StoredRsvp = "yes" | "maybe" | "no";

export type StoredGuest = { email: string; name: string; rsvp: StoredRsvp | null };

export const STORAGE_KEY = "festa-disfresses:guest";

function isRsvp(value: unknown): value is StoredRsvp {
  return value === "yes" || value === "maybe" || value === "no";
}

export function readStoredGuest(): StoredGuest | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const guest = parsed as Record<string, unknown>;
    if (typeof guest.email !== "string") return null;
    return {
      email: guest.email,
      name: typeof guest.name === "string" ? guest.name : "",
      // Written by later versions than the one that stored this record.
      rsvp: isRsvp(guest.rsvp) ? guest.rsvp : null,
    };
  } catch {
    return null;
  }
}

export function writeStoredGuest(guest: StoredGuest): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(guest));
  } catch {
    // Private mode or a full quota: the page still works, it just won't stick.
  }
}

export function clearStoredGuest(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do — the login form is shown either way.
  }
}
