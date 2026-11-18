import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/site";

export const alt = "KasiP2P: send files over Wi-Fi, device to device";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Link preview: the wire mark (this device in cyan, the other in amber) on ink.
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
          padding: 96,
          background: "#0b0f14",
          color: "#e8edf2",
        }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 56 }}>
          <div style={{ width: 56, height: 56, borderRadius: 28, background: "#00d9ff" }} />
          <div
            style={{ width: 360, height: 8, background: "linear-gradient(90deg, #00d9ff, #ffb547)" }}
          />
          <div style={{ width: 56, height: 56, borderRadius: 28, background: "#ffb547" }} />
        </div>
        <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: -2 }}>{SITE_NAME}</div>
        <div style={{ fontSize: 40, color: "#8a97a8", marginTop: 16 }}>
          Send files over Wi-Fi, device to device. Nothing is uploaded.
        </div>
      </div>
    ),
    size,
  );
}
