import type { ReactNode } from "react";
import { CountryPlayer } from "@/components/CountryPlayer";
import { Dancer } from "@/components/Dancer";
import { Flag } from "@/components/Flag";
import type { Country } from "@/data/countries";

type CountryStageProps = {
  country: Country;
  /** What this screen says above the flag. Rendered as-is, so it brings its own layout. */
  header: ReactNode;
  /** The flag pops in. Off for a guest coming back to a country they already know. */
  pop: boolean;
  /** The song starts on its own. Only ever true right after a click, which is what lets it. */
  autoplay: boolean;
  /** Anything that belongs under the name, such as the stamp on a shared country. */
  stamp?: ReactNode;
};

/**
 * A country as the reveal shows it: the flag on its glowing plinth, the name,
 * and the player with a dancer on either side.
 *
 * It is the reveal's own middle, lifted out so the reveal and the explorer are
 * the same thing rather than two lookalikes. That is the point of it: the
 * explorer exists to show every country exactly as a guest will meet it, and a
 * copy would drift the first time the reveal changed.
 *
 * Returns a fragment of two siblings — the body and the dance row — because the
 * reveal's stylesheet lays them out as separate rows of `.reveal-stage`. Render
 * it inside one, and give it a `key` per country so the pop and the player
 * start again on every change.
 */
export function CountryStage({ country, header, pop, autoplay, stamp }: CountryStageProps) {
  return (
    <>
      <div className="reveal-body">
        {header}

        <div className="plinth">
          <span className="halo" aria-hidden="true" />
          <Flag country={country} className={`big-flag flag-face ${pop ? "pop" : ""}`} />
        </div>

        <h1 className="country-name text-center">{country.name}</h1>

        {stamp}
      </div>

      <div className="dance-row">
        <Dancer code={country.code} side="left" />
        <div className="anthem-stub">
          <CountryPlayer
            key={country.code}
            code={country.code}
            anthemTitle={country.anthem.title}
            hasRecording={Boolean(country.anthem.source)}
            autoplay={autoplay}
          />
        </div>
        <Dancer code={country.code} side="right" />
      </div>
    </>
  );
}
