#!/usr/bin/env node
/**
 * Fills src/data/dances.json with transparent dancing stickers from Giphy.
 *
 *   npm run dances            # only fetch if the file is empty
 *   npm run dances -- --force
 *
 * Stickers, not GIFs: /v1/stickers is a separate library where everything is
 * cut out against a transparent background, which is what lets the dancers sit
 * on the reveal screen instead of in a white box. There is no background
 * removal for ordinary GIFs, so the endpoint is the whole trick.
 *
 * WebP is preferred over GIF for the animated frame. GIF transparency is
 * 1-bit — a pixel is either fully clear or fully opaque — so edges come out
 * jagged and often keep a pale fringe from whatever the sticker was matted
 * against. WebP carries real 8-bit alpha and sits cleanly on the dark plinth.
 *
 * Nothing is downloaded: the URLs point at Giphy's CDN, which is what their
 * terms allow in exchange for the attribution mark the reveal screen renders.
 * The key is only ever used here, never by the app, so it is not a Vercel
 * environment variable — put it in .env.local as GIPHY_API_KEY.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "src", "data", "dances.json");

/** Searches to pool together. Broad on purpose — variety beats curation here. */
const QUERIES = ["dancing", "dance party", "happy dance", "silly dance"];
const PER_QUERY = 25;
const RATING = "pg-13";

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
const existing = await fs.readFile(OUT, "utf8").then(JSON.parse, () => []);
if (existing.length && !force) {
  console.log(`· ${existing.length} stickers already present — pass --force to refetch.`);
  process.exit(0);
}

const seen = new Set();
const dances = [];

for (const q of QUERIES) {
  const url = new URL("https://api.giphy.com/v1/stickers/search");
  url.searchParams.set("api_key", key);
  url.searchParams.set("q", q);
  url.searchParams.set("limit", String(PER_QUERY));
  url.searchParams.set("rating", RATING);

  const res = await fetch(url);
  if (!res.ok) {
    console.error(`✗ "${q}" — HTTP ${res.status}`);
    if (res.status === 401 || res.status === 403) process.exit(1);
    continue;
  }

  let added = 0;
  for (const item of (await res.json()).data ?? []) {
    // fixed_height is ~200px tall: plenty beside the player, a fraction of the
    // payload of `original`, and the size every sticker is guaranteed to have.
    const frame = item.images?.fixed_height;
    const still = item.images?.fixed_height_still;
    const src = frame?.webp || frame?.url;
    if (!src || seen.has(item.id)) continue;
    seen.add(item.id);
    dances.push({
      id: item.id,
      title: item.title?.trim() || "dancing sticker",
      src,
      still: still?.url ?? src,
      width: Number(frame.width) || 200,
      height: Number(frame.height) || 200,
      // Giphy's terms want the sticker clickable back to its page.
      pageUrl: item.url,
    });
    added++;
  }
  console.log(`✓ "${q}" — ${added} new`);
}

if (!dances.length) {
  console.error("\nNothing fetched; leaving dances.json alone.");
  process.exit(1);
}

await fs.writeFile(OUT, JSON.stringify(dances, null, 2) + "\n", "utf8");
console.log(`\nDone: ${dances.length} transparent stickers written.`);
