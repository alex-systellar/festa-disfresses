"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Country } from "@/data/countries";
import { Farewell } from "@/components/Farewell";
import { Gate } from "@/components/Gate";
import { Reveal } from "@/components/Reveal";
import { Rsvp, type RsvpAnswer } from "@/components/Rsvp";
import { SlotReel } from "@/components/SlotReel";

const STORAGE_KEY = "festa-disfresses:guest";
// Deliberately permissive, mirroring the server: this gates a party.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_NAME = 80;

const ERROR_TEXT = {
  invalidEmail: "Aquest correu no s'entén. Revisa'l i torna-ho a provar.",
  invalidEmailDomain:
    "Aquest domini de correu no rep missatges. Revisa'l i torna-ho a provar.",
  invalidName: "Escriu com et dius, com a màxim 80 caràcters.",
  storage:
    "No hem pogut apuntar-te ara mateix. Espera uns segons i torna-ho a provar.",
  network: "No arribem a la festa. Comprova la connexió i torna-ho a provar.",
  ipLimit:
    "Ja s'han repartit prou països des d'aquesta connexió. Si sou més d'un a casa, parla amb qui organitza la festa.",
  deviceLimit:
    "Aquest dispositiu ja té un país amb un altre correu. Un país per persona! Si de debò no ets tu, parla amb qui organitza la festa.",
  rerollUsed: "Ja has fet servir la teva segona tirada. Aquest país és el bo.",
  rerollMissing:
    "No trobem la teva inscripció. Torna a entrar el nom i el correu.",
} as const;

type Phase =
  | "boot"
  | "gate"
  | "rsvp"
  | "declined"
  | "maybe"
  | "spinning"
  | "reveal";

export type ClaimResult = {
  country: Country;
  name: string;
  isNew: boolean;
  duplicate: boolean;
  canReroll: boolean;
  remaining: number;
};

type StoredGuest = { email: string; name: string };

function isClaimResult(value: unknown): value is ClaimResult {
  if (typeof value !== "object" || value === null) return false;
  const result = value as Record<string, unknown>;
  if (typeof result.remaining !== "number") return false;
  if (typeof result.canReroll !== "boolean") return false;
  const country = result.country;
  if (typeof country !== "object" || country === null) return false;
  const fields = country as Record<string, unknown>;
  return (
    typeof fields.code === "string" &&
    typeof fields.name === "string" &&
    typeof fields.flagImage === "string" &&
    Array.isArray(fields.colors) &&
    fields.colors.length === 2 &&
    typeof fields.anthem === "object" &&
    fields.anthem !== null
  );
}

function errorCode(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const code = (value as Record<string, unknown>).error;
  return typeof code === "string" ? code : null;
}


function readStoredGuest(): StoredGuest | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const guest = parsed as Record<string, unknown>;
    if (typeof guest.email !== "string") return null;
    return {
      email: guest.email,
      name: typeof guest.name === "string" ? guest.name : "",
    };
  } catch {
    return null;
  }
}

function writeStoredGuest(guest: StoredGuest): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(guest));
  } catch {
    // Private mode or a full quota: the reveal still works, it just won't stick.
  }
}

