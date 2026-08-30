#!/usr/bin/env node
/**
 * Fills src/data/dances.json with transparent dancing stickers from Giphy.
 *
 *   npm run dances            # only fetch if the file is empty
 *   npm run dances -- --force
 *
 * Two halves. `pool` is a shared set of dance-meme stickers, used for the
 * right-hand dancer. `byCountry` is one sticker per country, resolved from the
 * `dance` seed in countries.ts, used for the left — so every reveal pairs
 * something of the country's own with something from the common pool.
 *
 * Stickers, not GIFs: /v1/stickers is a separate library where everything is
 * cut out against a transparent background. There is no background removal for
 * an ordinary GIF, so the endpoint is the whole trick. The exception is a seed
 * pinned by `id`, which may well be a plain GIF with a solid background.
 *
 * WebP is preferred over GIF for the animated frame. GIF transparency is
 * 1-bit — a pixel is either fully clear or fully opaque — so edges come out
 * jagged and often keep a pale fringe from whatever the sticker was matted
 * against. WebP carries real 8-bit alpha and sits cleanly on the dark plinth.
 *
 * Nothing is downloaded: the URLs point at Giphy's CDN, which is what their
 * terms allow in exchange for the attribution mark the app renders. The key is
 * only ever used here, never by the app, so it is not a Vercel environment
 * variable — put it in .env.local as GIPHY_API_KEY.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "src", "data", "dances.json");

/**
 * Searches feeding the shared pool. Spread wide on purpose: the near-synonym
 * meme queries overlapped so heavily that three of them added almost nothing,
 * and what they did agree on was the dancing banana.
 */
const QUERIES = [
  "dance meme",
  "funny dance",
  "silly dance move",
  "celebration dance",
  "excited dance",
  "groovy dance",
];

/**
 * Titles to refuse. A waving flag is not a dancer; Giphy's dance-meme shelf is
 * thick with dancing bananas; and the cartoon-animal end of it reads as a
 * children's party rather than this one.
 */
const REJECT =
  /\b(flag|banana|dog|puppy|cat|kitten|baby|kids?|child|nursery|goose|bear|bunny|duck|toddler|teddy|panda|unicorn)\b/i;

/**
 * Stickers pinned into the pool by hand, fetched by id. These come first, so
 * they survive a refetch and cannot be crowded out by whatever search returns.
 */
const MUST_HAVE = [
  "x5lIgu2DDtI5IzdtUg",
  "gX8F8kMRTx44M",
  "8m4R4pvViWtRzbloJ1",
  "QsZol42CPIjMzke1QW",
  "uMo2qtslcUgEJwCo44",
  "NAWrgyZHMI6npwVa2d",
  "olAik8MhYOB9K",
];

/**
 * Ids kept out of the pool. Titles are close to useless for judging these —
 * the first one blocked here is called "Happy Cheer Up Sticker" — so rejects
 * are recorded by id, from looking at the contact sheet in /admin.
 */
const BLOCKED = new Set(["IwZ4nbKj3EnNLNNtu8", "BOGOB95CQOLzh9KaNU"]);
const PER_QUERY = 25;
const RATING = "pg-13";
const THROTTLE_MS = 150;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const force = process.argv.includes("--force");

/** Next loads .env.local for the app; a bare node script has to do it itself. */
async function loadKey() {
  if (process.env.GIPHY_API_KEY) return process.env.GIPHY_API_KEY;
  const raw = await fs.readFile(path.join(ROOT, ".env.local"), "utf8").catch(() => "");
  const line = raw.split("\n").find((l) => l.trim().startsWith("GIPHY_API_KEY="));
  const value = line?.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
  if (!value) {
    console.error(
      "No GIPHY_API_KEY. Add it to .env.local (gitignored) as GIPHY_API_KEY=…\n" +
        "Get one free at https://developers.giphy.com — it never leaves this machine.",
    );
    process.exit(1);
  }
  return value;
}

const key = await loadKey();
const { COUNTRIES } = await import(path.join(ROOT, "src/data/countries.ts"));

const existing = await fs.readFile(OUT, "utf8").then(JSON.parse, () => null);

/*
 * Default is a top-up, not a refetch. Pruning the blocklist costs nothing, and
 * fetching only what is missing costs a handful of requests — where a full
 * rebuild costs about fifty and Giphy's free quota is hourly. --force still
 * rebuilds from scratch when the queries themselves have changed.
 */
const topUp = Boolean(existing?.pool?.length) && !force;

/**
 * fixed_height is ~200px tall: plenty beside the player, a fraction of the
 * payload of `original`, and the size every sticker is guaranteed to have.
 */
function shape(item) {
  const frame = item?.images?.fixed_height;
  const src = frame?.webp || frame?.url;
  if (!src) return null;
  return {
    id: item.id,
    title: item.title?.trim() || "dancing sticker",
    src,
    still: item.images?.fixed_height_still?.url ?? src,
    width: Number(frame.width) || 200,
    height: Number(frame.height) || 200,
    // Giphy's terms want the sticker clickable back to its page.
    pageUrl: item.url,
    /**
     * Provisional: Giphy's own classification. A GIF outside the sticker
     * library can still carry alpha, so `measureAlpha` corrects this below by
     * reading the file rather than trusting the label.
     */
    transparent: item.is_sticker === 1 || item.is_sticker === true,
  };
}

/**
 * Whether a WebP actually carries an alpha channel.
 *
 * Giphy's `is_sticker` is a shelf, not a fact about the pixels: a hand-picked
 * GIF can be perfectly cut out and still sit outside the sticker library. The
 * VP8X header says so definitively, and it lives in the first few dozen bytes,
 * so one ranged request settles it.
 */
