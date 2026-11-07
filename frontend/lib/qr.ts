import QRCode from "qrcode";
import type { QrStyle } from "./types";

const DEFAULT: QrStyle = { foreground: "#111827", background: "#FFFFFF", useLogo: true, frame: "none", frameText: "Scan to save my contact" };

function esc(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
}

async function loadLogo(url?: string) {
  if (!url) return null;
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error("Could not load logo");
  const bytes = new Uint8Array(await res.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${res.headers.get("content-type") || "image/png"};base64,${btoa(binary)}`;
}

function options(style: QrStyle, logo: boolean) {
  return { margin: 4, errorCorrectionLevel: style.useLogo && logo ? "H" : "M", color: { dark: style.foreground, light: style.background } } as const;
}

function addLogo(svg: string, logo: string, background: string) {
  const match = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/i);
  if (!match) return svg;
  const width = Number(match[1]);
  const height = Number(match[2]);
  const size = Math.min(width, height) * 0.2;
  const pad = size * 0.2;
  const x = (width - size) / 2;
  const y = (height - size) / 2;
  return svg.replace("</svg>", `<rect x="${x - pad}" y="${y - pad}" width="${size + pad * 2}" height="${size + pad * 2}" rx="${pad / 2}" fill="${background}"/><image href="${esc(logo)}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/></svg>`);
}

function frameSvg(qr: string, style: QrStyle) {
  const size = 1024;
  const frameText = esc(style.frameText);
  const name = esc(style.name || "");
  const viewBox = qr.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/i);
  const inner = viewBox
    ? `<svg x="102" y="82" width="820" height="820" viewBox="0 0 ${viewBox[1]} ${viewBox[2]}">${qr.replace(/^<svg\b[^>]*>|<\/svg>$/gi, "")}</svg>`
    : qr;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect x="1" y="1" width="${size - 2}" height="${size - 2}" rx="18" fill="${style.background}" stroke="${style.foreground}" stroke-width="2"/><text x="${size / 2}" y="52" text-anchor="middle" font-family="Arial,sans-serif" font-size="28" font-weight="700" fill="${style.foreground}" textLength="960" lengthAdjust="spacingAndGlyphs">${name}</text>${inner}<text x="${size / 2}" y="988" text-anchor="middle" font-family="Arial,sans-serif" font-size="24" fill="${style.foreground}" textLength="960" lengthAdjust="spacingAndGlyphs">${frameText}</text></svg>`;
}

export async function qrSvg(url: string, input: Partial<QrStyle> = {}, onLogoError?: () => void) {
  const style = { ...DEFAULT, ...input };
  let logo = null;
  if (style.useLogo) {
    try {
      logo = await loadLogo(style.logoUrl);
    } catch {
      onLogoError?.();
    }
  }
  const target = `${url}?src=qr`;
  let svg = await QRCode.toString(target, { type: "svg", ...options(style, Boolean(logo)) });
  svg = svg.replace(/(<svg\b[^>]*>)/i, `$1<metadata>${esc(target)}</metadata>`);
  if (logo) svg = addLogo(svg, logo, style.background);
  return style.frame === "label" ? frameSvg(svg, style) : svg;
}

export async function qrPng(url: string, input: Partial<QrStyle> = {}, size = 1024, onLogoError?: () => void) {
  const style = { ...DEFAULT, ...input };
  let logo: HTMLImageElement | null = null;
  if (style.useLogo) {
    try {
      const src = await loadLogo(style.logoUrl);
      if (src) {
        logo = new Image();
        logo.crossOrigin = "anonymous";
        logo.src = src;
        await logo.decode();
      }
    } catch {
      onLogoError?.();
    }
  }
  const qrSize = style.frame === "label" ? Math.round(size * 0.8) : size;
  const data = await QRCode.toDataURL(`${url}?src=qr`, { width: qrSize, ...options(style, Boolean(logo)) });
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d")!;
  context.fillStyle = style.background;
  context.fillRect(0, 0, size, size);
  const image = new Image();
  image.src = data;
  await image.decode();
  const offset = style.frame === "label" ? Math.round(size * 0.08) : 0;
  context.drawImage(image, (size - qrSize) / 2, offset, qrSize, qrSize);
  if (logo) {
    const logoSize = qrSize * 0.2;
    const pad = logoSize * 0.2;
    const x = (size - logoSize) / 2;
    const y = offset + (qrSize - logoSize) / 2;
    context.fillStyle = style.background;
    context.fillRect(x - pad, y - pad, logoSize + pad * 2, logoSize + pad * 2);
    const scale = logoSize / Math.max(logo.naturalWidth, logo.naturalHeight);
    const drawWidth = logo.naturalWidth * scale;
    const drawHeight = logo.naturalHeight * scale;
    context.drawImage(logo, x + (logoSize - drawWidth) / 2, y + (logoSize - drawHeight) / 2, drawWidth, drawHeight);
  }
  if (style.frame === "label") {
    context.strokeStyle = style.foreground;
    context.lineWidth = 2;
    context.strokeRect(1, 1, size - 2, size - 2);
    context.fillStyle = style.foreground;
    context.textAlign = "center";
    context.font = "700 28px Arial";
    context.fillText(style.name || "", size / 2, 52, size - 64);
    context.font = "24px Arial";
    context.fillText(style.frameText, size / 2, size - 24, size - 64);
  }
  return canvas.toDataURL("image/png");
}

export function qrDefaults(input?: Partial<QrStyle>): QrStyle {
  return { ...DEFAULT, ...input };
}
