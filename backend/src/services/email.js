import crypto from "node:crypto";
import { env } from "../config/env.js";
import { logger } from "../common/logger.js";
import { EmailOutbox, PlatformSetting } from "../models/index.js";
import { dayKey } from "./time.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const MAX_ATTEMPTS = 5;

function classifyEmailError(reason) {
  const text = String(reason || "").toLowerCase();
  if (text.includes("only send testing emails") || text.includes("testing email") || text.includes("verify a domain")) return "testing_mode";
  if (text.includes("from") && (text.includes("verify") || text.includes("domain"))) return "invalid_from";
  return "send_failed";
}

function istDayBounds(now) {
  const start = new Date(`${dayKey(now, "Asia/Kolkata")}T00:00:00+05:30`);
  return { start, end: new Date(start.getTime() + 864e5) };
}

function nextIstDayStart(now) {
  return istDayBounds(new Date(istDayBounds(now).end.getTime())).start;
}

function retryDelay(attempt) {
  return Math.min(24 * 60 * 60_000, 60_000 * 2 ** Math.max(0, attempt - 1));
}

function retryableStatus(status) {
  return status === 429 || status >= 500;
}

function encodedHeader(value) {
  const chunks = [];
  let chunk = "";
  for (const character of String(value ?? "")) {
    if (chunk && Buffer.byteLength(chunk + character, "utf8") > 45) {
      chunks.push(chunk);
      chunk = "";
    }
    chunk += character;
  }
  if (chunk || !chunks.length) chunks.push(chunk);
  return chunks.map((part) => `=?UTF-8?B?${Buffer.from(part, "utf8").toString("base64")}?=`).join("\r\n ");
}

function base64MimeBody(value) {
  const encoded = Buffer.from(String(value ?? ""), "utf8").toString("base64");
  return encoded.match(/.{1,76}/g)?.join("\r\n") || "";
}

const safeHeader = (value) => String(value ?? "").replace(/[\r\n]+/g, " ").trim();

export function buildGmailRaw({ to, subject, html, text, sender, replyTo }) {
  const boundary = `beno-${crypto.randomUUID()}`;
  const headers = [
    `From: ${encodedHeader("Beno Card")} <${safeHeader(sender)}>`,
    `To: ${safeHeader(to)}`,
    `Subject: ${encodedHeader(subject)}`,
    ...(replyTo ? [`Reply-To: ${safeHeader(replyTo)}`] : []),
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  const mime = [
    ...headers,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64MimeBody(text),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64MimeBody(html),
    `--${boundary}--`,
    "",
  ].join("\r\n");
  return Buffer.from(mime, "utf8").toString("base64url");
}

let gmailTokenCache = { credentials: "", accessToken: "", expiresAt: 0 };

async function gmailAccessToken() {
  const credentials = `${env.gmailClientId}\0${env.gmailClientSecret}\0${env.gmailRefreshToken}`;
  if (gmailTokenCache.credentials === credentials && gmailTokenCache.expiresAt > Date.now()) return { accessToken: gmailTokenCache.accessToken };

  let response;
  try {
    response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: env.gmailClientId,
        client_secret: env.gmailClientSecret,
        refresh_token: env.gmailRefreshToken,
      }),
    });
  } catch (e) {
    return { error: { sent: false, reason: "Unable to reach Google OAuth.", code: "send_failed", retryable: true } };
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    const invalidGrant = data.error === "invalid_grant";
    return {
      error: {
        sent: false,
        reason: invalidGrant
          ? "Gmail authorisation expired, generate a new refresh token"
          : `Gmail token request failed: ${data.error_description || data.error || `HTTP ${response.status}`}`,
        code: invalidGrant ? "invalid_grant" : "gmail_auth_failed",
        retryable: retryableStatus(response.status),
      },
    };
  }
  gmailTokenCache = {
    credentials,
    accessToken: data.access_token,
    expiresAt: Date.now() + Math.max(0, Number(data.expires_in || 3600) - 60) * 1000,
  };
  return { accessToken: data.access_token };
}

async function sendWithResend(message) {
  if (!env.resendApiKey) {
    if (!env.isTest) logger.info(`[email:not-sent] to=${message.to} subject="${message.subject}"\n${message.text || ""}`);
    return { sent: false, reason: "not_configured", code: "not_configured", retryable: false };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.emailFrom, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const reason = data?.message || `HTTP ${res.status}`;
      const code = classifyEmailError(reason);
      logger.warn(`[email:send-failed] code=${code} reason=${reason}`);
      return { sent: false, reason, code, retryable: retryableStatus(res.status) };
    }
    return { sent: true, id: data.id };
  } catch (e) {
    logger.warn(`[email:send-failed] code=send_failed reason=${e.message}`);
    return { sent: false, reason: e.message, code: "send_failed", retryable: true };
  }
}

