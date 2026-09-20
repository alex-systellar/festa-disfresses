/**
 * The prizes. One list, read by the rules page and by the contest: the page
 * that explains a category and the ballot that votes in it cannot disagree.
 *
 * The `id` is stored on every vote, so it is an identity like a country's
 * `code`: rename the `name` freely, never an `id` once votes exist.
 */
export const CATEGORIES = [
  {
    id: "sexy",
    name: "Més sexy",
    body: "Dels creadors de `calabaza putilla` arriba `Afghanistan putilla`, la disfressa més sexy del middle east!",
    accent: "#FF2E88",
  },
  {
    id: "divertida",
    name: "Més divertida",
    body: "No necessita descripció.",
    accent: "#26D9C3",
  },
  {
    id: "original",
    name: "Més original",
    body: "Artesanal, atrevit, diferent sempre estàs dos moves per davant de tothom.",
    accent: "#7C5CFF",
  },
  {
    id: "public",
    name: "Premi del públic",
    body: "Simplement el millor, no cal discutir-ho",
    accent: "#FFC93C",
  },
] as const;

export type Category = (typeof CATEGORIES)[number];
export type CategoryId = Category["id"];

export const CATEGORY_IDS: readonly string[] = CATEGORIES.map((c) => c.id);

export function isCategoryId(value: unknown): value is CategoryId {
  return typeof value === "string" && CATEGORY_IDS.includes(value);
}

export function getCategory(id: string): Category | undefined {
  return CATEGORIES.find((c) => c.id === id);
}

/** A guest's votes, by category. A category they have not voted in is absent. */
export type MyVotes = Partial<Record<CategoryId, string>>;
