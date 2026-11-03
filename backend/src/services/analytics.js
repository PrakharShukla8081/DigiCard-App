import mongoose from "mongoose";
import { AnalyticsEvent, DailyStat, Employee } from "../models/index.js";
import { EVENT_TYPES } from "../common/constants.js";
import { dayKey, addDaysKey, dayRange } from "./time.js";
import { groupSum } from "./agg.js";

const STAT_FIELD = { view: "views", share: "shares", vcard_download: "saves", enquiry: "enquiries" };

/**
 * Record one measurable event. We only count what the app can genuinely see:
 * a "whatsapp_click" means the button was tapped — not that a chat happened.
 */
export async function trackEvent({ org, employee, type, source = "direct", visitor = "", meta = "" }) {
  const organizationId = org._id;
  const employeeId = employee._id;
  const day = dayKey(new Date(), org.timezone);
  const inc = { [`counts.${type}`]: 1 };

  if (type === "view") {
    if (visitor) {
      const seen = await AnalyticsEvent.exists({ organizationId, employeeId, day, type: "view", visitor });
      if (!seen) inc["counts.unique"] = 1;
    }
    if (source === "qr") inc["counts.qr_scan"] = 1;
  }

  await AnalyticsEvent.create({ organizationId, employeeId, type, source, visitor, day, meta: String(meta).slice(0, 40) });
  await DailyStat.updateOne({ organizationId, employeeId, day }, { $inc: inc }, { upsert: true });

  const empInc = STAT_FIELD[type] ? { [`stats.${STAT_FIELD[type]}`]: 1 } : null;
  const set = ["view", "share", "vcard_download", "enquiry"].includes(type) ? { lastEngagementAt: new Date() } : {};
  if (empInc || Object.keys(set).length) {
    await Employee.updateOne({ _id: employeeId, organizationId }, { ...(empInc ? { $inc: empInc } : {}), ...(Object.keys(set).length ? { $set: set } : {}) });
  }
}

/** Resolve a date range from query params: preset (today|7d|30d|90d) or from/to (YYYY-MM-DD). */
export function resolveRange(q, tz) {
  const today = dayKey(new Date(), tz);
  const isKey = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (isKey(q.from) && isKey(q.to) && q.from <= q.to) {
    const days = dayRange(q.from, q.to).length;
    return { from: q.from, to: q.to, days, custom: true };
  }
  const presets = { today: 1, "7d": 7, "30d": 30, "90d": 90 };
  const n = presets[q.range] || 30;
  return { from: addDaysKey(today, -(n - 1)), to: today, days: n, custom: false, preset: q.range || "30d" };
}

const sumFields = Object.fromEntries(["unique", ...EVENT_TYPES].map((k) => [k, `$counts.${k}`]));

/** Totals + daily series (+ optional per-employee leaderboard) for an organization. */
export async function orgAnalytics(organizationId, { from, to, employeeId, withEmployees = false, topN = 10 }) {
  const match = { organizationId: new mongoose.Types.ObjectId(String(organizationId)), day: { $gte: from, $lte: to } };
  if (employeeId) match.employeeId = new mongoose.Types.ObjectId(String(employeeId));

  const [series, perEmp] = await Promise.all([
    groupSum(DailyStat, [{ $match: match }], "$day", sumFields, null, { _id: 1 }),
    withEmployees ? groupSum(DailyStat, [{ $match: match }], "$employeeId", sumFields) : [],
  ]);

  const zero = Object.fromEntries(["unique", ...EVENT_TYPES].map((k) => [k, 0]));
  const byDay = Object.fromEntries(series.map((d) => [d._id, d]));
  const days = dayRange(from, to).map((day) => {
    const d = byDay[day] || zero;
    return { day, views: d.view || 0, unique: d.unique || 0, shares: d.share || 0, saves: d.vcard_download || 0, enquiries: d.enquiry || 0, qr: d.qr_scan || 0 };
  });
  const totals = { ...zero };
  for (const d of series) for (const k of Object.keys(zero)) totals[k] += d[k] || 0;

  let employees = [];
  if (withEmployees && perEmp.length) {
    const ids = perEmp.map((p) => p._id);
    const emps = await Employee.find({ organizationId: match.organizationId, _id: { $in: ids } }).select("firstName lastName designation department employeeCode slug photoUrl").lean();
    const em = Object.fromEntries(emps.map((e) => [String(e._id), e]));
    employees = perEmp
      .filter((p) => em[String(p._id)])
      .map((p) => {
        const e = em[String(p._id)];
        return {
          employeeId: p._id,
          name: [e.firstName, e.lastName].filter(Boolean).join(" "),
          designation: e.designation,
          department: e.department,
          employeeCode: e.employeeCode,
          photoUrl: e.photoUrl,
          views: p.view || 0,
          unique: p.unique || 0,
          shares: p.share || 0,
          saves: p.vcard_download || 0,
          calls: p.call_click || 0,
          whatsapp: p.whatsapp_click || 0,
          emails: p.email_click || 0,
          enquiries: p.enquiry || 0,
          qr: p.qr_scan || 0,
          score: (p.share || 0) * 3 + (p.vcard_download || 0) * 2 + (p.view || 0) + (p.enquiry || 0) * 5,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);
  }
  return { range: { from, to }, totals, series: days, employees };
}
