import { CATEGORIES, isCategoryId, type CategoryId, type MyVotes } from "@/data/categories";
import { COUNTRIES, getCountry } from "@/data/countries";
import { mutate, toResult, type ClaimResult } from "@/lib/assign";
import { normalizeEmail } from "@/lib/email";
import { readStore, type Assignment, type StoreData } from "@/lib/store";

/**
 * Login and the public prize.
 *
 * There are no sessions in this app and this does not add one: a guest proves
 * who they are by the name and email they signed up with, and every request
 * that needs it carries both. That is the same lookup-key identity the draw
 * has always used (see the README), with the name added as a second half so a
 * bare email is no longer enough to see somebody's country or cast their vote.
 */

/** No guest has this email, or the name given is not the one on file. */
export class NoMatchError extends Error {}
/** The email and name are right, but they answered no or maybe: no country. */
export class NoCountryError extends Error {}
/** A guest cannot vote for the country they are wearing themselves. */
export class OwnCountryError extends Error {}
/** Not a country in the list. */
export class UnknownCountryError extends Error {}
/** Not one of the categories. */
export class UnknownCategoryError extends Error {}
/** This guest already picked that country in another category. */
export class RepeatedCountryError extends Error {
  constructor(
    country: string,
    /** Where they used it, so the message can say. */
    readonly category: CategoryId,
  ) {
    super(country);
  }
}

/* ------------------------------ name matching ----------------------------- */

/**
 * Lowercase, accents stripped, split on anything that is not a letter or digit.
 * "Marta  Puig-Solé" and "marta puig sole" come out identical. Both the typed
 * name and the stored one go through this same fold, so whatever it does to
 * one it does to the other.
 */
