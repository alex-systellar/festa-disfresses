"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

const VIDEO = "/intro/celebrate-our-differences.mp4";
const POSTER = "/intro/celebrate-our-differences.jpg";

/** Set once the intro has been watched or skipped. Kept for good, not per tab. */
const SEEN_KEY = "festa-disfresses:intro-seen";

/** The colour probe: the picture, shrunk to this many pixels a side. */
const SAMPLE = 24;

type Rgb = [number, number, number];

/** The mean colour of rows `from` up to `to` of the probe. */
function averageRows(data: Uint8ClampedArray, from: number, to: number): Rgb {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = from; y < to; y++) {
    for (let x = 0; x < SAMPLE; x++) {
      const i = (y * SAMPLE + x) * 4;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n += 1;
    }
  }
  return [r / n, g / n, b / n];
}

/** A step from `from` towards `to`; the first colour is taken as it comes. */
function ease(from: Rgb | null, to: Rgb): Rgb {
  if (!from) return to;
  return [0, 1, 2].map((i) => from[i] + (to[i] - from[i]) * 0.45) as Rgb;
}

const css = ([r, g, b]: Rgb) => `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`;

/** How long the curtain takes to lift; keep in step with `.intro-leaving`. */
const LEAVE_MS = 700;

/**
 * "playing" the video is running
 * "leaving" the video is over and the curtain is lifting
 * "done"    the page is all there is
 */
type Stage = "playing" | "leaving" | "done";

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Whether this visit opens with the video: every visit does, until it has been
 * watched to the end or skipped once. From then on the page opens directly,
 * and a button on the page plays it again (`ReplayIntroButton`).
 *
 * `?intro` plays it regardless, which is the quick way to see it again
 * without clearing storage.
 *
 * Reads `localStorage`, which does not exist on the server: see `IntroGate`.
 */
function shouldPlay(): boolean {
  if (new URLSearchParams(window.location.search).has("intro")) return true;
  return storage()?.getItem(SEEN_KEY) !== "1";
}

/** Something on the page that plays the video again. */
const IntroContext = createContext<{ replay: () => void; waiting: boolean } | null>(null);

/**
 * Whether the page is still waiting for the film to end. True while the video
 * plays, false the moment the curtain starts to lift, so something that wants
 * to be seen from its first frame (a celebration) can hold back until then.
 * False outside an `IntroGate`.
 */
export function useIntroWaiting(): boolean {
  return useContext(IntroContext)?.waiting ?? false;
}

/**
 * A button that plays the video again, for wherever the page wants one. Draws
 * nothing outside an `IntroGate`, so it can sit in a shared component.
 */
export function ReplayIntroButton({ className = "btn-ghost" }: { className?: string }) {
  const intro = useContext(IntroContext);
  if (!intro) return null;
  return (
    <button type="button" onClick={intro.replay} className={className}>
      ▶ Torna a veure el vídeo
    </button>
  );
}

/**
 * The film before the page. Wraps a phase view (the wall of countries or the
 * contest) and covers it with a full-screen video until it ends or is skipped,
 * then lifts away onto a page that has been rendered and had its pictures
 * fetched behind the curtain the whole time.
 *
 * It goes in only once a guest has logged in, so the film and the page behind
 * it are for the guests alone. That is also why it may read `localStorage` and
 * the media query while it renders: it is never part of a server render, only
 * ever mounted by a client that has already been through a login.
 *
 * Browsers refuse to start a video with sound before the guest has touched the
 * page, so the sound is tried first and, when it is refused, the video plays
 * on muted with a button to turn it on. A tap on that button is the gesture
 * the browser was waiting for. Should even a muted start be refused (some
 * low-power modes do), a big play button takes its place.
 *
 * Somebody who asked their device for less motion gets that play button too,
 * rather than a video that starts by itself: they still see it, when they
 * choose to.
 */
