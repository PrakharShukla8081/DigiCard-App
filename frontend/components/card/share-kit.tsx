"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, Image as ImageIcon, Mail, Share2 } from "lucide-react";
import type { CardPayload } from "@/lib/types";
import { copyText, httpUrl } from "@/lib/utils";
import { qrPng } from "@/lib/qr";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/ui/misc";
import { I } from "./icons";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function signatureHtml(card: CardPayload) {
  const e = card.employee;
  const c = card.company;
  const color = c.primaryColor || "#4F46E5";
  const logo = c.logoUrl && /^https?:/.test(c.logoUrl) ? `<img src="${esc(c.logoUrl)}" alt="${esc(c.name)}" height="36" style="display:block;margin-bottom:8px">` : "";
  return `<table cellpadding="0" cellspacing="0" style="font-family:Arial,Helvetica,sans-serif;color:#0F172A;font-size:13px;line-height:1.45">
<tr><td style="border-left:3px solid ${color};padding-left:12px">
${logo}<div style="font-size:15px;font-weight:bold">${esc(e.name)}</div>
${e.designation ? `<div style="color:${color};font-weight:bold">${esc(e.designation)}</div>` : ""}
<div style="color:#5B6475">${esc([e.department, c.name].filter(Boolean).join(" · "))}</div>
<div style="margin-top:6px">${[e.mobile && `📞 ${esc(e.mobile)}`, e.email && `✉️ <a href="mailto:${esc(e.email)}" style="color:#0F172A">${esc(e.email)}</a>`].filter(Boolean).join(" &nbsp;|&nbsp; ")}</div>
<div style="margin-top:6px"><a href="${esc(card.url)}" style="color:${color};font-weight:bold;text-decoration:none">View my digital card →</a>${e.website ? ` &nbsp;|&nbsp; <a href="${esc(httpUrl(e.website))}" style="color:#5B6475">${esc(e.website.replace(/^https?:\/\//, ""))}</a>` : ""}</div>
</td></tr></table>`;
}

async function copyRich(html: string) {
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([html.replace(/<[^>]+>/g, " ")], { type: "text/plain" }) })]);
      return true;
    }
  } catch {
    /* fall through */
  }
  return copyText(html);
}

/** 1920×1080 PNG for Zoom / Teams / Meet with name, title, company and a QR code. */
async function virtualBackground(card: CardPayload) {
  const W = 1920;
  const H = 1080;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const g = cv.getContext("2d")!;
  const a = card.company.primaryColor || "#4F46E5";
  const b = card.company.secondaryColor || "#10B981";
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "#0B0F1A");
  grad.addColorStop(0.65, "#111831");
  grad.addColorStop(1, a);
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  g.fillStyle = b;
  g.globalAlpha = 0.18;
  g.beginPath();
  g.arc(W - 120, H + 60, 420, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;
  // Text block on the right third (the person sits in the middle)
  const x = W - 560;
  g.fillStyle = "#FFFFFF";
  g.font = "700 54px 'Bricolage Grotesque', Arial, sans-serif";
  g.fillText(card.employee.name, x, 160);
  g.fillStyle = b;
  g.font = "600 30px Manrope, Arial, sans-serif";
  g.fillText(card.employee.designation || "", x, 210);
  g.fillStyle = "rgba(255,255,255,0.75)";
  g.font = "500 28px Manrope, Arial, sans-serif";
  g.fillText(card.company.name, x, 256);
  const qr = await qrPng(
    card.url,
    { ...card.company.qr, logoUrl: card.company.logoUrl, name: card.employee.name },
    1024,
    () => toast.warning("The logo couldn't be loaded; the QR code in the background was created without it."),
  );
  const img = new Image();
  img.src = qr;
  await img.decode();
  g.fillStyle = "#FFFFFF";
  g.beginPath();
  g.roundRect(x, H - 420, 300 + 32, 300 + 32, 24);
  g.fill();
  g.drawImage(img, x + 16, H - 404, 300, 300);
  g.fillStyle = "rgba(255,255,255,0.8)";
  g.font = "600 24px Manrope, Arial, sans-serif";
  g.fillText("Scan to save my contact", x, H - 50);
  const a2 = document.createElement("a");
  a2.href = cv.toDataURL("image/png");
  a2.download = `${card.slug}-virtual-background.png`;
  a2.click();
}

export function ShareKit({ card }: { card: CardPayload }) {
  const [busy, setBusy] = useState(false);
  const waText = `Hi! Here is my digital visiting card — ${card.employee.name}, ${card.company.name}: ${card.url}`;
  return (
    <Panel>
      <PanelHeader title="Share kit" sub="Ways to get your card in front of customers." />
      <div className="grid gap-2 px-5 pb-5 sm:grid-cols-2">
        <Button asChild className="justify-start">
          <a href={`https://wa.me/?text=${encodeURIComponent(waText)}`} target="_blank" rel="noopener noreferrer">
            <span className="size-4 text-[#25D366] [&_svg]:size-4">{I.wa}</span> Share on WhatsApp
          </a>
        </Button>
        <Button className="justify-start" onClick={async () => ((await copyText(card.url)) ? toast.success("Link copied") : toast.error("Could not copy"))}>
          <Copy /> Copy card link
        </Button>
        <Button
          className="justify-start"
          onClick={async () => {
            if (navigator.share) {
              try {
                await navigator.share({ title: card.employee.name, url: card.url });
              } catch {
                /* cancelled */
              }
            } else if (await copyText(card.url)) toast.success("Link copied");
          }}
        >
          <Share2 /> Share…
        </Button>
        <Button className="justify-start" onClick={async () => ((await copyRich(signatureHtml(card))) ? toast.success("Signature copied — paste it into Gmail or Outlook signature settings") : toast.error("Could not copy"))}>
          <Mail /> Copy email signature
        </Button>
        <Button
          className="justify-start sm:col-span-2"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await virtualBackground(card);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Could not create the virtual background.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <ImageIcon /> Download Zoom / Teams background
        </Button>
      </div>
    </Panel>
  );
}
