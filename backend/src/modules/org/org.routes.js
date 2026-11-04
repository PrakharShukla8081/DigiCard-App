/**
 * Company Admin API — mounted at /api/org.
 * Every handler works only on req.tenant.organizationId, which comes from the
 * logged-in user's record (never from the request body or query).
 */
import { Router } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import { authenticate, requireRole, tenantContext, requireFeature } from "../../middleware/auth.js";
import { ROLES, FEATURES } from "../../common/constants.js";
import { Employee, Enquiry, AuditLog, User, Subscription, Plan, NotificationLog, Organization, ImportJob, RefreshToken } from "../../models/index.js";
import { parse, assertId, emailSchema, pageParams, escapeRegex } from "../../common/validate.js";
import { badRequest, conflict, forbidden, notFound } from "../../common/errors.js";
import { toCsv } from "../../common/csv.js";
import { effectiveStatus } from "../../services/entitlements.js";
import { orgAnalytics, resolveRange } from "../../services/analytics.js";
import { reminderPreview, runReminders } from "../../services/reminders.js";
import { whatsappConfig } from "../../services/whatsapp.js";
import { issueInvite } from "../../services/invites.js";
import { audit } from "../../services/audit.js";
import { fullName, buildCardPayload, loadCardContent } from "../../services/cards.js";
import { dayKey, addDaysKey } from "../../services/time.js";
import employeesRouter from "./employees.routes.js";
import importRouter from "./import.routes.js";
import { settingsRouter, contentRouter } from "./settings.routes.js";

const router = Router();
router.use(authenticate, requireRole(ROLES.COMPANY_ADMIN), tenantContext());

router.use("/employees", employeesRouter);
router.use("/import", importRouter);
router.use("/settings", settingsRouter);
router.use("/content", contentRouter);

/* ═════════════ Dashboard ═════════════ */
router.get("/dashboard", async (req, res) => {
  const { org, ent } = req.tenant;
  const oid = org._id;
  const [total, active, published, activated, noPhoto] = await Promise.all([
    Employee.countDocuments({ organizationId: oid }),
    Employee.countDocuments({ organizationId: oid, cardStatus: "active" }),
    Employee.countDocuments({ organizationId: oid, isPublished: true }),
    Employee.countDocuments({ organizationId: oid, activatedAt: { $ne: null } }),
    Employee.countDocuments({ organizationId: oid, photoUrl: "" }),
  ]);
  const today = dayKey(new Date(), org.timezone);
  const last30 = await orgAnalytics(oid, { from: addDaysKey(today, -29), to: today });
  const allTime = await orgAnalytics(oid, { from: "2000-01-01", to: today }).catch(() => null);
  const [recentEnquiries, recentActivity, newEnquiries] = await Promise.all([
    Enquiry.find({ organizationId: oid }).sort({ createdAt: -1 }).limit(5).lean(),
    AuditLog.find({ organizationId: oid }).sort({ createdAt: -1 }).limit(10).lean(),
    Enquiry.countDocuments({ organizationId: oid, status: "new" }),
  ]);
  const empIds = recentEnquiries.map((e) => e.employeeId);
  const emps = await Employee.find({ organizationId: oid, _id: { $in: empIds } }).select("firstName lastName").lean();
  const en = Object.fromEntries(emps.map((e) => [String(e._id), fullName(e)]));
  const t = allTime?.totals || last30.totals;
  res.json({
    success: true,
    data: {
      employees: { total, activeCards: active, inactiveCards: total - active, published, unpublished: total - published, activated, noPhoto },
      totals: { views: t.view, unique: t.unique, shares: t.share, qrScans: t.qr_scan, saves: t.vcard_download, enquiries: t.enquiry, calls: t.call_click, whatsapp: t.whatsapp_click },
      last30: { totals: last30.totals, series: last30.series },
      newEnquiries,
      recentEnquiries: recentEnquiries.map((e) => ({ ...e, employeeName: en[String(e.employeeId)] || "—" })),
      recentActivity,
      subscription: { status: ent.status, planName: ent.plan?.name, endDate: ent.endDate, employeeLimit: ent.employeeLimit },
    },
  });
});

