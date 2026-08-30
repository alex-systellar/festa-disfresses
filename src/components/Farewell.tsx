"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { FlagMarquee } from "@/components/FlagMarquee";

/** Cooler than the gate on purpose: neither of these is the party. */
const FAREWELL_STYLE = { "--c1": "#6C2BD9", "--c2": "#26D9C3" } as CSSProperties;

type FarewellProps = {
  /** `no` closes the door politely; `maybe` leaves it open. */
  kind: "no" | "maybe";
  /** Used to make the goodbye personal; empty is fine. */
  name: string;
  /** Back to the question: both answers are changed the same way. */
  onReconsider: () => void;
  /** Back to the details, still filled in. Same affordance as every screen. */
  onBack: () => void;
};

const COPY = {
  no: {
    eyebrow: "Resposta rebuda",
    title: "Bon vent i barca nova",
    body: "No és acomiadar-se el que fa mal sinó tots els moments que marxaran amb aquest adéu.",
  },
  maybe: {
    eyebrow: "Ho deixem en l'aire",
    title: "Torna quan ho sàpigues",
    body: "No et guardem cap país. Es reparteixen per ordre d'arribada i s'acaben. Espavila capdevila.",
  },
} as const;

export function Farewell({ kind, name, onReconsider, onBack }: FarewellProps) {
  const copy = COPY[kind];
  const first = name.trim().split(" ")[0] ?? "";

  return (
    <main className="night gate-shell" style={FAREWELL_STYLE}>
      <FlagMarquee />

      <div className="gate-inner gate-solo">
        <div className="rise poster-fit w-full text-center">
          <p className="eyebrow">{first ? `${first} · ${copy.eyebrow}` : copy.eyebrow}</p>
          <h1 className="poster-title mt-4 text-balance">{copy.title}</h1>
          <p className="mx-auto mt-5 max-w-sm text-sm leading-snug text-paper/75">
            {copy.body}
          </p>

          <div className="mx-auto mt-7 flex w-full max-w-xs flex-col gap-3">
            <button type="button" onClick={onReconsider} className="btn-festa">
              M&apos;ho he repensat
            </button>
            <button type="button" onClick={onBack} className="btn-outline">
              ← Canvia les dades
            </button>
          </div>

          <p className="mt-4">
            <Link href="/com-funciona" className="btn-ghost">
              Com funciona
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
