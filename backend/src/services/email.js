import { env } from "../config/env.js";
import { logger } from "../common/logger.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function classifyEmailError(reason) {
  const text = String(reason || "").toLowerCase();
  if (text.includes("only send testing emails") || text.includes("testing email") || text.includes("verify a domain")) return "testing_mode";
  if (text.includes("from") && (text.includes("verify") || text.includes("domain"))) return "invalid_from";
  return "send_failed";
}

/**
 * Send an email through Resend's HTTP API.
 * Without RESEND_API_KEY the email is printed to the server console (development mode)
 * and `{ sent: false, reason: "not_configured" }` is returned — nothing is faked.
 */
export async function sendEmail({ to, subject, html, text }) {
  if (!env.resendApiKey) {
    if (!env.isTest) logger.info(`[email:not-sent] to=${to} subject="${subject}"\n${text || ""}`);
    return { sent: false, reason: "not_configured", code: "not_configured" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.emailFrom, to: [to], subject, html, text }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const reason = data?.message || `HTTP ${res.status}`;
      const code = classifyEmailError(reason);
      logger.warn(`[email:send-failed] code=${code} reason=${reason}`);
      return { sent: false, reason, code };
    }
    return { sent: true, id: data.id };
  } catch (e) {
    const reason = e.message;
    logger.warn(`[email:send-failed] code=send_failed reason=${reason}`);
    return { sent: false, reason, code: "send_failed" };
  }
}

function layout(title, bodyHtml, cta) {
  return `<!doctype html><html><body style="margin:0;background:#F5F6FB;font-family:Segoe UI,Arial,sans-serif;color:#0F172A">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
  <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;border:1px solid #E1E5EF">
  <tr><td style="padding:28px 32px">
    <div style="font-weight:800;font-size:18px;margin-bottom:20px">Beno Digital Card</div>
    <h1 style="font-size:20px;margin:0 0 12px">${esc(title)}</h1>
    <div style="font-size:15px;line-height:1.6;color:#334155">${bodyHtml}</div>
    ${cta ? `<p style="margin:24px 0"><a href="${esc(cta.url)}" style="background:#4F46E5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700;display:inline-block">${esc(cta.label)}</a></p>
    <p style="font-size:12px;color:#64748B;word-break:break-all">Or open this link: ${esc(cta.url)}</p>` : ""}
  </td></tr></table></td></tr></table></body></html>`;
}

