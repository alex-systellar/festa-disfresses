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

/** What the server knows about one email. Mirrors GuestState in lib/assign. */
type GuestState = {
  state: "assigned" | "answered" | "new";
  result: ClaimResult | null;
  rsvp: RsvpAnswer | null;
  name: string;
};

type StoredGuest = { email: string; name: string; rsvp: RsvpAnswer | null };

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

function isRsvpAnswer(value: unknown): value is RsvpAnswer {
  return value === "yes" || value === "maybe" || value === "no";
}

function isGuestState(value: unknown): value is GuestState {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.state !== "assigned" && v.state !== "answered" && v.state !== "new") {
    return false;
  }
  if (v.rsvp !== null && !isRsvpAnswer(v.rsvp)) return false;
  if (typeof v.name !== "string") return false;
  // Only the assigned branch promises a country, so only it is checked.
  return v.state === "assigned" ? isClaimResult(v.result) : true;
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
      // Written by later versions than the one that stored this record.
      rsvp: isRsvpAnswer(guest.rsvp) ? guest.rsvp : null,
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
  const [rsvp, setRsvp] = useState<RsvpAnswer | null>(null);
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

  /** Everything the gate is allowed to complain about, in one place. */
  const showGateError = useCallback((code: string | null) => {
    setNameError(null);
    setEmailError(null);
    setBannerError(null);
    if (code === "invalid_email") setEmailError(ERROR_TEXT.invalidEmail);
    else if (code === "invalid_email_domain") setEmailError(ERROR_TEXT.invalidEmailDomain);
    else if (code === "invalid_name") setNameError(ERROR_TEXT.invalidName);
    else if (code === "device_limit") setBannerError(ERROR_TEXT.deviceLimit);
    else if (code === "ip_limit") setBannerError(ERROR_TEXT.ipLimit);
    else setBannerError(ERROR_TEXT.storage);
  }, []);

  /** Send the guest wherever their stored state says they belong. */
  const goToState = useCallback((state: GuestState, fallbackName: string) => {
    const known = state.name || fallbackName;
    setName(known);
    setRsvp(state.rsvp);

    if (state.state === "assigned" && state.result) {
      setResult(state.result);
      setCalm(true);
      setPhase("reveal");
      return;
    }
    // Already told us no or maybe: honour it instead of asking again.
    if (state.state === "answered" && state.rsvp && state.rsvp !== "yes") {
      setPhase(state.rsvp === "no" ? "declined" : "maybe");
      return;
    }
    setPhase("gate");
  }, []);

  // On load, ask what the server already knows about the remembered email.
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
      setRsvp(stored.rsvp);

      try {
        const response = await fetch(
          `/api/lookup?email=${encodeURIComponent(stored.email)}`,
          { cache: "no-store" },
        );
        if (cancelled) return;
        if (!response.ok) {
          // A stored address the server will not even parse is not worth keeping.
          if (response.status === 400) clearStoredGuest();
          setPhase("gate");
          return;
        }
        const data: unknown = await response.json();
        if (cancelled) return;
        if (isGuestState(data)) {
          goToState(data, stored.name);
          writeStoredGuest({
            email: stored.email,
            name: data.name || stored.name,
            rsvp: data.rsvp,
          });
        } else {
          setPhase("gate");
        }
      } catch {
        if (cancelled) return;
        // Offline. Fall back to what this browser remembers, so somebody who
        // already declined is not asked the question a second time.
        if (stored.rsvp === "no" || stored.rsvp === "maybe") {
          setPhase(stored.rsvp === "no" ? "declined" : "maybe");
        } else {
          setPhase("gate");
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [goToState]);

  /**
   * Details submitted. Everything that can refuse this guest — a dead email
   * domain, a browser that already registered, a network over its cap — is
   * checked *here*, while their cursor is still in the field that caused it.
   * Nothing is claimed: the country is only handed out after the RSVP.
   */
  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
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
      setBusy(true);

      try {
        const response = await fetch("/api/precheck", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: cleanEmail, name: cleanName }),
        });
        const data: unknown = await response.json().catch(() => null);
        setBusy(false);

        if (!response.ok || !isGuestState(data)) {
          setPhase("gate");
          showGateError(errorCode(data));
          return;
        }

        writeStoredGuest({
          email: cleanEmail,
          name: data.name || cleanName,
          rsvp: data.rsvp,
        });
        // A guest we have never heard of is the only one who gets asked.
        if (data.state === "new") {
          setName(data.name || cleanName);
          setRsvp(data.rsvp);
          setPhase("rsvp");
          return;
        }
        goToState(data, cleanName);
      } catch {
        setBusy(false);
        setPhase("gate");
        setBannerError(ERROR_TEXT.network);
      }
    },
    [busy, email, name, goToState, showGateError],
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
        // The precheck cleared these already, so landing here means something
        // changed underneath — another browser, or the caps moving. Every one
        // of them is fixed on the gate, not on the RSVP.
        setBusy(false);
        setPhase("gate");
        showGateError(errorCode(data));
        return;
      }

      setRsvp("yes");
      writeStoredGuest({ email: cleanEmail, name: cleanName, rsvp: "yes" });

      // Only a genuinely new assignment earns the sorteig. A returning guest
      // gets their country straight away, exactly like the load path.
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
      setBusy(false);
      setPhase("gate");
      setBannerError(ERROR_TEXT.network);
    }
  }, [email, name, showGateError]);

  const handleAnswer = useCallback(
    async (answer: RsvpAnswer) => {
      if (busy) return;
      if (answer === "yes") {
        void claim();
        return;
      }

      const cleanName = name.trim().replace(/\s+/g, " ");
      const cleanEmail = email.trim().toLowerCase();
      setBusy(true);
      try {
        await fetch("/api/rsvp", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: cleanEmail, name: cleanName, answer }),
        });
      } catch {
        // The answer stands either way. Refusing to accept a "no" because the
        // network hiccuped would be absurd; this browser remembers it below,
        // and the worst case is being asked again on another device.
      }
      setBusy(false);
      setRsvp(answer);
      writeStoredGuest({ email: cleanEmail, name: cleanName, rsvp: answer });
      setPhase(answer === "no" ? "declined" : "maybe");
    },
    [busy, claim, email, name],
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

  /** Back to the details, keeping them filled in. The universal "back". */
  const handleBackToGate = useCallback(() => {
    setBusy(false);
    setBannerError(null);
    setRerollError(null);
    setPhase("gate");
  }, []);

  /** Not this person at all: forget the browser and start over empty. */
  const handleReset = useCallback(() => {
    clearStoredGuest();
    setResult(null);
    pendingRef.current = null;
    setPending(null);
    setName("");
    setEmail("");
    setRsvp(null);
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
        answered={rsvp}
        onAnswer={(answer) => {
          void handleAnswer(answer);
        }}
        onBack={handleBackToGate}
      />
    );
  }

  if (phase === "declined" || phase === "maybe") {
    return (
      <Farewell
        kind={phase === "declined" ? "no" : "maybe"}
        name={name}
        onReconsider={() => setPhase("rsvp")}
        onBack={handleBackToGate}
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
