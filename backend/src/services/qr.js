import QRCode from "qrcode";

export const DEFAULT_QR = Object.freeze({
  foreground: "#111827",
  background: "#FFFFFF",
  useLogo: true,
  frame: "none",
  frameText: "Scan to save my contact",
});

export function qrStyle(org, ent) {
  if (!ent?.features?.customBranding) return { ...DEFAULT_QR };
  return { ...DEFAULT_QR, ...(org?.branding?.qr || {}) };
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);
}

function addLogo(svg, logoData, background) {
  if (!logoData) return svg;
  const viewBox = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/i);
  if (!viewBox) return svg;
  const width = Number(viewBox[1]);
  const height = Number(viewBox[2]);
  const logo = Math.min(width, height) * 0.2;
  const pad = logo * 0.2;
  const x = (width - logo) / 2;
  const y = (height - logo) / 2;
  return svg.replace("</svg>", `<rect x="${x - pad}" y="${y - pad}" width="${logo + pad * 2}" height="${logo + pad * 2}" rx="${pad / 2}" fill="${background}"/><image href="${logoData}" x="${x}" y="${y}" width="${logo}" height="${logo}" preserveAspectRatio="xMidYMid meet"/></svg>`);
}

function frameSvg(qr, style, name) {
  const size = 1024;
  const viewBox = qr.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/i);
  const inner = viewBox
    ? `<svg x="102" y="82" width="820" height="820" viewBox="0 0 ${viewBox[1]} ${viewBox[2]}">${qr.replace(/^<svg\b[^>]*>|<\/svg>$/gi, "")}</svg>`
    : qr;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect x="1" y="1" width="${size - 2}" height="${size - 2}" rx="18" fill="${style.background}" stroke="${style.foreground}" stroke-width="2"/><text x="${size / 2}" y="52" text-anchor="middle" font-family="Arial,sans-serif" font-size="28" font-weight="700" fill="${style.foreground}" textLength="960" lengthAdjust="spacingAndGlyphs">${esc(name)}</text>${inner}<text x="${size / 2}" y="988" text-anchor="middle" font-family="Arial,sans-serif" font-size="24" fill="${style.foreground}" textLength="960" lengthAdjust="spacingAndGlyphs">${esc(style.frameText)}</text></svg>`;
}

/** Render a QR SVG while keeping the tracking query string unchanged. */
export async function renderQrSvg(url, style, { logoData, name = "" } = {}) {
  const target = `${url}?src=qr`;
  let qr = await QRCode.toString(target, {
    type: "svg",
    margin: 4,
    errorCorrectionLevel: style.useLogo && logoData ? "H" : "M",
    color: { dark: style.foreground, light: style.background },
  });
  qr = qr.replace(/(<svg\b[^>]*>)/i, `$1<metadata>${esc(target)}</metadata>`);
  const content = style.useLogo && logoData ? addLogo(qr, logoData, style.background) : qr;
  return style.frame === "label" ? frameSvg(content, style, name) : content;
}
