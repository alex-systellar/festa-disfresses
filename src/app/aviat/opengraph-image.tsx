import { ImageResponse } from "next/og";

import { countdownTarget } from "@/lib/countdown";

export const alt = "El Mundialet";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * While the gate is up every shared link previews as this page, so it needs a
 * card of its own — the root one invites people to a draw that is not open yet.
 *
 * It states the date rather than the days left: link previews are cached hard
 * by WhatsApp and the rest, and a stale "falten 12 dies" is worse than none.
 */
export default function AviatOpengraphImage() {
  const target = countdownTarget();
  const opening = target
    ? new Intl.DateTimeFormat("ca-ES", {
        day: "numeric",
        month: "long",
        timeZone: "Europe/Madrid",
      }).format(target)
    : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background:
            "linear-gradient(135deg, #1D0F33 0%, #120A1F 45%, #2A0F3D 100%)",
          color: "#FFF3E2",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 26,
            letterSpacing: 10,
            color: "#FFC93C",
            textTransform: "uppercase",
          }}
        >
          41 països a repartir · 4 premis · moltes disfresses
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 30,
            fontSize: 40,
            letterSpacing: 18,
            color: "#FFC93C",
          }}
        >
          EL
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 10,
            fontSize: 150,
            fontWeight: 900,
            lineHeight: 1,
            letterSpacing: -4,
          }}
        >
          <span>MUNDIAL</span>
          <span style={{ color: "#FFC93C" }}>ET</span>
        </div>
        <div style={{ display: "flex", marginTop: 40, fontSize: 34 }}>
          {opening ? `El sorteig obre el ${opening}.` : "El sorteig obre aviat."}
        </div>
      </div>
    ),
    size,
  );
}
