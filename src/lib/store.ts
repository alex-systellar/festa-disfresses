import { promises as fs } from "node:fs";
import path from "node:path";
import { normalizeEmail } from "@/lib/email";

/**
 * Storage is a single JSON document. There is no database.
 *
 * Two drivers, picked automatically:
 *  - "blob": Vercel Blob, used whenever BLOB_READ_WRITE_TOKEN is present
 *    (i.e. on Vercel). Still just a JSON file — it simply lives somewhere
 *    that survives a serverless function's read-only, ephemeral filesystem.
 *  - "file": data/assignments.json on local disk, used in development.
 */

export type Assignment = {
  /** Normalised (lowercased, trimmed) email — the unique identifier. */
  email: string;
  /** Display name the guest typed. For the host's tracking only. */
  name: string;
  countryCode: string;
  assignedAt: string;
  /**
   * Client IP at claim time. Guests register from home ahead of the party, so
   * a repeated IP is a real signal — but housemates share one and mobile data
   * puts strangers behind one carrier address, so it stays a hint for the host
   * to eyeball, never an automatic block unless MAX_PER_IP is set explicitly.
   */
  ip?: string;
  /**
   * Per-browser id from the device cookie. Unlike `ip`, this survives a change
   * of network, so two emails sharing a deviceId is the strongest available
   * signal that one person registered twice.
   */
  deviceId?: string;
  /** Set once the guest has spent their single reroll. */
  rerolled?: boolean;
  /** The country they were handed first, kept for the host's curiosity. */
  previousCountryCode?: string;
  /** True when the pool ran dry and we had to hand out a repeat. */
  duplicate?: boolean;
};

/** What the guest answered when asked whether they are coming. */
export type RsvpAnswer = "yes" | "maybe" | "no";

/**
 * Everyone who has told us something, whether or not they ended up with a
 * country. A "no" leaves no assignment behind, so without this record the app
 * would forget the answer the moment the tab closed and ask again on the next
 * visit — and the host would have no headcount at all.
 */
export type Guest = {
  /** Canonical email. Same identity as an assignment's. */
  email: string;
  name: string;
  rsvp: RsvpAnswer;
  /** When they last answered; changing your mind overwrites it. */
  rsvpAt: string;
  ip?: string;
  deviceId?: string;
};

export type StoreData = {
  version: 1;
  assignments: Assignment[];
  /** Indexed by the same canonical email as `assignments`. */
  guests: Guest[];
};

/**
 * A *fresh* empty document every call. This must never be a shared constant:
 * spreading one would copy the `assignments` array by reference, so every
 * empty read would hand out the same array and mutations would leak between
 * requests for the lifetime of the process.
 */
function emptyStore(): StoreData {
  return { version: 1, assignments: [], guests: [] };
}

const BLOB_PATHNAME = "festa-disfresses/assignments.json";
const FILE_PATH = path.join(process.cwd(), "data", "assignments.json");

export type Driver = "blob" | "file";

export function activeDriver(): Driver {
  return hasBlobCredentials() ? "blob" : "file";
}

/**
 * Vercel provisions Blob credentials two different ways, and a store connected
 * through the current dashboard flow only gets the second:
 *
 *  - a long-lived `BLOB_READ_WRITE_TOKEN`, or
 *  - OIDC: `BLOB_STORE_ID` plus a short-lived `VERCEL_OIDC_TOKEN` that the
 *    runtime refreshes on its own (@vercel/blob picks it up automatically).
 *
 * Checking only the first would silently fall back to the file driver on a
 * perfectly well-configured deployment.
 */
