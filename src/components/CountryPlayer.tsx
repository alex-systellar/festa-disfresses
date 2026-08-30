"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getCountry } from "@/data/countries";
import { getSong } from "@/data/songs";

const DEFAULT_VOLUME = 0.5;

/**
 * Inline icons, for the same reason the flags are SVG: emoji differ per
 * platform. `display: block` + `shrink-0` so the glyph can never be squeezed
 * or pick up inline-baseline slack inside the flex button.
 */
function TransportIcon({ playing }: { playing: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="currentColor"
      aria-hidden="true"
      className="block shrink-0"
    >
      {playing ? (
        // Pause: two bars.
        <path d="M8.5 5h2.6v14H8.5zM12.9 5h2.6v14h-2.6z" />
      ) : (
        // Play: a triangle, optically nudged right so it looks centred.
        <path d="M9 5.4v13.2a.6.6 0 0 0 .92.5l10.3-6.6a.6.6 0 0 0 0-1L9.92 4.9a.6.6 0 0 0-.92.5z" />
      )}
    </svg>
  );
}

type CountryPlayerProps = {
  code: string;
  anthemTitle: string;
  /**
   * False for the few anthems with no freely-licensed recording. Not a failure:
   * the title still shows, the control just isn't there.
   */
  hasRecording: boolean;
  /** True right after a claim, when the submit click still counts as a gesture. */
  autoplay: boolean;
};

/**
 * One control, not two. A play/pause button already covers "make it stop", so a
 * separate mute toggle only added a second, contradictory way to silence it.
 *
 * Plays the country's song where there is one, streamed from Apple's CDN, and
 * falls back to the committed anthem mp3 — which is local, so a dead venue
 * wifi downgrades the guest to the anthem rather than to silence. Every other
 * failure path is silent too: a missing file downgrades to a note and a
 * blocked autoplay downgrades to a paused button the guest can press.
 */
export function CountryPlayer({ code, anthemTitle, hasRecording, autoplay }: CountryPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const song = getSong(code);
  const [available, setAvailable] = useState(true);
  const [playing, setPlaying] = useState(false);
  /**
   * Flipped when the preview will not load, so the anthem takes over. Reset on
   * a reroll by the `key` at the usage site, not by an effect — remounting is
   * how React wants per-item state cleared.
   */
  const [songFailed, setSongFailed] = useState(false);

  const usingSong = Boolean(song) && !songFailed;
  const src = usingSong ? song!.previewUrl : hasRecording ? `/anthems/${code}.mp3` : null;
  /**
   * Where in the preview to drop the needle, so the reveal opens on the chorus.
   * Only the song is offset — the anthem clips already start where they should.
   */
  const start = usingSong ? (getCountry(code)?.song?.start ?? 0) : 0;

  /**
   * Offsets are hand-written, and the previews are only ~30s. One set past the
   * end would end playback the instant it began and — through the loop below —
   * restart it just as fast, so an out-of-range offset opens the clip normally
   * instead of spinning.
   */
  const seekToStart = useCallback(
    (el: HTMLAudioElement) => {
      if (start <= 0) return;
      el.currentTime = Number.isFinite(el.duration) && start >= el.duration - 1 ? 0 : start;
    },
    [start],
  );

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = DEFAULT_VOLUME;
    if (el.readyState >= 1) seekToStart(el);

    if (autoplay) {
      // Rejection is expected (autoplay policy); the onPlay/onPause handlers
      // are what actually drive `playing`, so nothing to do on either branch.
      void el.play().catch(() => {});
    }

    return () => el.pause();
  }, [autoplay, code, src, seekToStart]);

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => setAvailable(false));
    else el.pause();
  }, []);

  /**
   * The preview is the thing most likely to fail — it is the only source that
   * needs the network. Falling back to the anthem re-renders with a new `src`,
   * and the effect above picks up autoplay again from there.
   */
  const handleError = useCallback(() => {
    if (usingSong) {
      setSongFailed(true);
      return;
    }
    setAvailable(false);
    setPlaying(false);
  }, [usingSong]);

  // Nothing to play at all: show the anthem title and nothing else.
  if (!src || !available) {
    return (
      <div>
        <p className={`eyebrow${available ? "" : " opacity-70"}`}>Himne nacional</p>
        <p className="mt-1 text-lg leading-tight text-paper">{anthemTitle}</p>
        <p className="mt-2 font-mono text-[0.7rem] tracking-wider text-paper/40">
          {available ? "Sense enregistrament lliure" : "Himne no disponible"}
        </p>
      </div>
    );
  }

  const label = usingSong ? `${song!.title} — ${song!.artist}` : anthemTitle;

  return (
    <div className="flex items-center gap-4">
      <audio
        ref={audioRef}
        src={src}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        // Looping by hand: the `loop` attribute restarts at 0, which would
        // replay the run-up the offset exists to skip.
        onEnded={(e) => {
          const el = e.currentTarget;
          seekToStart(el);
          void el.play().catch(() => setPlaying(false));
        }}
        onLoadedMetadata={(e) => seekToStart(e.currentTarget)}
        onError={handleError}
      />

      <button
        type="button"
        onClick={toggle}
        aria-pressed={playing}
        aria-label={playing ? `Atura ${label}` : `Fes sonar ${label}`}
        // Explicit width AND height plus aspect-square: belt and braces so the
        // circle can never be squashed into an oval by its flex context.
        className="flex aspect-square h-14 w-14 min-w-14 shrink-0 items-center justify-center rounded-full border-2 border-paper/30 bg-paper/10 text-paper backdrop-blur transition hover:border-turquesa hover:bg-paper/15 hover:text-turquesa focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-turquesa"
      >
        <TransportIcon playing={playing} />
      </button>

      <div className="min-w-0 flex-1">
        <p className="text-lg leading-tight text-balance text-paper">
          {usingSong ? song!.title : anthemTitle}
        </p>
        {usingSong ? (
          <p className="mt-0.5 truncate text-sm text-paper/60">
            {song!.artist} ·{" "}
            {/* Apple's preview terms want the clip pointing back at the store. */}
            <a
              href={song!.trackUrl}
              target="_blank"
              rel="noreferrer"
              className="underline decoration-paper/30 underline-offset-2 transition hover:text-turquesa"
            >
              Apple Music
            </a>
          </p>
        ) : null}
      </div>
    </div>
  );
}
