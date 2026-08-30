"use client";

import { useEffect, useState } from "react";

type CountdownProps = {
  /** ISO timestamp the clock counts towards. */
  targetIso: string;
};

type Remaining = { days: number; hours: number; minutes: number; seconds: number };

function remainingUntil(target: number, now: number): Remaining {
  const ms = Math.max(0, target - now);
  const total = Math.floor(ms / 1000);
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

const UNITS: { key: keyof Remaining; label: string }[] = [
  { key: "days", label: "dies" },
  { key: "hours", label: "hores" },
  { key: "minutes", label: "minuts" },
  { key: "seconds", label: "segons" },
];

/**
 * Ticking clock to the opening.
 *
 * Nothing is computed during render: the server and the client would disagree
 * about "now" by however long the response took, and React would report a
 * hydration mismatch. The first paint shows dashes, and the real figures
 * arrive on mount a frame later.
 */
export function Countdown({ targetIso }: CountdownProps) {
  const [left, setLeft] = useState<Remaining | null>(null);

  useEffect(() => {
    const target = new Date(targetIso).getTime();
    const tick = () => setLeft(remainingUntil(target, Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetIso]);

  return (
    <div className="flex flex-wrap items-start justify-center gap-3 sm:gap-6">
      {UNITS.map(({ key, label }) => (
        <div key={key} className="flex min-w-[4.5rem] flex-col items-center sm:min-w-[6rem]">
          <span
            className="font-display text-paper tabular-nums"
            style={{ fontSize: "clamp(2.5rem, 11vw, 5.5rem)", lineHeight: 1 }}
          >
            {left ? String(left[key]).padStart(2, "0") : "––"}
          </span>
          <span className="eyebrow mt-2">{label}</span>
        </div>
      ))}
    </div>
  );
}
