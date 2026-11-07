import { ImageResponse } from "next/og";

export function pwaIcon(size: number, maskable = false) {
  const markSize = Math.round(size * (maskable ? 0.38 : 0.42));
  const tileSize = Math.round(markSize * 0.7);
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0F172A",
      }}
    >
      <div
        style={{
          width: markSize,
          height: markSize,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          borderRadius: Math.round(size * 0.12),
          background: "#4F46E5",
        }}
      >
        <div
          style={{
            width: tileSize,
            height: Math.round(tileSize * 0.72),
            borderRadius: Math.round(size * 0.035),
            background: "#FFFFFF",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: Math.round(markSize * 0.15),
            bottom: Math.round(markSize * 0.15),
            width: Math.round(markSize * 0.28),
            height: Math.round(markSize * 0.16),
            borderRadius: Math.round(size * 0.02),
            background: "#0F172A",
          }}
        />
      </div>
    </div>,
    { width: size, height: size },
  );
}
