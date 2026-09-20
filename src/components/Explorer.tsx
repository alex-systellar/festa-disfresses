"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { CountryStage } from "@/components/CountryStage";
import { Flag } from "@/components/Flag";
import type { Country } from "@/data/countries";

/**
 * Where "the explorer is open" lives, and how the browser's back button closes
 * it. It is not an effect because an effect that pushes a history entry runs
 * twice under React's strict mode and leaves the stack a step out — so the
 * entry is pushed by the click that opens it, and a single listener answers
 * the button.
 *
 * `history.pushState` is safe to call here: the router patches it to keep its
 * own state on the entry, so coming back to it never triggers a reload.
 */
export function useExplorer() {
  /** Null while closed. `code` is where it opens, undefined for the first country. */
  const [open, setOpen] = useState<{ code?: string } | null>(null);

  useEffect(() => {
    const onPop = () => setOpen(null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const openAt = useCallback((code?: string) => {
    try {
      window.history.pushState({ explorer: true }, "");
    } catch {
      // No history to push to: it still opens, and closes with its own button.
    }
    setOpen({ code });
  }, []);

  const close = useCallback(() => {
    // Our own entry: leave it, and the listener above closes the explorer.
    if ((window.history.state as { explorer?: boolean } | null)?.explorer) {
      window.history.back();
    } else {
      setOpen(null);
    }
  }, []);

  return { open, openAt, close };
}

export type ExplorerVote = {
  /** The guest's own country. It is on the wall like any other, but not votable. */
  ownCode: string;
  /** The prizes, and the one being voted in. */
  categories: { id: string; name: string; accent: string }[];
  category: string;
  onCategory: (id: string) => void;
  /** What the guest picked in the category being voted in, or null. */
  myVote: string | null;
  /** The name of the other prize this guest already gave the country to. */
  usedIn: (code: string) => string | null;
  /** Whether the guest picked the country in any prize. */
  picked: (code: string) => boolean;
  busy: boolean;
  error: string | null;
  onVote: (code: string) => void;
};

type ExplorerProps = {
  /** The countries to walk through, in order. */
  countries: Country[];
  /** Where to open. Defaults to the first. */
  startCode?: string;
  onClose: () => void;
  /** Present only in the contest, where the way back to the search is a switch
   *  in the corner as well as the close button. */
  onSearch?: () => void;
  /** Present only in the contest, where each country gets a vote button. */
  vote?: ExplorerVote;
};

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Every country, one at a time, exactly as a guest meets theirs: the flag, the
 * name, the song and both dancers. It is the admin's "simula el sorteig"
 * preview turned into something you can walk through — next, previous, or jump
 * along the strip — with nothing about who holds what anywhere on it.
 *
 * Full screen and modal: it takes the keyboard (arrows, escape, a tab that
 * stays inside it), locks the page behind it and hands focus back to whatever
 * opened it. The song starts on its own because every way of changing country
 * is a click or a key, which is the gesture the browser wants before it will.
 */
export function Explorer({ countries, startCode, onClose, onSearch, vote }: ExplorerProps) {
  const [index, setIndex] = useState(() =>
    Math.max(0, countries.findIndex((c) => c.code === startCode)),
  );
  const dialogRef = useRef<HTMLDivElement>(null);
  const currentChip = useRef<HTMLButtonElement>(null);

  const count = countries.length;
  const country = countries[index];

  const go = useCallback((delta: number) => setIndex((i) => (i + delta + count) % count), [count]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        go(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        go(-1);
      } else if (event.key === "Tab" && dialogRef.current) {
        // Keep the tab key inside: everything behind the overlay is inert to
        // the eye, so it must not be reachable by the keyboard either.
        const items = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (event.shiftKey && (active === first || active === dialogRef.current)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  // Lock the page behind, and give focus back to whatever opened this.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const opener = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      opener?.focus?.();
    };
  }, []);

  // Keep the current flag in view along the strip.
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    currentChip.current?.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: reduced ? "auto" : "smooth",
    });
  }, [index]);

  if (!country) return null;

  const [c1, c2] = country.colors;
  const isOwn = vote?.ownCode === country.code;
  const isMyVote = vote?.myVote === country.code;
  const usedIn = vote?.usedIn(country.code) ?? null;
  const category = vote?.categories.find((c) => c.id === vote.category);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Explora els països"
      tabIndex={-1}
      className="fixed inset-0 z-50 overflow-auto bg-nit outline-none"
    >
      {onSearch ? (
        <div className="mode-switch fixed left-4 top-4 z-10" role="group" aria-label="Com vols triar">
          <button type="button" aria-pressed="false" onClick={onSearch}>
            Cerca
          </button>
          <button type="button" aria-pressed="true" className="mode-switch-on">
            Explora
          </button>
        </div>
      ) : null}

      <button
        type="button"
        onClick={onClose}
        className="fixed right-4 top-4 z-10 rounded-full border-2 border-paper/30 bg-nit/70 px-4 py-2 font-mono text-xs uppercase tracking-widest text-paper backdrop-blur transition hover:border-turquesa hover:text-turquesa"
      >
        Tanca<span className="hidden sm:inline"> · esc</span>
      </button>

      <main
        className="night center-safe flex flex-col items-center px-5 sm:px-6"
        style={{ "--c1": c1, "--c2": c2 } as CSSProperties}
      >
        <div className="reveal-stage">
          <CountryStage
            key={country.code}
            country={country}
            pop
            autoplay
            header={
              <div className="text-center">
                <p className="section-title">{category ? category.name : "Explora"}</p>
                <p
                  aria-live="polite"
                  className="mt-2.5 font-mono text-[0.7rem] uppercase tracking-[0.2em] text-paper/60"
                >
                  {index + 1} de {count} · ← → per canviar
                </p>
              </div>
            }
          />

          <footer className="mt-5 flex w-full flex-col items-center gap-4 pb-2 text-center">
            {vote ? (
              <div className="flex w-full max-w-lg flex-col items-center gap-2">
                <div className="cat-pills" role="group" aria-label="Premi">
                  {vote.categories.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={c.id === vote.category}
                      onClick={() => vote.onCategory(c.id)}
                      style={{ "--accent": c.accent } as CSSProperties}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>

                {vote.error ? (
                  <p
                    role="alert"
                    className="w-full rounded-xl border border-magenta/50 bg-magenta/15 px-4 py-3 text-sm leading-snug text-paper"
                  >
                    {vote.error}
                  </p>
                ) : null}

                {isOwn ? (
                  <p className="rounded-xl border-2 border-dashed border-paper/30 px-4 py-3 text-sm leading-snug text-paper/80">
                    Aquest és el teu país. No et pots votar a tu mateix/a.
                  </p>
                ) : isMyVote ? (
                  <>
                    <p className="stamp">✓ El teu vot</p>
                    <p className="text-sm text-paper/70">
                      Si en tries un altre, el vot canvia.
                    </p>
                  </>
                ) : usedIn ? (
                  <p className="rounded-xl border-2 border-dashed border-paper/30 px-4 py-3 text-sm leading-snug text-paper/80">
                    Ja has votat aquest país a «{usedIn}». Un país només el pots triar en un premi.
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => vote.onVote(country.code)}
                    disabled={vote.busy}
                    className="btn-festa"
                  >
                    {vote.busy ? "Un moment…" : `Vota ${country.name}`}
                  </button>
                )}
              </div>
            ) : null}

            <div className="grid w-full max-w-lg grid-cols-2 gap-3">
              <button type="button" onClick={() => go(-1)} className="btn-outline">
                ← Anterior
              </button>
              <button type="button" onClick={() => go(1)} className="btn-outline">
                Següent →
              </button>
            </div>

            <nav aria-label="Tots els països" className="explorer-strip">
              {countries.map((c, i) => (
                <button
                  key={c.code}
                  ref={i === index ? currentChip : undefined}
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={c.name}
                  aria-current={i === index ? "true" : undefined}
                  className="explorer-chip"
                >
                  <Flag country={c} decorative className="flag-face" />
                  {vote?.picked(c.code) ? (
                    <span className="explorer-chip-check" aria-hidden="true">
                      ✓
                    </span>
                  ) : null}
                </button>
              ))}
            </nav>
          </footer>
        </div>
      </main>
    </div>
  );
}
