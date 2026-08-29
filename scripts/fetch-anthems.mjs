#!/usr/bin/env node
/**
 * Builds public/anthems/<CODE>.mp3 from the Wikimedia Commons files named in
 * src/data/countries.ts, plus a CREDITS.md with per-file attribution.
 *
 *   npm run anthems          # only fetch what is missing
 *   npm run anthems -- --force
 *
 * The mp3s are committed, so this only needs rerunning when the country list
 * changes. Requires Node >= 22 (native TypeScript import).
 */
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "public", "anthems");
// Wikimedia's User-Agent policy requires a contact URL. Without one,
// upload.wikimedia.org answers bulk requests with 429 + Retry-After: 600.
const UA = "FestaDisfresses/1.0 (https://github.com/festa-disfresses/festa-disfresses)";

/** Wikimedia rate-limits anonymous clients hard. Stay polite and back off. */
const THROTTLE_MS = 500;
const MAX_RETRIES = 6;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function politeFetch(url, label) {
  for (let attempt = 0; ; attempt++) {
    await sleep(THROTTLE_MS);
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (res.ok) return res;
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= MAX_RETRIES) {
      throw new Error(`${label} ${res.status}`);
    }
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : Math.min(30_000, 2000 * 2 ** attempt);
    console.log(`  … ${res.status} on ${label}, retrying in ${Math.round(waitMs / 1000)}s`);
    await sleep(waitMs);
  }
}

/** Clip length in seconds — long enough to recognise, short enough to survive. */
const CLIP_SECONDS = 45;
const FADE_SECONDS = 4;

const force = process.argv.includes("--force");

const { COUNTRIES } = await import(path.join(ROOT, "src/data/countries.ts"));

async function commonsMetadata(fileName) {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("titles", `File:${fileName}`);
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|extmetadata");

  const res = await politeFetch(url, `Commons API for ${fileName}`);
  const pages = (await res.json()).query?.pages ?? {};
  const page = Object.values(pages)[0];
  if (!page || page.missing !== undefined) throw new Error(`No such Commons file: ${fileName}`);

  const info = page.imageinfo?.[0];
  if (!info) throw new Error(`No imageinfo for ${fileName}`);
  const extra = info.extmetadata ?? {};
  const plain = (v) => (v ? String(v.value).replace(/<[^>]*>/g, "").trim() : "unknown");

  return {
    downloadUrl: info.url,
    descriptionUrl: info.descriptionurl,
    artist: plain(extra.Artist),
    license: plain(extra.LicenseShortName),
  };
}

async function transcode(inputPath, outputPath) {
  await execFileAsync(
    ffmpegPath,
    [
      "-y", "-hide_banner", "-loglevel", "error",
      "-i", inputPath,
      "-t", String(CLIP_SECONDS),
      "-af", `afade=t=out:st=${CLIP_SECONDS - FADE_SECONDS}:d=${FADE_SECONDS},loudnorm=I=-18:TP=-1.5:LRA=11`,
      "-ac", "1", "-ar", "44100", "-b:a", "64k",
      outputPath,
    ],
    { maxBuffer: 1024 * 1024 * 32 },
  );
}

await fs.mkdir(OUT_DIR, { recursive: true });
const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "anthems-"));
const credits = [];
const failures = [];

for (const country of COUNTRIES) {
  if (!country.anthem.source) {
    console.log(`· ${country.code} ${country.name} — no freely-licensed recording, skipping`);
    continue;
  }

  const outPath = path.join(OUT_DIR, `${country.code}.mp3`);
  const exists = await fs.access(outPath).then(() => true, () => false);

  try {
    const meta = await commonsMetadata(country.anthem.source);
    credits.push({ country, meta });

    if (exists && !force) {
      console.log(`· ${country.code} ${country.name} — already present, skipping`);
      continue;
    }

    const res = await politeFetch(meta.downloadUrl, "download");
    const srcPath = path.join(tmpDir, `${country.code}${path.extname(country.anthem.source) || ".bin"}`);
    await fs.writeFile(srcPath, Buffer.from(await res.arrayBuffer()));

    await transcode(srcPath, outPath);
    const { size } = await fs.stat(outPath);
    console.log(`✓ ${country.code} ${country.name} — ${(size / 1024).toFixed(0)} KB`);
  } catch (err) {
    failures.push({ country, message: err.message });
    console.error(`✗ ${country.code} ${country.name} — ${err.message}`);
  }
}

await fs.rm(tmpDir, { recursive: true, force: true });

const creditsBody = [
  "# Anthem credits",
  "",
  "Every clip in this folder is the first " + CLIP_SECONDS + " seconds of a recording",
  "from Wikimedia Commons, downmixed to mono MP3 by `scripts/fetch-anthems.mjs`.",
  "Sources and licences below; follow the description page for full terms.",
  "",
  "Most sources are public domain. Where a source is CC BY or CC BY-SA, the",
  "attribution below is the required credit, and the trimmed clip is a derivative",
  "work redistributed under that same licence.",
  "",
  ...credits.flatMap(({ country, meta }) => [
    `## ${country.flag} ${country.name} — ${country.anthem.title}`,
    "",
    `- File: \`${country.anthem.source}\``,
    `- Author: ${meta.artist}`,
    `- Licence: ${meta.license}`,
    `- Source: ${meta.descriptionUrl}`,
    "",
  ]),
].join("\n");
await fs.writeFile(path.join(OUT_DIR, "CREDITS.md"), creditsBody, "utf8");

const expected = COUNTRIES.filter((c) => c.anthem.source).length;
console.log(`\nDone: ${credits.length - failures.length}/${expected} clips (${COUNTRIES.length - expected} countries have no free recording), credits written.`);
if (failures.length) {
  console.error(`\n${failures.length} failed:`);
  for (const f of failures) console.error(`  ${f.country.code}: ${f.message}`);
  process.exit(1);
}
