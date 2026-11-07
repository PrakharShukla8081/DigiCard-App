"use client";

import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { qrPng, qrSvg } from "@/lib/qr";
import type { QrStyle } from "@/lib/types";

/** Large QR code for a card URL with a PNG download (generated in the browser). */
export function QrBlock({ url, fileName, size = 200, style, name }: { url: string; fileName: string; size?: number; style?: Partial<QrStyle>; name?: string }) {
  const target = `${url}?src=qr`;
  const qrStyle = useMemo(() => ({ ...style, name: name || style?.name }), [style, name]);
  const [src, setSrc] = useState("");
  useEffect(() => {
    qrPng(url, qrStyle).then(setSrc).catch(() => setSrc(""));
  }, [target, qrStyle]);
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="rounded-2xl bg-white p-3" style={{ width: size + 24 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src ? <img src={src} alt="QR code" width={size} height={size} /> : <div style={{ width: size, height: size }} />}
      </div>
      <Button
        size="sm"
        disabled={!src}
        onClick={async () => {
          try {
            const data = await qrPng(url, qrStyle, 1024, () => toast.warning("The logo couldn't be loaded; the QR code was downloaded without it."));
            const a = document.createElement("a");
            a.href = data;
            a.download = `${fileName}-qr.png`;
            a.click();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not create QR code.");
          }
        }}
      >
        <Download /> Download QR (PNG)
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={async () => {
          try {
            const svg = await qrSvg(url, qrStyle, () => toast.warning("The logo couldn't be loaded; the QR code was downloaded without it."));
            const objectUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
            const a = document.createElement("a");
            a.href = objectUrl;
            a.download = `${fileName}-qr.svg`;
            a.click();
            window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not create QR code.");
          }
        }}
      >
        Download QR (SVG)
      </Button>
    </div>
  );
}
