"use client";

import { COUNTRIES } from "@/data/countries";
import { Flag } from "@/components/Flag";

/** Ambient strip of every country in the pool. Decorative only. */
export function FlagMarquee() {
  return (
    <div className="marquee w-full py-2" aria-hidden="true">
      <div className="marquee-track select-none opacity-45">
        {[...COUNTRIES, ...COUNTRIES].map((country, index) => (
          <Flag
            key={`${country.code}-${index}`}
            country={country}
            className="flag-face h-6 w-auto shrink-0"
            decorative
          />
        ))}
      </div>
    </div>
  );
}
