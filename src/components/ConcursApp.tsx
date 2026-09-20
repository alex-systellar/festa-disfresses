"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { Explorer, useExplorer } from "@/components/Explorer";
import { Flag } from "@/components/Flag";
import { FlagMarquee } from "@/components/FlagMarquee";
import { LoginForm } from "@/components/LoginForm";
import { useLogin } from "@/components/useLogin";
import { CATEGORIES, getCategory, type CategoryId, type MyVotes } from "@/data/categories";
import { getCountry } from "@/data/countries";
import { errorCode } from "@/lib/client-guards";
import {
  buildSearchIndex,
  COUNTRIES_BY_NAME,
  firstName,
  searchCountries,
} from "@/lib/country-order";
import { ReplayIntroButton } from "@/components/IntroGate";

const PAGE_STYLE = { "--c1": "#FFC93C", "--c2": "#FF2E88" } as CSSProperties;

const VOTE_TEXT = {
  ownCountry: "No et pots votar a tu mateix/a: tria'n un altre.",
  noMatch: "Ja no et reconeixem. Surt i torna a entrar amb el teu nom i correu.",
  noCountry: "Només poden votar els qui tenen un país.",
  unknown: "Aquest país no existeix. Tria'n un altre.",
  unknownCategory: "Aquest premi no existeix. Recarrega la pàgina.",
  closed: "El concurs ja no està obert. Recarrega la pàgina.",
  storage: "No hem pogut apuntar el vot ara mateix. Torna-ho a provar en uns segons.",
  network: "No arribem a la festa. Comprova la connexió i torna-ho a provar.",
} as const;

/** The ballot the vote endpoint answers with. */
function isBallot(value: unknown): value is { myVotes: MyVotes } {
  if (typeof value !== "object" || value === null) return false;
  const votes = (value as { myVotes?: unknown }).myVotes;
  return typeof votes === "object" && votes !== null;
}

/** The category a refused repeat was already used in, from the 409 body. */
function repeatedIn(value: unknown): string | null {
  const category = (value as { category?: unknown } | null)?.category;
  return typeof category === "string" ? category : null;
}

/**
 * `/` while the prizes are open: a logged-in guest picks the costumes they
 * liked best, one for each prize.
 *
 * Only somebody who signed up can get past the login. There are two ways to
 * pick — search the list and vote from it, or walk through the countries one at
 * a time in the explorer and vote from there — with a switch between them. A
 * guest has one vote per prize and may change it, cannot give one country two
 * prizes, and never votes for their own country.
 */