export function IntroGate({ children }: { children: ReactNode }) {
  // Whether this visit gets the video at all, and whether it starts by itself.
  const [initial] = useState(() => ({
    play: shouldPlay(),
    calm: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  }));
  const [stage, setStage] = useState<Stage>(initial.play ? "playing" : "done");
  const [muted, setMuted] = useState(false);
  const [blocked, setBlocked] = useState(initial.play && initial.calm);
  const [progress, setProgress] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  const skip = useRef<HTMLButtonElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  /** False for somebody who asked for less motion: the video waits for a tap. */
  const autoplay = useRef(!initial.calm);

  // Start playback the moment the video is on screen.
  useEffect(() => {
    if (stage !== "playing") return;
    const el = video.current;
    if (!el) return;
    let cancelled = false;

    if (!autoplay.current) {
      // Shown, but not started for them: the play button is up already.
      skip.current?.focus();
      return;
    }

    el.muted = false;
    el.play().catch(() => {
      if (cancelled) return;
      // No gesture yet, so no sound. Play on without it, and offer it back.
      el.muted = true;
      setMuted(true);
      el.play().catch(() => {
        if (!cancelled) setBlocked(true);
      });
    });
    skip.current?.focus();
    return () => {
      cancelled = true;
    };
  }, [stage]);

  // Paint the screen around the picture in the picture's own colours, so its
  // feathered edges dissolve into more of the same instead of into black.
  useEffect(() => {
    if (stage !== "playing" && stage !== "leaving") return;
    const canvas = document.createElement("canvas");
    canvas.width = SAMPLE;
    canvas.height = SAMPLE;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    let top: Rgb | null = null;
    let bottom: Rgb | null = null;

    const tick = () => {
      const box = overlay.current;
      const picture = frame.current;
      const el = video.current;
      if (!box || !picture || !el) return;

      // Where the picture sits, so the colour above it and below it can meet
      // exactly at its top and bottom edges and blend across the feather.
      const rect = picture.getBoundingClientRect();
      box.style.setProperty("--intro-y0", `${rect.top}px`);
      box.style.setProperty("--intro-y1", `${rect.bottom}px`);

      // Nothing to read until the first frame has arrived.
      if (el.readyState < 2) return;
      try {
        ctx.drawImage(el, 0, 0, SAMPLE, SAMPLE);
        const { data } = ctx.getImageData(0, 0, SAMPLE, SAMPLE);
        const nextTop = averageRows(data, 0, 2);
        const nextBottom = averageRows(data, SAMPLE - 2, SAMPLE);
        // Eased, so a cut to another scene is a wash of colour and not a flash.
        top = ease(top, nextTop);
        bottom = ease(bottom, nextBottom);
        box.style.setProperty("--intro-top", css(top));
        box.style.setProperty("--intro-bottom", css(bottom));
      } catch {
        // A frame that cannot be read leaves the colours where they were.
      }
    };

    tick();
    const timer = window.setInterval(tick, 70);
    return () => window.clearInterval(timer);
  }, [stage]);

  // While the curtain is up the page underneath must not scroll or be read.
  useEffect(() => {
    if (stage === "done") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [stage]);

  // The curtain has lifted: take it out of the tree.
  useEffect(() => {
    if (stage !== "leaving") return;
    const timer = window.setTimeout(() => setStage("done"), LEAVE_MS);
    return () => window.clearTimeout(timer);
  }, [stage]);

  function leave(watched = true) {
    video.current?.pause();
    if (watched) {
      try {
        storage()?.setItem(SEEN_KEY, "1");
      } catch {
        // Private mode: it plays again next visit, which is harmless.
      }
    }
    setStage("leaving");
  }

  function replay() {
    // They chose to watch it, which is a tap: sound and all.
    autoplay.current = true;
    setProgress(0);
    setMuted(false);
    setBlocked(false);
    setStage("playing");
  }

  useEffect(() => {
    if (stage !== "playing") return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") leave();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage]);

  function unmute() {
    const el = video.current;
    if (!el) return;
    el.muted = false;
    setMuted(false);
  }

  function start() {
    const el = video.current;
    if (!el) return;
    // The tap that got us here is the gesture: sound is allowed now.
    el.muted = false;
    setMuted(false);
    setBlocked(false);
    el.play().catch(() => setBlocked(true));
  }

  const covered = stage !== "done";

  return (
    <IntroContext.Provider value={{ replay, waiting: stage === "playing" }}>
      {/* `inert` takes the page out of the tab order and the accessibility
          tree while the video is on top of it. It stays mounted, not deferred
          until the video ends, so it loads behind the curtain. */}
      <div style={{ display: "contents" }} inert={covered && stage !== "leaving"}>
        {children}
      </div>

      {covered ? (
        <div
          ref={overlay}
          className={`intro ${stage === "leaving" ? "intro-leaving" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label="Vídeo de benvinguda"
        >
          <div ref={frame} className="intro-frame">
            <video
              ref={video}
              className="intro-video"
              src={VIDEO}
              poster={POSTER}
              playsInline
              preload="auto"
              onEnded={() => leave()}
              onTimeUpdate={(event) => {
                const { currentTime, duration } = event.currentTarget;
                if (duration > 0) setProgress(currentTime / duration);
              }}
              // A file that cannot load must never trap the guest behind it, and
              // must not count as watched: it should try again next visit.
              onError={() => {
                console.warn("[intro] the video could not be loaded");
                leave(false);
              }}
            />
            {blocked ? (
              <button type="button" className="intro-play" onClick={start}>
                <span aria-hidden="true">▶</span>
                Toca per començar
              </button>
            ) : null}
          </div>

          <div className="intro-progress" aria-hidden="true">
            <span style={{ transform: `scaleX(${progress})` }} />
          </div>

          <div className="intro-actions">
            {muted && !blocked ? (
              <button type="button" className="btn-outline" onClick={unmute}>
                🔊 Activa el so
              </button>
            ) : null}
            <button ref={skip} type="button" className="btn-ghost" onClick={() => leave()}>
              Salta →
            </button>
          </div>
        </div>
      ) : null}
    </IntroContext.Provider>
  );
}
