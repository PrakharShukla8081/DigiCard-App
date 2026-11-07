/**
 * Super Admin (Beno internal) API — mounted at /api/platform.
 * Only role super_admin reaches these handlers. Cross-tenant reads opt out of the
 * tenant guard explicitly with { skipTenantGuard: true }.
 */
import { Router } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import { authenticate, requireRole } from "../../middleware/auth.js";
import { ROLES, FEATURE_KEYS, FEATURES, SUBSCRIPTION_STATUSES, BILLING_CYCLES } from "../../common/constants.js";
import {
  Plan,
  Organization,
  Subscription,
  User,
  Employee,
  DailyStat,
  AuditLog,
  RefreshToken,
  PlatformSetting,
  getPlatformSettings,
} from "../../models/index.js";
import { parse, objectId, assertId, emailSchema, optStr, urlish, phoneSchema, pageParams, escapeRegex } from "../../common/validate.js";
import { badRequest, conflict, notFound } from "../../common/errors.js";
import { slugify, uniqueSlug } from "../../common/slug.js";
import { effectiveStatus } from "../../services/entitlements.js";
import { issueInvite } from "../../services/invites.js";
import { audit } from "../../services/audit.js";
import { dayKey, addDaysKey } from "../../services/time.js";
import { groupSum } from "../../services/agg.js";

const router = Router();
router.use(authenticate, requireRole(ROLES.SUPER_ADMIN));

const SKIP = { skipTenantGuard: true };
const oid = (v) => new mongoose.Types.ObjectId(String(v));

/* ═════════════ Meta ═════════════ */
router.get("/meta", (_req, res) => {
  res.json({ success: true, data: { features: FEATURES, statuses: SUBSCRIPTION_STATUSES, billingCycles: BILLING_CYCLES } });
});

/* ═════════════ Dashboard ═════════════ */
router.get("/dashboard", async (_req, res) => {
  const now = new Date();
  const in30 = new Date(Date.now() + 30 * 864e5);
  const [orgTotal, orgActive, employees, cardsActive, cardsPublished, subs, recentOrgs] = await Promise.all([
    Organization.countDocuments({}),
    Organization.countDocuments({ status: "active" }),
    Employee.countDocuments({}).setOptions(SKIP),
    Employee.countDocuments({ cardStatus: "active" }).setOptions(SKIP),
    Employee.countDocuments({ cardStatus: "active", isPublished: true }).setOptions(SKIP),
    Subscription.find({ isCurrent: true }).setOptions(SKIP).lean(),
    Organization.find({}).sort({ createdAt: -1 }).limit(5).select("name slug status createdAt").lean(),
  ]);

  const byStatus = Object.fromEntries(SUBSCRIPTION_STATUSES.map((s) => [s, 0]));
  const expiring = [];
  for (const s of subs) {
    const st = effectiveStatus(s, now);
    byStatus[st] = (byStatus[st] || 0) + 1;
    if ((st === "active" || st === "trial") && new Date(s.endDate) <= in30) expiring.push(s);
  }
  const expOrgs = await Organization.find({ _id: { $in: expiring.map((s) => s.organizationId) } }).select("name").lean();
  const nameOf = Object.fromEntries(expOrgs.map((o) => [String(o._id), o.name]));

  const from = addDaysKey(dayKey(now), -29);
  const series = await groupSum(
    DailyStat,
    [{ $match: { day: { $gte: from } } }],
    "$day",
    { views: "$counts.view", saves: "$counts.vcard_download", shares: "$counts.share", enquiries: "$counts.enquiry" },
    SKIP,
    { _id: 1 }
  );
  const totals = series.reduce((a, d) => ({ views: a.views + d.views, saves: a.saves + d.saves, shares: a.shares + d.shares, enquiries: a.enquiries + d.enquiries }), { views: 0, saves: 0, shares: 0, enquiries: 0 });

  const topOrgsRaw = await Employee.aggregate([{ $group: { _id: "$organizationId", employees: { $sum: 1 } } }, { $sort: { employees: -1 } }, { $limit: 5 }]).option(SKIP);
  const topNames = await Organization.find({ _id: { $in: topOrgsRaw.map((t) => t._id) } }).select("name").lean();
  const tn = Object.fromEntries(topNames.map((o) => [String(o._id), o.name]));

  res.json({
    success: true,
    data: {
      organizations: { total: orgTotal, active: orgActive, inactive: orgTotal - orgActive },
      employees: { total: employees },
      cards: { active: cardsActive, inactive: employees - cardsActive, published: cardsPublished, unpublished: employees - cardsPublished },
      subscriptions: byStatus,
      expiringSoon: expiring
        .sort((a, b) => new Date(a.endDate) - new Date(b.endDate))
        .slice(0, 10)
        .map((s) => ({ organizationId: s.organizationId, organizationName: nameOf[String(s.organizationId)] || "—", endDate: s.endDate, status: effectiveStatus(s, now) })),
      engagement: { from, totals, series: series.map((d) => ({ day: d._id, views: d.views, saves: d.saves, shares: d.shares })) },
      topOrganizations: topOrgsRaw.map((t) => ({ organizationId: t._id, name: tn[String(t._id)] || "—", employees: t.employees })),
      recentOrganizations: recentOrgs,
    },
  });
});

