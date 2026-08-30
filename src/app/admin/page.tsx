"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { getCountry } from "@/data/countries";
import { ALL_DANCES } from "@/data/dances";
import { getSong } from "@/data/songs";

/* ---------------------------------- types --------------------------------- */

type RemainingCountry = {
  code: string;
  name: string;
  /** Emoji flag. Plain-text exports only — the UI always renders the SVG. */
  flag: string;
  /** Always present: every country ships a local 4:3 SVG under /flags. */
  flagImage: string;
};

type AdminAssignment = {
  email: string;
  /** The guest's own typed name — not the country. */
  name: string;
  assignedAt: string;
  duplicate: boolean;
  rerolled: boolean;
  /** Country they held before spending their reroll. */
  previousName: string | null;
  ip: string | null;
  /** How many guests share this IP. 1 means nobody else does. */
  ipCount: number | null;
  /** Other emails registered from this same IP. Circumstantial. */
  sharedIpWith: string[];
  /** Short slice of the per-browser device id. */
  device: string | null;
  /** Other emails from this same browser. The strong signal. */
  sharedDeviceWith: string[];
  code: string;
  country: string;
  /** Emoji flag. Plain-text exports only — the UI always renders the SVG. */
  flag: string;
  /** Always present: every country ships a local 4:3 SVG under /flags. */
  flagImage: string;
};

type RsvpAnswer = "yes" | "maybe" | "no";

/** Somebody who answered but holds no country: every no, maybe, and dropout. */
type PendingGuest = {
  email: string;
  name: string;
  rsvp: RsvpAnswer;
  rsvpAt: string;
};

type AdminData = {
  driver: "blob" | "file";
  total: number;
  assigned: number;
  rsvpCounts: { yes: number; maybe: number; no: number };
  withoutCountry: PendingGuest[];
  /** Groups of >1 email sharing one browser. Ranked first: hardest to fake. */
  duplicateDeviceGroups: string[][];
  /** Groups of >1 email sharing one IP. Housemates and carrier NAT live here. */
  duplicateIpGroups: string[][];
  remaining: RemainingCountry[];
  assignments: AdminAssignment[];
};

type Status = "idle" | "loading" | "ready" | "unauthorized" | "error";

/**
 * The admin key is remembered in localStorage so the host does not retype it
 * every time. That is a deliberate trade: anything able to run script on this
 * origin can read it, where React state could not be read back after a reload.
 * `Surt` clears it, and rotating ADMIN_KEY invalidates whatever is stored.
 */
const KEY_STORAGE = "festa-disfresses:admin-key";

