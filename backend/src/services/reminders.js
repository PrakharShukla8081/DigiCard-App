import crypto from "node:crypto";
import { env } from "../config/env.js";
import { Employee, Organization, User, NotificationLog } from "../models/index.js";
import { ROLES } from "../common/constants.js";
import { getEntitlements } from "./entitlements.js";
import { sendEmail, templates } from "./email.js";
import { whatsappConfig, sendWhatsAppTemplate } from "./whatsapp.js";
import { issueInvite } from "./invites.js";
import { cardUrl, fullName } from "./cards.js";
import { logger } from "../common/logger.js";

/** Build the employee query + a function that explains why each employee matched. */
export function reminderCriteria(org, ent, now = new Date()) {
  const r = org.reminders || {};
  const c = r.criteria || {};
  const loginOn = ent.features.employeeLogin && org.cardSettings?.allowEmployeeLogin;
  const or = [];
  if (c.notActivated && loginOn) or.push({ activatedAt: null });
  if (c.noPhoto) or.push({ photoUrl: "" });
  let cutoff = null;
  if (c.inactiveDays > 0) {
    cutoff = new Date(now.getTime() - c.inactiveDays * 864e5);
    // Only employees who have had their card for at least `inactiveDays` days
    or.push({ createdAt: { $lt: cutoff }, $or: [{ lastEngagementAt: null }, { lastEngagementAt: { $lt: cutoff } }] });
  }
  const minGap = new Date(now.getTime() - (r.minDaysBetween || 7) * 864e5);
  const query = or.length
    ? { organizationId: org._id, cardStatus: "active", isPublished: true, $and: [{ $or: or }, { $or: [{ lastReminderAt: null }, { lastReminderAt: { $lt: minGap } }] }] }
    : null;
  const reasonsFor = (e) => {
    const out = [];
    if (c.notActivated && loginOn && !e.activatedAt) out.push("Log in once to activate your card and check your details");
    if (c.noPhoto && !e.photoUrl) out.push("Add a profile photo so customers recognise you");
    if (cutoff && e.createdAt < cutoff && (!e.lastEngagementAt || e.lastEngagementAt < cutoff)) out.push(`Your card had no views or shares in the last ${c.inactiveDays} days — share it with your customers`);
    return out;
  };
  return { query, reasonsFor, loginOn };
}

/** Counts per criterion for the admin screen (no messages sent). */
export async function reminderPreview(org, ent) {
  const { query, loginOn } = reminderCriteria(org, ent);
  const base = { organizationId: org._id, cardStatus: "active", isPublished: true };
  const c = org.reminders?.criteria || {};
  const cutoff = new Date(Date.now() - (c.inactiveDays || 30) * 864e5);
  const [notActivated, noPhoto, inactive, eligible] = await Promise.all([
    loginOn ? Employee.countDocuments({ ...base, activatedAt: null }) : 0,
    Employee.countDocuments({ ...base, photoUrl: "" }),
    Employee.countDocuments({ ...base, createdAt: { $lt: cutoff }, $or: [{ lastEngagementAt: null }, { lastEngagementAt: { $lt: cutoff } }] }),
    query ? Employee.countDocuments(query) : 0,
  ]);
  return { notActivated, noPhoto, inactive, eligibleNow: eligible, loginEnabled: Boolean(loginOn) };
}

/**
 * Send reminders for one organization. Returns a summary.
 * Each employee gets at most one message per channel per run, and never more
 * often than `minDaysBetween` days.
 */
