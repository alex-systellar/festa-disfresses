import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { CATEGORIES } from "@/data/categories";
import { currentPhase, type Phase } from "@/lib/phase";

export const metadata: Metadata = {
  title: "Com funciona · El Mundialet",
  description:
    "Les normes del sorteig, la passarel·la de la nit i les quatre categories que es premien.",
  openGraph: {
    title: "Com funciona · El Mundialet",
    description:
      "Les normes del sorteig, la passarel·la de la nit i les quatre categories que es premien.",
    locale: "ca_ES",
    type: "article",
  },
};

const PAGE_STYLE = { "--c1": "#FF2E88", "--c2": "#6C2BD9" } as CSSProperties;

/**
 * The rules never change, but where they point does: the link back and the
 * button at the bottom lead to `/`, and what `/` is depends on how far along
 * the party is (see `src/lib/phase.ts`). Read per request for that reason.
 */
export const dynamic = "force-dynamic";

const PHASE_COPY: Record<Phase, { back: string; closing: string; cta: string }> = {
  draw: {
    back: "← Torna al sorteig",
    closing: "Ja ho saps tot. Ara només falta saber de quin país vas.",
    cta: "Tira la sort",
  },
  over: {
    back: "← Torna als països",
    closing: "Ja ho saps tot. Només et falta consultar de quin país vas.",
    cta: "Consulta el teu país",
  },
  concurs: {
    back: "← Torna al concurs",
    closing: "Ja ho saps tot. Ara toca triar el millor.",
    cta: "Vota el millor",
  },
};

const STEPS = [
  {
    title: "Sorteig",
    body: "Posa el nom i el correu, fes RSPV i et tocarà un país. Si no t'agrada tens una segona tirada però la segona és definitiva.",
  },
  {
    title: "Prepara la disfressa",
    body: "Tens temps de sobres per preparar-ho!",
  },
  {
    title: "Concurs",
    body: "El dia de la festa es desfila i es reparteixen els quatre premis. Si no recordes què t'ha tocat, torna a la portada amb el mateix nom i correu i ho veuràs.",
  },
];

export default function ComFunciona() {
  const copy = PHASE_COPY[currentPhase()];

  return (
    <main className="night px-5 pb-16 pt-6 sm:px-8" style={PAGE_STYLE}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-14 sm:gap-20">
        <header className="rise">
          <Link href="/" className="btn-ghost -ml-3">
            {copy.back}
          </Link>
          <p className="eyebrow mt-6">Les normes de la nit</p>
          <h1 className="poster-title poster-title-sm mt-4">
            <span>Com</span>
            <span className="line-2">funciona</span>
          </h1>
          {/* Three sentences, three paragraphs. JSX folds the blank lines of a
              single block into spaces, so the breaks have to be real elements. */}
          <div className="mt-6 flex max-w-xl flex-col gap-4 text-lg leading-snug text-paper/75">
            <p>Farem un concurs de disfresses com cada any.</p>
            <p>Aquest any la temàtica és 🌈 països 🌈.</p>
            <p>
              A cadascú se li assigna un país aleatori, no hi ha repes i
              (idealment) ningú sap quins toquen abans de la festa.
            </p>
          </div>
        </header>

        <section aria-labelledby="categories">
          <h2 id="categories" className="section-title">
            Les categories
          </h2>
          <p className="mt-4 max-w-xl leading-snug text-paper/70">
            Quatre premis, i els vota tothom. Tens un vot per premi, no pots
            votar-te a tu mateix/a, i un mateix país no el pots triar en dos
            premis.
          </p>

          <ul className="mt-7 grid gap-4 sm:grid-cols-2">
            {CATEGORIES.map((category) => (
              <li
                key={category.id}
                className={`cat-card ${category.id === "public" ? "cat-card-public" : ""}`}
                style={{ "--accent": category.accent } as CSSProperties}
              >
                <span className="cat-rule" aria-hidden="true" />
                <h3 className="cat-name">{category.name}</h3>
                <p className="leading-snug text-paper/70">{category.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="ara-que">
          <h2 id="ara-que" className="section-title">
            I ara, què?
          </h2>

          <ol className="mt-7 flex flex-col gap-4">
            {STEPS.map((step, index) => (
              <li key={step.title} className="ticket flex gap-4 p-5 sm:p-6">
                <span className="step-num" aria-hidden="true">
                  {index + 1}
                </span>
                <div>
                  <h3 className="text-lg font-semibold leading-tight text-paper sm:text-xl">
                    {step.title}
                  </h3>
                  <p className="mt-1.5 leading-snug text-paper/70">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="passarella" className="runway-band">
          <p className="eyebrow">La nit</p>
          <h2 id="passarella" className="runway-title mt-4">
            Hi haurà
            <br />
            passarel·la
          </h2>
          <p className="mx-auto mt-6 max-w-md text-lg leading-snug text-paper/85 sm:text-xl">
            Tothom desfila. Surts, camines, fas el teu moment i tornes. No cal
            preparar cap número: el país ja fa la meitat de la feina.
          </p>
          <div className="footlights mt-10" aria-hidden="true">
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i} style={{ animationDelay: `${i * 0.14}s` }} />
            ))}
          </div>
        </section>

        <footer className="flex flex-col items-center gap-4 text-center">
          <p className="max-w-md leading-snug text-paper/70">{copy.closing}</p>
          <Link href="/" className="btn-festa max-w-xs">
            {copy.cta}
          </Link>
        </footer>
      </div>
    </main>
  );
}
