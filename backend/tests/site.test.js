import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

process.env.NODE_ENV = "test";
process.env.JWT_ACCESS_SECRET ||= "test-secret-test-secret-test-secret-1234";
process.env.MONGO_URI = process.env.TEST_MONGO_URI || "mongodb://127.0.0.1:27017/beno_card_test";
process.env.FRONTEND_URL = "http://localhost:3000";
process.env.PUBLIC_CARD_BASE_URL = "http://localhost:3000";

const { createApp } = await import("../src/app.js");
const M = await import("../src/models/index.js");
const { ROLES } = await import("../src/common/constants.js");
const { signAccessToken } = await import("../src/middleware/auth.js");
const { syncBuiltInPlans, BUILTIN_PLANS } = await import("../src/services/builtinPlans.js");

let server;
let base;
let token;
let leadId;

async function call(method, path, body, auth = token) {
  const headers = body ? { "content-type": "application/json" } : {};
  if (auth) headers.authorization = `Bearer ${auth}`;
  const response = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, json: await response.json().catch(() => ({})) };
}

before(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await mongoose.connection.db.dropDatabase();
  await M.User.create({ name: "Root", email: "site-root@beno.test", role: ROLES.SUPER_ADMIN, status: "active", passwordHash: await bcrypt.hash("RootPass123", 4) });
  await M.User.create({ name: "Company admin", email: "site-admin@beno.test", role: ROLES.COMPANY_ADMIN, status: "active", passwordHash: await bcrypt.hash("AdminPass123", 4) });
  await M.Plan.create({ name: "Visible", code: "visible", price: 100, features: { customBranding: true }, isActive: true, sortOrder: 1, website: { showOnWebsite: true, group: "For teams" } });
  await M.Plan.create({ name: "Hidden", code: "hidden", price: 200, features: {}, isActive: false, sortOrder: 0 });
  const app = createApp();
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  const login = await call("POST", "/api/auth/login", { email: "site-root@beno.test", password: "RootPass123" }, null);
  token = login.json.data.accessToken;
});

after(async () => {
  server?.close();
  await mongoose.disconnect();
});

test("public pricing returns active plans with feature labels", async () => {
  const result = await call("GET", "/api/public/site/plans", undefined, null);
  assert.equal(result.status, 200);
  assert.equal(result.json.data.plans.length, 1);
  assert.equal(result.json.data.plans[0].features.find((feature) => feature.key === "customBranding").label, "Custom branding (logo, colours, templates)");
  assert.equal(result.json.data.groups[0].name, "For teams");
});

test("public pricing returns monthly billing savings", async () => {
  await M.Plan.create({ name: "Monthly Business", code: "monthly-business", price: 36, currency: "USD", billingCycle: "yearly", durationDays: 365, website: { showOnWebsite: true, showMonthlyEquivalent: true, monthlyPrice: 4, group: "For teams" } });
  const result = await call("GET", "/api/public/site/plans", undefined, null);
  assert.equal(result.json.data.billing.hasMonthly, true);
  assert.equal(result.json.data.billing.maxYearlySavingsPercent, 25);
});

test("public pricing keeps the first non-empty group subtitle", async () => {
  await M.Plan.create([
    { name: "Personal", code: "subtitle-personal", price: 0, currency: "USD", billingCycle: "yearly", durationDays: 365, website: { showOnWebsite: true, group: "Individuals", groupSubtitle: "One person, one card" }, sortOrder: 10 },
    { name: "Professional", code: "subtitle-professional", price: 48, currency: "USD", billingCycle: "yearly", durationDays: 365, website: { showOnWebsite: true, group: "Individuals" }, sortOrder: 20 },
  ]);
  const result = await call("GET", "/api/public/site/plans", undefined, null);
  assert.equal(result.json.data.groups.find((group) => group.name === "Individuals").subtitle, "One person, one card");
});

test("website plan visibility and pricing validation are enforced", async () => {
  const hidden = await call("POST", "/api/platform/plans", { name: "Hidden website", code: "hidden-website", price: 10, currency: "USD", billingCycle: "yearly", durationDays: 365, website: { showOnWebsite: false } });
  assert.equal(hidden.status, 201);
  const publicPlans = await call("GET", "/api/public/site/plans", undefined, null);
  assert.equal(publicPlans.json.data.plans.some((plan) => plan.code === "hidden-website"), false);
  const invalidMonthly = await call("POST", "/api/platform/plans", { name: "Odd yearly", code: "odd-yearly", price: 100, currency: "USD", billingCycle: "yearly", durationDays: 365, website: { showOnWebsite: true, showMonthlyEquivalent: true } });
  assert.equal(invalidMonthly.status, 400);
  const invalidUsd = await call("POST", "/api/platform/plans", { name: "Decimal USD", code: "decimal-usd", price: 10.5, currency: "USD", billingCycle: "yearly", durationDays: 365 });
  assert.equal(invalidUsd.status, 400);
  const invalidMonthlyPrice = await call("POST", "/api/platform/plans", { name: "Low monthly", code: "low-monthly", price: 48, currency: "USD", billingCycle: "yearly", durationDays: 365, website: { showOnWebsite: true, showMonthlyEquivalent: true, monthlyPrice: 3 } });
  assert.equal(invalidMonthlyPrice.status, 400);
});

