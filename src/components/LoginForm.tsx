"use client";

import type { Login } from "@/components/useLogin";

type LoginFormProps = {
  login: Login;
  /** The small gold line above the fields: what logging in is for. */
  eyebrow: string;
  /** One or two sentences under it. */
  intro: string;
  submitLabel: string;
};

/**
 * The name and email a guest signed up with, in the same ticket the gate uses.
 * Shared by the wall of countries and the contest, which log in identically.
 */
export function LoginForm({ login, eyebrow, intro, submitLabel }: LoginFormProps) {
  const { name, email, busy, nameError, emailError, bannerError } = login;

  return (
    <div>
      {bannerError ? (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-magenta/60 bg-magenta/15 px-4 py-3 text-sm leading-snug text-paper"
        >
          {bannerError}
        </p>
      ) : null}

      <form
        onSubmit={(event) => void login.submit(event)}
        noValidate
        className="ticket rise p-5 sm:p-6"
      >
        <p className="eyebrow">{eyebrow}</p>
        <p className="mt-3 text-sm leading-snug text-paper/75">{intro}</p>

        <div className="mt-4 flex flex-col gap-3">
          <div>
            <label htmlFor="login-name" className="eyebrow block">
              Com et dius
            </label>
            <input
              id="login-name"
              name="name"
              type="text"
              autoComplete="name"
              maxLength={80}
              placeholder="Marta Puig"
              value={name}
              onChange={(event) => login.changeName(event.target.value)}
              aria-invalid={nameError ? "true" : "false"}
              aria-describedby="login-name-error"
              className="field mt-3"
            />
            <p
              id="login-name-error"
              className="mt-2 min-h-5 font-mono text-xs leading-5 text-magenta"
            >
              {nameError}
            </p>
          </div>

          <div>
            <label htmlFor="login-email" className="eyebrow block">
              El teu correu
            </label>
            <input
              id="login-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="nom@exemple.com"
              value={email}
              onChange={(event) => login.changeEmail(event.target.value)}
              aria-invalid={emailError ? "true" : "false"}
              aria-describedby="login-email-error"
              className="field mt-3"
            />
            <p
              id="login-email-error"
              className="mt-2 min-h-5 font-mono text-xs leading-5 text-magenta"
            >
              {emailError}
            </p>
          </div>
        </div>

        <hr className="perf" />

        <button type="submit" className="btn-festa" disabled={busy}>
          {busy ? "Un moment…" : submitLabel}
        </button>
      </form>
    </div>
  );
}
