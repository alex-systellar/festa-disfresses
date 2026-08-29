"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

type AnthemPlayerProps = {
  code: string;
  title: string;
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
 * separate mute toggle only added a second, contradictory way to silence the
 * anthem. Every failure path is silent: a missing file downgrades to a note and
 * a blocked autoplay downgrades to a paused button the guest can press.
 */
export function AnthemPlayer({ code, title, hasRecording, autoplay }: AnthemPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [available, setAvailable] = useState(true);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = DEFAULT_VOLUME;

    if (autoplay) {
      // Rejection is expected (autoplay policy); the onPlay/onPause handlers
      // are what actually drive `playing`, so nothing to do on either branch.
      void el.play().catch(() => {});
    }

    return () => el.pause();
  }, [autoplay, code, hasRecording]);

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => setAvailable(false));
    else el.pause();
  }, []);

  const label = title;

  // No recording exists for this anthem — show the title and nothing else.
  if (!hasRecording) {
    return (
      <div>
        <p className="eyebrow">Himne nacional</p>
        <p className="mt-1 text-lg leading-tight text-paper">{label}</p>
        <p className="mt-2 font-mono text-[0.7rem] tracking-wider text-paper/40">
          Sense enregistrament lliure
        </p>
      </div>
    );
  }

  if (!available) {
    return (
      <div>
        <p className="eyebrow opacity-70">Himne nacional</p>
        <p className="mt-1 text-lg leading-tight text-paper">{label}</p>
        <p className="mt-2 font-mono text-[0.7rem] tracking-wider text-paper/40">
          Himne no disponible
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <audio
        ref={audioRef}
        src={`/anthems/${code}.mp3`}
        preload="auto"
        loop
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => {
          setAvailable(false);
          setPlaying(false);
        }}
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
        <p className="eyebrow">Himne nacional</p>
        <p className="text-lg leading-tight text-balance text-paper">{label}</p>
      </div>
    </div>
  );
}