export function ConcursApp() {
  const login = useLogin();
  const { setMyVotes } = login;
  const explorer = useExplorer();
  const [category, setCategory] = useState<CategoryId>(CATEGORIES[0].id);
  const [query, setQuery] = useState("");
  const [voting, setVoting] = useState<string | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const session = login.auth.status === "in" ? login.auth.session : null;
  const ownCode = session?.result.country.code ?? null;
  const myVotes: MyVotes = session?.voting?.myVotes ?? {};
  const myVote = myVotes[category] ?? null;
  const active = getCategory(category) ?? CATEGORIES[0];

  /** The name of the other prize where this guest already used the country. */
  const usedIn = useCallback(
    (code: string): string | null => {
      const other = CATEGORIES.find((c) => c.id !== category && myVotes[c.id] === code);
      return other?.name ?? null;
    },
    // `myVotes` is rebuilt every render; what it holds is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [category, session?.voting?.myVotes],
  );
  const picked = useCallback(
    (code: string) => CATEGORIES.some((c) => myVotes[c.id] === code),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session?.voting?.myVotes],
  );

  // Built the first time it is needed, in the browser only.
  const index = useMemo(() => buildSearchIndex(COUNTRIES_BY_NAME), []);
  const results = useMemo(() => searchCountries(COUNTRIES_BY_NAME, index, query), [index, query]);

  // A new search starts at the top of its own list, not wherever the last one
  // was scrolled to.
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    list.current?.scrollTo({ top: 0 });
  }, [query]);

  /** A vote in the prize being looked at, or `null` to take it back. */
  const castVote = useCallback(
    async (code: string | null, forCategory: CategoryId = category) => {
      if (!session || voting) return;
      setVoting(code ?? forCategory);
      setVoteError(null);
      setNotice(null);
      try {
        const response = await fetch("/api/vote", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: session.email,
            name: session.name,
            category: forCategory,
            country: code,
          }),
        });
        const data: unknown = await response.json().catch(() => null);
        setVoting(null);

        if (response.ok && isBallot(data)) {
          setMyVotes(data.myVotes);
          const prize = getCategory(forCategory)?.name ?? forCategory;
          setNotice(
            code
              ? `Vot apuntat a «${prize}»: ${getCountry(code)?.name ?? code}.`
              : `Vot de «${prize}» retirat.`,
          );
          return;
        }
        const failure = errorCode(data);
        if (failure === "own_country") setVoteError(VOTE_TEXT.ownCountry);
        else if (failure === "no_match") setVoteError(VOTE_TEXT.noMatch);
        else if (failure === "no_country") setVoteError(VOTE_TEXT.noCountry);
        else if (failure === "invalid_country") setVoteError(VOTE_TEXT.unknown);
        else if (failure === "invalid_category") setVoteError(VOTE_TEXT.unknownCategory);
        else if (failure === "concurs_closed") setVoteError(VOTE_TEXT.closed);
        else if (failure === "country_repeated") {
          const where = getCategory(repeatedIn(data) ?? "")?.name;
          setVoteError(
            `Ja has votat ${getCountry(code ?? "")?.name ?? "aquest país"}${where ? ` a «${where}»` : ""}. Un país només el pots triar en un premi: treu-ne el vot o tria'n un altre.`,
          );
        } else setVoteError(VOTE_TEXT.storage);
      } catch {
        setVoting(null);
        setVoteError(VOTE_TEXT.network);
      }
    },
    [category, setMyVotes, session, voting],
  );

  /** A vote refused a moment ago is not news once the explorer is opened afresh. */
  const openExplorer = useCallback(
    (code?: string) => {
      setVoteError(null);
      explorer.openAt(code);
    },
    [explorer],
  );

  const changeCategory = useCallback((id: CategoryId) => {
    setCategory(id);
    setVoteError(null);
    setNotice(null);
  }, []);

  return (
    <main style={PAGE_STYLE} className="night gate-shell">
      <FlagMarquee />

      <div className="concurs-inner">
        <header className="rise poster-fit text-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- static local SVG; the optimizer does not process SVG */}
          <img
            src="/logo-cup.svg"
            alt=""
            aria-hidden="true"
            className="gate-logo mx-auto mb-4"
          />
          <p className="eyebrow">Els premis · vota tothom</p>
          <h1 className="poster-title mt-4">
            <span className="line-el">El</span>
            <span>
              Mundial<em className="tail">et</em>
            </span>
          </h1>
        </header>

        {login.auth.status === "boot" ? (
          <div className="ticket p-5 text-center" aria-busy="true">
            <p className="eyebrow blink">Un moment…</p>
          </div>
        ) : !session ? (
          <LoginForm
            login={login}
            eyebrow="Només amb entrada"
            intro="Aquí només hi voten els qui vénen a la festa. Entra amb el nom i el correu amb què t'has apuntat per triar les millors disfresses."
            submitLabel="Entra i vota"
          />
        ) : (
          <>
            <div className="ticket rise flex items-center gap-4 p-4 sm:p-5">
              <Flag country={session.result.country} className="flag-face w-16 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="eyebrow">Hola, {firstName(session.result.name || session.name)}!</p>
                <p className="mt-1 truncate text-lg font-bold leading-tight">
                  Tu vas de {session.result.country.name}
                </p>
              </div>
              <button type="button" onClick={login.logout} className="btn-ghost shrink-0 !px-2">
                Surt
              </button>
            </div>

            <section className="ticket rise flex flex-col gap-4 p-5" aria-labelledby="ballot-title">
              <div>
                <h2 id="ballot-title" className="section-title">
                  Els teus vots
                </h2>
                <p className="mt-2 text-sm leading-snug text-paper/70">
                  Un vot per premi, i el pots canviar mentre el concurs estigui
                  obert. Un país només el pots triar en un premi.
                </p>
              </div>

              <ul className="ballot">
                {CATEGORIES.map((c) => {
                  const code = myVotes[c.id];
                  const country = code ? getCountry(code) : undefined;
                  return (
                    <li key={c.id} className="ballot-row">
                      <button
                        type="button"
                        className="ballot-pick"
                        aria-pressed={c.id === category}
                        onClick={() => changeCategory(c.id)}
                        style={{ "--accent": c.accent } as CSSProperties}
                      >
                        <span className="ballot-name">{c.name}</span>
                        {country ? (
                          <span className="ballot-value">
                            <Flag country={country} decorative className="flag-face w-7 shrink-0" />
                            <span className="truncate">{country.name}</span>
                          </span>
                        ) : (
                          <span className="ballot-value-none">Sense votar</span>
                        )}
                      </button>
                      {country ? (
                        <button
                          type="button"
                          className="ballot-clear"
                          onClick={() => void castVote(null, c.id)}
                          disabled={voting !== null}
                          aria-label={`Treu el vot de ${c.name}`}
                          title="Treu el vot"
                        >
                          ✕
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>

            <section
              className="ticket rise flex flex-col gap-4 p-5"
              aria-labelledby="vote-title"
              style={{ "--accent": active.accent } as CSSProperties}
            >
              <div>
                <p className="eyebrow">Vota</p>
                <h2 id="vote-title" className="section-title mt-1">
                  {active.name}
                </h2>
                <p className="mt-2 text-sm leading-snug text-paper/70">{active.body}</p>
              </div>

              {/* Read out by screen readers when it changes; sighted guests have
                  the ballot above to look at. */}
              <p role="status" className="sr-only">
                {notice}
              </p>

              {voteError && !explorer.open ? (
                <p
                  role="alert"
                  className="rounded-xl border border-magenta/50 bg-magenta/15 px-4 py-3 text-sm leading-snug text-paper"
                >
                  {voteError}
                </p>
              ) : null}

              <div className="mode-switch" role="group" aria-label="Com vols triar">
                <button type="button" aria-pressed={!explorer.open} className="mode-switch-on">
                  Cerca
                </button>
                <button
                  type="button"
                  aria-pressed={Boolean(explorer.open)}
                  onClick={() => openExplorer(results[0]?.code)}
                >
                  Explora
                </button>
              </div>

              <div className="min-w-0">
                <label htmlFor="country-search" className="sr-only">
                  Cerca un país
                </label>
                <input
                  id="country-search"
                  type="search"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  placeholder="Cerca un país…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="field"
                />
              </div>

              {results.length === 0 ? (
                <p className="text-sm text-paper/70">
                  Cap país es diu així. Prova-ho amb un altre nom.
                </p>
              ) : (
                <ul ref={list} className="vote-list" aria-label={`Països per a ${active.name}`}>
                  {results.map((country) => {
                    const own = country.code === ownCode;
                    const mine = country.code === myVote;
                    const used = usedIn(country.code);
                    return (
                      <li key={country.code} className="vote-row">
                        <Flag country={country} decorative className="flag-face w-10 shrink-0" />
                        {/* One line when there is a note under it, two when there is not:
                            either way the row keeps the one height the list counts by. */}
                        <span className="min-w-0 flex-1 font-semibold leading-tight">
                          <span className={used ? "block truncate" : "line-clamp-2"}>
                            {country.name}
                          </span>
                          {used ? (
                            <span className="block truncate font-mono text-[0.65rem] font-normal uppercase tracking-wider text-paper/45">
                              Ja votat a «{used}»
                            </span>
                          ) : null}
                        </span>
                        <button
                          type="button"
                          onClick={() => openExplorer(country.code)}
                          className="vote-look"
                          aria-label={`Mira ${country.name}`}
                          title={`Mira ${country.name}`}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            width="20"
                            height="20"
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            {/* An eye: this looks at the country, it does not vote for it. */}
                            <path d="M12 5c-5 0-8.5 4.4-9.4 5.7a1.5 1.5 0 0 0 0 1.7C3.5 13.6 7 18 12 18s8.5-4.4 9.4-5.6a1.5 1.5 0 0 0 0-1.7C20.5 9.4 17 5 12 5zm0 10.2a3.7 3.7 0 1 1 0-7.4 3.7 3.7 0 0 1 0 7.4z" />
                          </svg>
                        </button>
                        {own ? (
                          <span className="vote-state">El teu país</span>
                        ) : mine ? (
                          <span className="vote-state vote-state-on">✓ El teu vot</span>
                        ) : used ? (
                          <span className="vote-state">Ja el tens</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void castVote(country.code)}
                            disabled={voting !== null}
                            className="vote-go"
                            aria-label={`Vota ${country.name} a ${active.name}`}
                          >
                            {voting === country.code ? "…" : "Vota"}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        )}

        <div className="flex flex-wrap items-center justify-center gap-x-4">
          <Link href="/com-funciona" className="btn-ghost">
            Com funciona · les normes
          </Link>
          <ReplayIntroButton />
        </div>
      </div>

      <FlagMarquee />

      {explorer.open && session ? (
        <Explorer
          countries={COUNTRIES_BY_NAME}
          startCode={explorer.open.code}
          onClose={explorer.close}
          onSearch={explorer.close}
          vote={{
            ownCode: ownCode ?? "",
            categories: CATEGORIES.map((c) => ({ id: c.id, name: c.name, accent: c.accent })),
            category,
            onCategory: (id) => changeCategory(id as CategoryId),
            myVote,
            usedIn,
            picked,
            busy: voting !== null,
            error: voteError,
            onVote: (code) => void castVote(code),
          }}
        />
      ) : null}
    </main>
  );
}