/* ═════════════ Plans ═════════════ */
const featuresSchema = z.object(Object.fromEntries(FEATURE_KEYS.map((k) => [k, z.boolean().optional()]))).partial();
const websiteFeatureGroup = z.object({ title: z.string().trim().min(1).max(40), items: z.array(z.string().trim().min(1).max(120)).max(10) });
const websiteSchema = z.object({
  showOnWebsite: z.boolean().optional(),
  group: z.string().trim().max(40).optional(),
  groupSubtitle: z.string().trim().max(80).optional(),
  userRangeLabel: z.string().trim().max(30).optional(),
  description: z.string().trim().max(200).optional(),
  badge: z.string().trim().max(24).optional(),
  featured: z.boolean().optional(),
  priceMode: z.enum(["price", "per_user", "custom"]).optional(),
  showMonthlyEquivalent: z.boolean().optional(),
  monthlyPrice: z.coerce.number().int().min(0).optional(),
  freeLabel: z.string().trim().max(20).optional(),
  priceSuffix: z.string().trim().max(30).optional(),
  priceNote: z.string().trim().max(80).optional(),
  ctaType: z.enum(["trial", "demo", "contact_sales"]).optional(),
  ctaLabel: z.string().trim().max(30).optional(),
  ctaNote: z.string().trim().max(60).optional(),
  inheritsLabel: z.string().trim().max(60).optional(),
  featureGroups: z.array(websiteFeatureGroup).max(6).optional(),
}).optional();
const planBody = z.object({
  name: z.string().trim().min(2).max(80),
  code: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/, "Use 2-40 lowercase letters, numbers or dashes").optional(),
  description: optStr(500),
  price: z.coerce.number().min(0).max(1e9),
  currency: z.enum(["INR", "USD"]).optional(),
  billingCycle: z.enum(BILLING_CYCLES),
  durationDays: z.coerce.number().int().min(1).max(3650),
  employeeLimit: z.union([z.coerce.number().int().min(1).max(1_000_000), z.null()]).optional(),
  features: featuresSchema.optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.coerce.number().int().optional(),
  website: websiteSchema,
});

function validatePlanPricing(plan) {
  const website = plan.website || {};
  if (website.showMonthlyEquivalent && ["price", "per_user"].includes(website.priceMode || "price") && plan.price % 12 !== 0) {
    throw badRequest("Yearly price must divide evenly by 12 so the monthly price is a whole number.");
  }
  if (plan.currency === "USD" && !Number.isInteger(plan.price)) throw badRequest("USD prices must be whole dollars.");
  if (website.monthlyPrice !== undefined && plan.currency === "USD" && !Number.isInteger(website.monthlyPrice)) throw badRequest("USD monthly prices must be whole dollars.");
  if (website.monthlyPrice !== undefined && website.showMonthlyEquivalent && website.monthlyPrice < plan.price / 12) {
    throw badRequest("Monthly price cannot be lower than the yearly equivalent.");
  }
}

