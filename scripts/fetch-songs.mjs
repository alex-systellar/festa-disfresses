#!/usr/bin/env node
/**
 * Resolves the `song` seed on each country in src/data/countries.ts against
 * the iTunes Search API and writes src/data/songs.json.
 *
 *   npm run songs           # only resolve what is missing
 *   npm run songs -- --force
 *
 * Nothing is downloaded. Apple licenses these previews for playback alongside
 * a link back to the store, not for re-hosting, so what lands in the repo is
 * the URL and the metadata — the audio is streamed from Apple's CDN at play
 * time and `public/anthems/<CODE>.mp3` stays the offline fallback.
 *
 * The output is committed, so this only needs rerunning when a seed changes
 * or a preview URL rots. Requires Node >= 22 (native TypeScript import).
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "src", "data", "songs.json");

/** iTunes rate-limits around 20 calls/minute and answers 403 past it. */
const THROTTLE_MS = 1500;
const MAX_RETRIES = 4;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const force = process.argv.includes("--force");
const { COUNTRIES } = await import(path.join(ROOT, "src/data/countries.ts"));

const existing = force
  ? {}
  : await fs.readFile(OUT, "utf8").then(JSON.parse, () => ({}));

async function search(term) {
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", term);
  url.searchParams.set("media", "music");
  url.searchParams.set("entity", "song");
  url.searchParams.set("limit", "10");

  for (let attempt = 0; ; attempt++) {
    await sleep(THROTTLE_MS);
    const res = await fetch(url);
    if (res.ok) return (await res.json()).results ?? [];
    if (res.status !== 403 && res.status < 500) throw new Error(`HTTP ${res.status}`);
    if (attempt >= MAX_RETRIES) throw new Error(`HTTP ${res.status} after ${attempt} retries`);
    const waitMs = Math.min(30_000, 4000 * 2 ** attempt);
    console.log(`  … ${res.status}, retrying in ${waitMs / 1000}s`);
    await sleep(waitMs);
  }
}

/**
 * The top hit is regularly a cover, a live take or a Kidz Bop version, so the
 * seed's `match` picks from the list. Only results with a preview qualify —
 * a hit without one is useless to the player.
 */
function choose(results, match) {
  const playable = results.filter((r) => r.previewUrl);
  const needle = match.toLowerCase();
  return (
    playable.find((r) => `${r.trackName} — ${r.artistName}`.toLowerCase().includes(needle)) ?? null
  );
}

const songs = {};
const failures = [];

for (const country of COUNTRIES) {
  if (!country.song) {
    console.log(`· ${country.code} ${country.name} — anthem only, skipping`);
    continue;
  }

  if (existing[country.code] && !force) {
    songs[country.code] = existing[country.code];
    console.log(`· ${country.code} ${country.name} — already resolved, skipping`);
    continue;
  }

  try {
    const results = await search(country.song.search);
    const hit = choose(results, country.song.match);
    if (!hit) throw new Error(`no playable result matching "${country.song.match}"`);

    songs[country.code] = {
      title: hit.trackName,
      artist: hit.artistName,
      previewUrl: hit.previewUrl,
      // Shown as the required attribution link back to the store.
      trackUrl: hit.trackViewUrl,
      artwork: hit.artworkUrl100,
    };
    console.log(`✓ ${country.code} ${country.name} — ${hit.trackName} · ${hit.artistName}`);
  } catch (err) {
    failures.push({ country, message: err.message });
    console.error(`✗ ${country.code} ${country.name} — ${err.message}`);
  }
}

const ordered = Object.fromEntries(
  COUNTRIES.filter((c) => songs[c.code]).map((c) => [c.code, songs[c.code]]),
);
await fs.writeFile(OUT, JSON.stringify(ordered, null, 2) + "\n", "utf8");

const expected = COUNTRIES.filter((c) => c.song).length;
console.log(`\nDone: ${Object.keys(ordered).length}/${expected} songs resolved.`);
if (failures.length) {
  console.error(`\n${failures.length} failed:`);
  for (const f of failures) console.error(`  ${f.country.code}: ${f.message}`);
  process.exit(1);
}