async function sendWithGmail(message) {
  const tokenResult = await gmailAccessToken();
  if (tokenResult.error) return tokenResult.error;
  const settings = await PlatformSetting.findOne({ key: "platform" }).select("supportEmail").lean();
  const raw = buildGmailRaw({
    ...message,
    sender: env.gmailSender,
    replyTo: settings?.supportEmail,
  });
  try {
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenResult.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errorValue = typeof data.error === "string" ? data.error : data.error?.message || data.error?.status;
      const reason = data.error?.message || data.error_description || errorValue || `HTTP ${response.status}`;
      return {
        sent: false,
        reason: `Gmail send failed: ${reason}`,
        code: "gmail_send_failed",
        retryable: retryableStatus(response.status),
      };
    }
    return { sent: true, id: data.id };
  } catch {
    return { sent: false, reason: "Unable to reach Gmail API.", code: "send_failed", retryable: true };
  }
}

async function deliverEmail(message) {
  return env.emailProvider === "gmail" ? sendWithGmail(message) : sendWithResend(message);
}

export async function getEmailMetrics(now = new Date()) {
  const { start, end } = istDayBounds(now);
  const [sentToday, queued, failed] = await Promise.all([
    EmailOutbox.countDocuments({ status: "sent", sentAt: { $gte: start, $lt: end } }),
    EmailOutbox.countDocuments({ status: "queued" }),
    EmailOutbox.countDocuments({ status: "failed" }),
  ]);
  return { provider: env.emailProvider, sentToday, dailyLimit: env.emailDailyLimit, queued, failed };
}

async function saveMessage(message, status, { attempts = 0, lastError = "", sendAfter = new Date(), sentAt = null } = {}) {
  return EmailOutbox.create({
    ...message,
    status,
    attempts,
    lastError: String(lastError).slice(0, 1000),
    sendAfter,
    sentAt,
  });
}

/**
 * Dispatch immediately within the India daily cap; otherwise persist the email
 * in the outbox for the scheduled worker.
 */
export async function sendEmail({ to, subject, html, text, kind = "general", organizationId = null }) {
  const message = { to, subject, html, text, kind, organizationId };
  const metrics = await getEmailMetrics();
  if (metrics.sentToday >= metrics.dailyLimit) {
    const outbox = await saveMessage(message, "queued", { sendAfter: nextIstDayStart(new Date()) });
    return { sent: false, queued: true, reason: "Daily email limit reached.", code: "queued", outboxId: String(outbox._id) };
  }

  const result = await deliverEmail(message);
  if (result.sent) {
    const outbox = await saveMessage(message, "sent", { attempts: 1, sentAt: new Date() });
    return { sent: true, queued: false, id: result.id, outboxId: String(outbox._id) };
  }

  if (result.retryable) {
    const outbox = await saveMessage(message, "queued", {
      attempts: 1,
      lastError: result.reason,
      sendAfter: new Date(Date.now() + retryDelay(1)),
    });
    return { sent: false, queued: true, reason: result.reason, code: result.code, outboxId: String(outbox._id) };
  }

  const outbox = await saveMessage(message, "failed", { attempts: 1, lastError: result.reason });
  return { sent: false, queued: false, reason: result.reason, code: result.code, outboxId: String(outbox._id) };
}

export async function runQueuedEmails(now = new Date()) {
  const { start, end } = istDayBounds(now);
  let sentToday = await EmailOutbox.countDocuments({ status: "sent", sentAt: { $gte: start, $lt: end } });
  let sent = 0;
  let retried = 0;
  let failed = 0;

  while (sentToday < env.emailDailyLimit) {
    const email = await EmailOutbox.findOneAndUpdate(
      { status: "queued", sendAfter: { $lte: now } },
      { $set: { sendAfter: new Date(now.getTime() + 60_000) } },
      { sort: { createdAt: 1, _id: 1 }, returnDocument: "after" }
    ).lean();
    if (!email) break;

    const attempts = email.attempts + 1;
    const result = await deliverEmail(email);
    if (result.sent) {
      await EmailOutbox.updateOne(
        { _id: email._id, status: "queued" },
        { $set: { status: "sent", attempts, lastError: "", sentAt: now } }
      );
      sentToday += 1;
      sent += 1;
    } else if (result.retryable && attempts < MAX_ATTEMPTS) {
      await EmailOutbox.updateOne(
        { _id: email._id, status: "queued" },
        { $set: { attempts, lastError: result.reason, sendAfter: new Date(now.getTime() + retryDelay(attempts)) } }
      );
      retried += 1;
    } else {
      await EmailOutbox.updateOne(
        { _id: email._id, status: "queued" },
        { $set: { status: "failed", attempts, lastError: result.reason } }
      );
      failed += 1;
    }
  }

  const queued = await EmailOutbox.countDocuments({ status: "queued" });
  return { sent, retried, failed, queued, sentToday };
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