export async function runReminders(orgId, { trigger = "schedule" } = {}) {
  const org = await Organization.findById(orgId).lean();
  if (!org || org.status !== "active") return { skipped: "organization inactive" };
  const ent = await getEntitlements(org._id);
  if (!ent.active) return { skipped: "subscription inactive" };
  const r = org.reminders || {};
  const useEmail = r.channels?.email && ent.features.emailReminders;
  const useWa = r.channels?.whatsapp && ent.features.whatsappReminders;
  if (!useEmail && !useWa) return { skipped: "no reminder channel is enabled in the plan/settings" };

  const { query, reasonsFor, loginOn } = reminderCriteria(org, ent);
  if (!query) return { skipped: "no criteria selected" };
  const waCfg = useWa ? await whatsappConfig(org._id) : null;
  const runId = crypto.randomBytes(6).toString("hex");
  const summary = { runId, trigger, matched: 0, email: { sent: 0, failed: 0, skipped: 0 }, whatsapp: { sent: 0, failed: 0, skipped: 0 } };
  const logs = [];

  const cursor = Employee.find(query).limit(20000).cursor();
  for await (const e of cursor) {
    const reasons = reasonsFor(e);
    if (!reasons.length) continue;
    summary.matched++;
    const url = cardUrl(org.slug, e.slug);
    let loginUrl = null;

    if (loginOn && e.workEmail) {
      try {
        let user = e.userId ? await User.findOne({ _id: e.userId, organizationId: org._id }) : null;
        if (!user && !(await User.exists({ email: e.workEmail }))) {
          user = new User({ name: fullName(e), email: e.workEmail, role: ROLES.EMPLOYEE, organizationId: org._id, employeeId: e._id, status: "invited" });
        }
        if (user && user.status === "invited") {
          loginUrl = (await issueInvite(user, org.name, { send: false })).link;
          if (!e.userId) await Employee.updateOne({ _id: e._id, organizationId: org._id }, { userId: user._id });
        } else if (user && user.status === "active") {
          loginUrl = `${env.frontendUrl}/login`;
        }
      } catch (err) {
        logger.warn("reminder invite failed", err.message);
      }
    }

    let delivered = false;
    if (useEmail) {
      if (!e.workEmail) {
        summary.email.skipped++;
        logs.push({ organizationId: org._id, employeeId: e._id, channel: "email", status: "skipped", reason: "No work email", runId });
      } else {
        const t = templates.reminder({ name: e.firstName, orgName: org.name, cardUrl: url, reasons, loginUrl });
        const m = await sendEmail({ to: e.workEmail, ...t });
        const st = m.sent ? "sent" : m.reason === "not_configured" ? "skipped" : "failed";
        summary.email[st]++;
        if (m.sent) delivered = true;
        logs.push({ organizationId: org._id, employeeId: e._id, channel: "email", to: e.workEmail, status: st, reason: m.sent ? "" : m.reason === "not_configured" ? "Email is not configured on the server" : m.reason, providerId: m.id || "", runId });
      }
    }
    if (useWa) {
      const to = e.whatsapp || e.mobile;
      if (!waCfg) {
        summary.whatsapp.skipped++;
        logs.push({ organizationId: org._id, employeeId: e._id, channel: "whatsapp", status: "skipped", reason: "WhatsApp is not configured", runId });
      } else if (!to) {
        summary.whatsapp.skipped++;
        logs.push({ organizationId: org._id, employeeId: e._id, channel: "whatsapp", status: "skipped", reason: "No WhatsApp number", runId });
      } else {
        const w = await sendWhatsAppTemplate(waCfg, to, [e.firstName, url]);
        const st = w.sent ? "sent" : "failed";
        summary.whatsapp[st]++;
        if (w.sent) delivered = true;
        logs.push({ organizationId: org._id, employeeId: e._id, channel: "whatsapp", to, status: st, reason: w.sent ? "" : w.reason, providerId: w.id || "", runId });
      }
    }
    if (delivered) await Employee.updateOne({ _id: e._id, organizationId: org._id }, { lastReminderAt: new Date() });
    if (logs.length >= 500) await NotificationLog.insertMany(logs.splice(0));
  }
  if (logs.length) await NotificationLog.insertMany(logs);
  await Organization.updateOne({ _id: org._id }, { "reminders.lastRunAt": new Date() });
  return summary;
}
