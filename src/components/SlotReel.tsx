"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { COUNTRIES, type Country } from "@/data/countries";
import { Flag } from "@/components/Flag";

/** The wait is the show: never land before this. */
const MIN_SPIN_MS = 2400;
const FLAP_MS = 65;
/** Deceleration curve for the last few flaps. */
const SLOWDOWN_MS = [95, 140, 200, 280, 385, 520];
const SETTLE_MS = 620;

const REEL_STYLE = { "--c1": "#6C2BD9", "--c2": "#FF2E88" } as CSSProperties;

function pickDifferent(current: Country): Country {
  let next = current;
  while (next.code === current.code) {
    next = COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)];
  }
  return next;
}

type SlotReelProps = {
  /** The claimed country, once the API has answered. Null while in flight. */
  target: Country | null;
  onLand: (country: Country) => void;
  /** Second and final attempt: say so while it turns. */
  reroll: boolean;
};

export function SlotReel({ target, onLand, reroll }: SlotReelProps) {
  const [display, setDisplay] = useState<Country>(
    () => COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)],
  );
  const [landed, setLanded] = useState(false);

  const targetRef = useRef<Country | null>(target);
  const onLandRef = useRef(onLand);

  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  useEffect(() => {
    onLandRef.current = onLand;
  }, [onLand]);

  useEffect(() => {
    const startedAt = Date.now();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    const land = (country: Country) => {
      let step = 0;
      const next = () => {
        if (stopped) return;
        if (step === SLOWDOWN_MS.length) {
          setDisplay(country);
          setLanded(true);
          timer = setTimeout(() => {
            if (!stopped) onLandRef.current(country);
          }, SETTLE_MS);
          return;
        }
        setDisplay(pickDifferent);
        timer = setTimeout(next, SLOWDOWN_MS[step++]);
      };
      next();
    };

    const spin = () => {
      if (stopped) return;
      const claimed = targetRef.current;
      if (claimed && Date.now() - startedAt >= MIN_SPIN_MS) {
        land(claimed);
        return;
      }
      setDisplay(pickDifferent);
      timer = setTimeout(spin, FLAP_MS);
    };

    timer = setTimeout(spin, FLAP_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);

  return (
    <main
      className="night center-safe flex flex-col items-center gap-8 px-6 py-16"
      style={REEL_STYLE}
    >
      <p className="eyebrow" aria-hidden="true">
        {reroll ? "Segona i última tirada" : "Sorteig en curs"}
      </p>

      <div className={`flap ${landed ? "flap-landed" : ""}`}>
        <Flag
          key={display.code}
          country={display}
          className="flap-glyph flag-face"
          decorative
        />
      </div>

      <p
        className="font-mono text-sm uppercase tracking-[0.28em] text-paper/80"
        role="status"
        aria-live="polite"
      >
        {landed ? display.name : <span className="blink">Assignant país…</span>}
      </p>

      <p className="max-w-xs text-center text-sm leading-snug text-paper/45">
        No et moguis. La roda decideix per tu.
      </p>
    </main>
  );
}
