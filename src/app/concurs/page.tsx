import type { Metadata } from "next";
import { ConcursApp } from "@/components/ConcursApp";

export const metadata: Metadata = {
  title: "Vota · El Mundialet",
  description: "Vota les millors disfresses de la nit, un país per premi.",
  openGraph: {
    title: "El Mundialet",
    description: "Vota les millors disfresses de la nit, un país per premi.",
    locale: "ca_ES",
    type: "website",
  },
};

/**
 * What `/` shows once `IS_CONCURS` is on. Reached by a rewrite in
 * `src/proxy.ts`, exactly like the wall of countries. Everything on it is
 * behind the login, and the API refuses a vote from anyone who is not.
 *
 * Like the wall of countries, it shows the film only after the login.
 */
export default function ConcursPage() {
  return <ConcursApp />;
}
