"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { Explorer, useExplorer } from "@/components/Explorer";
import { Flag } from "@/components/Flag";
import { FlagMarquee } from "@/components/FlagMarquee";
import { IntroGate, ReplayIntroButton, useIntroWaiting } from "@/components/IntroGate";
import { LoginForm } from "@/components/LoginForm";
import { Reveal } from "@/components/Reveal";
import { useLogin } from "@/components/useLogin";
import type { Session } from "@/components/useLogin";
import { COUNTRIES, getCountry } from "@/data/countries";
import { getDancers } from "@/data/dances";
import { COUNTRIES_BY_NAME, firstName } from "@/lib/country-order";

const PAGE_STYLE = { "--c1": "#FF2E88", "--c2": "#6C2BD9" } as CSSProperties;

/**
 * The memes that get a sticker on the wall: Sparta, the Conguitos, the bike
 * thief and Borat. Hand-picked rather than one per country, so the wall reads
 * as a few jokes among the flags instead of a second grid of stickers. Each
 * one is that country's own GIF and opens that country in the explorer.
 */
const WALL_MEMES = new Set(["GR", "CD", "MA", "KZ"]);

type WallCell =
  | { kind: "flag"; code: string }
  | { kind: "meme"; code: string };

/** Every flag in order, with a chosen country's meme right after its flag. */
const CELLS: WallCell[] = COUNTRIES_BY_NAME.flatMap((country) => {
  const cells: WallCell[] = [{ kind: "flag", code: country.code }];
  if (WALL_MEMES.has(country.code) && getDancers(country.code)) {
    cells.push({ kind: "meme", code: country.code });
  }
  return cells;
});

/**
 * One meme as a sticker on the wall. The same trick as the dancers beside the
 * player: under reduced motion the still frame is served instead of the
 * animation, since an animated image cannot be paused from script.
 */
function WallMeme({ code }: { code: string }) {
  const dance = getDancers(code)?.left;
  if (!dance) return null;
  return (
    <picture>
      <source media="(prefers-reduced-motion: reduce)" srcSet={dance.still} />
      <img
        src={dance.src}
        alt=""
        aria-hidden="true"
        width={dance.width}
        height={dance.height}
        loading="lazy"
        decoding="async"
        className="wall-meme-img"
      />
    </picture>
  );
}

type WallProps = {
  session: Session;
  view: "wall" | "mine";
  celebrate: boolean;
  onView: (view: "wall" | "mine") => void;
  onLogout: () => void;
};

/**
 * The wall itself, for a guest who is logged in: their country, every country
 * laid out around it, and the viewer.
 *
 * Nothing here says who wears what. The wall shows the whole list, held or not,
 * and shows a guest only their own country.
 */
