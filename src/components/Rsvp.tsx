"use client";

import type { CSSProperties } from "react";
import { FlagMarquee } from "@/components/FlagMarquee";

const RSVP_STYLE = { "--c1": "#FF2E88", "--c2": "#6C2BD9" } as CSSProperties;

export type RsvpAnswer = "yes" | "maybe" | "no";

type RsvpProps = {
  /** Only the first name: this is the one screen that talks to the guest. */
  name: string;
  onAnswer: (answer: RsvpAnswer) => void;
  onBack: () => void;
  busy: boolean;
};

/**
 * The confirmation between the details and the sorteig. Nothing is claimed
 * until somebody says they are coming — a country handed to a "no" is a
 * country nobody at the party gets to wear.
 */
export function Rsvp({ name, onAnswer, onBack, busy }: RsvpProps) {
  const first = name.trim().split(" ")[0] ?? "";

  return (
    <main className="night gate-shell" style={RSVP_STYLE}>
      <FlagMarquee />

      <div className="gate-inner gate-solo">
        <div className="ticket rise w-full">
          <p className="eyebrow">
            {first ? `${first}, l'hora de la veritat` : "L'hora de la veritat"}
          </p>
          <h1 className="section-title mt-3">Hi seràs?</h1>
          <p className="mt-3 text-sm leading-snug text-paper/75">
            Els països es reparteixen entre qui ve. Confirma-ho i la roda
            comença a girar.
          </p>

          <hr className="perf" />

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => onAnswer("yes")}
              disabled={busy}
              className="btn-festa"
            >
              {busy ? "Sortejant…" : "Sí, hi seré"}
            </button>
            <button
              type="button"
              onClick={() => onAnswer("maybe")}
              disabled={busy}
              className="btn-outline"
            >
              Potser
            </button>
            <button
              type="button"
              onClick={() => onAnswer("no")}
              disabled={busy}
              className="btn-outline"
            >
              No hi podré ser
            </button>
          </div>
        </div>

        <p className="text-center">
          <button type="button" onClick={onBack} className="btn-ghost">
            Torna enrere
          </button>
        </p>
      </div>
    </main>
  );
}
