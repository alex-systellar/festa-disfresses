"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { remainingUntil, type Remaining } from "@/lib/countdown";

type CountdownProps = {
  /** ISO timestamp the clock counts towards. */
  targetIso: string;
  /**
   * The gap as the server saw it. Used as the first client render too, so the
   * markup matches and the guest never sees placeholder dashes.
   */
  initial: Remaining;
};

const UNITS: { key: keyof Remaining; label: string }[] = [
  { key: "days", label: "dies" },
  { key: "hours", label: "hores" },
  { key: "minutes", label: "minuts" },
  { key: "seconds", label: "segons" },
];

/** Marks the one automatic hop to `/`, so a fast clock cannot loop on it. */
const HOP_KEY = "fd_countdown_hop";

/**
 * The clock to the opening, built as the split-flap board the sorteig itself
 * uses: same card, same hinge, same flap on every change. The countdown is
 * visibly the same machine as the draw, stopped.
 */
export function Countdown({ targetIso, initial }: CountdownProps) {
  const router = useRouter();
  const [left, setLeft] = useState<Remaining>(initial);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const target = new Date(targetIso).getTime();
    const tick = () => {
      const now = Date.now();
      setLeft(remainingUntil(target, now));
      setOpen(now >= target);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetIso]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    void import("canvas-confetti")
      .then(({ default: confetti }) => {
        if (cancelled) return;
        confetti({
          particleCount: 140,
          spread: 92,
          startVelocity: 48,
          scalar: 1.05,
          ticks: 220,
          origin: { y: 0.55 },
          colors: ["#FF2E88", "#FFC93C", "#26D9C3", "#FFF3E2"],
          disableForReducedMotion: true,
        });
      })
      .catch(() => {
        // Confetti is decoration; a failed chunk must not strand the guest.
      });

    /*
     * One automatic hop to the draw, at most once per session. The proxy runs
     * on this navigation too, so a guest whose clock is ahead of the server's
     * simply gets rewritten back here — without the flag that is an endless
     * loop. With it, a fast clock costs one wasted hop and the button below
     * still works.
     */
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (sessionStorage.getItem(HOP_KEY) === null) {
        sessionStorage.setItem(HOP_KEY, "1");
        timer = setTimeout(() => router.push("/"), 1800);
      }
    } catch {
      // Private mode denies storage. The guest clicks through instead.
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [open, router]);

  if (open) {
    return (
      <div className="flex w-full flex-col items-center gap-6">
        <p className="poster-title clock-open">Obert!</p>
        <div className="w-full max-w-xs">
          <Link href="/" className="btn-festa">
            Entra al sorteig
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="clock" role="timer" aria-live="off">
      {UNITS.map(({ key, label }) => {
        const value = String(left[key]).padStart(2, "0");
        return (
          <div key={key} className="clock-unit">
            <div className="clock-card">
              {/* Re-keyed on the value so the flap animation replays: React
                  remounts the span, which restarts the CSS animation. */}
              <span key={value} className="clock-digits">
                {value}
              </span>
            </div>
            <span className="clock-label">{label}</span>
          </div>
        );
      })}
    </div>
  );
}