/* ═════════════ Card preview base (company branding + content with a sample person) ═════════════ */
router.get("/card-preview", async (req, res) => {
  const { org, ent } = req.tenant;
  const sample = await Employee.findOne({ organizationId: org._id }).sort({ createdAt: 1 }).lean();
  const employee = sample || {
    firstName: "Rahul",
    lastName: "Sharma",
    designation: "Senior Sales Manager",
    department: "Sales",
    workEmail: "rahul.sharma@example.com",
    mobile: "+919876543210",
    whatsapp: "+919876543210",
    bio: "Helping customers find the right solution.",
    location: "Pune, Maharashtra",
    slug: "sample",
    social: {},
  };
  const card = await buildCardPayload({ org, employee, ent, content: await loadCardContent(org._id, ent) });
  res.json({ success: true, data: card });
});

/* ═════════════ Subscription (read-only for company admins) ═════════════ */
router.get("/subscription", async (req, res) => {
  const { org, ent } = req.tenant;
  const used = await Employee.countDocuments({ organizationId: org._id });
  const history = await Subscription.find({ organizationId: org._id }).sort({ createdAt: -1 }).limit(20).lean();
  const plans = await Plan.find({ _id: { $in: history.map((h) => h.planId) } }).select("name").lean();
  const pm = Object.fromEntries(plans.map((p) => [String(p._id), p.name]));
  res.json({
    success: true,
    data: {
      status: ent.status,
      active: ent.active,
      plan: ent.plan ? { name: ent.plan.name, billingCycle: ent.plan.billingCycle, description: ent.plan.description } : null,
      startDate: ent.subscription?.startDate || null,
      endDate: ent.endDate,
      employeeLimit: ent.employeeLimit,
      employeesUsed: used,
      features: Object.entries(FEATURES).map(([key, label]) => ({ key, label, enabled: ent.features[key] })),
      history: history.map((h) => ({ _id: h._id, planName: pm[String(h.planId)] || "—", status: effectiveStatus(h), startDate: h.startDate, endDate: h.endDate })),
    },
  });
});

/* ═════════════ Analytics ═════════════ */
function analyticsRange(req) {
  const { org, ent } = req.tenant;
  const r = resolveRange(req.query, org.timezone);
  const advanced = ent.features.advancedAnalytics;
  if (!advanced && (r.custom || r.days > 30)) throw forbidden("Custom date ranges need Advanced analytics. Contact Beno to upgrade.", "FEATURE_NOT_IN_PLAN");
  if (r.days > 366) throw badRequest("Choose a range of one year or less.");
  return { r, advanced };
}

router.get("/analytics", async (req, res) => {
  const { org } = req.tenant;
  const { r, advanced } = analyticsRange(req);
  let employeeId = null;
  if (req.query.employeeId) {
    if (!advanced) throw forbidden("Per-employee analytics need Advanced analytics.", "FEATURE_NOT_IN_PLAN");
    employeeId = assertId(req.query.employeeId, "employeeId");
    if (!(await Employee.exists({ _id: employeeId, organizationId: org._id }))) throw notFound("Employee not found.");
  }
  const data = await orgAnalytics(org._id, { from: r.from, to: r.to, employeeId, withEmployees: advanced && !employeeId, topN: 50 });
  const prevTo = addDaysKey(r.from, -1);
  const prev = await orgAnalytics(org._id, { from: addDaysKey(prevTo, -(r.days - 1)), to: prevTo, employeeId });
  res.json({ success: true, data: { ...data, previousTotals: prev.totals, advanced, days: r.days } });
});

