"use client";

import type { CSSProperties, FormEvent } from "react";
import Link from "next/link";
import { COUNTRIES } from "@/data/countries";
import { FlagMarquee } from "@/components/FlagMarquee";

const GATE_STYLE = { "--c1": "#FF2E88", "--c2": "#6C2BD9" } as CSSProperties;

type GateProps = {
  name: string;
  email: string;
  onNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  nameError: string | null;
  emailError: string | null;
  bannerError: string | null;
  busy: boolean;
};

export function Gate({
  name,
  email,
  onNameChange,
  onEmailChange,
  onSubmit,
  nameError,
  emailError,
  bannerError,
  busy,
}: GateProps) {
  return (
    <main className="night gate-shell" style={GATE_STYLE}>
      <FlagMarquee />

      <div className="gate-inner">
        <header className="rise gate-poster poster-fit">
          {/* eslint-disable-next-line @next/next/no-img-element -- static local SVG; the optimizer does not process SVG */}
          <img
            src="/logo-cup.svg"
            alt=""
            aria-hidden="true"
            className="gate-logo mx-auto mb-4"
          />
          <p className="eyebrow">
            {COUNTRIES.length} països · 1 nit · cap excusa
          </p>
          <h1 className="poster-title mt-4">
            <span className="line-el">El</span>
            <span>
              Mundial<em className="tail">et</em>
            </span>
          </h1>
        </header>

        <div className="gate-ticket">
          {bannerError ? (
            <p
              role="alert"
              className="mb-4 rounded-xl border border-magenta/60 bg-magenta/15 px-4 py-3 text-sm leading-snug text-paper"
            >
              {bannerError}
            </p>
          ) : null}

          <form
            onSubmit={onSubmit}
            noValidate
            className="ticket rise"
          >
            <div className="flex flex-col gap-3">
              <div>
                <label htmlFor="name" className="eyebrow block">
                  Com et dius
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  maxLength={80}
                  placeholder="Marta Puig"
                  value={name}
                  onChange={(event) => onNameChange(event.target.value)}
                  aria-invalid={nameError ? "true" : "false"}
                  aria-describedby="name-error"
                  className="field mt-3"
                />
                <p
                  id="name-error"
                  className="mt-2 min-h-5 font-mono text-xs leading-5 text-magenta"
                >
                  {nameError}
                </p>
              </div>

              <div>
                <label htmlFor="email" className="eyebrow block">
                  El teu correu
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="nom@exemple.com"
                  value={email}
                  onChange={(event) => onEmailChange(event.target.value)}
                  aria-invalid={emailError ? "true" : "false"}
                  aria-describedby="email-error"
                  className="field mt-3"
                />
                <p
                  id="email-error"
                  className="mt-2 min-h-5 font-mono text-xs leading-5 text-magenta"
                >
                  {emailError}
                </p>
              </div>
            </div>

            <hr className="perf" />

            <button type="submit" className="btn-festa" disabled={busy}>
              {busy ? "Sortejant…" : "Tira la sort"}
            </button>
            <p className="mt-3 text-center font-mono text-[0.7rem] leading-4 tracking-wider text-paper/45">
              Guardem el correu només per recordar quin país t&apos;ha tocat.
            </p>
          </form>

          <p className="mt-2 text-center">
            <Link href="/com-funciona" className="btn-ghost">
              Com funciona · les normes
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
