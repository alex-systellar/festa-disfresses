"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { ClaimResult } from "@/components/PartyApp";
import type { MyVotes } from "@/data/categories";
import { errorCode, isClaimResult } from "@/lib/client-guards";
import {
  clearStoredGuest,
  readStoredGuest,
  writeStoredGuest,
} from "@/lib/guest-storage";

/** What the contest lets this guest do. Mirrors `VotingState` in lib/concurs. */
export type Voting = {
  /** What this guest has picked, by category. */
  myVotes: MyVotes;
};

export type Session = {
  /** The credentials the server accepted, sent again with every vote. */
  email: string;
  name: string;
  result: ClaimResult;
  /** Null unless the contest is open. */
  voting: Voting | null;
};

type Auth =
  | { status: "boot" }
  | { status: "out" }
  | { status: "in"; session: Session };

// Deliberately permissive, mirroring the server: this gates a party.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_NAME = 80;

export const LOGIN_TEXT = {
  invalidEmail: "Aquest correu no s'entén. Revisa'l i torna-ho a provar.",
  invalidName: "Escriu com et dius, com a màxim 80 caràcters.",
  noMatch:
    "No trobem cap inscripció amb aquest nom i aquest correu. Escriu-los tal com els vas posar en apuntar-te.",
  noCountry:
    "Hi ha una inscripció amb aquest nom i correu, però vas dir que no o que potser, així que no tens cap país.",
  changed:
    "Alguna cosa ha canviat a la festa mentre tenies la pàgina oberta. Recarrega-la i torna-ho a provar.",
  storage:
    "No hem pogut comprovar-ho ara mateix. Espera uns segons i torna-ho a provar.",
  network: "No arribem a la festa. Comprova la connexió i torna-ho a provar.",
} as const;

function isVoting(value: unknown): value is Voting {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.myVotes === "object" &&
    v.myVotes !== null &&
    Object.values(v.myVotes).every((code) => typeof code === "string")
  );
}

type LoginResponse = { result: ClaimResult; voting: Voting | null };

function isLoginResponse(value: unknown): value is LoginResponse {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return isClaimResult(v.result) && (v.voting === null || isVoting(v.voting));
}

type Attempt = { ok: true; session: Session } | { ok: false; code: string };

/** One login, as plain data. Throws only when the network does. */
async function requestLogin(email: string, name: string): Promise<Attempt> {
  const response = await fetch("/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, name }),
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok || !isLoginResponse(data)) {
    return { ok: false, code: errorCode(data) ?? "storage_unavailable" };
  }
  return {
    ok: true,
    session: {
      email,
      // The name the server holds, not the (possibly shorter) one typed: it is
      // what gets remembered, so the next visit sends the exact form.
      name: data.result.name || name,
      result: data.result,
      voting: data.voting,
    },
  };
}

/**
 * Logging in with the name and email a guest signed up with, for the pages that
 * come after the draw.
 *
 * A browser that already registered has that email and name remembered, so on
 * load this quietly tries them: a returning guest lands logged in and types
 * nothing. If they no longer work the form opens with the fields filled in, and
 * no error — nothing the guest did was wrong.
 *
 * There is no session behind this. "Logged in" means the server accepted a name
 * and email a moment ago, and the browser holds them to send again.
 *
 * `onLogin` fires only for a login the guest just performed by submitting the
 * form — not for the remembered one on load — which is what lets a page make a
 * moment of it the first time and stay quiet on every visit after.
 */
export function useLogin({ onLogin }: { onLogin?: (session: Session) => void } = {}) {
  const [auth, setAuth] = useState<Auth>({ status: "boot" });
  // Read through a ref so a page passing a fresh arrow every render does not
  // rebuild `submit` (and the form's handler) each time.
  const onLoginRef = useRef(onLogin);
  useEffect(() => {
    onLoginRef.current = onLogin;
  });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const stored = readStoredGuest();
      if (!stored?.email || !stored.name) {
        if (!cancelled) setAuth({ status: "out" });
        return;
      }
      setEmail(stored.email);
      setName(stored.name);
      try {
        const attempt = await requestLogin(stored.email, stored.name);
        if (cancelled) return;
        setAuth(attempt.ok ? { status: "in", session: attempt.session } : { status: "out" });
      } catch {
        if (!cancelled) setAuth({ status: "out" });
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const showError = useCallback((code: string) => {
    setNameError(null);
    setEmailError(null);
    setBannerError(null);
    if (code === "invalid_email") setEmailError(LOGIN_TEXT.invalidEmail);
    else if (code === "invalid_name") setNameError(LOGIN_TEXT.invalidName);
    else if (code === "no_match") setBannerError(LOGIN_TEXT.noMatch);
    else if (code === "no_country") setBannerError(LOGIN_TEXT.noCountry);
    // The phase moved under a page that was already open.
    else if (code === "repartiment_open" || code === "concurs_closed" || code === "repartiment_over") {
      setBannerError(LOGIN_TEXT.changed);
    } else setBannerError(LOGIN_TEXT.storage);
  }, []);

  const submit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (busy) return;

      const cleanName = name.trim().replace(/\s+/g, " ");
      const cleanEmail = email.trim().toLowerCase();
      const nameBad = cleanName.length === 0 || cleanName.length > MAX_NAME;
      const emailBad = !EMAIL_RE.test(cleanEmail) || cleanEmail.length > 254;
      setNameError(nameBad ? LOGIN_TEXT.invalidName : null);
      setEmailError(emailBad ? LOGIN_TEXT.invalidEmail : null);
      setBannerError(null);
      if (nameBad || emailBad) return;

      setBusy(true);
      try {
        const attempt = await requestLogin(cleanEmail, cleanName);
        setBusy(false);
        if (!attempt.ok) {
          showError(attempt.code);
          return;
        }
        writeStoredGuest({
          email: cleanEmail,
          name: attempt.session.name,
          rsvp: "yes",
        });
        setName(attempt.session.name);
        setAuth({ status: "in", session: attempt.session });
        onLoginRef.current?.(attempt.session);
      } catch {
        setBusy(false);
        setBannerError(LOGIN_TEXT.network);
      }
    },
    [busy, email, name, showError],
  );

  const logout = useCallback(() => {
    clearStoredGuest();
    setAuth({ status: "out" });
    setName("");
    setEmail("");
    setNameError(null);
    setEmailError(null);
    setBannerError(null);
  }, []);

  /** Keeps the session in step with the ballot the server has just answered. */
  const setMyVotes = useCallback((myVotes: MyVotes) => {
    setAuth((current) =>
      current.status === "in" && current.session.voting
        ? {
            status: "in",
            session: { ...current.session, voting: { myVotes } },
          }
        : current,
    );
  }, []);

  return {
    auth,
    name,
    email,
    busy,
    nameError,
    emailError,
    bannerError,
    changeName: (value: string) => {
      setName(value);
      if (nameError) setNameError(null);
    },
    changeEmail: (value: string) => {
      setEmail(value);
      if (emailError) setEmailError(null);
    },
    submit,
    logout,
    setMyVotes,
  };
}

export type Login = ReturnType<typeof useLogin>;
