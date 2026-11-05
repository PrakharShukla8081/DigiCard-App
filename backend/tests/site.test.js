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
  await M.Plan.create({ name: "Visible", code: "visible", price: 100, features: { customBranding: true }, isActive: true, sortOrder: 1 });
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
