import { env } from "../config/env.js";
import { randomToken, sha256 } from "../common/crypto.js";
import { sendEmail, templates } from "./email.js";

/**
 * Generate a fresh 7-day invite token for a user document, save it, and (by
 * default) email it. The link is also returned so an admin can share it
 * manually when email is not configured.
 */
export async function issueInvite(userDoc, orgName, { send = true } = {}) {
  const raw = randomToken(32);
  userDoc.inviteTokenHash = sha256(raw);
  userDoc.inviteExpires = new Date(Date.now() + 7 * 864e5);
  userDoc.invitedAt = new Date();
  if (userDoc.status !== "active") userDoc.status = "invited";
  await userDoc.save();
  const link = `${env.frontendUrl}/accept-invite?token=${encodeURIComponent(raw)}`;
  if (!send) return { link, emailSent: false, emailError: null };
  const t = templates.invite({ name: userDoc.name, orgName: orgName || "Beno Digital Card", role: userDoc.role, link });
  const mail = await sendEmail({ to: userDoc.email, ...t });
  return { link, emailSent: mail.sent, emailError: mail.sent ? null : mail.reason };
}