router.get("/plans", async (_req, res) => {
  const plans = await Plan.find({}).sort({ sortOrder: 1, createdAt: 1 }).lean();
  const counts = await Subscription.aggregate([{ $match: { isCurrent: true } }, { $group: { _id: "$planId", n: { $sum: 1 } } }]).option(SKIP);
  const c = Object.fromEntries(counts.map((x) => [String(x._id), x.n]));
  res.json({ success: true, data: plans.map((p) => ({ ...p, organizations: c[String(p._id)] || 0 })) });
});

router.post("/plans", async (req, res) => {
  const b = parse(planBody, req.body);
  validatePlanPricing(b);
  const code = b.code || slugify(b.name, 40);
  if (await Plan.exists({ code })) throw conflict(`A plan with code "${code}" already exists.`);
  const sortOrder = b.sortOrder ?? (((await Plan.findOne({}).sort({ sortOrder: -1 }).select("sortOrder").lean())?.sortOrder || 0) + 10);
  const plan = await Plan.create({ ...b, code, sortOrder });
  audit(req, { action: "plan.created", entity: "Plan", entityId: plan._id, summary: plan.name, organizationId: null });
  res.status(201).json({ success: true, data: plan });
});

router.patch("/plans/:id", async (req, res) => {
  assertId(req.params.id);
  const b = parse(planBody.partial(), req.body);
  const plan = await Plan.findById(req.params.id);
  if (!plan) throw notFound("Plan not found.");
  if (b.code && b.code !== plan.code && (await Plan.exists({ code: b.code }))) throw conflict(`A plan with code "${b.code}" already exists.`);
  validatePlanPricing({ ...plan.toObject(), ...b, website: { ...(plan.website?.toObject?.() || plan.website || {}), ...(b.website || {}) } });
  const { features, website, ...rest } = b;
  Object.assign(plan, rest);
  if (features) for (const [k, v] of Object.entries(features)) if (typeof v === "boolean") plan.features[k] = v;
  if (website) Object.assign(plan.website, website);
  await plan.save();
  audit(req, { action: "plan.updated", entity: "Plan", entityId: plan._id, summary: plan.name, organizationId: null });
  res.json({ success: true, data: plan });
});

router.delete("/plans/:id", async (req, res) => {
  assertId(req.params.id);
  const used = await Subscription.exists({ planId: req.params.id }).setOptions(SKIP);
  const plan = await Plan.findById(req.params.id).select("isBuiltIn");
  if (plan?.isBuiltIn) throw badRequest("Built-in plans cannot be deleted. Hide it from the website or deactivate it instead.");
  if (used) {
    await Plan.updateOne({ _id: req.params.id }, { isActive: false });
    return res.json({ success: true, message: "This plan is used by subscriptions, so it was deactivated instead of deleted." });
  }
  await Plan.deleteOne({ _id: req.params.id });
  audit(req, { action: "plan.deleted", entity: "Plan", entityId: req.params.id, organizationId: null });
  res.json({ success: true, message: "Plan deleted." });
});

/* ═════════════ Organizations ═════════════ */
const contactSchema = z
  .object({ email: z.union([emailSchema, z.literal("")]).optional(), phone: phoneSchema, website: urlish, address: optStr(400), gstin: optStr(20) })
  .partial();

const subAssignSchema = z.object({
  planId: objectId,
  status: z.enum(["trial", "active", "suspended", "cancelled", "expired"]).default("active"),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  employeeLimitOverride: z.union([z.coerce.number().int().min(1), z.null()]).optional(),
  featureOverrides: featuresSchema.optional(),
  priceOverride: z.union([z.coerce.number().min(0), z.null()]).optional(),
  notes: optStr(1000),
  paymentReference: optStr(120),
});

