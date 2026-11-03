/**
 * Lightweight in-process scheduler (no extra dependency).
 *  - every 10 minutes: run due reminder schedules
 *  - every hour: mark ended subscriptions as expired + warn admins before expiry
 *
 * Run only ONE API instance with JOBS_ENABLED=true when you scale horizontally.
 */
import { Organization, Subscription, User } from "../models/index.js";
import { getPlatformSettings } from "../models/index.js";
import { ROLES } from "../common/constants.js";
import { localParts } from "../services/time.js";
import { runReminders } from "../services/reminders.js";
import { sendEmail, templates } from "../services/email.js";
import { logger } from "../common/logger.js";

let running = false;

export async function runDueReminders(now = new Date()) {
  const orgs = await Organization.find({ status: "active", "reminders.enabled": true }).select("timezone reminders").lean();
  const results = [];
  for (const o of orgs) {
    const { dayOfWeek, hour } = localParts(now, o.timezone || "Asia/Kolkata");
    const s = o.reminders.schedule || {};
    const last = o.reminders.lastRunAt ? new Date(o.reminders.lastRunAt) : null;
    const ranRecently = last && now - last < 20 * 3600e3;
    if (dayOfWeek === s.dayOfWeek && hour === s.hour && !ranRecently) {
      try {
        results.push({ org: o._id, ...(await runReminders(o._id, { trigger: "schedule" })) });
      } catch (e) {
        logger.error("reminder run failed", e);
      }
    }
  }
  return results;
}

export async function runSubscriptionJobs(now = new Date()) {
  const SKIP = { skipTenantGuard: true };
  const expired = await Subscription.updateMany({ isCurrent: true, status: { $in: ["active", "trial"] }, endDate: { $lt: now } }, { $set: { status: "expired" } }).setOptions(SKIP);
  const settings = await getPlatformSettings();
  const warnBefore = new Date(now.getTime() + (settings.expiryReminderDays || 7) * 864e5);
  const soon = await Subscription.find({ isCurrent: true, status: { $in: ["active", "trial"] }, endDate: { $gte: now, $lte: warnBefore }, expiryNotifiedAt: null }).setOptions(SKIP).lean();
  for (const s of soon) {
    const org = await Organization.findById(s.organizationId).select("name").lean();
    const admins = await User.find({ organizationId: s.organizationId, role: ROLES.COMPANY_ADMIN, status: "active" }).select("email").lean();
    const days = Math.max(1, Math.ceil((new Date(s.endDate) - now) / 864e5));
    for (const a of admins) await sendEmail({ to: a.email, ...templates.expiry({ orgName: org?.name || "", endDate: s.endDate, days }) });
    await Subscription.updateOne({ _id: s._id, organizationId: s.organizationId }, { expiryNotifiedAt: now });
  }
  return { expired: expired.modifiedCount, warned: soon.length };
}

export function startScheduler() {
  const tick = async (fn, label) => {
    if (running) return;
    running = true;
    try {
      await fn();
    } catch (e) {
      logger.error(`${label} job failed`, e);
    } finally {
      running = false;
    }
  };
  setTimeout(() => tick(runSubscriptionJobs, "subscription"), 15_000).unref();
  setInterval(() => tick(runDueReminders, "reminder"), 10 * 60_000).unref();
  setInterval(() => tick(runSubscriptionJobs, "subscription"), 60 * 60_000).unref();
  logger.info("Background jobs started (reminders every 10 min, subscriptions hourly)");
}