async function measureAlpha(url) {
  try {
    const res = await fetch(url, { headers: { range: "bytes=0-63" } });
    if (!res.ok && res.status !== 206) return null;
    const b = Buffer.from(await res.arrayBuffer());
    if (b.length < 20 || b.toString("ascii", 0, 4) !== "RIFF") return null;
    let off = 12;
    while (off + 8 <= b.length) {
      const fourcc = b.toString("ascii", off, off + 4);
      if (fourcc === "VP8X") return Boolean(b[off + 8] & 0x10);
      if (fourcc === "ALPH") return true;
      off += 8 + b.readUInt32LE(off + 4);
    }
    return null;
  } catch {
    return null;
  }
}

async function api(pathname, params) {
  const url = new URL(`https://api.giphy.com/v1/${pathname}`);
  url.searchParams.set("api_key", key);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  for (let attempt = 0; ; attempt++) {
    await sleep(THROTTLE_MS);
    const res = await fetch(url);
    if (res.ok) return (await res.json()).data;
    if (res.status === 401 || res.status === 403) {
      console.error(`\nGiphy rejected the key (HTTP ${res.status}).`);
      process.exit(1);
    }
    // The free quota is hourly, so a 429 is worth a short wait but not a long
    // one — past a couple of tries the answer is to come back later.
    if (res.status !== 429 || attempt >= 2) throw new Error(`HTTP ${res.status}`);
    const waitMs = 5000 * 2 ** attempt;
    console.log(`  … rate limited, retrying in ${waitMs / 1000}s`);
    await sleep(waitMs);
  }
}

/* ------------------------------- the pool -------------------------------- */

const seen = new Set();
const pool = [];

if (topUp) {
  // Pruning needs no network: the filters have usually moved on since the
  // pool was built, and this is what applies them to what is already there.
  const kept = existing.pool.filter((d) => !BLOCKED.has(d.id) && !REJECT.test(d.title));
  const dropped = existing.pool.length - kept.length;
  for (const d of kept) {
    seen.add(d.id);
    pool.push(d);
  }
  console.log(`· topping up ${kept.length} kept${dropped ? `, ${dropped} pruned` : ""}`);
}

for (const id of MUST_HAVE) {
  if (seen.has(id)) continue;
  try {
    const d = shape(await api(`gifs/${id}`, {}));
    if (!d) throw new Error("no usable frame");
    seen.add(d.id);
    pool.push(d);
    console.log(`✓ pinned ${id} — ${d.title}${d.transparent ? "" : "  [opaque GIF]"}`);
  } catch (err) {
    console.error(`✗ pinned ${id} — ${err.message}`);
  }
}

for (const q of topUp ? [] : QUERIES) {
  try {
    let added = 0;
    for (const item of (await api("stickers/search", { q, limit: PER_QUERY, rating: RATING })) ?? []) {
      const d = shape(item);
      if (!d || seen.has(d.id) || BLOCKED.has(d.id) || REJECT.test(d.title)) continue;
      seen.add(d.id);
      pool.push(d);
      added++;
    }
    console.log(`✓ pool "${q}" — ${added} new`);
  } catch (err) {
    console.error(`✗ pool "${q}" — ${err.message}`);
  }
}

if (pool.length < 2) {
  console.error("\nPool too small to draw a pair from; leaving dances.json alone.");
  process.exit(1);
}

/* ----------------------------- per country ------------------------------- */

const byCountry = {};
const fellBack = [];

for (const country of COUNTRIES) {
  const seed = country.dance;
  if (!seed) continue;

  const stored = topUp ? existing.byCountry?.[country.code] : null;
  // A pinned id that already matches needs no request; neither does a search
  // whose answer is already on disk.
  if (stored && (seed.id ? stored.id === seed.id : true)) {
    byCountry[country.code] = stored;
    continue;
  }

  try {
    let item = null;
    if (seed.id) {
      item = await api(`gifs/${seed.id}`, {});
    } else {
      const results = (await api("stickers/search", { q: seed.search, limit: 15, rating: RATING })) ?? [];
      // Taking results[0] blindly is what put a waving flag on half the
      // countries; skip anything the filter refuses before settling.
      item = results.find((r) => !REJECT.test(r.title ?? "")) ?? null;
    }
    const d = item ? shape(item) : null;
    if (!d) {
      fellBack.push(`${country.code} (${seed.search ?? seed.id})`);
      continue;
    }
    byCountry[country.code] = d;
    const mark = d.transparent ? "" : "  [opaque GIF, not a sticker]";
    console.log(`✓ ${country.code} ${country.name} — ${d.title}${mark}`);
  } catch (err) {
    fellBack.push(`${country.code} (${err.message})`);
  }
}

/*
 * Anything still marked opaque gets checked for real. Only these are fetched:
 * the sticker library is transparent by definition, so this is a handful of
 * ranged requests over the hand-picked GIFs, not a pass over the whole pool.
 */
let corrected = 0;
for (const entry of [...pool, ...Object.values(byCountry)]) {
  if (entry.transparent) continue;
  const alpha = await measureAlpha(entry.src);
  if (alpha === true) {
    entry.transparent = true;
    corrected++;
  }
}
if (corrected) console.log(`· ${corrected} marked opaque actually carry alpha`);

await fs.writeFile(OUT, JSON.stringify({ pool, byCountry }, null, 2) + "\n", "utf8");

console.log(`\nDone: ${pool.length} in the pool, ${Object.keys(byCountry).length}/${COUNTRIES.length} countries with their own.`);
if (fellBack.length) {
  console.log(`\n${fellBack.length} fell back to the pool (no sticker for that term):`);
  for (const f of fellBack) console.log(`  ${f}`);
}
