import { COUNTRIES, type Country } from "@/data/countries";

/**
 * Lowercase with the accents taken off, for sorting and for searching. Done by
 * hand rather than with `Intl.Collator` because the wall is rendered on the
 * server and again in the browser, and two ICU builds can order the same
 * names differently — which React reports as a hydration mismatch.
 */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase();
}

/** Every country A to Z by its name in Catalan. Stable across server and browser. */
export const COUNTRIES_BY_NAME: Country[] = [...COUNTRIES].sort((a, b) => {
  const [x, y] = [fold(a.name), fold(b.name)];
  return x < y ? -1 : x > y ? 1 : 0;
});

/**
 * Names the list cannot know. `Intl.DisplayNames` covers every ISO country, but
 * Catalonia and Scotland are not countries to ISO, and they are the two people
 * are most likely to type in English or Spanish.
 */
const EXTRA_NAMES: Record<string, string[]> = {
  CT: ["Catalonia", "Cataluña"],
  SCT: ["Scotland", "Escocia"],
};

/**
 * What to search a country by: its Catalan name, and the same country in
 * English and Spanish so "germany" and "alemania" both find Alemanya. Built in
 * the browser when the search is first used, never on the server, so nothing
 * here can differ between the two renders.
 */
export function buildSearchIndex(countries: Country[]): Map<string, string> {
  const names = ["en", "es"].map((locale) => {
    try {
      return new Intl.DisplayNames([locale], { type: "region" });
    } catch {
      return null;
    }
  });

  return new Map(
    countries.map((country) => {
      const spellings = [country.name, ...(EXTRA_NAMES[country.code] ?? [])];
      for (const display of names) {
        try {
          const other = display?.of(country.code);
          // `of` answers with the code itself for one it does not know.
          if (other && other !== country.code) spellings.push(other);
        } catch {
          // Not an ISO region (Catalonia, Scotland): covered by EXTRA_NAMES.
        }
      }
      return [country.code, fold(spellings.join(" "))];
    }),
  );
}

/**
 * The countries a search matches, in their existing order. Every word typed has
 * to appear somewhere in a country's names, so "reg un" finds Regne Unit, and
 * an empty search matches everything.
 */
export function searchCountries(
  countries: Country[],
  index: Map<string, string>,
  query: string,
): Country[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return countries;
  return countries.filter((country) => {
    const haystack = index.get(country.code) ?? fold(country.name);
    return words.every((word) => haystack.includes(word));
  });
}

/** "Marta Puig" -> "Marta". For a greeting; falls back to the whole thing. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name.trim();
}