export const templates = {
  invite({ name, orgName, role, link }) {
    const roleLabel = role === "employee" ? "your digital visiting card" : `the ${orgName} admin panel`;
    return {
      subject: `You're invited to ${orgName} on Beno Digital Card`,
      html: layout(
        `Hi ${name}, set up your account`,
        `<p>You have been invited to access ${esc(roleLabel)}. Click the button below to choose your password. The link is valid for 7 days.</p>`,
        { url: link, label: "Set my password" }
      ),
      text: `Hi ${name},\n\nYou have been invited to access ${roleLabel}. Set your password here (valid 7 days):\n${link}`,
    };
  },
  reset({ name, link }) {
    return {
      subject: "Reset your Beno Digital Card password",
      html: layout(
        `Hi ${name}, reset your password`,
        `<p>We received a request to reset your password. This link is valid for 30 minutes. If you did not ask for this, ignore this email.</p>`,
        { url: link, label: "Reset password" }
      ),
      text: `Hi ${name},\n\nReset your password here (valid 30 minutes):\n${link}\n\nIf you did not ask for this, ignore this email.`,
    };
  },
  reminder({ name, orgName, cardUrl, reasons, loginUrl }) {
    const items = reasons.map((r) => `<li>${esc(r)}</li>`).join("");
    return {
      subject: `${name}, your ${orgName} digital card is waiting`,
      html: layout(
        `Hi ${name}, make the most of your digital card`,
        `<p>Your ${esc(orgName)} digital visiting card is ready to share with customers.</p><ul>${items}</ul><p>Your card: <a href="${esc(cardUrl)}">${esc(cardUrl)}</a></p>`,
        loginUrl ? { url: loginUrl, label: "Open my card" } : { url: cardUrl, label: "View my card" }
      ),
      text: `Hi ${name},\n\nYour ${orgName} digital visiting card is ready.\n- ${reasons.join("\n- ")}\n\nYour card: ${cardUrl}`,
    };
  },
  enquiry({ employeeName, orgName, enquiry, adminLink }) {
    const rows = [
      ["Name", enquiry.name],
      ["Email", enquiry.email],
      ["Phone", enquiry.phone],
      ["Company", enquiry.company],
      ["Message", enquiry.message],
    ]
      .filter(([, v]) => v)
      .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#64748B">${k}</td><td style="padding:4px 0">${esc(v)}</td></tr>`)
      .join("");
    return {
      subject: `New enquiry for ${employeeName} (${orgName})`,
      html: layout(`New enquiry from your digital card`, `<table>${rows}</table>`, adminLink ? { url: adminLink, label: "View enquiries" } : null),
      text: `New enquiry for ${employeeName}\n\n${["name", "email", "phone", "company", "message"].map((k) => `${k}: ${enquiry[k] || ""}`).join("\n")}`,
    };
  },
  contactExchange({ employeeName, orgName, enquiry, adminLink }) {
    const rows = [
      ["Name", enquiry.name],
      ["Email", enquiry.email],
      ["Phone", enquiry.phone],
      ["Company", enquiry.company],
      ["Designation", enquiry.designation],
      ["Note", enquiry.note],
    ]
      .filter(([, value]) => value)
      .map(([key, value]) => `<tr><td style="padding:4px 12px 4px 0;color:#64748B">${esc(key)}</td><td style="padding:4px 0">${esc(value)}</td></tr>`)
      .join("");
    return {
      subject: `${enquiry.name.replace(/[\r\n]/g, " ")} shared their contact with you`,
      html: layout(`${enquiry.name} shared their contact with you`, `<p>${esc(enquiry.name)} shared their details with ${esc(employeeName)} at ${esc(orgName)}.</p><table>${rows}</table>`, adminLink ? { url: adminLink, label: "View contacts" } : null),
      text: `${enquiry.name} shared their contact with you\n\n${["name", "email", "phone", "company", "designation", "note"].map((key) => `${key}: ${enquiry[key] || ""}`).join("\n")}`,
    };
  },
  leadRequest({ lead, adminLink }) {
    const rows = [
      ["Name", lead.name],
      ["Email", lead.email],
      ["Phone", lead.phone],
      ["Company", lead.company],
      ["Designation", lead.designation],
      ["Team size", lead.employees],
      ["City", lead.city],
      ["Interest", lead.interest],
      ["Plan", lead.planInterest],
      ["Billing", lead.billingPreference],
      ["Message", lead.message],
    ]
      .filter(([, value]) => value)
      .map(([key, value]) => `<tr><td style="padding:4px 12px 4px 0;color:#64748B">${esc(key)}</td><td style="padding:4px 0">${esc(value)}</td></tr>`)
      .join("");
    return {
      subject: `New website lead from ${lead.name}`,
      html: layout("New website lead", `<table>${rows}</table>`, adminLink ? { url: adminLink, label: "View website leads" } : null),
      text: `New website lead\n\n${["name", "email", "phone", "company", "designation", "employees", "city", "interest", "planInterest", "billingPreference", "message"].map((key) => `${key}: ${lead[key] || ""}`).join("\n")}`,
    };
  },
  expiry({ orgName, endDate, days }) {
    const d = new Date(endDate).toDateString();
    return {
      subject: `Your Beno Digital Card subscription ends in ${days} day${days === 1 ? "" : "s"}`,
      html: layout(`Subscription ending on ${d}`, `<p>The ${esc(orgName)} subscription ends on <b>${esc(d)}</b>. Contact Beno to renew so employee cards stay online.</p>`),
      text: `The ${orgName} subscription ends on ${d}. Contact Beno to renew so employee cards stay online.`,
    };
  },
};
