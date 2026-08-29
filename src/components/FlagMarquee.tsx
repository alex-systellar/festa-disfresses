"use client";

import { COUNTRIES } from "@/data/countries";
import { Flag } from "@/components/Flag";

/** Ambient strip of every country in the pool. Decorative only. */
export function FlagMarquee() {
  return (
    <div className="marquee w-full py-1.5 sm:py-2" aria-hidden="true">
      <div className="marquee-track select-none opacity-45">
        {[...COUNTRIES, ...COUNTRIES].map((country, index) => (
          <Flag
            key={`${country.code}-${index}`}
            country={country}
            className="flag-face h-5 w-auto shrink-0 sm:h-6"
            decorative
          />
        ))}
      </div>
    </div>
  );
}