function Wall({ session, view, celebrate, onView, onLogout }: WallProps) {
  const explorer = useExplorer();
  // A guest who has just logged in lands on their own country. It waits for the
  // film to be over, so the moment is seen and not spent behind the curtain.
  const waiting = useIntroWaiting();

  if (view === "mine" && !waiting) {
    return (
      <Reveal
        result={session.result}
        calm={!celebrate}
        mode="board"
        onReroll={() => {}}
        rerollError={null}
        onBack={() => onView("wall")}
        onReset={onLogout}
      />
    );
  }

  return (
    <main style={PAGE_STYLE} className="night gate-shell wall-shell">
      <FlagMarquee />

      <div className="wall-inner">
        <section className="wall-hero" aria-label="El teu país">
          <header className="rise poster-fit">
            {/* eslint-disable-next-line @next/next/no-img-element -- static local SVG; the optimizer does not process SVG */}
            <img
              src="/logo-cup.svg"
              alt=""
              aria-hidden="true"
              className="gate-logo mb-4"
            />
            <p className="eyebrow">{COUNTRIES.length} països · el sorteig ja ha acabat</p>
            <h1 className="poster-title mt-4">
              <span className="line-el">El</span>
              <span>
                Mundial<em className="tail">et</em>
              </span>
            </h1>
          </header>

          <div className="ticket rise flex flex-col gap-4 p-5">
            <p className="eyebrow">Hola, {firstName(session.result.name || session.name)}!</p>
            <div className="flex items-center gap-4">
              <Flag country={session.result.country} className="flag-face w-20 shrink-0" />
              <div className="min-w-0">
                <p className="text-2xl font-extrabold leading-tight tracking-tight">
                  {session.result.country.name}
                </p>
                <p className="text-sm text-paper/60">El teu país</p>
              </div>
            </div>
            <button type="button" onClick={() => onView("mine")} className="btn-festa btn-festa-sm">
              Veure el meu país
            </button>
            <button type="button" onClick={onLogout} className="btn-ghost self-center">
              No sóc jo · surt
            </button>
          </div>

          <div className="flex flex-col items-center gap-1">
            <button type="button" onClick={() => explorer.openAt()} className="btn-outline">
              Explora
            </button>
            <p className="max-w-xs text-center font-mono text-[0.7rem] leading-4 tracking-wider text-paper/50">
              Tots els països, un per un: bandera, cançó i mems.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-4">
            <Link href="/com-funciona" className="btn-ghost">
              Com funciona · les normes
            </Link>
            <ReplayIntroButton />
          </div>
        </section>

        <section className="wall-board" aria-labelledby="wall-title">
          <h2 id="wall-title" className="sr-only">
            Tots els països
          </h2>
          <p className="mb-4 font-mono text-[0.7rem] uppercase tracking-[0.2em] text-paper/55">
            Toca un país per veure&apos;l
          </p>
          <ul className="wall-grid">
            {CELLS.map((cell, index) => {
              const country = getCountry(cell.code);
              if (!country) return null;
              return cell.kind === "flag" ? (
                <li key={`f-${cell.code}`} className="wall-tile">
                  <button
                    type="button"
                    onClick={() => explorer.openAt(cell.code)}
                    aria-label={`Explora ${country.name}`}
                  >
                    <Flag country={country} decorative className="flag-face" />
                    <span className="wall-name">{country.name}</span>
                  </button>
                </li>
              ) : (
                <li
                  key={`m-${cell.code}`}
                  className="wall-meme"
                  // Stickers lean alternately, so they do not sit in a row.
                  style={{ "--tilt": index % 2 ? "1.5deg" : "-1.5deg" } as CSSProperties}
                >
                  <button
                    type="button"
                    onClick={() => explorer.openAt(cell.code)}
                    aria-label={`Explora ${country.name}`}
                  >
                    <WallMeme code={cell.code} />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <FlagMarquee />

      {explorer.open ? (
        <Explorer
          countries={COUNTRIES_BY_NAME}
          startCode={explorer.open.code}
          onClose={explorer.close}
        />
      ) : null}
    </main>
  );
}

/**
 * `/` once the draw is over and the contest has not opened.
 *
 * A guest has to log in to get past the door: until they do there is only the
 * login, and no wall, no viewer and no film. Once in, the film plays (see
 * `IntroGate`) and then the wall of everybody's countries is there, with their
 * own country up front. A guest who signed up on this browser is let straight
 * through, so they type nothing.
 */
export function RepartimentApp() {
  const [view, setView] = useState<"wall" | "mine">("wall");
  /** Only a login just performed celebrates; a remembered one stays calm. */
  const [celebrate, setCelebrate] = useState(false);
  const login = useLogin({
    onLogin: () => {
      setCelebrate(true);
      setView("mine");
    },
  });

  const session = login.auth.status === "in" ? login.auth.session : null;

  function logout() {
    login.logout();
    setCelebrate(false);
    setView("wall");
  }

  if (session) {
    return (
      <IntroGate>
        <Wall
          session={session}
          view={view}
          celebrate={celebrate}
          onView={(next) => {
            if (next === "wall") setCelebrate(false);
            setView(next);
          }}
          onLogout={logout}
        />
      </IntroGate>
    );
  }

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
          <p className="eyebrow">El sorteig ja ha acabat</p>
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
        ) : (
          <LoginForm
            login={login}
            eyebrow="Només amb entrada"
            intro="El sorteig ha acabat i ja no s'apunta ningú. Entra amb el nom i el correu amb què t'has apuntat per veure el vídeo, els països i què et va tocar."
            submitLabel="Entra"
          />
        )}

        <div className="flex justify-center">
          <Link href="/com-funciona" className="btn-ghost">
            Com funciona · les normes
          </Link>
        </div>
      </div>

      <FlagMarquee />
    </main>
  );
}
