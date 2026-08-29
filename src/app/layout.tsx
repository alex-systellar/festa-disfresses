import type { Metadata, Viewport } from "next";
import { Bungee, DM_Mono, Outfit } from "next/font/google";
import "./globals.css";

/** Signage face — carnival posters and fairground boards. Used sparingly. */
const bungee = Bungee({
  variable: "--font-bungee",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
  display: "swap",
});

/** Absolute base for the OG image. Vercel sets the host; locally it's the dev server. */
const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "El Mundialet",
  description:
    "El sorteig et dona un país, tu hi poses la disfressa. Entra el teu correu i descobreix de què vas vestit.",
  openGraph: {
    title: "El Mundialet",
    description: "El sorteig et dona un país, tu hi poses la disfressa.",
    locale: "ca_ES",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#120a1f",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ca"
      className={`${bungee.variable} ${outfit.variable} ${dmMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
