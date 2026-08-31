import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";

import { Countdown } from "@/components/Countdown";
import { Dancer } from "@/components/Dancer";
import { FlagMarquee } from "@/components/FlagMarquee";
import { countdownTarget, remainingUntil } from "@/lib/countdown";

const STRAPLINE = "42 països a repartir · 4 premis · moltes disfresses";

/**
 * The right-hand dancer, pinned by Giphy id rather than drawn from the pool.
 * Kept in `MUST_HAVE` in scripts/fetch-dances.mjs, which is what puts it in the
 * pool and keeps it there across a top-up.
 */
const RIGHT_DANCER = "x5lIgu2DDtI5IzdtUg";

export const metadata: Metadata = {
  title: "Aviat · El Mundialet",
  description: "42 països a repartir. 4 premis. Moltes disfresses.",
  openGraph: {
    title: "El Mundialet",
    description: "42 països a repartir. 4 premis. Moltes disfresses.",
    locale: "ca_ES",
    type: "website",
  },
};

/** The gate's own palette: the closed door should look like the door. */
const PAGE_STYLE = { "--c1": "#FF2E88", "--c2": "#6C2BD9" } as CSSProperties;

/**
 * Shown in place of every gated route while COUNT_DOWN is in the future.
 * Reached by rewrite, so the URL the guest typed is the URL they keep.
 *
 * Rendered per request: the countdown has to be read at request time, not
 * baked in at build time, or the gate would outlive the date it counts to.
 */
export const dynamic = "force-dynamic";

/** "11 de setembre" — no article, so there is no elision to get wrong. */
function openingDay(target: Date): string {
  return new Intl.DateTimeFormat("ca-ES", {
    day: "numeric",
    month: "long",
    timeZone: "Europe/Madrid",
  }).format(target);
}

export default function AviatPage() {
  const target = countdownTarget();

  return (
    <main style={PAGE_STYLE} className="night gate-shell">
      <FlagMarquee />

      <div className="aviat-inner">
        <header className="rise poster-fit w-full">
          {/* eslint-disable-next-line @next/next/no-img-element -- static local SVG; the optimizer does not process SVG */}
          <img
            src="/logo-cup.svg"
            alt=""
            aria-hidden="true"
            className="gate-logo mx-auto mb-4"
          />
          <h1 className="poster-title">
            <span className="line-el">El</span>
            <span>
              Mundial<em className="tail">et</em>
            </span>
          </h1>
          <p className="eyebrow mt-5 text-balance">{STRAPLINE}</p>
        </header>

        {target ? (
          <>
            {/* The dancers flank the board the same way they flank the player
                on the reveal, and drop out on narrow screens with it. */}
            <div className="dance-row">
              <Dancer code="CT" side="left" />
              <Countdown
                targetIso={target.toISOString()}
                initial={remainingUntil(target.getTime())}
              />
              <Dancer id={RIGHT_DANCER} side="right" />
            </div>
            <p className="stamp">Obertura · {openingDay(target)}</p>
          </>
        ) : (
          <p className="text-lg text-paper/70">Obrim aviat.</p>
        )}

        <div className="w-full max-w-xs">
          <Link href="/com-funciona" className="btn-festa">
            Com funciona
          </Link>
        </div>
      </div>

      <FlagMarquee />
    </main>
  );
}
