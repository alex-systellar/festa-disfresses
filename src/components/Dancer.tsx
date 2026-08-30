import { getDance, getDancers } from "@/data/dances";

type DancerProps = {
  /** Which country's pair to draw from. Ignored when `id` is given. */
  code?: string;
  /**
   * A specific sticker, pinned by Giphy id. The countdown picks its own rather
   * than deriving a pair from a country, since it belongs to no country.
   */
  id?: string;
  /** Left is the country's own sticker; right comes from the shared pool. */
  side: "left" | "right";
};

/**
 * One cut-out dancer beside the player. Decorative only: `aria-hidden`, no
 * alt text, and nothing here is announced or focusable.
 *
 * Renders nothing until `npm run dances` has filled dances.json, so the reveal
 * degrades to exactly what it was before rather than to a broken image.
 */
export function Dancer({ code, id, side }: DancerProps) {
  const dance = id ? getDance(id) : code ? getDancers(code)?.[side] : null;
  if (!dance) return null;

  return (
    <picture>
      {/* Swapping the source beats pausing the GIF: there is no way to stop an
          animated image from script, and `prefers-reduced-motion` is a real
          media condition here, so the still is served rather than hidden. */}
      <source media="(prefers-reduced-motion: reduce)" srcSet={dance.still} />
      <img
        src={dance.src}
        alt=""
        aria-hidden="true"
        width={dance.width}
        height={dance.height}
        loading="lazy"
        decoding="async"
        className={`dancer dancer-${side}`}
      />
    </picture>
  );
}