function hasBlobCredentials(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

/** True when running on Vercel, where everything outside /tmp is read-only. */
function onVercel(): boolean {
  return Boolean(process.env.VERCEL);
}

/**
 * The file driver cannot work on Vercel: the deployment filesystem is
 * read-only, so the first write fails with EROFS and every guest sees an
 * opaque 500. Fail with something actionable instead.
 */
function assertWritable(): void {
  if (activeDriver() === "file" && onVercel()) {
    throw new Error(
      "No Blob credentials found (neither BLOB_READ_WRITE_TOKEN nor " +
        "BLOB_STORE_ID), so assignments would be written to the deployment " +
        "filesystem — which is read-only on Vercel. Create a Blob store " +
        "(Storage -> Blob), connect it to this project and redeploy; the " +
        "variables are injected automatically.",
    );
  }
}

/**
 * Normalises one stored record. Documents written by earlier versions of this
 * app predate the `name` field, so every consumer would otherwise have to
 * defend against `undefined` — sorting on it is enough to crash the admin page.
 * Coerce here, once, so the rest of the codebase can trust the type.
 */
function migrate(raw: unknown): Assignment | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Partial<Assignment>;
  if (typeof a.email !== "string" || typeof a.countryCode !== "string") return null;

  return {
    ...a,
    // Re-canonicalised on every read: records written before provider aliasing
    // was collapsed still hold the raw address, and a guest whose stored key no
    // longer matches their canonical one would be handed a brand new country.
    email: normalizeEmail(a.email),
    countryCode: a.countryCode,
    name: typeof a.name === "string" && a.name.trim() !== "" ? a.name : "",
    assignedAt: typeof a.assignedAt === "string" ? a.assignedAt : new Date(0).toISOString(),
  };
}

const RSVP_VALUES: readonly RsvpAnswer[] = ["yes", "maybe", "no"];

function isRsvp(value: unknown): value is RsvpAnswer {
  return typeof value === "string" && (RSVP_VALUES as readonly string[]).includes(value);
}

/** One stored RSVP, or null if the record is unusable. */
function migrateGuest(raw: unknown): Guest | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Partial<Guest>;
  if (typeof g.email !== "string" || !isRsvp(g.rsvp)) return null;

  return {
    ...g,
    email: normalizeEmail(g.email),
    rsvp: g.rsvp,
    name: typeof g.name === "string" ? g.name : "",
    rsvpAt: typeof g.rsvpAt === "string" ? g.rsvpAt : new Date(0).toISOString(),
  };
}

function parse(raw: string): StoreData {
  let parsed: Partial<StoreData>;
  try {
    parsed = JSON.parse(raw) as Partial<StoreData>;
  } catch {
    // A corrupt document must not wipe the party. Fail loudly instead.
    throw new Error("assignments.json is not valid JSON");
  }
  if (!parsed || !Array.isArray(parsed.assignments)) return emptyStore();
  // `guests` postdates the first documents written, so its absence is normal
  // rather than corruption — every reader must cope with it being missing.
  const guests = Array.isArray(parsed.guests) ? parsed.guests : [];
  const byEmail = new Map<string, Guest>();
  for (const g of guests.map(migrateGuest)) {
    if (g) byEmail.set(g.email, g);
  }
  return {
    version: 1,
    assignments: dedupe(
      parsed.assignments.map(migrate).filter((a): a is Assignment => a !== null),
    ),
    guests: [...byEmail.values()],
  };
}

/**
 * Collapses records that share a canonical email — the same person claiming
 * twice under two spellings of one mailbox, from before provider aliasing was
 * normalised. The earliest claim wins, matching the rule that a guest is never
 * reassigned; the later country goes back into the pool for somebody else.
 */
function dedupe(assignments: Assignment[]): Assignment[] {
  const byEmail = new Map<string, Assignment>();
  for (const a of assignments) {
    const seen = byEmail.get(a.email);
    if (!seen) {
      byEmail.set(a.email, a);
      continue;
    }
    const winner = a.assignedAt < seen.assignedAt ? a : seen;
    const loser = winner === a ? seen : a;
    console.warn(
      `[store] ${a.email} resolved to two assignments; keeping ` +
        `${winner.countryCode} (${winner.assignedAt}) and releasing ${loser.countryCode}`,
    );
    byEmail.set(a.email, winner);
  }
  return [...byEmail.values()];
}

