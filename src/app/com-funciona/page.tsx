import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";

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

const STEPS = [
  {
    title: "Sorteig",
    body: "Entra el nom i el correu, fes RSPV i et tocarà un país. Si no t'agrada tens una segona tirada però la segona és definitiva.",
  },
  {
    title: "Prepara la disfressa",
    body: "Tens temps de sobres per preparar-ho!",
  },
  {
    title: "Concurs",
    body: "El dia de la festa es desfila i es reparteixen els quatre premis. Si no recordes què t'ha tocat, torna aquí amb el mateix correu.",
  },
];

const CATEGORIES = [
  {
    name: "Més sexy",
    body: "Glamur, posat i seguretat. Aquí guanya qui se la creu més, no qui ensenya més.",
    accent: "#FF2E88",
    public: false,
  },
  {
    name: "Més divertida",
    body: "La que fa riure tota la sala abans d'arribar al final de la passarel·la.",
    accent: "#26D9C3",
    public: false,
  },
  {
    name: "Més original",
    body: "La idea que ningú no havia vist venir. Punts extra per l'enginy casolà.",
    accent: "#7C5CFF",
    public: false,
  },
  {
    name: "Premi del públic",
    body: "Aquest no el decideix cap jurat: el vota tothom qui hi és, a crits i aplaudiments.",
    accent: "#FFC93C",
    public: true,
  },
];

export default function ComFunciona() {
  return (
    <main className="night px-5 pb-16 pt-6 sm:px-8" style={PAGE_STYLE}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-14 sm:gap-20">
        <header className="rise">
          <Link href="/" className="btn-ghost -ml-3">
            ← Torna al sorteig
          </Link>
          <p className="eyebrow mt-6">Les normes de la nit</p>
          <h1 className="poster-title poster-title-sm mt-4">
            <span>Com</span>
            <span className="line-2">funciona</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-snug text-paper/75">
            A cadascú se li assigna un país aleatori, no hi ha repes i
            (idealment) ningú sap quins toquen abans de la festa.
          </p>
        </header>

        <section aria-labelledby="categories">
          <h2 id="categories" className="section-title">
            Les categories
          </h2>
          <p className="mt-4 max-w-xl leading-snug text-paper/70">
            Quatre premis. Tres els decideix el jurat de la casa; l&apos;últim,
            tothom.
          </p>

          <ul className="mt-7 grid gap-4 sm:grid-cols-2">
            {CATEGORIES.map((category) => (
              <li
                key={category.name}
                className={`cat-card ${category.public ? "cat-card-public" : ""}`}
                style={{ "--accent": category.accent } as CSSProperties}
              >
                <span className="cat-rule" aria-hidden="true" />
                <h3 className="cat-name">{category.name}</h3>
                <p className="leading-snug text-paper/70">{category.body}</p>
                {category.public ? (
                  <p className="mt-1 font-mono text-[0.7rem] uppercase tracking-[0.18em] text-or">
                    El vota tothom
                  </p>
                ) : null}
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
          <p className="max-w-md leading-snug text-paper/70">
            Ja ho saps tot. Ara només falta saber de quin país vas.
          </p>
          <Link href="/" className="btn-festa max-w-xs">
            Tira la sort
          </Link>
        </footer>
      </div>
    </main>
  );
}
