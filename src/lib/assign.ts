import { randomInt } from "node:crypto";
import { COUNTRIES, getCountry, type Country } from "@/data/countries";
import { normalizeEmail } from "@/lib/email";
import {
  ConflictError,
  readStore,
  withLock,
  writeStore,
  type Assignment,
  type StoreData,
} from "@/lib/store";

// Re-exported so callers have one place to reach for email helpers.
export { isValidEmail, normalizeEmail } from "@/lib/email";

export function normalizeName(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

export function isValidName(input: string): boolean {
  const name = normalizeName(input);
  return name.length >= 1 && name.length <= 80;
}

export type ClaimResult = {
  country: Country;
  name: string;
  /** False when this email had already been assigned — a returning guest. */
  isNew: boolean;
  /** True when every country was taken and we had to reuse one. */
  duplicate: boolean;
  /** True while the guest still has their one reroll in hand. */
  canReroll: boolean;
  remaining: number;
};

export class RerollUsedError extends Error {}
export class NotFoundError extends Error {}

/** Refused because this browser already claimed under another address. */
export class DeviceLimitError extends Error {}
/** Refused because this network already claimed the allowed number of times. */
export class IpLimitError extends Error {}

/**
 * Hard limits on new claims. These BLOCK, they do not merely flag.
 *
 * Defaults are asymmetric on purpose. A repeated device is a browser profile
 * registering twice, which is almost always one person taking a second
 * country, so one is the cap. A repeated IP is a household — couples and
 * housemates share one legitimately — so the default leaves room for two
 * before refusing.
 *
 * Set either to "off" (or 0) to stop enforcing it. Raise MAX_PER_IP for a
 * shared flat; every refusal is a real guest who cannot get in without you.
 */
const DEFAULT_MAX_PER_DEVICE = 1;
const DEFAULT_MAX_PER_IP = 2;

function limitFrom(raw: string | undefined, fallback: number): number | null {
  if (raw === undefined || raw === "") return fallback;
  if (raw.toLowerCase() === "off") return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function maxPerDevice(): number | null {
  return limitFrom(process.env.MAX_PER_DEVICE, DEFAULT_MAX_PER_DEVICE);
}

function maxPerIp(): number | null {
  return limitFrom(process.env.MAX_PER_IP, DEFAULT_MAX_PER_IP);
}

/**
 * Enforced only for a genuinely new email — a returning guest has already
 * short-circuited above, so nobody can be locked out of the country they hold.
 */
function enforceLimits(data: StoreData, email: string, ip?: string, deviceId?: string): void {
  const deviceCap = maxPerDevice();
  if (deviceCap !== null && deviceId) {
    const others = data.assignments.filter((a) => a.deviceId === deviceId && a.email !== email);
    if (others.length >= deviceCap) {
      throw new DeviceLimitError(`device already claimed as ${others.map((a) => a.email).join(", ")}`);
    }
  }

  const ipCap = maxPerIp();
  if (ipCap !== null && ip) {
    const others = data.assignments.filter((a) => a.ip === ip && a.email !== email);
    if (others.length >= ipCap) {
      throw new IpLimitError(`ip ${ip} already has ${others.length} assignments`);
    }
  }
}

function toResult(assignment: Assignment, country: Country, data: StoreData, isNew: boolean): ClaimResult {
  return {
    country,
    name: assignment.name,
    isNew,
    duplicate: Boolean(assignment.duplicate),
    canReroll: !assignment.rerolled,
    remaining: remainingCount(data.assignments),
  };
}

/** Pick uniformly from the untaken countries, ignoring `exclude`. */
function pick(data: StoreData, exclude?: string): { country: Country; duplicate: boolean } {
  const taken = new Set(data.assignments.map((a) => a.countryCode));
  if (exclude) taken.add(exclude);

  const pool = COUNTRIES.filter((c) => !taken.has(c.code));
  if (pool.length > 0) {
    return { country: pool[randomInt(pool.length)], duplicate: false };
  }

  // Pool exhausted (more guests than countries): keep the party working and
  // mark the assignment as a knowing repeat.
  const fallback = COUNTRIES.filter((c) => c.code !== exclude);
  const candidates = fallback.length > 0 ? fallback : COUNTRIES;
  return { country: candidates[randomInt(candidates.length)], duplicate: true };
}

/**
 * Runs a read-modify-write against the store, retrying when another serverless
 * instance wrote first. `fn` mutates `data` and returns its result plus whether
 * anything actually needs persisting.
 */
const MAX_ATTEMPTS = 5;

async function mutate<T>(fn: (data: StoreData) => { value: T; dirty: boolean }): Promise<T> {
  return withLock(async () => {
    for (let attempt = 1; ; attempt++) {
      const { data, version } = await readStore();
      const { value, dirty } = fn(data);
      if (!dirty) return value;
      try {
        await writeStore(data, version);
        return value;
      } catch (err) {
        // Someone else claimed in the meantime — redo the whole decision
        // against their data so we never hand out a country twice.
        if (err instanceof ConflictError && attempt < MAX_ATTEMPTS) continue;
        throw err;
      }
    }
  });
}

export async function claim(
  rawEmail: string,
  rawName: string,
  ip?: string,
  deviceId?: string,
): Promise<ClaimResult> {
  const email = normalizeEmail(rawEmail);
  const name = normalizeName(rawName);

  return mutate((data) => {
    const existing = data.assignments.find((a) => a.email === email);
    if (existing && getCountry(existing.countryCode)) {
      const country = getCountry(existing.countryCode)!;
      // Returning guest. Let them correct a typo'd name, but never reassign.
      let dirty = Boolean(name) && existing.name !== name;
      if (dirty) existing.name = name;
      // Backfill for guests who claimed before device tracking existed.
      if (deviceId && existing.deviceId !== deviceId) {
        existing.deviceId = deviceId;
        dirty = true;
      }
      return { value: toResult(existing, country, data, false), dirty };
    }
    // Either brand new, or the stored code vanished from COUNTRIES because the
    // list was edited mid-party — in which case reassign rather than 500.
    if (existing) data.assignments = data.assignments.filter((a) => a.email !== email);

    enforceLimits(data, email, ip, deviceId);

    const { country, duplicate } = pick(data);
    const assignment: Assignment = {
      email,
      name,
      countryCode: country.code,
      assignedAt: new Date().toISOString(),
      ...(ip ? { ip } : {}),
      ...(deviceId ? { deviceId } : {}),
      ...(duplicate ? { duplicate: true } : {}),
    };
    data.assignments.push(assignment);
    return { value: toResult(assignment, country, data, true), dirty: true };
  });
}

/**
 * The guest's single second attempt. The first country goes straight back into
 * the pool and the new one is final — only ever one country is persisted per
 * guest.
 */
export async function reroll(rawEmail: string): Promise<ClaimResult> {
  const email = normalizeEmail(rawEmail);

  return mutate((data) => {
    const existing = data.assignments.find((a) => a.email === email);
    if (!existing) throw new NotFoundError(email);
    if (existing.rerolled) throw new RerollUsedError(email);

    const previous = existing.countryCode;
    // Exclude the old country so a reroll always actually changes something.
    const { country, duplicate } = pick(data, previous);

    existing.previousCountryCode = previous;
    existing.countryCode = country.code;
    existing.rerolled = true;
    existing.assignedAt = new Date().toISOString();
    if (duplicate) existing.duplicate = true;
    else delete existing.duplicate;

    return { value: toResult(existing, country, data, false), dirty: true };
  });
}

/** Look up an existing assignment without creating one. */
export async function lookup(rawEmail: string): Promise<ClaimResult | null> {
  const email = normalizeEmail(rawEmail);
  const { data } = await readStore();
  const existing = data.assignments.find((a) => a.email === email);
  if (!existing) return null;
  const country = getCountry(existing.countryCode);
  if (!country) return null;
  return toResult(existing, country, data, false);
}

/* --------------------------------- ops only -------------------------------- */

/**
 * Drop one guest's assignment, handing their country back to the pool.
 *
 * Returns false when that email held nothing, so the caller can answer 404
 * rather than report a deletion that never happened.
 */
export async function removeAssignment(rawEmail: string): Promise<boolean> {
  const email = normalizeEmail(rawEmail);

  return mutate((data) => {
    const before = data.assignments.length;
    data.assignments = data.assignments.filter((a) => a.email !== email);
    const removed = data.assignments.length !== before;
    return { value: removed, dirty: removed };
  });
}

/**
 * Empty the whole party. Returns how many assignments were destroyed.
 *
 * Runs through the same locked read-modify-write as claim and reroll, so a
 * claim landing at the same instant either commits before the wipe or loses
 * the ETag check and is retried against the emptied document. It can never be
 * half-applied, and it can never resurrect a record the wipe just removed.
 */
export async function clearAssignments(): Promise<number> {
  return mutate((data) => {
    const removed = data.assignments.length;
    data.assignments = [];
    return { value: removed, dirty: removed > 0 };
  });
}

function remainingCount(assignments: Assignment[]): number {
  const taken = new Set(assignments.map((a) => a.countryCode));
  return COUNTRIES.filter((c) => !taken.has(c.code)).length;
}