/* ------------------------------- file driver ------------------------------ */

async function readFileStore(): Promise<Snapshot> {
  try {
    return { data: parse(await fs.readFile(FILE_PATH, "utf8")), version: null };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { data: emptyStore(), version: null };
    }
    throw err;
  }
}

async function writeFileStore(data: StoreData): Promise<void> {
  await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
  // Write-then-rename so a crash mid-write can never truncate the document.
  const tmp = `${FILE_PATH}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, FILE_PATH);
}

/* ------------------------------- blob driver ------------------------------ */

/**
 * Access mode of the Blob store. Private is the default and the right choice:
 * this document holds every guest's name, email and IP, and a public blob has
 * a guessable URL that needs no credentials at all. Only set this to "public"
 * if the connected store was created as a public one — the API rejects a
 * mismatch rather than silently downgrading.
 */
const BLOB_ACCESS = (process.env.BLOB_ACCESS === "public" ? "public" : "private") as
  | "public"
  | "private";

async function readBlobStore(): Promise<Snapshot> {
  const { get } = await import("@vercel/blob");

  // useCache:false reads straight from origin storage. Essential: a CDN-cached
  // read would hand two guests the same stale country list.
  const result = await get(BLOB_PATHNAME, { access: BLOB_ACCESS, useCache: false });
  if (!result) return { data: emptyStore(), version: null };
  if (result.statusCode === 304 || !result.stream) {
    // Only reachable with a conditional request, which we never send.
    return { data: emptyStore(), version: result.blob.etag };
  }

  const raw = await new Response(result.stream).text();
  return { data: parse(raw), version: result.blob.etag };
}

async function writeBlobStore(data: StoreData, expectedVersion: string | null): Promise<void> {
  const { put, BlobPreconditionFailedError } = await import("@vercel/blob");
  try {
    await put(BLOB_PATHNAME, JSON.stringify(data, null, 2), {
      access: BLOB_ACCESS,
      contentType: "application/json",
      addRandomSuffix: false,
      cacheControlMaxAge: 0,
      // With a version: write only if the document is still the one we read.
      // Without: this is the first write, so refuse to clobber a blob another
      // instance created in the meantime.
      ...(expectedVersion ? { ifMatch: expectedVersion } : { allowOverwrite: false }),
    });
  } catch (err) {
    if (err instanceof BlobPreconditionFailedError) throw new ConflictError();
    // The create path races as "already exists" rather than a precondition.
    if (!expectedVersion && err instanceof Error && /exists/i.test(err.message)) {
      throw new ConflictError();
    }
    throw err;
  }
}

/* --------------------------------- public --------------------------------- */

/** Raised when someone else wrote the document since we read it. */
export class ConflictError extends Error {}

export type Snapshot = {
  data: StoreData;
  /** Opaque write token (the blob ETag). Pass it back to writeStore. */
  version: string | null;
};

export async function readStore(): Promise<Snapshot> {
  return activeDriver() === "blob" ? readBlobStore() : readFileStore();
}

/**
 * Writes the document back, but only if nobody else has written since the
 * matching readStore(). Throws ConflictError otherwise so the caller can redo
 * its read-modify-write against fresh data.
 */
export async function writeStore(data: StoreData, expectedVersion: string | null): Promise<void> {
  assertWritable();
  return activeDriver() === "blob"
    ? writeBlobStore(data, expectedVersion)
    : writeFileStore(data);
}

/**
 * Serialises read-modify-write cycles inside one process. Across concurrently
 * warm serverless instances the ETag check in writeStore is what actually keeps
 * things correct; this lock just avoids pointless conflict retries locally.
 */
let chain: Promise<unknown> = Promise.resolve();
export function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}
