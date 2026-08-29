import { ImageResponse } from "next/og";

export const alt = "Festa de Disfresses";
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
          40 països · 1 nit · cap excusa
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 28,
            fontSize: 132,
            fontWeight: 900,
            lineHeight: 1,
            letterSpacing: -4,
          }}
        >
          <span>FESTA</span>
          <span style={{ color: "#FF2E88" }}>DE DISFRESSES</span>
        </div>
        <div style={{ display: "flex", marginTop: 40, fontSize: 34, color: "#FFF3E2" }}>
          El sorteig et dona un país. Tu hi poses la disfressa.
        </div>
      </div>
    ),
    size,
  );
}
