import { resolveMx } from "node:dns/promises";

/**
 * Email identity and plausibility checks.
 *
 * Lives apart from `assign.ts` because `store.ts` needs `normalizeEmail` to
 * migrate stored records, and `assign.ts` already imports `store.ts` — putting
 * this here keeps that from becoming an import cycle.
 *
 * Nothing here proves the guest owns the address: the app never sends mail, so
 * ownership is unverifiable by construction. These checks only catch typos and
 * addresses that could not possibly receive mail.
 */

// Deliberately permissive: this gates a party, not a bank account.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Providers that treat `+tag` as an alias for the bare mailbox. Kept as an
 * explicit list rather than applied universally: `+` is a legal character in a
 * local part, and stripping it everywhere would silently merge two genuinely
 * different addresses at any host that does not do plus-addressing.
 */
const PLUS_ALIASING = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "hotmail.es",
  "hotmail.co.uk",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "proton.me",
  "protonmail.com",
  "fastmail.com",
]);

/**
 * Gmail — and only Gmail — ignores dots in the local part, so `a.lex@` and
 * `alex@` are one mailbox. Everywhere else a dot is significant and
 * `first.last@company.com` is a different person from `firstlast@`.
 */
const DOT_INSENSITIVE = new Set(["gmail.com", "googlemail.com"]);

/** Domains that are the same mailbox under two names. */
const DOMAIN_ALIASES: Record<string, string> = {
  "googlemail.com": "gmail.com",
};

/**
 * The canonical form of an address — this is the stored identity.
 *
 * Beyond trimming and lowercasing it collapses provider-level aliases, so one
 * person cannot take two countries with `alex@gmail.com` and
 * `a.l.e.x+party@gmail.com`. Unrecognised domains get trim + lowercase only.
 */
export function normalizeEmail(input: string): string {
  const trimmed = input.trim().toLowerCase();

  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return trimmed;

  let local = trimmed.slice(0, at);
  let domain = trimmed.slice(at + 1);

  domain = DOMAIN_ALIASES[domain] ?? domain;

  // Strip the +tag before the dots: the tag itself may contain dots, and at a
  // dot-insensitive host those must go too.
  if (PLUS_ALIASING.has(domain)) {
    const plus = local.indexOf("+");
    if (plus !== -1) local = local.slice(0, plus);
  }
  if (DOT_INSENSITIVE.has(domain)) local = local.replaceAll(".", "");

  // A local part of nothing but a tag ("+foo@gmail.com") addresses no mailbox.
  // Letting `local` stay empty produces "@gmail.com", which fails EMAIL_RE and
  // so is rejected by isValidEmail rather than becoming a usable identity.
  return `${local}@${domain}`;
}

export function isValidEmail(input: string): boolean {
  const email = normalizeEmail(input);
  return email.length <= 254 && EMAIL_RE.test(email);
}

export function emailDomain(email: string): string {
  return email.slice(email.lastIndexOf("@") + 1);
}

/* ------------------------- domain plausibility check ----------------------- */

type CacheEntry = { ok: boolean; expires: number };
const mxCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000;
const DNS_TIMEOUT_MS = 2_000;

/** Escape hatch for local testing against domains that hold no MX records. */
function dnsCheckEnabled(): boolean {
  return process.env.EMAIL_DNS_CHECK !== "off";
}

async function hasMxRecords(domain: string): Promise<boolean> {
  const cached = mxCache.get(domain);
  if (cached && cached.expires > Date.now()) return cached.ok;

  let timer: NodeJS.Timeout | undefined;
  try {
    const records = await Promise.race([
      resolveMx(domain),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("dns_timeout")), DNS_TIMEOUT_MS);
      }),
    ]);
    const ok = records.length > 0;
    mxCache.set(domain, { ok, expires: Date.now() + CACHE_TTL_MS });
    return ok;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    // ENOTFOUND: no such domain. ENODATA: the domain exists but publishes no
    // MX, which is what parked typo-squats like gmial.com look like.
    if (code === "ENOTFOUND" || code === "ENODATA" || code === "NXDOMAIN") {
      mxCache.set(domain, { ok: false, expires: Date.now() + CACHE_TTL_MS });
      return false;
    }
    // Anything else is our problem, not the guest's — a SERVFAIL or a timeout
    // must never keep somebody standing at the door without a country. Fail
    // open, and do not cache a verdict we did not actually reach.
    console.warn(`[email] MX lookup for ${domain} failed open:`, code ?? err);
    return true;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Whether this address could plausibly receive mail. Note the deliberate
 * absence of an A-record fallback: the legacy "a host with an A record accepts
 * mail" rule is effectively dead for consumer domains, and honouring it would
 * wave through exactly the parked typo-squats worth catching.
 */
export async function checkEmailDomain(email: string): Promise<boolean> {
  if (!dnsCheckEnabled()) return true;
  return hasMxRecords(emailDomain(normalizeEmail(email)));
}
