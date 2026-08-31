import { ImageResponse } from "next/og";

export const alt = "El Mundialet";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
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
          42 països · 1 nit · cap excusa
        </div>
        {/* The article rides small above the name and the -et lights up, the
            same way the wordmark is built in public/logo.svg. */}
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
        <div style={{ display: "flex", marginTop: 40, fontSize: 34, color: "#FFF3E2" }}>
          El sorteig et dona un país. Tu hi poses la disfressa.
        </div>
      </div>
    ),
    size,
  );
}
