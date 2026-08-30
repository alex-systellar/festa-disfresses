"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { CSSProperties } from "react";
import { CountryPlayer } from "@/components/CountryPlayer";
import { Dancer } from "@/components/Dancer";
import { Flag } from "@/components/Flag";
import type { ClaimResult } from "@/components/PartyApp";

type RevealProps = {
  result: ClaimResult;
  /** Returning guest: no spin, no confetti, no autoplay. */
  calm: boolean;
  onReroll: () => void;
  onReset: () => void;
  rerollError: string | null;
};

export function Reveal({
  result,
  calm,
  onReroll,
  onReset,
  rerollError,
}: RevealProps) {
  const { country, duplicate, canReroll, remaining } = result;
  const [c1, c2] = country.colors;
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (calm) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    void import("canvas-confetti")
      .then(({ default: confetti }) => {
        if (cancelled) return;
        const colors = [c1, c2, "#FF2E88", "#FFC93C", "#FFF3E2"];
        const burst = (particleCount: number, x: number, y: number) => {
          confetti({
            particleCount,
            spread: 78,
            startVelocity: 46,
            scalar: 1.05,
            ticks: 220,
            origin: { x, y },
            colors,
            disableForReducedMotion: true,
          });
        };
        burst(110, 0.5, 0.55);
        timers.push(setTimeout(() => !cancelled && burst(55, 0.1, 0.7), 220));
        timers.push(setTimeout(() => !cancelled && burst(55, 0.9, 0.7), 380));
      })
      .catch(() => {
        // Confetti is decoration; a failed chunk must never break the reveal.
      });

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [calm, c1, c2]);

  return (
    <main
      className="night center-safe flex flex-col items-center px-5 sm:px-6"
      style={{ "--c1": c1, "--c2": c2 } as CSSProperties}
    >
      <div className="reveal-stage rise">
        <div className="reveal-body">
          <div className="text-center">
            {/* Not an <h1>: the country below is the page's subject and holds
                that role, so this stays a paragraph wearing the title style. */}
            <p className="section-title">Ja tens país!</p>
            <p className="mt-2.5 font-mono text-[0.7rem] uppercase tracking-[0.2em] text-paper/60">
              Prepara la disfressa ·{" "}
              <Link
                href="/com-funciona"
                className="inline-block px-1 py-1.5 underline decoration-paper/30 underline-offset-4 transition hover:text-turquesa"
              >
                les normes
              </Link>
            </p>
          </div>

          <div className="plinth">
            <span className="halo" aria-hidden="true" />
            <Flag
              country={country}
              className={`big-flag flag-face ${calm ? "" : "pop"}`}
            />
          </div>

          <h1 className="country-name text-center">{country.name}</h1>

          {duplicate ? (
            <span className="stamp">
              País compartit · s&apos;han acabat els originals
            </span>
          ) : null}
        </div>

        <div className="dance-row">
          <Dancer code={country.code} side="left" />
          <div className="anthem-stub">
            <CountryPlayer
              key={country.code}
              code={country.code}
              anthemTitle={country.anthem.title}
              hasRecording={Boolean(country.anthem.source)}
              autoplay={!calm}
            />
          </div>
          <Dancer code={country.code} side="right" />
        </div>

        <footer className="mt-5 flex w-full flex-col items-center gap-2 text-center">
          {rerollError ? (
            <p
              role="alert"
              className="max-w-lg rounded-xl border border-magenta/50 bg-magenta/15 px-4 py-3 text-sm leading-snug text-paper"
            >
              {rerollError}
            </p>
          ) : null}

          {canReroll && !confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="btn-ghost"
            >
              No m&apos;agrada — torna a tirar (només un cop)
            </button>
          ) : null}

          {canReroll && confirming ? (
            <div className="w-full max-w-lg rounded-2xl border-2 border-dashed border-or/50 bg-nit/70 p-5 backdrop-blur">
              <p className="eyebrow">Última oportunitat</p>
              <p className="mt-3 text-sm leading-snug text-paper/85">
                Si tornes a tirar, {country.name} torna al sac i se&apos;l pot
                quedar algú altre. El país que surti serà el definitiu.
              </p>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => {
                    setConfirming(false);
                    onReroll();
                  }}
                  className="btn-festa btn-festa-sm"
                >
                  Sí, torna a tirar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="btn-outline"
                >
                  Em quedo {country.name}
                </button>
              </div>
            </div>
          ) : null}

          <p className="font-mono text-[0.7rem] uppercase tracking-[0.2em] text-paper/55">
            {remaining > 0
              ? `Queden ${remaining} països sense amo`
              : "Tots els països repartits"}
          </p>
          <button type="button" onClick={onReset} className="btn-ghost">
            No sóc jo · comença de nou
          </button>
        </footer>
      </div>
    </main>
  );
}