export function nameTokens(input: string): string[] {
  return input
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * Whether the name somebody typed is the one on file.
 *
 * Every word they typed has to be a whole word of the stored name, in any
 * order, ignoring case and accents. So "marta", "Puig Marta" and "Marta Puig"
 * all match "Marta Puig", while "Mart" and "Marta Soler" do not.
 *
 * This is deliberately looser than exact equality. The name is not a secret —
 * anyone who knows a guest's email knows what they are called — so being strict
 * buys no security and costs a real guest their vote when they type the short
 * form they always use. The email is the key; the name is there so a typo in it
 * does not silently log someone in as a stranger.
 */
export function namesMatch(typed: string, stored: string): boolean {
  const wanted = nameTokens(typed);
  if (wanted.length === 0) return false;
  const have = new Set(nameTokens(stored));
  return wanted.every((token) => have.has(token));
}

/* --------------------------------- login ---------------------------------- */

export type Identity = {
  assignment: Assignment;
  country: NonNullable<ReturnType<typeof getCountry>>;
};

/**
 * Checks an email and name against the document and returns who they are.
 *
 * Distinguishes two failures on purpose. `NoMatchError` is what anybody gets
 * for a wrong email or a wrong name, and is the same answer for both — it must
 * not reveal which half was right, or the endpoint becomes a way to ask whether
 * an address is on the list. `NoCountryError` is only reachable by somebody who
 * already got both halves right, so telling them why they cannot go on leaks
 * nothing they did not have to know to get there.
 */
export function authenticate(data: StoreData, rawEmail: string, rawName: string): Identity {
  const email = normalizeEmail(rawEmail);
  const assignment = data.assignments.find((a) => a.email === email);
  const guest = data.guests.find((g) => g.email === email);
  if (!assignment && !guest) throw new NoMatchError(email);

  // Either record may hold the name: a returning guest can correct a typo'd
  // name on the claim, and the two are written at different moments.
  const known = [assignment?.name, guest?.name].filter((n): n is string => Boolean(n?.trim()));
  // A record from before names were kept has nothing to compare against. The
  // email alone has to do, or that guest could never get in.
  if (known.length > 0 && !known.some((n) => namesMatch(rawName, n))) {
    throw new NoMatchError(email);
  }

  const country = assignment ? getCountry(assignment.countryCode) : undefined;
  if (!assignment || !country) throw new NoCountryError(email);
  return { assignment, country };
}

export type VotingState = {
  /** What this guest has picked, by category. */
  myVotes: MyVotes;
};

/** One guest's ballot, read out of the document. */
function ballot(data: StoreData, email: string): MyVotes {
  const votes: MyVotes = {};
  for (const v of data.votes) {
    if (v.voter === email && isCategoryId(v.category)) votes[v.category] = v.countryCode;
  }
  return votes;
}

export type LoginResult = {
  result: ClaimResult;
  /** Only while the contest is open. */
  voting: VotingState | null;
};

function votingFor(data: StoreData, email: string): VotingState {
  return { myVotes: ballot(data, email) };
}

/** Reads only. Nothing about logging in changes the document. */
export async function login(
  rawEmail: string,
  rawName: string,
  withVoting: boolean,
): Promise<LoginResult> {
  const { data } = await readStore();
  const { assignment, country } = authenticate(data, rawEmail, rawName);

  return {
    // The draw is over: there is no reroll to offer and no pool to count.
    result: {
      ...toResult(assignment, country, data, false),
      canReroll: false,
      remaining: 0,
    },
    voting: withVoting ? votingFor(data, assignment.email) : null,
  };
}

/* ---------------------------------- votes --------------------------------- */

/**
 * Records, replaces or clears a guest's vote in one category.
 *
 * The rules, all checked here and not only on the page:
 *  - one vote per category, so voting again in it replaces the first;
 *  - a country can be picked in only one category by the same guest, so the
 *    prizes cannot all go to one costume by one voter;
 *  - never the country the guest is wearing.
 * Passing `null` for the country takes the vote back, which is also how a guest
 * frees a country to use it in another category.
 *
 * The identity check and the write share one locked read-modify-write, so a
 * vote cannot land for a guest the host deleted a moment ago, and two votes
 * from one guest cannot both be stored: the second replaces the first.
 */
export async function castVote(
  rawEmail: string,
  rawName: string,
  category: string,
  countryCode: string | null,
): Promise<{ myVotes: MyVotes }> {
  return mutate((data) => {
    const { assignment } = authenticate(data, rawEmail, rawName);
    const email = assignment.email;
    if (!isCategoryId(category)) throw new UnknownCategoryError(category);

    const existing = data.votes.find((v) => v.voter === email && v.category === category);

    if (countryCode === null) {
      if (!existing) return { value: { myVotes: ballot(data, email) }, dirty: false };
      data.votes = data.votes.filter((v) => v !== existing);
      return { value: { myVotes: ballot(data, email) }, dirty: true };
    }

    // Any country in the list can be voted for, not only the ones somebody is
    // wearing: which countries are taken is not something the contest page
    // should give away, and a guest searches the whole list. Votes for a
    // country nobody wears are kept and shown to the host as such.
    if (!getCountry(countryCode)) throw new UnknownCountryError(countryCode);
    if (assignment.countryCode === countryCode) throw new OwnCountryError(countryCode);

    const repeat = data.votes.find(
      (v) => v.voter === email && v.countryCode === countryCode && v.category !== category,
    );
    if (repeat) throw new RepeatedCountryError(countryCode, repeat.category);

    // Voting for the same country again changes nothing, and must not touch
    // the timestamp of the vote that is already there.
    if (existing?.countryCode === countryCode) {
      return { value: { myVotes: ballot(data, email) }, dirty: false };
    }

    const vote = {
      voter: email,
      category,
      countryCode,
      votedAt: new Date().toISOString(),
    };
    if (existing) Object.assign(existing, vote);
    else data.votes.push(vote);
    return { value: { myVotes: ballot(data, email) }, dirty: true };
  });
}

/* ---------------------------------- tally --------------------------------- */

export type TallyRow = {
  code: string;
  votes: number;
  /** False when nobody is wearing this country: a vote that cannot win. */
  worn: boolean;
};

export type CategoryTally = {
  id: CategoryId;
  /** Votes in this category that count. */
  votes: number;
  /** Every country somebody wears or has a vote, most votes first. */
  rows: TallyRow[];
};

export type Tally = {
  categories: CategoryTally[];
  /** Votes that count, over every category. */
  votes: number;
  /** Guests who could have voted: everyone holding a country. */
  eligible: number;
};

/**
 * The count for the host, one ranking per category.
 *
 * Only votes that still make sense are counted, rather than trusting that the
 * document was never edited underneath them: the voter must still hold a
 * country, the category and the country must exist, and the country must not
 * be the voter's own. Deleting a guest already removes their votes, so this is
 * the belt to that pair of braces.
 */
export function tally(data: StoreData): Tally {
  const own = new Map(data.assignments.map((a) => [a.email, a.countryCode]));
  const held = new Set(own.values());
  const counts = new Map<CategoryId, Map<string, number>>(
    CATEGORIES.map((c) => [c.id, new Map<string, number>()]),
  );
  const totals = new Map<CategoryId, number>(CATEGORIES.map((c) => [c.id, 0]));
  let votes = 0;

  for (const v of data.votes) {
    const theirs = own.get(v.voter);
    const perCountry = counts.get(v.category);
    if (theirs === undefined || theirs === v.countryCode || !perCountry || !getCountry(v.countryCode)) {
      continue;
    }
    perCountry.set(v.countryCode, (perCountry.get(v.countryCode) ?? 0) + 1);
    totals.set(v.category, (totals.get(v.category) ?? 0) + 1);
    votes += 1;
  }

  const categories = CATEGORIES.map((c) => {
    const perCountry = counts.get(c.id)!;
    const rows = COUNTRIES.filter((country) => held.has(country.code) || perCountry.has(country.code))
      .map((country) => ({
        code: country.code,
        votes: perCountry.get(country.code) ?? 0,
        worn: held.has(country.code),
      }))
      // A stable order among ties, so the table does not shuffle on every refresh.
      .sort((a, b) => b.votes - a.votes);
    return { id: c.id, votes: totals.get(c.id) ?? 0, rows };
  });

  return { categories, votes, eligible: data.assignments.length };
}
