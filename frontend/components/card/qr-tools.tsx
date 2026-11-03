"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Large QR code for a card URL with a PNG download (generated in the browser). */
export function QrBlock({ url, fileName, size = 200 }: { url: string; fileName: string; size?: number }) {
  const target = `${url}?src=qr`;
  const [src, setSrc] = useState("");
  useEffect(() => {
    QRCode.toDataURL(target, { width: 800, margin: 2, errorCorrectionLevel: "M" }).then(setSrc).catch(() => setSrc(""));
  }, [target]);
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="rounded-2xl bg-white p-3" style={{ width: size + 24 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src ? <img src={src} alt="QR code" width={size} height={size} /> : <div style={{ width: size, height: size }} />}
      </div>
      <Button
        size="sm"
        disabled={!src}
        onClick={() => {
          const a = document.createElement("a");
          a.href = src;
          a.download = `${fileName}-qr.png`;
          a.click();
        }}
      >
        <Download /> Download QR (PNG)
      </Button>
    </div>
  );
}