router.get("/analytics/export.csv", requireFeature("advancedAnalytics", "Analytics export"), async (req, res) => {
  const { org } = req.tenant;
  const { r } = analyticsRange(req);
  const data = await orgAnalytics(org._id, { from: r.from, to: r.to, withEmployees: true, topN: 100000 });
  const csv = toCsv(
    ["Employee ID", "Name", "Designation", "Department", "Views", "Unique visitors", "Shares", "Contact saves", "Call taps", "WhatsApp taps", "Email taps", "QR visits", "Enquiries"],
    data.employees.map((e) => [e.employeeCode, e.name, e.designation, e.department, e.views, e.unique, e.shares, e.saves, e.calls, e.whatsapp, e.emails, e.qr, e.enquiries])
  );
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="analytics-${r.from}-to-${r.to}.csv"`);
  res.send(csv);
});

/* ═════════════ Enquiries ═════════════ */
router.get("/enquiries", async (req, res) => {
  const { org } = req.tenant;
  const { page, limit, skip } = pageParams(req.query);
  const q = { organizationId: org._id };
  if (["new", "contacted", "closed"].includes(req.query.status)) q.status = req.query.status;
  if (req.query.employeeId && mongoose.isValidObjectId(req.query.employeeId)) q.employeeId = req.query.employeeId;
  if (req.query.search) {
    const rx = { $regex: escapeRegex(String(req.query.search).slice(0, 80)), $options: "i" };
    q.$or = [{ name: rx }, { email: rx }, { phone: rx }, { company: rx }];
  }
  const [items, total] = await Promise.all([Enquiry.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(), Enquiry.countDocuments(q)]);
  const emps = await Employee.find({ organizationId: org._id, _id: { $in: items.map((i) => i.employeeId) } }).select("firstName lastName designation").lean();
  const em = Object.fromEntries(emps.map((e) => [String(e._id), e]));
  res.json({ success: true, data: items.map((i) => ({ ...i, employeeName: em[String(i.employeeId)] ? fullName(em[String(i.employeeId)]) : "Deleted employee" })), pagination: { page, limit, total } });
});

router.patch("/enquiries/:id", async (req, res) => {
  assertId(req.params.id);
  const { status } = parse(z.object({ status: z.enum(["new", "contacted", "closed"]) }), req.body);
  const e = await Enquiry.findOneAndUpdate({ _id: req.params.id, organizationId: req.tenant.organizationId }, { status }, { returnDocument: "after" });
  if (!e) throw notFound("Enquiry not found.");
  res.json({ success: true, data: e });
});

router.delete("/enquiries/:id", async (req, res) => {
  assertId(req.params.id);
  const r = await Enquiry.deleteOne({ _id: req.params.id, organizationId: req.tenant.organizationId });
  if (!r.deletedCount) throw notFound("Enquiry not found.");
  audit(req, { action: "enquiry.deleted", entity: "Enquiry", entityId: req.params.id });
  res.json({ success: true });
});

router.get("/enquiries/export.csv", async (req, res) => {
  const { org } = req.tenant;
  const items = await Enquiry.find({ organizationId: org._id }).sort({ createdAt: -1 }).limit(50000).lean();
  const emps = await Employee.find({ organizationId: org._id }).select("firstName lastName").lean();
  const em = Object.fromEntries(emps.map((e) => [String(e._id), fullName(e)]));
  const csv = toCsv(["Date", "Employee", "Name", "Email", "Phone", "Company", "Message", "Status"], items.map((i) => [new Date(i.createdAt).toISOString(), em[String(i.employeeId)] || "", i.name, i.email, i.phone, i.company, i.message, i.status]));
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="enquiries.csv"');
  res.send(csv);
});

/* ═════════════ Reminders ═════════════ */
router.get("/reminders", async (req, res) => {
  const { org, ent } = req.tenant;
  const fresh = await Organization.findById(org._id).select("+whatsapp.accessTokenEnc reminders").lean();
  const [preview, logs, waCfg] = await Promise.all([reminderPreview(org, ent), NotificationLog.find({ organizationId: org._id }).sort({ createdAt: -1 }).limit(50).lean(), whatsappConfig(org._id)]);
  const emps = await Employee.find({ organizationId: org._id, _id: { $in: logs.map((l) => l.employeeId).filter(Boolean) } }).select("firstName lastName").lean();
  const em = Object.fromEntries(emps.map((e) => [String(e._id), fullName(e)]));
  res.json({
    success: true,
    data: {
      settings: fresh.reminders,
      whatsapp: { useOwn: fresh.whatsapp?.useOwn, phoneNumberId: fresh.whatsapp?.phoneNumberId, templateName: fresh.whatsapp?.templateName, templateLang: fresh.whatsapp?.templateLang, hasToken: Boolean(fresh.whatsapp?.accessTokenEnc), configured: Boolean(waCfg), source: waCfg?.source || null },
      emailConfigured: Boolean(process.env.RESEND_API_KEY),
      features: { email: ent.features.emailReminders, whatsapp: ent.features.whatsappReminders },
      preview,
      logs: logs.map((l) => ({ ...l, employeeName: l.employeeId ? em[String(l.employeeId)] || "—" : "" })),
    },
  });
});

router.put("/reminders", async (req, res) => {
  const { ent } = req.tenant;
  const b = parse(
    z.object({
      enabled: z.boolean(),
      channels: z.object({ email: z.boolean(), whatsapp: z.boolean() }),
      criteria: z.object({ notActivated: z.boolean(), noPhoto: z.boolean(), inactiveDays: z.coerce.number().int().min(0).max(365) }),
      schedule: z.object({ dayOfWeek: z.coerce.number().int().min(0).max(6), hour: z.coerce.number().int().min(0).max(23) }),
      minDaysBetween: z.coerce.number().int().min(1).max(90),
    }),
    req.body
  );
  if (b.channels.email && !ent.features.emailReminders) throw forbidden("Email reminders are not in your plan.", "FEATURE_NOT_IN_PLAN");
  if (b.channels.whatsapp && !ent.features.whatsappReminders) throw forbidden("WhatsApp reminders are not in your plan.", "FEATURE_NOT_IN_PLAN");
  const org = await Organization.findById(req.tenant.organizationId);
  Object.assign(org.reminders, b);
  await org.save();
  audit(req, { action: "reminders.updated", entity: "Organization", entityId: org._id, summary: b.enabled ? "enabled" : "disabled" });
  res.json({ success: true, data: org.reminders });
});

router.post("/reminders/run", async (req, res) => {
  const { ent } = req.tenant;
  if (!ent.features.emailReminders && !ent.features.whatsappReminders) throw forbidden("Reminders are not in your plan.", "FEATURE_NOT_IN_PLAN");
  const summary = await runReminders(req.tenant.organizationId, { trigger: "manual" });
  audit(req, { action: "reminders.run", entity: "Organization", summary: JSON.stringify(summary).slice(0, 300) });
  res.json({ success: true, data: summary });
});

/* ═════════════ Team (company admins) ═════════════ */
router.get("/team", async (req, res) => {
  const list = await User.find({ organizationId: req.tenant.organizationId, role: ROLES.COMPANY_ADMIN }).select("name email status lastLoginAt invitedAt createdAt").lean();
  res.json({ success: true, data: list });
});

router.post("/team", async (req, res) => {
  const b = parse(z.object({ name: z.string().trim().min(2).max(120), email: emailSchema }), req.body);
  if (await User.exists({ email: b.email })) throw conflict("A user with this email already exists.");
  const u = new User({ name: b.name, email: b.email, role: ROLES.COMPANY_ADMIN, organizationId: req.tenant.organizationId, status: "invited" });
  const invite = await issueInvite(u, req.tenant.org.name);
  audit(req, { action: "team.admin_invited", entity: "User", entityId: u._id, summary: u.email });
  res.status(201).json({ success: true, data: { user: { _id: u._id, name: u.name, email: u.email, status: u.status }, invite } });
});

router.post("/team/:id/resend-invite", async (req, res) => {
  assertId(req.params.id);
  const u = await User.findOne({ _id: req.params.id, organizationId: req.tenant.organizationId, role: ROLES.COMPANY_ADMIN });
  if (!u) throw notFound("User not found.");
  if (u.status === "active") throw badRequest("This admin has already set up their account.");
  const invite = await issueInvite(u, req.tenant.org.name);
  res.json({ success: true, data: { invite } });
});

router.patch("/team/:id", async (req, res) => {
  assertId(req.params.id);
  const b = parse(z.object({ name: z.string().trim().min(2).max(120).optional(), email: emailSchema.optional() }).refine((v) => v.name !== undefined || v.email !== undefined, "Provide a name or email to update."), req.body);
  const u = await User.findOne({ _id: req.params.id, organizationId: req.tenant.organizationId, role: ROLES.COMPANY_ADMIN });
  if (!u) throw notFound("User not found.");
  const emailChanged = b.email !== undefined && b.email !== u.email;
  if (emailChanged) {
    if (u.status !== "invited") throw badRequest("Email can only be changed before the invite is accepted.");
    if (await User.exists({ email: b.email, _id: { $ne: u._id } })) throw conflict("A user with this email already exists.");
    u.email = b.email;
  }
  if (b.name !== undefined) u.name = b.name;
  await u.save();
  const invite = emailChanged ? await issueInvite(u, req.tenant.org.name) : null;
  audit(req, { action: "team.admin_updated", entity: "User", entityId: u._id, summary: u.email });
  res.json({ success: true, data: { user: { _id: u._id, name: u.name, email: u.email, status: u.status }, invite } });
});

router.delete("/team/:id", async (req, res) => {
  assertId(req.params.id);
  const u = await User.findOne({ _id: req.params.id, organizationId: req.tenant.organizationId, role: ROLES.COMPANY_ADMIN });
  if (!u) throw notFound("User not found.");
  if (String(u._id) === String(req.auth.userId)) throw badRequest("You cannot delete yourself.");
  if (u.status !== "invited") throw badRequest("Only invited admins can be deleted. Disable active admins instead.");
  await RefreshToken.deleteMany({ userId: u._id });
  await User.deleteOne({ _id: u._id });
  audit(req, { action: "team.admin_deleted", entity: "User", entityId: u._id, summary: u.email });
  res.json({ success: true, message: "Invited admin removed." });
});

router.patch("/team/:id/status", async (req, res) => {
  assertId(req.params.id);
  const { status } = parse(z.object({ status: z.enum(["active", "disabled"]) }), req.body);
  if (String(req.params.id) === String(req.auth.userId)) throw badRequest("You cannot change your own status.");
  const u = await User.findOne({ _id: req.params.id, organizationId: req.tenant.organizationId, role: ROLES.COMPANY_ADMIN }).select("+passwordHash");
  if (!u) throw notFound("User not found.");
  if (status === "active" && !u.passwordHash) throw badRequest("This admin has not accepted the invite yet.");
  u.status = status;
  if (status === "disabled") {
    u.tokenVersion += 1;
    await RefreshToken.updateMany({ userId: u._id, revokedAt: null }, { revokedAt: new Date() });
  }
  await u.save();
  audit(req, { action: `team.admin_${status}`, entity: "User", entityId: u._id, summary: u.email });
  res.json({ success: true, data: { _id: u._id, status: u.status } });
});

/* ═════════════ Audit log ═════════════ */
router.get("/audit-logs", async (req, res) => {
  const { page, limit, skip } = pageParams(req.query);
  const q = { organizationId: req.tenant.organizationId };
  const [items, total] = await Promise.all([AuditLog.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(), AuditLog.countDocuments(q)]);
  res.json({ success: true, data: items, pagination: { page, limit, total } });
});

export default router;
export { ImportJob };