function readStoredKey(): string | null {
  try {
    const value = window.localStorage.getItem(KEY_STORAGE);
    return value && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

function writeStoredKey(key: string): void {
  try {
    window.localStorage.setItem(KEY_STORAGE, key);
  } catch {
    // Private mode: the session still works, it just will not be remembered.
  }
}

function clearStoredKey(): void {
  try {
    window.localStorage.removeItem(KEY_STORAGE);
  } catch {
    // Nothing to do.
  }
}

type SortBy = "date" | "name";

/** The destructive action waiting on the confirm dialog. */
type PendingDelete =
  | { kind: "one"; email: string; name: string; country: string }
  | { kind: "all"; count: number };

/** Typed out in full before the whole party can be wiped. */
const CONFIRM_WORD = "ESBORRA";

type LoadResult =
  | { kind: "ok"; data: AdminData }
  | { kind: "unauthorized" }
  | { kind: "error"; message: string };

/** Pure fetch: never touches React state, so callers decide what to do with it. */
async function fetchAdmin(key: string): Promise<LoadResult> {
  try {
    const res = await fetch(`/api/admin?key=${encodeURIComponent(key)}`, { cache: "no-store" });
    if (res.status === 401) return { kind: "unauthorized" };
    if (!res.ok) return { kind: "error", message: `El servidor ha respost ${res.status}.` };
    return { kind: "ok", data: (await res.json()) as AdminData };
  } catch {
    return { kind: "error", message: "No s'ha pogut contactar amb el servidor." };
  }
}

/* --------------------------------- helpers -------------------------------- */

function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function relativeTime(iso: string, now: number): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const minutes = Math.floor(Math.max(0, now - then) / 60_000);
  if (minutes < 1) return "ara mateix";
  if (minutes < 60) return `fa ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `fa ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "fa 1 dia" : `fa ${days} dies`;
}

function absoluteTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("ca-ES", { dateStyle: "short", timeStyle: "medium" });
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function toCsv(rows: AdminAssignment[]): string {
  const lines = [
    [
      "nom",
      "email",
      "pais",
      "codi",
      "ip",
      "ip_compartida",
      "rerolled",
      "pais_anterior",
      "duplicat",
      "data",
      "dispositiu",
      "mateix_dispositiu",
      "mateixa_ip",
      "bandera",
    ]
      .map(csvCell)
      .join(","),
  ];
  for (const row of rows) {
    lines.push(
      [
        row.name,
        row.email,
        row.country,
        row.code,
        row.ip ?? "",
        row.ipCount && row.ipCount > 1 ? String(row.ipCount) : "",
        row.rerolled ? "si" : "no",
        row.previousName ?? "",
        row.duplicate ? "si" : "no",
        row.assignedAt,
        row.device ?? "",
        row.sharedDeviceWith.join("; "),
        row.sharedIpWith.join("; "),
        row.flag,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\r\n");
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the textarea fallback (clipboard API needs a secure context).
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

/* ------------------------------- small pieces ------------------------------ */

/**
 * Every flag is a local 4:3 SVG from the same set, so all 41 look like
 * siblings on every platform. Emoji flags are deliberately not rendered:
 * they are drawn by the platform font and Catalonia has none at all.
 */
function Flag({ src, alt }: { src: string; alt: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny local SVG, no optimisation needed
    <img
      src={src}
      alt={alt}
      width={24}
      height={18}
      className="inline-block h-4 w-[1.333rem] shrink-0 rounded-[2px] object-cover align-[-3px] ring-1 ring-white/15"
    />
  );
}

/**
 * Only one clip at a time: the previous button's stopper is parked here so
 * starting a second preview silences the first. Module scope rather than
 * context because this is the whole of the shared state.
 */
let stopPlayingPreview: (() => void) | null = null;

/**
 * Hover-to-reveal preview, on every country in both lists so the whole pool
 * can be auditioned before the party — including countries already handed out.
 *
 * Plays the same source the guest gets: the song where there is one, streamed
 * from Apple, and the committed anthem mp3 otherwise. Renders nothing for a
 * country with neither.
 */
function SongPreview({ code, label }: { code: string; label: string }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const country = getCountry(code);
  const song = getSong(code);
  const src = song?.previewUrl ?? (country?.anthem.source ? `/anthems/${code}.mp3` : null);
  /** Same offset the guest gets, so auditioning here matches the reveal. */
  const start = song ? (country?.song?.start ?? 0) : 0;

  const stop = useCallback(() => {
    audioRef.current?.pause();
    setPlaying(false);
  }, []);

  // Quieter than the reveal: this one plays in a room, not at a party.
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = 0.6;
  }, []);

  // Leaving the page mid-preview must not keep the audio alive.
  useEffect(() => {
    return () => {
      if (stopPlayingPreview === stop) stopPlayingPreview = null;
    };
  }, [stop]);

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (!el.paused) {
      el.pause();
      stopPlayingPreview = null;
      return;
    }
    stopPlayingPreview?.();
    stopPlayingPreview = stop;
    void el.play().catch(() => setPlaying(false));
  }, [stop]);

  if (!src) return null;

  const what = song ? `${song.title} — ${song.artist}` : `himne de ${label}`;

  return (
    <>
      {/* `preload="none"`: 41 of these on one page must not pull 41 MB. */}
      <audio
        ref={audioRef}
        src={src}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={(e) => {
          const el = e.currentTarget;
          if (start > 0) {
            el.currentTime = Number.isFinite(el.duration) && start >= el.duration - 1 ? 0 : start;
          }
        }}
        onError={() => setPlaying(false)}
      />
      <button
        type="button"
        onClick={toggle}
        title={what}
        aria-label={playing ? `Atura ${what}` : `Escolta ${what}`}
        // Hidden until the row is hovered or the button focused, but always
        // visible while playing — otherwise the only stop control disappears
        // the moment the pointer moves away.
        className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition focus-visible:opacity-100 focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-white/40 ${
          playing
            ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-300 opacity-100"
            : "border-white/20 bg-white/5 text-white/60 opacity-0 hover:border-white/40 hover:text-white group-hover:opacity-100"
        }`}
      >
        <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor" aria-hidden="true" className="block">
          {playing ? (
            <path d="M8.5 5h2.6v14H8.5zM12.9 5h2.6v14h-2.6z" />
          ) : (
            <path d="M9 5.4v13.2a.6.6 0 0 0 .92.5l10.3-6.6a.6.6 0 0 0 0-1L9.92 4.9a.6.6 0 0 0-.92.5z" />
          )}
        </svg>
      </button>
    </>
  );
}

function Stat({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "good" | "warn";
}) {
  const toneRing =
    tone === "warn"
      ? "border-amber-400/40 bg-amber-400/5"
      : tone === "good"
        ? "border-emerald-400/30 bg-emerald-400/5"
        : "border-white/10 bg-white/[0.03]";
  const toneValue =
    tone === "warn" ? "text-amber-300" : tone === "good" ? "text-emerald-300" : "text-white";

  return (
    <div className={`rounded-lg border px-3 py-2 ${toneRing}`}>
      <div className="text-[11px] uppercase tracking-widest text-white/40">{label}</div>
      <div className={`mt-0.5 font-mono text-xl leading-tight ${toneValue}`}>{value}</div>
      {hint ? <div className="mt-0.5 text-[11px] text-white/40">{hint}</div> : null}
    </div>
  );
}

/**
 * Confirm step for the two destructive actions.
 *
 * Deliberately not `window.confirm`: it has to name exactly what is about to
 * be destroyed, and the whole-party wipe asks for the word to be typed. None
 * of this is recoverable — there is one JSON document and no backups — so the
 * friction is the point.
 */
function ConfirmDelete({
  pending,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  pending: PendingDelete;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");
  const isAll = pending.kind === "all";
  const ready = !isAll || typed.trim().toUpperCase() === CONFIRM_WORD;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div className="w-full max-w-md rounded-xl border border-white/15 bg-neutral-900 p-5 shadow-2xl">
        <h2 id="confirm-title" className="text-base font-semibold text-white">
          {isAll ? "Esborrar totes les assignacions" : "Esborrar aquesta assignació"}
        </h2>

        {isAll ? (
          <div className="mt-2 space-y-2 text-sm text-white/60">
            <p>
              Això esborrarà <strong className="text-white">{pending.count}</strong>{" "}
              {pending.count === 1 ? "assignació" : "assignacions"}. Tots els països tornen al
              pool i cap convidat conservarà el seu.
            </p>
            <p className="text-red-300/80">No es pot desfer.</p>
            <label className="block pt-1 text-xs uppercase tracking-widest text-white/40">
              Escriu {CONFIRM_WORD} per confirmar
            </label>
            <input
              autoFocus
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              className="w-full rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 font-mono text-sm outline-none transition focus:border-red-400/60"
            />
          </div>
        ) : (
          <p className="mt-2 text-sm text-white/60">
            <strong className="text-white">{pending.name}</strong>{" "}
            <span className="font-mono text-xs text-white/40">({pending.email})</span>{" "}
            {pending.country === "cap país" ? (
              <>no té cap país, només una resposta. Si l&apos;esborres, se li tornarà a preguntar
              si hi serà.</>
            ) : (
              <>
                té <strong className="text-white">{pending.country}</strong>. Si l&apos;esborres,
                el país torna al pool i pot tocar a algú altre.
              </>
            )}
          </p>
        )}

        {error ? (
          <p className="mt-3 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            autoFocus={!isAll}
            className="rounded-md border border-white/15 px-3 py-1.5 text-sm text-white/70 transition hover:border-white/30 hover:bg-white/5 disabled:opacity-40"
          >
            Cancel·la
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || !ready}
            className="rounded-md bg-red-500/90 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Esborrant…" : isAll ? `Esborra ${pending.count}` : "Esborra"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- page ---------------------------------- */

export default function AdminPage() {
  const [keyInput, setKeyInput] = useState("");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [data, setData] = useState<AdminData | null>(null);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("date");
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");
  const [now, setNow] = useState(() => Date.now());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
  /** Which destructive action the dialog is asking about. null = closed. */
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const bootstrapped = useRef(false);

  const cancelDelete = useCallback(() => {
    setPendingDelete(null);
    setDeleteError(null);
  }, []);

  const apply = useCallback((key: string, result: LoadResult) => {
    if (result.kind === "ok") {
      writeStoredKey(key);
      setData(result.data);
      setStatus("ready");
      setErrorMessage(null);
      setKeyInput(key);
      setActiveKey(key);
      setNow(Date.now());
      setLastLoadedAt(Date.now());
      return;
    }
    if (result.kind === "unauthorized") {
      // Rotated or mistyped: a stored key that no longer works is just noise.
      clearStoredKey();
      setData(null);
      setStatus("unauthorized");
      setErrorMessage(null);
      setKeyInput(key);
      setActiveKey(null);
      return;
    }
    setStatus("error");
    setErrorMessage(result.message);
  }, []);

  const load = useCallback(
    async (key: string) => {
      apply(key, await fetchAdmin(key));
    },
    [apply],
  );

  // Pick up ?key=... on first paint so an ops bookmark just works. Read from
  // window rather than useSearchParams so this page never needs a Suspense
  // boundary — nothing here is server-rendered anyway.
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    // ?key= wins: pasting a fresh link should override a stale stored key.
    const key = new URLSearchParams(window.location.search).get("key") ?? readStoredKey();
    if (!key) return;
    // Deliberately not cancelled on unmount. React StrictMode runs effects
    // twice in development: the first pass set the ref and started this fetch,
    // its cleanup cancelled it, and the second pass hit the ref guard and
    // never re-issued it — so the panel sat on the key form in dev with a
    // perfectly good key in hand, while production worked fine. This is a
    // one-shot bootstrap and its result is always worth applying.
    void fetchAdmin(key).then((result) => apply(key, result));
  }, [apply]);

  // Keep the "fa X min" column honest without hammering the API.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    // Frozen while a confirm dialog is open: the count being confirmed must
    // not change between reading it and pressing the button.
    if (!autoRefresh || !activeKey || status === "unauthorized" || pendingDelete) return;
    const id = window.setInterval(() => void load(activeKey), 30_000);
    return () => window.clearInterval(id);
  }, [autoRefresh, activeKey, status, load, pendingDelete]);

  useEffect(() => {
    if (copied === "idle") return;
    const id = window.setTimeout(() => setCopied("idle"), 2500);
    return () => window.clearTimeout(id);
  }, [copied]);

  const needle = fold(query.trim());

  const assignments = useMemo(() => {
    if (!data) return [];
    const filtered = !needle
      ? data.assignments
      : data.assignments.filter(
          (a) =>
            fold(a.name).includes(needle) ||
            fold(a.email).includes(needle) ||
            fold(a.country).includes(needle) ||
            fold(a.code).includes(needle) ||
            (a.ip ? fold(a.ip).includes(needle) : false) ||
            (a.device ? fold(a.device).includes(needle) : false),
        );
    // The API already sorts newest first; only re-sort when asked to.
    if (sortBy === "date") return filtered;
    return [...filtered].sort((a, b) =>
      (a.name ?? "").localeCompare(b.name ?? "", "ca", { sensitivity: "base" }),
    );
  }, [data, needle, sortBy]);

  const remaining = useMemo(() => {
    if (!data) return [];
    if (!needle) return data.remaining;
    return data.remaining.filter(
      (c) => fold(c.name).includes(needle) || fold(c.code).includes(needle),
    );
  }, [data, needle]);

  const duplicates = useMemo(
    () => (data ? data.assignments.filter((a) => a.duplicate).length : 0),
    [data],
  );

  const rerolls = useMemo(
    () => (data ? data.assignments.filter((a) => a.rerolled).length : 0),
    [data],
  );

  const sharedIps = useMemo(
    () => (data ? data.assignments.filter((a) => (a.ipCount ?? 1) > 1).length : 0),
    [data],
  );

  const deviceGroups = useMemo(() => data?.duplicateDeviceGroups ?? [], [data]);
  const ipGroups = useMemo(() => data?.duplicateIpGroups ?? [], [data]);

  /** Emails caught in a same-browser collision, counted once each. */
  const deviceCollisionEmails = useMemo(
    () => new Set(deviceGroups.flat()).size,
    [deviceGroups],
  );

  function refresh(key: string) {
    setStatus("loading");
    setErrorMessage(null);
    void load(key);
  }

  function submitKey(event: FormEvent) {
    event.preventDefault();
    const key = keyInput.trim();
    if (!key) return;
    refresh(key);
  }

  async function handleCopyCsv() {
    if (!data) return;
    const ok = await copyText(toCsv(assignments));
    setCopied(ok ? "ok" : "fail");
  }

  async function runDelete() {
    if (!pendingDelete || !activeKey) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/admin", {
        method: "DELETE",
        // The key travels in a header, not the query string, so a destructive
        // call never lands in browser history or an access log.
        headers: { "content-type": "application/json", "x-admin-key": activeKey },
        body: JSON.stringify(
          pendingDelete.kind === "all" ? { all: true } : { email: pendingDelete.email },
        ),
      });
      if (!res.ok) {
        setDeleteError(
          res.status === 401
            ? "La clau ja no és vàlida. Torna a entrar."
            : res.status === 404
              ? "Aquesta assignació ja no hi era. Actualitza la vista."
              : `El servidor ha respost ${res.status}.`,
        );
        return;
      }
      setPendingDelete(null);
      await load(activeKey);
    } catch {
      setDeleteError("No s'ha pogut contactar amb el servidor.");
    } finally {
      setDeleting(false);
    }
  }

  /* ------------------------------- gate screen ------------------------------ */

  if (!data) {
    return (
      <main className="min-h-dvh bg-neutral-950 text-neutral-100">
        <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-16">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Panell d&apos;administració</h1>
            <p className="mt-1 text-sm text-white/50">
              El Mundialet · vista d&apos;operacions
            </p>
          </div>

          <form onSubmit={submitKey} className="flex flex-col gap-3">
            <label className="text-xs uppercase tracking-widest text-white/40" htmlFor="admin-key">
              Clau d&apos;administració
            </label>
            <input
              id="admin-key"
              type="password"
              autoComplete="off"
              autoFocus
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="ADMIN_KEY"
              className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 font-mono text-sm outline-none transition focus:border-fuchsia-400/60 focus:bg-white/[0.06]"
            />
            <button
              type="submit"
              disabled={status === "loading" || keyInput.trim().length === 0}
              className="rounded-lg bg-fuchsia-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-fuchsia-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {status === "loading" ? "Comprovant…" : "Entra"}
            </button>
          </form>

          {status === "unauthorized" ? (
            <p className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-200">
              Clau incorrecta. Torna-la a escriure.
              <span className="mt-1 block text-xs text-red-200/70">
                Si encara no has definit <code className="font-mono">ADMIN_KEY</code> a l&apos;entorn,
                cap clau funcionarà.
              </span>
            </p>
          ) : null}

          {status === "error" && errorMessage ? (
            <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
              {errorMessage}
            </p>
          ) : null}
        </div>
      </main>
    );
  }

  /* -------------------------------- dashboard ------------------------------- */

  return (
    <main className="min-h-dvh bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Panell d&apos;administració</h1>
            <p className="text-xs text-white/40">
              {lastLoadedAt ? `Actualitzat ${absoluteTime(new Date(lastLoadedAt).toISOString())}` : null}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-white/50">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="accent-fuchsia-500"
              />
              auto 30 s
            </label>
            <button
              type="button"
              onClick={() => activeKey && refresh(activeKey)}
              disabled={status === "loading"}
              className="rounded-md border border-white/15 px-2.5 py-1.5 text-xs text-white/80 transition hover:border-white/30 hover:bg-white/5 disabled:opacity-40"
            >
              {status === "loading" ? "Carregant…" : "Actualitza"}
            </button>
            <button
              type="button"
              onClick={() => {
                setDeleteError(null);
                setPendingDelete({ kind: "all", count: data.assignments.length });
              }}
              disabled={data.assignments.length === 0}
              className="rounded-md border border-red-400/30 px-2.5 py-1.5 text-xs text-red-300/80 transition hover:border-red-400/60 hover:bg-red-400/10 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-30"
            >
              Esborra-ho tot
            </button>
            <button
              type="button"
              onClick={() => {
                clearStoredKey();
                setActiveKey(null);
                setData(null);
                setKeyInput("");
                setStatus("idle");
              }}
              className="rounded-md border border-white/15 px-2.5 py-1.5 text-xs text-white/60 transition hover:border-white/30 hover:bg-white/5"
            >
              Surt
            </button>
          </div>
        </header>

        {status === "error" && errorMessage ? (
          <div className="mt-4 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-200">
            {errorMessage}
          </div>
        ) : null}

        <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat
            label="Assignats"
            value={`${data.assigned} / ${data.total}`}
            hint={`${Math.round((data.assigned / Math.max(1, data.total)) * 100)} % del pool`}
          />
          <Stat
            label="Disponibles"
            value={String(data.remaining.length)}
            hint="països sense amo"
            tone={data.remaining.length === 0 ? "warn" : "good"}
          />
          <Stat
            label="Re-tirades"
            value={String(rerolls)}
            hint="han gastat el canvi"
          />
          <Stat
            label="Mateix dispositiu"
            value={String(deviceCollisionEmails)}
            hint="correus implicats"
            tone={deviceCollisionEmails > 0 ? "warn" : "good"}
          />
          <Stat
            label="Duplicats"
            value={String(duplicates)}
            hint="pool exhaurit"
            tone={duplicates > 0 ? "warn" : "neutral"}
          />
          <Stat
            label="Respostes"
            value={`${data.rsvpCounts.yes} sí`}
            hint={`${data.rsvpCounts.maybe} potser · ${data.rsvpCounts.no} no`}
          />
          <Stat
            label="Driver"
            value={data.driver}
            hint={data.driver === "file" ? "disc local" : "Vercel Blob"}
          />
        </section>

        {deviceGroups.length > 0 || ipGroups.length > 0 ? (
          <section className="mt-4 rounded-lg border border-white/10 bg-white/[0.02] p-3">
            <h2 className="text-xs uppercase tracking-widest text-white/40">
              Possibles duplicats
            </h2>

            {deviceGroups.length > 0 ? (
              <div className="mt-2.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-rose-300">
                  Mateix dispositiu · senyal fort ({deviceGroups.length})
                </p>
                <p className="mt-0.5 text-[11px] text-white/40">
                  El mateix navegador s&apos;ha registrat amb més d&apos;un correu.
                </p>
                <ul className="mt-1.5 flex flex-col gap-1.5">
                  {deviceGroups.map((group) => (
                    <li
                      key={`dev-${group.join("|")}`}
                      className="flex flex-wrap items-center gap-1.5 rounded-md border border-rose-400/40 bg-rose-400/10 px-2.5 py-1.5"
                    >
                      {group.map((email) => (
                        <button
                          key={email}
                          type="button"
                          onClick={() => setQuery(email)}
                          className="rounded bg-rose-400/15 px-1.5 py-0.5 font-mono text-[12px] text-rose-100 transition hover:bg-rose-400/25"
                          title="Filtra per aquest correu"
                        >
                          {email}
                        </button>
                      ))}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {ipGroups.length > 0 ? (
              <div className="mt-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-amber-300/90">
                  Mateixa IP · circumstancial ({ipGroups.length})
                </p>
                <p className="mt-0.5 text-[11px] text-white/40">
                  Convivents, parelles i dades mòbils comparteixen IP de manera
                  perfectament legítima.
                </p>
                <ul className="mt-1.5 flex flex-col gap-1.5">
                  {ipGroups.map((group) => (
                    <li
                      key={`ip-${group.join("|")}`}
                      className="flex flex-wrap items-center gap-1.5 rounded-md border border-amber-400/25 bg-amber-400/[0.06] px-2.5 py-1.5"
                    >
                      {group.map((email) => (
                        <button
                          key={email}
                          type="button"
                          onClick={() => setQuery(email)}
                          className="rounded bg-amber-400/10 px-1.5 py-0.5 font-mono text-[12px] text-amber-100/90 transition hover:bg-amber-400/20"
                          title="Filtra per aquest correu"
                        >
                          {email}
                        </button>
                      ))}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="mt-5 flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtra per nom, correu, país, IP o dispositiu…"
            className="min-w-56 flex-1 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-sm outline-none transition placeholder:text-white/30 focus:border-fuchsia-400/60"
          />
          <div className="flex items-center overflow-hidden rounded-lg border border-white/15 text-xs">
            <span className="px-2 py-2 text-white/40">Ordena</span>
            <button
              type="button"
              onClick={() => setSortBy("date")}
              aria-pressed={sortBy === "date"}
              className={`px-2.5 py-2 transition ${
                sortBy === "date" ? "bg-fuchsia-500/20 text-fuchsia-200" : "text-white/60 hover:bg-white/5"
              }`}
            >
              Data
            </button>
            <button
              type="button"
              onClick={() => setSortBy("name")}
              aria-pressed={sortBy === "name"}
              className={`px-2.5 py-2 transition ${
                sortBy === "name" ? "bg-fuchsia-500/20 text-fuchsia-200" : "text-white/60 hover:bg-white/5"
              }`}
            >
              Nom
            </button>
          </div>
          <button
            type="button"
            onClick={() => void handleCopyCsv()}
            className="rounded-lg border border-white/15 px-3 py-2 text-sm text-white/85 transition hover:border-white/30 hover:bg-white/5"
          >
            {copied === "ok"
              ? "Copiat ✓"
              : copied === "fail"
                ? "No s'ha pogut copiar"
                : "Copia com a CSV"}
          </button>
          {needle ? (
            <span className="text-xs text-white/40">
              {assignments.length} assignacions · {remaining.length} disponibles
            </span>
          ) : null}
        </section>

        <section className="mt-4">
          <h2 className="mb-2 text-xs uppercase tracking-widest text-white/40">
            Assignacions ({assignments.length})
          </h2>
          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full min-w-[62rem] border-collapse text-sm">
              <thead>
                <tr className="bg-white/[0.04] text-left text-[11px] uppercase tracking-widest text-white/40">
                  <th className="px-3 py-2 font-medium">Nom</th>
                  <th className="px-3 py-2 font-medium">País</th>
                  <th className="px-3 py-2 font-medium">Correu</th>
                  <th className="px-3 py-2 font-medium">Dispositiu</th>
                  <th className="px-3 py-2 font-medium">IP</th>
                  <th className="px-3 py-2 font-medium">Assignat</th>
                  <th className="px-3 py-2 font-medium">
                    <span className="sr-only">Accions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {assignments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-white/40">
                      {data.assignments.length === 0
                        ? "Encara no hi ha cap assignació."
                        : "Cap resultat per aquest filtre."}
                    </td>
                  </tr>
                ) : (
                  assignments.map((a) => {
                    const sharedIp = a.sharedIpWith.length > 0 || (a.ipCount ?? 1) > 1;
                    const sharedDevice = a.sharedDeviceWith.length > 0;
                    return (
                      <tr
                        key={`${a.email}-${a.assignedAt}`}
                        className="group border-t border-white/[0.07] align-top hover:bg-white/[0.03]"
                      >
                        <td className="px-3 py-1.5 font-medium text-white">{a.name || "—"}</td>
                        <td className="whitespace-nowrap px-3 py-1.5">
                          <span className="mr-1.5">
                            <Flag src={a.flagImage} alt={a.country} />
                          </span>
                          <span>{a.country}</span>
                          <span className="ml-1.5 font-mono text-[11px] text-white/30">{a.code}</span>
                          <span className="ml-1.5 align-[-4px]">
                            <SongPreview code={a.code} label={a.country} />
                          </span>
                          {a.rerolled ? (
                            <span
                              className="ml-2 rounded border border-sky-400/40 bg-sky-400/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-sky-300"
                              title={a.previousName ? `abans: ${a.previousName}` : "ha gastat la re-tirada"}
                            >
                              re-tirada
                            </span>
                          ) : null}
                          {a.duplicate ? (
                            <span className="ml-2 rounded border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-300">
                              duplicat
                            </span>
                          ) : null}
                          {a.rerolled && a.previousName ? (
                            <div className="mt-0.5 text-[11px] text-white/35">
                              abans: {a.previousName}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-[13px] text-white/80">{a.email}</td>
                        <td className="whitespace-nowrap px-3 py-1.5">
                          <span className="font-mono text-[12px] text-white/60">
                            {a.device ?? "—"}
                          </span>
                          {sharedDevice ? (
                            <span
                              className="ml-2 rounded border border-rose-400/60 bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-200"
                              title={`També des d'aquest navegador: ${a.sharedDeviceWith.join(", ")}`}
                            >
                              mateix dispositiu ×{a.sharedDeviceWith.length + 1}
                            </span>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5">
                          <span className="font-mono text-[12px] text-white/60">{a.ip ?? "—"}</span>
                          {sharedIp ? (
                            <span
                              className="ml-2 rounded border border-amber-400/30 bg-amber-400/[0.08] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-300/90"
                              title={
                                a.sharedIpWith.length > 0
                                  ? `També des d'aquesta IP: ${a.sharedIpWith.join(", ")}`
                                  : "Diversos registres des d'aquesta IP."
                              }
                            >
                              compartida ×{a.ipCount ?? a.sharedIpWith.length + 1}
                            </span>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-white/60">
                          <span title={absoluteTime(a.assignedAt)}>
                            {relativeTime(a.assignedAt, now)}
                          </span>
                          <div className="text-[11px] text-white/30">{absoluteTime(a.assignedAt)}</div>
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteError(null);
                              setPendingDelete({
                                kind: "one",
                                email: a.email,
                                name: a.name || a.email,
                                country: a.country,
                              });
                            }}
                            title={`Esborra l'assignació de ${a.name || a.email}`}
                            className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-white/45 transition hover:border-red-400/50 hover:bg-red-400/10 hover:text-red-200"
                          >
                            Esborra
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-2 space-y-1 text-[11px] leading-relaxed text-white/35">
            <p>
              <strong className="font-medium text-rose-300/80">Mateix dispositiu</strong> vol dir
              que el mateix navegador s&apos;ha registrat amb més d&apos;un correu: és el senyal
              fort, perquè sobreviu a un canvi de xarxa.
            </p>
            <p>
              <strong className="font-medium text-amber-300/80">Mateixa IP</strong> és
              circumstancial. Els convidats es registren des de casa setmanes abans, així que una
              IP repetida val la pena mirar-se-la — però convivents i parelles en comparteixen una
              legítimament, i qui va amb dades mòbils queda darrere del NAT de l&apos;operadora
              amb perfectes desconeguts.
            </p>
            <p>
              Tots dos s&apos;esquiven fàcilment (finestra privada, esborrar dades, un segon
              dispositiu, una altra xarxa) i cap dels dos és una prova: són pistes per mirar-t&apos;ho,
              i el sistema no bloqueja mai ningú automàticament. Les IP venen de{" "}
              <code className="font-mono">x-forwarded-for</code> i es poden falsejar.
              {sharedIps > 0 ? ` Ara mateix: ${sharedIps} assignacions amb IP compartida.` : null}
            </p>
          </div>
        </section>

        {data.withoutCountry.length > 0 ? (
          <section className="mt-6">
            <h2 className="mb-2 text-xs uppercase tracking-widest text-white/40">
              Han respost sense agafar país ({data.withoutCountry.length})
            </h2>
            <p className="mb-2 text-[11px] text-white/35">
              No surten a la taula de dalt perquè no tenen cap país. Un
              &laquo;potser&raquo; encara pot tornar i tirar.
            </p>
            <ul className="flex flex-col gap-1.5">
              {data.withoutCountry.map((g) => (
                <li
                  key={g.email}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-white/10 bg-white/[0.02] px-2.5 py-1.5 text-sm"
                >
                  <span className="font-medium text-white">{g.name || "—"}</span>
                  <span className="font-mono text-xs text-white/45">{g.email}</span>
                  <span
                    className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                      g.rsvp === "no"
                        ? "border-white/15 bg-white/[0.04] text-white/50"
                        : "border-amber-400/30 bg-amber-400/[0.08] text-amber-300/90"
                    }`}
                  >
                    {g.rsvp === "no" ? "no hi serà" : g.rsvp === "maybe" ? "potser" : "sí"}
                  </span>
                  <span className="text-[11px] text-white/30" title={absoluteTime(g.rsvpAt)}>
                    {relativeTime(g.rsvpAt, now)}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteError(null);
                      setPendingDelete({
                        kind: "one",
                        email: g.email,
                        name: g.name || g.email,
                        country: "cap país",
                      });
                    }}
                    title={`Esborra la resposta de ${g.name || g.email}`}
                    className="ml-auto rounded-md border border-white/10 px-2 py-1 text-[11px] text-white/45 transition hover:border-red-400/50 hover:bg-red-400/10 hover:text-red-200"
                  >
                    Esborra
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-6 pb-10">
          <h2 className="mb-2 text-xs uppercase tracking-widest text-white/40">
            Països disponibles ({remaining.length})
          </h2>
          {remaining.length === 0 ? (
            <p className="rounded-lg border border-white/10 px-3 py-4 text-sm text-white/40">
              {data.remaining.length === 0
                ? "Pool exhaurit: les properes assignacions seran duplicats."
                : "Cap resultat per aquest filtre."}
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
              {remaining.map((c) => (
                <li
                  key={c.code}
                  className="group flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.02] px-2.5 py-1.5 text-sm"
                >
                  <Flag src={c.flagImage} alt={c.name} />
                  <span className="truncate">{c.name}</span>
                  <SongPreview code={c.code} label={c.name} />
                  <span className="ml-auto font-mono text-[11px] text-white/30">{c.code}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="pb-10">
          <h2 className="mb-2 text-xs uppercase tracking-widest text-white/40">
            Balladors ({ALL_DANCES.length})
          </h2>
          {ALL_DANCES.length === 0 ? (
            <p className="rounded-lg border border-white/10 px-3 py-4 text-sm text-white/40">
              Cap ballador. Posa GIPHY_API_KEY a .env.local i executa{" "}
              <code className="font-mono text-white/60">npm run dances</code>.
            </p>
          ) : (
            <>
              <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 lg:grid-cols-8">
                {ALL_DANCES.map((d, i) => (
                  <li
                    key={d.id}
                    className="flex flex-col items-center gap-1 rounded-md border border-white/10 bg-white/[0.03] p-2"
                    title={d.title}
                  >
                    {/* Lazy: 94 animated WebPs would be a lot to pull at once. */}
                    {/* eslint-disable-next-line @next/next/no-img-element -- animated WebP on Giphy's CDN; next/image would need a remotePatterns entry and `unoptimized` to keep the animation, for no gain */}
                    <img
                      src={d.src}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-20 w-auto max-w-full object-contain"
                    />
                    <span className="font-mono text-[10px] text-white/30">{i + 1}</span>
                  </li>
                ))}
              </ul>
              {/* Giphy's terms ask for the mark wherever their stickers appear. */}
              <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-white/25">
                Powered by GIPHY
              </p>
            </>
          )}
        </section>

      </div>

      {pendingDelete ? (
        <ConfirmDelete
          pending={pendingDelete}
          busy={deleting}
          error={deleteError}
          onCancel={cancelDelete}
          onConfirm={() => void runDelete()}
        />
      ) : null}
    </main>
  );
}
