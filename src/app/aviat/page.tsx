import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";

import { Countdown } from "@/components/Countdown";
import { countdownTarget } from "@/lib/countdown";

export const metadata: Metadata = {
  title: "Aviat · El Mundialet",
  description: "Encara no. El sorteig obre el dia que toca.",
  openGraph: {
    title: "Aviat · El Mundialet",
    description: "Encara no. El sorteig obre el dia que toca.",
    locale: "ca_ES",
    type: "website",
  },
};

const PAGE_STYLE = { "--c1": "#26D9C3", "--c2": "#6C2BD9" } as CSSProperties;

/**
 * Shown in place of every gated route while COUNT_DOWN is in the future.
 * Reached by rewrite, so the URL the guest typed is the URL they keep.
 *
 * Rendered per request: the countdown has to be read at request time, not
 * baked in at build time, or the gate would outlive the date it counts to.
 */
export const dynamic = "force-dynamic";

export default function AviatPage() {
  const target = countdownTarget();

  return (
    <main
      style={PAGE_STYLE}
      className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col items-center justify-center gap-8 px-5 py-16 text-center"
    >
      <div>
        <p className="eyebrow">El Mundialet</p>
        <h1 className="country-name mt-3 text-balance">Encara no</h1>
      </div>

      {target ? (
        <Countdown targetIso={target.toISOString()} />
      ) : (
        <p className="text-lg text-paper/70">Obrim aviat.</p>
      )}

      <p className="max-w-md text-balance text-lg leading-snug text-paper/70">
        El sorteig encara no està obert. Torna quan el rellotge arribi a zero i
        et donarem un país.
      </p>

      <Link
        href="/com-funciona"
        className="rounded-full border-2 border-paper/30 px-6 py-3 text-paper transition hover:border-turquesa hover:text-turquesa focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-turquesa"
      >
        Mentrestant, mira com funciona
      </Link>
    </main>
  );
}
