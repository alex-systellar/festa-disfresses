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

/** Searches feeding the shared pool. Meme-leaning: generic "dancing" was bland. */
const QUERIES = ["dance meme", "dancing meme", "meme dance", "funny dance meme"];
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
if (existing?.pool?.length && !force) {
  console.log(`· already populated — pass --force to refetch.`);
  process.exit(0);
}

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
    /** False for a pinned GIF: it carries a solid background, not alpha. */
    transparent: item.is_sticker === 1 || item.is_sticker === true,
  };
}

async function api(pathname, params) {
  await sleep(THROTTLE_MS);
  const url = new URL(`https://api.giphy.com/v1/${pathname}`);
  url.searchParams.set("api_key", key);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      console.error(`\nGiphy rejected the key (HTTP ${res.status}).`);
      process.exit(1);
    }
    throw new Error(`HTTP ${res.status}`);
  }
  return (await res.json()).data;
}

/* ------------------------------- the pool -------------------------------- */

const seen = new Set();
const pool = [];
for (const q of QUERIES) {
  try {
    let added = 0;
    for (const item of (await api("stickers/search", { q, limit: PER_QUERY, rating: RATING })) ?? []) {
      const d = shape(item);
      if (!d || seen.has(d.id)) continue;
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
  try {
    let item = null;
    if (seed.id) {
      item = await api(`gifs/${seed.id}`, {});
    } else {
      const results = (await api("stickers/search", { q: seed.search, limit: 5, rating: RATING })) ?? [];
      item = results[0] ?? null;
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

await fs.writeFile(OUT, JSON.stringify({ pool, byCountry }, null, 2) + "\n", "utf8");

console.log(`\nDone: ${pool.length} in the pool, ${Object.keys(byCountry).length}/${COUNTRIES.length} countries with their own.`);
if (fellBack.length) {
  console.log(`\n${fellBack.length} fell back to the pool (no sticker for that term):`);
  for (const f of fellBack) console.log(`  ${f}`);
}