function clearStoredGuest(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do — the gate is shown either way.
  }
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function PartyApp() {
  const [phase, setPhase] = useState<Phase>("boot");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<ClaimResult | null>(null);
  const [pending, setPending] = useState<ClaimResult | null>(null);
  const [calm, setCalm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [isReroll, setIsReroll] = useState(false);
  /** Bumped per spin so the reel remounts and turns again on a reroll. */
  const [spinKey, setSpinKey] = useState(0);
  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [rerollError, setRerollError] = useState<string | null>(null);

  /** Mirrors `pending` so the reel's land callback can read it without a re-render. */
  const pendingRef = useRef<ClaimResult | null>(null);

  // Returning guests: read their country straight back, no sorteig.
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const stored = readStoredGuest();
      if (!stored) {
        if (!cancelled) setPhase("gate");
        return;
      }
      setEmail(stored.email);
      setName(stored.name);

      try {
        const response = await fetch(
          `/api/lookup?email=${encodeURIComponent(stored.email)}`,
          { cache: "no-store" },
        );
        if (cancelled) return;
        if (!response.ok) {
          if (response.status === 404 || response.status === 400) {
            clearStoredGuest();
          }
          setPhase("gate");
          return;
        }
        const data: unknown = await response.json();
        if (cancelled) return;
        if (isClaimResult(data)) {
          setResult(data);
          setCalm(true);
          setPhase("reveal");
        } else {
          setPhase("gate");
        }
      } catch {
        if (!cancelled) setPhase("gate");
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // The details are only checked here; nothing is claimed until the guest has
  // said they are coming. A country handed to a "no" is a country nobody at
  // the party gets to wear.
  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (busy) return;

      const cleanName = name.trim().replace(/\s+/g, " ");
      const cleanEmail = email.trim().toLowerCase();

      const nameBad = cleanName.length === 0 || cleanName.length > MAX_NAME;
      const emailBad = !EMAIL_RE.test(cleanEmail) || cleanEmail.length > 254;
      setNameError(nameBad ? ERROR_TEXT.invalidName : null);
      setEmailError(emailBad ? ERROR_TEXT.invalidEmail : null);
      if (nameBad || emailBad) {
        setBannerError(null);
        return;
      }

      setBannerError(null);
      setRerollError(null);
      setPhase("rsvp");
    },
    [busy, email, name],
  );

  const claim = useCallback(async () => {
    const cleanName = name.trim().replace(/\s+/g, " ");
    const cleanEmail = email.trim().toLowerCase();

    setBannerError(null);
    setRerollError(null);
    setBusy(true);
    setIsReroll(false);
    pendingRef.current = null;
    setPending(null);

    // Deliberately no spin yet: we cannot know whether this email is a fresh
    // draw or a guest coming back until the server answers. Spinning first
    // would stage a sorteig for someone whose country was decided long ago.
    // The RSVP shows its busy state while we wait.
    try {
      const response = await fetch("/api/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: cleanEmail, name: cleanName }),
      });
      const data: unknown = await response.json().catch(() => null);

      if (!response.ok || !isClaimResult(data)) {
        const code = errorCode(data);
        // Every one of these is fixed on the gate, not on the RSVP.
        setPhase("gate");
        setBusy(false);
        if (code === "invalid_email") {
          setEmailError(ERROR_TEXT.invalidEmail);
        } else if (code === "invalid_email_domain") {
          setEmailError(ERROR_TEXT.invalidEmailDomain);
        } else if (code === "invalid_name") {
          setNameError(ERROR_TEXT.invalidName);
        } else if (code === "device_limit") {
          setBannerError(ERROR_TEXT.deviceLimit);
        } else if (code === "ip_limit") {
          setBannerError(ERROR_TEXT.ipLimit);
        } else {
          setBannerError(ERROR_TEXT.storage);
        }
        return;
      }

      writeStoredGuest({ email: cleanEmail, name: cleanName });

      // Only a genuinely new assignment earns the sorteig. A returning guest
      // gets their country straight away, exactly like the localStorage path.
      const returning = !data.isNew;
      if (returning || prefersReducedMotion()) {
        setCalm(returning);
        setResult(data);
        setPhase("reveal");
        setBusy(false);
      } else {
        setCalm(false);
        setSpinKey((key) => key + 1);
        setPhase("spinning");
        // The reel keeps turning until it has both a result and its minimum.
        pendingRef.current = data;
        setPending(data);
      }
    } catch {
      setPhase("gate");
      setBusy(false);
      setBannerError(ERROR_TEXT.network);
    }
  }, [email, name]);

  const handleAnswer = useCallback(
    (answer: RsvpAnswer) => {
      if (busy) return;
      if (answer === "no") {
        setPhase("declined");
        return;
      }
      if (answer === "maybe") {
        setPhase("maybe");
        return;
      }
      void claim();
    },
    [busy, claim],
  );

  const handleReroll = useCallback(async () => {
    if (busy) return;
    const cleanEmail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(cleanEmail)) {
      setRerollError(ERROR_TEXT.rerollMissing);
      return;
    }

    setRerollError(null);
    setBusy(true);
    setIsReroll(true);
    pendingRef.current = null;
    setPending(null);

    const skipSpin = prefersReducedMotion();
    if (!skipSpin) {
      setSpinKey((key) => key + 1);
      setPhase("spinning");
    }

    try {
      const response = await fetch("/api/reroll", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: cleanEmail }),
      });
      const data: unknown = await response.json().catch(() => null);

      if (!response.ok || !isClaimResult(data)) {
        const code = errorCode(data);
        setBusy(false);
        setPhase("reveal");
        if (code === "reroll_used") {
          // The server is right: drop the button by trusting its answer.
          setResult((current) =>
            current ? { ...current, canReroll: false } : current,
          );
          setRerollError(ERROR_TEXT.rerollUsed);
        } else if (code === "not_found") {
          setRerollError(ERROR_TEXT.rerollMissing);
        } else {
          setRerollError(ERROR_TEXT.storage);
        }
        return;
      }

      setCalm(false);
      if (skipSpin) {
        setResult(data);
        setPhase("reveal");
        setBusy(false);
      } else {
        pendingRef.current = data;
        setPending(data);
      }
    } catch {
      setBusy(false);
      setPhase("reveal");
      setRerollError(ERROR_TEXT.network);
    }
  }, [busy, email]);

  const handleLand = useCallback(() => {
    const landed = pendingRef.current;
    if (!landed) return;
    setResult(landed);
    setPhase("reveal");
    setBusy(false);
  }, []);

  const handleReset = useCallback(() => {
    clearStoredGuest();
    setResult(null);
    pendingRef.current = null;
    setPending(null);
    setName("");
    setEmail("");
    setCalm(false);
    setBusy(false);
    setIsReroll(false);
    setNameError(null);
    setEmailError(null);
    setBannerError(null);
    setRerollError(null);
    setPhase("gate");
  }, []);

  if (phase === "boot") {
    return (
      <main className="night center-safe flex items-center">
        <p className="eyebrow blink">Obrint la festa…</p>
      </main>
    );
  }

  if (phase === "rsvp") {
    return (
      <Rsvp
        name={name}
        busy={busy}
        onAnswer={handleAnswer}
        onBack={() => setPhase("gate")}
      />
    );
  }

  if (phase === "declined" || phase === "maybe") {
    return (
      <Farewell
        kind={phase === "declined" ? "no" : "maybe"}
        onReconsider={() => setPhase("rsvp")}
        onReset={handleReset}
      />
    );
  }

  if (phase === "spinning") {
    return (
      <SlotReel
        key={spinKey}
        target={pending ? pending.country : null}
        onLand={handleLand}
        reroll={isReroll}
      />
    );
  }

  if (phase === "reveal" && result) {
    return (
      <Reveal
        result={result}
        calm={calm}
        onReroll={() => {
          void handleReroll();
        }}
        onReset={handleReset}
        rerollError={rerollError}
      />
    );
  }

  return (
    <Gate
      name={name}
      email={email}
      onNameChange={(value) => {
        setName(value);
        if (nameError) setNameError(null);
      }}
      onEmailChange={(value) => {
        setEmail(value);
        if (emailError) setEmailError(null);
      }}
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
      nameError={nameError}
      emailError={emailError}
      bannerError={bannerError}
      busy={busy}
    />
  );
}
