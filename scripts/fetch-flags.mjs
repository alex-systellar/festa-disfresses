#!/usr/bin/env node
/**
 * Downloads one 4:3 SVG per country into public/flags/<CODE>.svg.
 *
 *   npm run flags [-- --force]
 *
 * Why not emoji? Flag emoji are drawn by the platform font, so they look
 * different on iOS, Android and Windows — and several flags we need have no
 * emoji at all (Catalonia). Rendering every flag from one SVG set is the only
 * way to make all 40 look like siblings, Catalonia included.
 *
 * Source: flag-icons (MIT). See public/flags/CREDITS.md.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "public", "flags");
const PKG = "flag-icons@7.5.0";
const BASE = `https://cdn.jsdelivr.net/npm/${PKG}/flags/4x3`;

/** Country code -> flag-icons file name. Only non-ISO-3166-1 codes need an entry. */
const OVERRIDES = { CT: "es-ct" };

const force = process.argv.includes("--force");
const { COUNTRIES } = await import(path.join(ROOT, "src/data/countries.ts"));

await fs.mkdir(OUT_DIR, { recursive: true });
const failures = [];

for (const country of COUNTRIES) {
  const slug = OVERRIDES[country.code] ?? country.code.toLowerCase();
  const outPath = path.join(OUT_DIR, `${country.code}.svg`);

  if (!force && (await fs.access(outPath).then(() => true, () => false))) {
    console.log(`· ${country.code} ${country.name} — already present`);
    continue;
  }

  try {
    const res = await fetch(`${BASE}/${slug}.svg`);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${slug}.svg`);
    const svg = await res.text();
    if (!svg.trimStart().startsWith("<svg")) throw new Error("not an SVG");
    await fs.writeFile(outPath, svg, "utf8");
    console.log(`✓ ${country.code} ${country.name} — ${(svg.length / 1024).toFixed(1)} KB`);
  } catch (err) {
    failures.push({ country, message: err.message });
    console.error(`✗ ${country.code} ${country.name} — ${err.message}`);
  }
}

await fs.writeFile(
  path.join(OUT_DIR, "CREDITS.md"),
  [
    "# Flag credits",
    "",
    `All flags in this folder come from [flag-icons](https://github.com/lipis/flag-icons) \`${PKG.split("@")[1]}\`,`,
    "used under the MIT licence, fetched by `scripts/fetch-flags.mjs`.",
    "",
    "They are 4:3 SVGs so that every country — including Catalonia, which has no",
    "emoji flag — renders identically on every platform.",
    "",
  ].join("\n"),
  "utf8",
);

console.log(`\nDone: ${COUNTRIES.length - failures.length}/${COUNTRIES.length} flags.`);
if (failures.length) process.exit(1);