async function createSubscription(orgId, b, actorId) {
  const plan = await Plan.findById(b.planId).lean();
  if (!plan) throw badRequest("Selected plan does not exist.");
  const start = b.startDate || new Date();
  const end = b.endDate || new Date(start.getTime() + plan.durationDays * 864e5);
  if (end <= start) throw badRequest("End date must be after the start date.");
  await Subscription.updateMany({ organizationId: orgId, isCurrent: true }, { isCurrent: false });
  return Subscription.create({
    organizationId: orgId,
    planId: plan._id,
    status: b.status,
    startDate: start,
    endDate: end,
    employeeLimitOverride: b.employeeLimitOverride ?? null,
    featureOverrides: b.featureOverrides || {},
    priceOverride: b.priceOverride ?? null,
    notes: b.notes || "",
    payment: { provider: "manual", reference: b.paymentReference || "" },
    isCurrent: true,
    createdBy: actorId,
  });
}

router.get("/organizations", async (req, res) => {
  const { page, limit, skip } = pageParams(req.query);
  const q = {};
  if (req.query.status === "active" || req.query.status === "inactive") q.status = req.query.status;
  if (req.query.search) q.$or = [{ name: { $regex: escapeRegex(req.query.search), $options: "i" } }, { slug: { $regex: escapeRegex(req.query.search), $options: "i" } }];
  const [items, total] = await Promise.all([Organization.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(), Organization.countDocuments(q)]);
  const ids = items.map((o) => o._id);
  const [subs, empCounts] = await Promise.all([
    Subscription.find({ organizationId: { $in: ids }, isCurrent: true }).setOptions(SKIP).lean(),
    Employee.aggregate([{ $match: { organizationId: { $in: ids } } }, { $group: { _id: "$organizationId", n: { $sum: 1 } } }]).option(SKIP),
  ]);
  const plans = await Plan.find({ _id: { $in: subs.map((s) => s.planId) } }).select("name employeeLimit").lean();
  const planMap = Object.fromEntries(plans.map((p) => [String(p._id), p]));
  const subMap = Object.fromEntries(subs.map((s) => [String(s.organizationId), s]));
  const empMap = Object.fromEntries(empCounts.map((e) => [String(e._id), e.n]));
  let data = items.map((o) => {
    const s = subMap[String(o._id)];
    const p = s && planMap[String(s.planId)];
    return {
      _id: o._id,
      name: o.name,
      slug: o.slug,
      status: o.status,
      contact: o.contact,
      logoUrl: o.branding?.logoUrl || "",
      createdAt: o.createdAt,
      employees: empMap[String(o._id)] || 0,
      subscription: s ? { status: effectiveStatus(s), planName: p?.name || "—", endDate: s.endDate, employeeLimit: s.employeeLimitOverride ?? p?.employeeLimit ?? null } : null,
    };
  });
  if (req.query.subscription) data = data.filter((o) => (o.subscription?.status || "none") === req.query.subscription);
  res.json({ success: true, data, pagination: { page, limit, total } });
});

