import type { Country } from "@/data/countries";

type FlagProps = {
  country: Country;
  /** Sizes the flag. Every flag is a 4:3 SVG, so one class fits them all. */
  className?: string;
  /** Decorative flags (marquee, spinning reel) stay out of the a11y tree. */
  decorative?: boolean;
};

/**
 * The single flag renderer for the whole app. Every country ships a local 4:3
 * SVG, so the reel, the marquee and the reveal card can never drift apart —
 * and nothing depends on which emoji font the guest's phone happens to have.
 */
export function Flag({ country, className, decorative = false }: FlagProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static local SVG; the optimizer does not process SVG
    <img
      src={country.flagImage}
      alt={decorative ? "" : country.name}
      aria-hidden={decorative ? "true" : undefined}
      className={className}
      draggable={false}
    />
  );
}
