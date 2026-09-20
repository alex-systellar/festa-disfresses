import type { Metadata } from "next";
import { IntroGate } from "@/components/IntroGate";
import { RepartimentApp } from "@/components/RepartimentApp";

export const metadata: Metadata = {
  title: "Els països · El Mundialet",
  description: "El sorteig ha acabat. Consulta quin país et va tocar i mira'ls tots.",
  openGraph: {
    title: "El Mundialet",
    description: "El sorteig ha acabat. Consulta quin país et va tocar i mira'ls tots.",
    locale: "ca_ES",
    type: "website",
  },
};

/**
 * What `/` shows once `REPARTIMENT_OVER` is on. Reached by a rewrite in
 * `src/proxy.ts`, which sends anyone who types this address straight back to
 * `/` — the page itself decides nothing, so it can stay static.
 *
 * Opens with the film (see `IntroGate`): once per tab, then the page.
 */
export default function RepartimentPage() {
  return (
    <IntroGate>
      <RepartimentApp />
    </IntroGate>
  );
}