router.post("/organizations", async (req, res) => {
  const b = parse(
    z.object({
      name: z.string().trim().min(2).max(120),
      slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,60}$/, "Use 2-60 lowercase letters, numbers or dashes").optional(),
      contact: contactSchema.optional(),
      admin: z.object({ name: z.string().trim().min(2).max(120), email: emailSchema }),
      subscription: subAssignSchema,
    }),
    req.body
  );
  if (await User.exists({ email: b.admin.email })) throw conflict("A user with this admin email already exists. Use a different email.");
  let slug = b.slug || slugify(b.name);
  if (b.slug && (await Organization.exists({ slug }))) throw conflict(`The URL name "${slug}" is already used by another company.`);
  if (!b.slug) {
    const taken = new Set((await Organization.find({ slug: { $regex: `^${escapeRegex(slug)}` } }).select("slug").lean()).map((o) => o.slug));
    slug = uniqueSlug(slug, taken);
  }

  const org = await Organization.create({ name: b.name, slug, contact: b.contact || {}, createdBy: req.auth.userId });
  try {
    const sub = await createSubscription(org._id, b.subscription, req.auth.userId);
    const admin = new User({ name: b.admin.name, email: b.admin.email, role: ROLES.COMPANY_ADMIN, organizationId: org._id, status: "invited" });
    const invite = await issueInvite(admin, org.name);
    audit(req, { action: "organization.created", entity: "Organization", entityId: org._id, summary: `${org.name} created with admin ${admin.email}`, organizationId: org._id });
    res.status(201).json({ success: true, data: { organization: org, subscription: sub, admin: { _id: admin._id, name: admin.name, email: admin.email }, invite } });
  } catch (e) {
    // Manual rollback (works on standalone MongoDB without transactions)
    await Subscription.deleteMany({ organizationId: org._id });
    await User.deleteMany({ organizationId: org._id });
    await Organization.deleteOne({ _id: org._id });
    throw e;
  }
});

router.get("/organizations/:id", async (req, res) => {
  assertId(req.params.id);
  const org = await Organization.findById(req.params.id).populate("verification.verifiedBy", "name email").lean();
  if (!org) throw notFound("Company not found.");
  const [subs, admins, employees, published, active] = await Promise.all([
    Subscription.find({ organizationId: org._id }).sort({ createdAt: -1 }).lean(),
    User.find({ organizationId: org._id, role: ROLES.COMPANY_ADMIN }).select("name email status lastLoginAt invitedAt createdAt").lean(),
    Employee.countDocuments({ organizationId: org._id }),
    Employee.countDocuments({ organizationId: org._id, isPublished: true, cardStatus: "active" }),
    Employee.countDocuments({ organizationId: org._id, cardStatus: "active" }),
  ]);
  const plans = await Plan.find({ _id: { $in: subs.map((s) => s.planId) } }).lean();
  const pm = Object.fromEntries(plans.map((p) => [String(p._id), p]));
  const from = addDaysKey(dayKey(new Date()), -29);
  const [eng] = await groupSum(DailyStat, [{ $match: { organizationId: org._id, day: { $gte: from } } }], null, {
    views: "$counts.view",
    saves: "$counts.vcard_download",
    shares: "$counts.share",
    enquiries: "$counts.enquiry",
  });

  res.json({
    success: true,
    data: {
      organization: org,
      subscriptions: subs.map((s) => ({ ...s, effectiveStatus: effectiveStatus(s), plan: pm[String(s.planId)] ? { _id: s.planId, name: pm[String(s.planId)].name, employeeLimit: pm[String(s.planId)].employeeLimit, features: pm[String(s.planId)].features } : null })),
      admins,
      usage: { employees, activeCards: active, publishedCards: published, last30Days: eng ? { views: eng.views, saves: eng.saves, shares: eng.shares, enquiries: eng.enquiries } : { views: 0, saves: 0, shares: 0, enquiries: 0 } },
    },
  });
});

router.patch("/organizations/:id/verification", async (req, res) => {
  assertId(req.params.id);
  const b = parse(z.object({ isVerified: z.boolean(), note: z.string().trim().max(300).optional() }), req.body);
  const org = await Organization.findById(req.params.id);
  if (!org) throw notFound("Company not found.");
  org.verification.isVerified = b.isVerified;
  org.verification.note = b.note || "";
  org.verification.verifiedAt = b.isVerified ? new Date() : null;
  org.verification.verifiedBy = b.isVerified ? req.auth.userId : null;
  await org.save();
  await audit(req, {
    action: b.isVerified ? "organization.verified" : "organization.unverified",
    entity: "Organization",
    entityId: org._id,
    summary: b.isVerified ? org.verification.note : org.name,
    organizationId: null,
  });
  res.json({ success: true, data: { isVerified: org.verification.isVerified, verifiedAt: org.verification.verifiedAt, verifiedBy: org.verification.verifiedBy, note: org.verification.note } });
});