test("built-in sync protects subscriptions and fills only missing fields", async () => {
  assert.equal(BUILTIN_PLANS.find((plan) => plan.code === "business").features.companyDirectory, true);
  assert.equal(BUILTIN_PLANS.find((plan) => plan.code === "enterprise").features.companyDirectory, true);
  const definition = BUILTIN_PLANS.find((plan) => plan.code === "professional");
  const existing = await M.Plan.create({ ...definition, _id: undefined, isBuiltIn: true, website: { ...definition.website, monthlyPrice: undefined, description: "Admin edit" } });
  await syncBuiltInPlans({ apply: true });
  const filled = await M.Plan.findById(existing._id).lean();
  assert.equal(filled.website.monthlyPrice, 5);
  assert.equal(filled.website.description, "Admin edit");
});

test("built-in plan sync is safe, idempotent and dry-run by default", async () => {
  const definition = BUILTIN_PLANS.find((plan) => plan.code === "business");
  const old = await M.Plan.create({ name: "Business (sample)", code: "business", price: 999, currency: "USD", billingCycle: "monthly", durationDays: 30, employeeLimit: 25, features: {}, website: { showOnWebsite: false }, isBuiltIn: false });
  const dryRun = await syncBuiltInPlans();
  assert.equal(dryRun.summary.some((item) => item.code === "business"), true);
  assert.equal((await M.Plan.findById(old._id)).price, 999);
  await syncBuiltInPlans({ apply: true });
  const synced = await M.Plan.findById(old._id).lean();
  assert.equal(synced.isBuiltIn, true);
  assert.equal(synced.price, definition.price);
  assert.equal(synced.website.showOnWebsite, true);

  const enterprise = await M.Plan.create({ name: "Enterprise (sample)", code: "enterprise", price: 1234, currency: "USD", billingCycle: "monthly", durationDays: 30, employeeLimit: 5, features: {}, website: { showOnWebsite: false }, isBuiltIn: false, isActive: false });
  const organization = await M.Organization.create({ name: "Sync Test Org", slug: "sync-test-org" });
  await M.Subscription.create({ organizationId: organization._id, planId: enterprise._id, startDate: new Date(), endDate: new Date(Date.now() + 86400000) });
  await syncBuiltInPlans({ apply: true });
  const protectedPlan = await M.Plan.findById(enterprise._id).lean();
  assert.equal(protectedPlan.isBuiltIn, true);
  assert.equal(protectedPlan.price, 1234);
  assert.equal(protectedPlan.isActive, false);
  assert.equal(protectedPlan.website.showOnWebsite, true);
});

test("demo requests validate consent and phone, and store normalized leads", async () => {
  const baseLead = { name: "Asha Rao", email: "ASHA@EXAMPLE.COM", company: "Example Works", employees: "26-100", consent: true };
  assert.equal((await call("POST", "/api/public/site/demo-requests", { ...baseLead, consent: false }, null)).status, 400);
  assert.equal((await call("POST", "/api/public/site/demo-requests", { ...baseLead, phone: "123" }, null)).status, 400);
  const valid = await call("POST", "/api/public/site/demo-requests", { ...baseLead, phone: "+91 98765 43210", interest: "trial" }, null);
  assert.equal(valid.status, 201);
  const lead = await M.Lead.findOne({ email: "asha@example.com" }).lean();
  assert.equal(lead.phone, "+919876543210");
  leadId = lead._id;
  assert.equal((await call("POST", "/api/public/site/demo-requests", { ...baseLead, website: "bot" }, null)).status, 201);
  assert.equal(await M.Lead.countDocuments({}), 1);
});

test("website leads require super admin and support lifecycle operations", async () => {
  assert.equal((await call("GET", "/api/platform/leads", undefined, null)).status, 401);
  const companyAdmin = await M.User.findOne({ email: "site-admin@beno.test" });
  assert.equal((await call("GET", "/api/platform/leads", undefined, signAccessToken(companyAdmin))).status, 403);
  const listed = await call("GET", "/api/platform/leads");
  assert.equal(listed.status, 200);
  assert.equal(listed.json.meta.newCount, 1);
  const updated = await call("PATCH", `/api/platform/leads/${leadId}`, { status: "contacted", notes: "Called" });
  assert.equal(updated.status, 200);
  assert.equal((await call("DELETE", `/api/platform/leads/${leadId}`)).status, 200);
});

test("testimonials require consent to publish and public output is filtered", async () => {
  assert.equal((await call("GET", "/api/public/site/testimonials", undefined, null)).json.data.length, 0);
  assert.equal((await call("GET", "/api/platform/testimonials", undefined, null)).status, 401);
  const companyAdmin = await M.User.findOne({ email: "site-admin@beno.test" });
  assert.equal((await call("GET", "/api/platform/testimonials", undefined, signAccessToken(companyAdmin))).status, 403);
  const rejected = await call("POST", "/api/platform/testimonials", { name: "Asha Rao", company: "Example Works", quote: "This is a sufficiently long sample testimonial for validation.", consentConfirmed: false, isPublished: true });
  assert.equal(rejected.status, 400);
  const unpublished = await call("POST", "/api/platform/testimonials", { name: "Asha Rao", company: "Example Works", quote: "This is a sufficiently long sample testimonial for validation.", consentConfirmed: true, isPublished: false });
  assert.equal(unpublished.status, 201);
  assert.equal((await call("GET", "/api/public/site/testimonials", undefined, null)).json.data.length, 0);
  const published = await call("PATCH", `/api/platform/testimonials/${unpublished.json.data._id}`, { isPublished: true, consentConfirmed: true });
  assert.equal(published.status, 200);
  assert.equal((await call("GET", "/api/public/site/testimonials", undefined, null)).json.data[0].name, "Asha Rao");
});
