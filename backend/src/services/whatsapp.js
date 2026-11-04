/**
 * WhatsApp Business Cloud API (Meta). Sends an APPROVED message template —
 * Meta does not allow free-text business-initiated messages.
 *
 * Credentials: the company's own (Admin > Reminders) when saved, otherwise the
 * platform default from .env. Meta bills each delivered template message
 * (utility/marketing rates); those charges are outside this app.
 */
import { env } from "../config/env.js";
import { decrypt } from "../common/crypto.js";
import { Organization } from "../models/index.js";

export async function whatsappConfig(orgId) {
  const org = await Organization.findById(orgId).select("+whatsapp.accessTokenEnc").lean();
  const w = org?.whatsapp || {};
  if (w.useOwn && w.accessTokenEnc && w.phoneNumberId && w.templateName) {
    try {
      return { token: decrypt(w.accessTokenEnc), phoneNumberId: w.phoneNumberId, templateName: w.templateName, lang: w.templateLang || "en", source: "company" };
    } catch {
      return null;
    }
  }
  const p = env.whatsapp;
  if (p.accessToken && p.phoneNumberId && p.templateName) {
    return { token: p.accessToken, phoneNumberId: p.phoneNumberId, templateName: p.templateName, lang: p.templateLang, source: "platform" };
  }
  return null;
}

/** E.164 digits without "+". A bare 10-digit number is treated as Indian (+91). */
export function waNumber(v) {
  const d = String(v || "").replace(/\D/g, "");
  if (d.length === 10) return "91" + d;
  if (d.length >= 11 && d.length <= 15) return d;
  return "";
}

export async function sendWhatsAppTemplate(cfg, to, params = []) {
  if (!cfg) return { sent: false, reason: "WhatsApp is not configured" };
  const number = waNumber(to);
  if (!number) return { sent: false, reason: "Invalid WhatsApp number" };
  try {
    const res = await fetch(`https://graph.facebook.com/${env.whatsapp.apiVersion}/${cfg.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: number,
        type: "template",
        template: {
          name: cfg.templateName,
          language: { code: cfg.lang },
          components: params.length ? [{ type: "body", parameters: params.map((t) => ({ type: "text", text: String(t).slice(0, 1000) })) }] : [],
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { sent: false, reason: data?.error?.message || `HTTP ${res.status}` };
    return { sent: true, id: data?.messages?.[0]?.id || "" };
  } catch (e) {
    return { sent: false, reason: e.message };
  }
}