router.patch("/organizations/:id", async (req, res) => {
  assertId(req.params.id);
  const b = parse(
    z.object({
      name: z.string().trim().min(2).max(120).optional(),
      slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,60}$/).optional(),
      contact: contactSchema.optional(),
    }),
    req.body
  );
  const org = await Organization.findById(req.params.id);
  if (!org) throw notFound("Company not found.");
  if (b.slug && b.slug !== org.slug) {
    if (await Organization.exists({ slug: b.slug })) throw conflict(`The URL name "${b.slug}" is already used.`);
    org.slug = b.slug; // NOTE: changes every public card URL of this company
  }
  if (b.name) org.name = b.name;
  if (b.contact) for (const [k, v] of Object.entries(b.contact)) if (v !== undefined) org.contact[k] = v;
  await org.save();
  audit(req, { action: "organization.updated", entity: "Organization", entityId: org._id, summary: org.name, organizationId: org._id });
  res.json({ success: true, data: org });
});

router.post("/organizations/:id/status", async (req, res) => {
  assertId(req.params.id);
  const { status } = parse(z.object({ status: z.enum(["active", "inactive"]) }), req.body);
  const r = await Organization.updateOne({ _id: req.params.id }, { status });
  if (!r.matchedCount) throw notFound("Company not found.");
  const org = await Organization.findById(req.params.id).lean();
  audit(req, { action: `organization.${status === "active" ? "activated" : "deactivated"}`, entity: "Organization", entityId: org._id, summary: org.name, organizationId: org._id });
  res.json({ success: true, data: org });
});

/* ═════════════ Subscriptions ═════════════ */
router.get("/subscriptions", async (req, res) => {
  const subs = await Subscription.find({ isCurrent: true }).setOptions(SKIP).sort({ endDate: 1 }).lean();
  const [orgs, plans] = await Promise.all([
    Organization.find({ _id: { $in: subs.map((s) => s.organizationId) } }).select("name slug status").lean(),
    Plan.find({ _id: { $in: subs.map((s) => s.planId) } }).select("name").lean(),
  ]);
  const om = Object.fromEntries(orgs.map((o) => [String(o._id), o]));
  const pm = Object.fromEntries(plans.map((p) => [String(p._id), p.name]));
  let data = subs.map((s) => ({ ...s, effectiveStatus: effectiveStatus(s), organization: om[String(s.organizationId)] || null, planName: pm[String(s.planId)] || "—", daysLeft: Math.ceil((new Date(s.endDate) - Date.now()) / 864e5) }));
  if (req.query.status) data = data.filter((s) => s.effectiveStatus === req.query.status);
  if (req.query.expiringInDays) {
    const d = Number(req.query.expiringInDays);
    data = data.filter((s) => s.daysLeft >= 0 && s.daysLeft <= d && (s.effectiveStatus === "active" || s.effectiveStatus === "trial"));
  }
  res.json({ success: true, data });
});

router.post("/organizations/:id/subscriptions", async (req, res) => {
  assertId(req.params.id);
  const org = await Organization.findById(req.params.id).lean();
  if (!org) throw notFound("Company not found.");
  const b = parse(subAssignSchema, req.body);
  const sub = await createSubscription(org._id, b, req.auth.userId);
  audit(req, { action: "subscription.assigned", entity: "Subscription", entityId: sub._id, summary: `${org.name}: ${b.status} until ${sub.endDate.toDateString()}`, organizationId: org._id });
  res.status(201).json({ success: true, data: sub });
});

router.patch("/subscriptions/:id", async (req, res) => {
  assertId(req.params.id);
  const b = parse(subAssignSchema.omit({ planId: true }).partial(), req.body);
  const sub = await Subscription.findOne({ _id: req.params.id }).setOptions(SKIP);
  if (!sub) throw notFound("Subscription not found.");
  const { featureOverrides, paymentReference, ...rest } = b;
  Object.assign(sub, rest);
  // clearFeatureOverrides=true replaces all overrides with the ones sent (used by the edit form)
  if (req.body?.clearFeatureOverrides === true) sub.featureOverrides = new Map();
  if (featureOverrides) {
    for (const [k, v] of Object.entries(featureOverrides)) if (typeof v === "boolean") sub.featureOverrides.set(k, v);
  }
  if (paymentReference !== undefined) sub.payment.reference = paymentReference;
  if (sub.endDate <= sub.startDate) throw badRequest("End date must be after the start date.");
  await sub.save();
  audit(req, { action: "subscription.updated", entity: "Subscription", entityId: sub._id, summary: `status ${sub.status}, ends ${sub.endDate.toDateString()}`, organizationId: sub.organizationId });
  res.json({ success: true, data: sub });
});

/* ═════════════ Company admins ═════════════ */
router.post("/organizations/:id/admins", async (req, res) => {
  assertId(req.params.id);
  const org = await Organization.findById(req.params.id).lean();
  if (!org) throw notFound("Company not found.");
  const b = parse(z.object({ name: z.string().trim().min(2).max(120), email: emailSchema }), req.body);
  if (await User.exists({ email: b.email })) throw conflict("A user with this email already exists.");
  const admin = new User({ name: b.name, email: b.email, role: ROLES.COMPANY_ADMIN, organizationId: org._id, status: "invited" });
  const invite = await issueInvite(admin, org.name);
  audit(req, { action: "admin.invited", entity: "User", entityId: admin._id, summary: admin.email, organizationId: org._id });
  res.status(201).json({ success: true, data: { admin: { _id: admin._id, name: admin.name, email: admin.email, status: admin.status }, invite } });
});

async function loadManagedUser(id) {
  assertId(id);
  const user = await User.findById(id);
  if (!user || user.role === ROLES.EMPLOYEE) throw notFound("User not found.");
  return user;
}

router.patch("/users/:id", async (req, res) => {
  const user = await loadManagedUser(req.params.id);
  const b = parse(z.object({ name: z.string().trim().min(2).max(120).optional(), email: emailSchema.optional() }).refine((v) => v.name !== undefined || v.email !== undefined, "Provide a name or email to update."), req.body);
  const emailChanged = b.email !== undefined && b.email !== user.email;
  if (b.email && b.email !== user.email) {
    if (user.status !== "invited") throw badRequest("Email can only be changed before the invite is accepted.");
    if (await User.exists({ email: b.email, _id: { $ne: user._id } })) throw conflict("A user with this email already exists.");
    user.email = b.email;
  }
  if (b.name !== undefined) user.name = b.name;
  await user.save();
  const org = user.organizationId ? await Organization.findById(user.organizationId).select("name").lean() : null;
  const invite = emailChanged ? await issueInvite(user, org?.name) : null;
  audit(req, { action: "admin.updated", entity: "User", entityId: user._id, summary: user.email, organizationId: user.organizationId });
  res.json({ success: true, data: { user: { _id: user._id, name: user.name, email: user.email, status: user.status }, invite } });
});

router.delete("/users/:id", async (req, res) => {
  const user = await loadManagedUser(req.params.id);
  if (String(user._id) === String(req.auth.userId)) throw badRequest("You cannot delete yourself.");
  if (user.status !== "invited") throw badRequest("Only invited admins can be deleted. Disable active admins instead.");
  await RefreshToken.deleteMany({ userId: user._id });
  await User.deleteOne({ _id: user._id });
  audit(req, { action: "admin.deleted", entity: "User", entityId: user._id, summary: user.email, organizationId: user.organizationId });
  res.json({ success: true, message: "Invited admin removed." });
});

router.post("/users/:id/resend-invite", async (req, res) => {
  const user = await loadManagedUser(req.params.id);
  if (user.status === "active") throw badRequest("This user has already set up their account.");
  const org = user.organizationId ? await Organization.findById(user.organizationId).select("name").lean() : null;
  const invite = await issueInvite(user, org?.name);
  audit(req, { action: "admin.invite_resent", entity: "User", entityId: user._id, summary: user.email, organizationId: user.organizationId });
  res.json({ success: true, data: { invite } });
});

router.patch("/users/:id/status", async (req, res) => {
  const user = await loadManagedUser(req.params.id);
  const { status } = parse(z.object({ status: z.enum(["active", "disabled"]) }), req.body);
  if (String(user._id) === String(req.auth.userId)) throw badRequest("You cannot change your own status.");
  if (status === "active" && !user.passwordHash && user.status === "invited") throw badRequest("This user has not accepted the invite yet.");
  user.status = status;
  if (status === "disabled") {
    user.tokenVersion += 1;
    await RefreshToken.updateMany({ userId: user._id, revokedAt: null }, { revokedAt: new Date() });
  }
  await user.save();
  audit(req, { action: `user.${status}`, entity: "User", entityId: user._id, summary: user.email, organizationId: user.organizationId });
  res.json({ success: true, data: { _id: user._id, status: user.status } });
});

/* ═════════════ Super Admin team ═════════════ */
router.get("/admins", async (_req, res) => {
  const list = await User.find({ role: ROLES.SUPER_ADMIN }).select("name email status lastLoginAt createdAt").lean();
  res.json({ success: true, data: list });
});

router.post("/admins", async (req, res) => {
  const b = parse(z.object({ name: z.string().trim().min(2).max(120), email: emailSchema }), req.body);
  if (await User.exists({ email: b.email })) throw conflict("A user with this email already exists.");
  const u = new User({ name: b.name, email: b.email, role: ROLES.SUPER_ADMIN, status: "invited" });
  const invite = await issueInvite(u, "Beno Digital Card platform");
  audit(req, { action: "superadmin.invited", entity: "User", entityId: u._id, summary: u.email, organizationId: null });
  res.status(201).json({ success: true, data: { admin: { _id: u._id, name: u.name, email: u.email, status: u.status }, invite } });
});

/* ═════════════ Platform settings ═════════════ */
router.get("/settings", async (_req, res) => {
  res.json({ success: true, data: await getPlatformSettings() });
});

router.put("/settings", async (req, res) => {
  const b = parse(
    z.object({
      platformName: z.string().trim().min(2).max(80).optional(),
      supportEmail: z.union([emailSchema, z.literal("")]).optional(),
      supportPhone: phoneSchema,
      defaultTrialDays: z.coerce.number().int().min(1).max(365).optional(),
      poweredByText: optStr(80),
      expiryReminderDays: z.coerce.number().int().min(1).max(60).optional(),
    }),
    req.body
  );
  const s = await PlatformSetting.findOneAndUpdate({ key: "platform" }, { $set: b }, { upsert: true, returnDocument: "after" });
  audit(req, { action: "platform.settings_updated", entity: "PlatformSetting", organizationId: null });
  res.json({ success: true, data: s });
});

/* ═════════════ Audit log ═════════════ */
router.get("/audit-logs", async (req, res) => {
  const { page, limit, skip } = pageParams(req.query);
  const q = {};
  if (req.query.organizationId) q.organizationId = assertId(req.query.organizationId, "organizationId");
  if (req.query.action) q.action = { $regex: `^${escapeRegex(req.query.action)}` };
  const [items, total] = await Promise.all([AuditLog.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(), AuditLog.countDocuments(q)]);
  const orgs = await Organization.find({ _id: { $in: items.map((i) => i.organizationId).filter(Boolean) } }).select("name").lean();
  const om = Object.fromEntries(orgs.map((o) => [String(o._id), o.name]));
  res.json({ success: true, data: items.map((i) => ({ ...i, organizationName: i.organizationId ? om[String(i.organizationId)] || "—" : "Platform" })), pagination: { page, limit, total } });
});

export default router;
export { oid };
