/**
 * End-to-end API tests. Needs a MongoDB the tests may wipe:
 *   TEST_MONGO_URI=mongodb://127.0.0.1:27017/beno_card_test npm test
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { inflateRawSync } from "node:zlib";

process.env.NODE_ENV = "test";
if (process.env.TEST_FERRETDB) process.env.AGG_SINGLE_ACCUMULATOR = "1";
process.env.JWT_ACCESS_SECRET ||= "test-secret-test-secret-test-secret-1234";
process.env.MONGO_URI = process.env.TEST_MONGO_URI || "mongodb://127.0.0.1:27017/beno_card_test";
process.env.UPLOAD_DIR = "./tests/.uploads";
process.env.FRONTEND_URL = "http://localhost:3000";
process.env.PUBLIC_CARD_BASE_URL = "http://localhost:3000";

const { createApp } = await import("../src/app.js");
const M = await import("../src/models/index.js");
const { ROLES } = await import("../src/common/constants.js");

let server;
let base;

/* ── tiny client with a cookie jar ── */
function client() {
  const jar = {};
  let token = null;
  async function call(method, path, body, { raw = false, headers = {} } = {}) {
    const h = { ...headers };
    if (token) h.Authorization = `Bearer ${token}`;
    const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
    if (cookie) h.Cookie = cookie;
    let payload = body;
    if (body && !(body instanceof FormData)) {
      h["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const res = await fetch(base + path, { method, headers: h, body: payload });
    for (const c of res.headers.getSetCookie?.() || []) {
      const [pair] = c.split(";");
      const [k, ...v] = pair.split("=");
      const val = v.join("=");
      if (/max-age=0|expires=Thu, 01 Jan 1970/i.test(c) || val === "") delete jar[k];
      else jar[k] = val;
    }
    if (raw) return res;
    const json = res.status === 204 ? {} : await res.json().catch(() => ({}));
    return { status: res.status, ...json };
  }
  return {
    jar,
    setToken: (t) => (token = t),
    get: (p, o) => call("GET", p, undefined, o),
    post: (p, b, o) => call("POST", p, b, o),
    patch: (p, b) => call("PATCH", p, b),
    put: (p, b) => call("PUT", p, b),
    del: (p) => call("DELETE", p),
  };
}

function zipEntries(buffer) {
  const endMin = Math.max(0, buffer.length - 65557);
  let end = -1;
  for (let i = buffer.length - 22; i >= endMin; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  assert.notEqual(end, -1, "ZIP end record exists");
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  const entries = [];
  for (let i = 0; i < count; i++) {
    assert.equal(buffer.readUInt32LE(offset), 0x02014b50, "ZIP entry exists");
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    const content = method === 8 ? inflateRawSync(compressed) : compressed;
    entries.push({ name, content: content.toString("utf8") });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

const tokenFromLink = (link) => decodeURIComponent(link.split("token=")[1]);
const sa = client();
const adminA = client();
const adminB = client();
const inviteClient = client();
const anon = client();
let planAll;
let planSmall;
let orgA;
let orgB;
let empA;

before(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await mongoose.connection.db.dropDatabase();
  for (const m of Object.values(M)) if (m?.syncIndexes && m.modelName) await m.syncIndexes().catch(() => {});
  await M.User.create({ name: "Root", email: "root@beno.test", role: ROLES.SUPER_ADMIN, status: "active", passwordHash: await bcrypt.hash("RootPass123", 4) });
  const app = createApp();
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server?.close();
  await mongoose.disconnect();
});

test("super admin logs in; wrong password rejected", async () => {
  const bad = await sa.post("/api/auth/login", { email: "root@beno.test", password: "nope" });
  assert.equal(bad.status, 401);
  const r = await sa.post("/api/auth/login", { email: "root@beno.test", password: "RootPass123" });
  assert.equal(r.status, 200, r.message);
  assert.ok(r.data.accessToken);
  assert.ok(sa.jar.bdc_rt, "refresh cookie set");
  sa.setToken(r.data.accessToken);
});

test("super admin creates plans and two organizations", async () => {
  const features = { bulkUpload: true, customBranding: true, employeeLogin: true, advancedAnalytics: true, enquiryForm: true, productsGallery: true, emailReminders: true, whatsappReminders: true, removeBranding: false };
  let r = await sa.post("/api/platform/plans", { name: "Enterprise", price: 100000, billingCycle: "yearly", durationDays: 365, employeeLimit: 100, features });
  assert.equal(r.status, 201, r.message);
  planAll = r.data;
  r = await sa.post("/api/platform/plans", { name: "Tiny", price: 0, billingCycle: "monthly", durationDays: 30, employeeLimit: 2, features: { enquiryForm: true } });
  planSmall = r.data;

  r = await sa.post("/api/platform/organizations", { name: "ABC Company", admin: { name: "Asha", email: "asha@abc.test" }, subscription: { planId: planAll._id, status: "active" } });
  assert.equal(r.status, 201, r.message);
  orgA = r.data.organization;
  assert.equal(orgA.slug, "abc-company");
  let acc = await adminA.post("/api/auth/accept-invite", { token: tokenFromLink(r.data.invite.link), password: "AdminPass1" });
  assert.equal(acc.status, 200, acc.message);
  adminA.setToken(acc.data.accessToken);
  assert.equal(acc.data.user.role, "company_admin");

  r = await sa.post("/api/platform/organizations", { name: "XYZ Company", admin: { name: "Ben", email: "ben@xyz.test" }, subscription: { planId: planSmall._id, status: "trial" } });
  orgB = r.data.organization;
  acc = await adminB.post("/api/auth/accept-invite", { token: tokenFromLink(r.data.invite.link), password: "AdminPass2" });
  adminB.setToken(acc.data.accessToken);

  const dup = await sa.post("/api/platform/organizations", { name: "ABC Company", admin: { name: "Xavier", email: "asha@abc.test" }, subscription: { planId: planAll._id } });
  assert.equal(dup.status, 409);
});

test("company admin cannot reach platform APIs", async () => {
  const r = await adminA.get("/api/platform/dashboard");
  assert.equal(r.status, 403);
  const r2 = await anon.get("/api/org/employees");
  assert.equal(r2.status, 401);
});

test("invited admins can be edited or removed with scoped invite rotation", async () => {
  let r = await sa.post(`/api/platform/organizations/${orgA._id}/admins`, { name: "Typo Admin", email: "typo@abc.test" });
  assert.equal(r.status, 201, r.message);
  const managedId = r.data.admin._id;
  const oldToken = tokenFromLink(r.data.invite.link);
  r = await sa.patch(`/api/platform/users/${managedId}`, { name: "Correct Admin", email: "correct@abc.test" });
  assert.equal(r.status, 200, r.message);
  assert.equal(r.data.user.email, "correct@abc.test");
  assert.ok(r.data.invite.link);
  assert.equal((await inviteClient.post("/api/auth/accept-invite", { token: oldToken, password: "AdminPass3" })).status, 400);
  r = await inviteClient.post("/api/auth/accept-invite", { token: tokenFromLink(r.data.invite.link), password: "AdminPass3" });
  assert.equal(r.status, 200, r.message);
  assert.equal((await sa.patch(`/api/platform/users/${managedId}`, { email: "another@abc.test" })).status, 400);
  assert.equal((await sa.del(`/api/platform/users/${managedId}`)).status, 400);

  r = await sa.post(`/api/platform/organizations/${orgA._id}/admins`, { name: "Delete Me", email: "delete-me@abc.test" });
  assert.equal(r.status, 201, r.message);
  const deleteId = r.data.admin._id;
  assert.equal((await sa.del(`/api/platform/users/${deleteId}`)).status, 200);
  assert.equal(await M.User.findById(deleteId).lean(), null);

  r = await adminA.post("/api/org/team", { name: "Team Invite", email: "team-invite@abc.test" });
  assert.equal(r.status, 201, r.message);
  const teamId = r.data.user._id;
  assert.equal((await adminB.patch(`/api/org/team/${teamId}`, { name: "Cross Tenant" })).status, 404);
  assert.equal((await adminB.del(`/api/org/team/${teamId}`)).status, 404);
  assert.equal((await adminA.patch(`/api/org/team/${teamId}`, { name: "Updated Team Invite", email: "team-updated@abc.test" })).status, 200);
  assert.equal((await adminA.del(`/api/org/team/${teamId}`)).status, 200);
});

test("employees are isolated between companies", async () => {
  let r = await adminA.post("/api/org/employees", { employeeCode: "A-1", firstName: "Rahul", lastName: "Sharma", designation: "Sales", workEmail: "rahul@abc.test", mobile: "+91 98765 43210" });
  assert.equal(r.status, 201, r.message);
  empA = r.data;
  assert.equal(empA.slug, "rahul-sharma");
  assert.equal(empA.mobile, "+919876543210");

  // same code is fine in another company
  r = await adminB.post("/api/org/employees", { employeeCode: "A-1", firstName: "Mohit" });
  assert.equal(r.status, 201, r.message);

  // B cannot read, edit or delete A's employee — even with the exact id
  assert.equal((await adminB.get(`/api/org/employees/${empA._id}`)).status, 404);
  assert.equal((await adminB.patch(`/api/org/employees/${empA._id}`, { firstName: "Hacked" })).status, 404);
  assert.equal((await adminB.del(`/api/org/employees/${empA._id}`)).status, 404);
  const bulk = await adminB.post("/api/org/employees/bulk", { ids: [empA._id], action: "delete" });
  assert.equal(bulk.data.affected, 0);
  // organizationId in the body is ignored
  r = await adminB.post("/api/org/employees", { employeeCode: "B-9", firstName: "Sneaky", organizationId: orgA._id });
  assert.equal(r.status, 201);
  const sneaky = await M.Employee.findOne({ organizationId: orgB._id, employeeCode: "B-9" }).lean();
  assert.ok(sneaky, "created in B, not A");

  const listB = await adminB.get("/api/org/employees");
  assert.ok(listB.data.every((e) => e.employeeCode !== "A-1" || e.firstName === "Mohit"));
  const stillA = await adminA.get(`/api/org/employees/${empA._id}`);
  assert.equal(stillA.data.firstName, "Rahul");
});

test("tenant guard blocks unscoped queries at the database layer", async () => {
  await assert.rejects(() => M.Employee.find({}).lean(), /Tenant guard/);
  await assert.rejects(() => M.Employee.findById(empA._id).lean(), /Tenant guard/);
  await assert.rejects(() => M.Employee.updateMany({}, { firstName: "x" }), /Tenant guard/);
  await assert.rejects(() => M.Employee.aggregate([{ $group: { _id: null } }]), /Tenant guard/);
  const ok = await M.Employee.find({}).setOptions({ skipTenantGuard: true }).lean();
  assert.ok(ok.length >= 3);
});

test("plan employee limit is enforced", async () => {
  // Tiny plan allows 2; B already has 2
  const r = await adminB.post("/api/org/employees", { employeeCode: "B-3", firstName: "Over" });
  assert.equal(r.status, 403);
  assert.equal(r.code, "EMPLOYEE_LIMIT");
});

test("features outside the plan are blocked", async () => {
  const r = await adminB.get("/api/org/import/template");
  assert.equal(r.status, 403);
  const c = await adminB.patch("/api/org/settings/card", { template: "executive" });
  assert.equal(c.status, 403);
});

test("QR branding validates colours and requires custom branding", async () => {
  const invalidHex = await adminA.patch("/api/org/settings/company", { branding: { qr: { foreground: "navy" } } });
  assert.equal(invalidHex.status, 400);
  const lightForeground = await adminA.patch("/api/org/settings/company", { branding: { qr: { foreground: "#FFFFFF", background: "#111827" } } });
  assert.equal(lightForeground.status, 400);
  assert.equal(lightForeground.message, "These colours are too close; the QR code may not scan.");
  const lowContrast = await adminA.patch("/api/org/settings/company", { branding: { qr: { foreground: "#111827", background: "#121827" } } });
  assert.equal(lowContrast.status, 400);

  const denied = await adminB.patch("/api/org/settings/company", { branding: { qr: { foreground: "#000000" } } });
  assert.equal(denied.status, 403);
  const defaultCard = await anon.get("/api/public/cards/xyz-company/mohit");
  assert.deepEqual(defaultCard.data.company.qr, {
    foreground: "#111827",
    background: "#FFFFFF",
    useLogo: true,
    frame: "none",
    frameText: "Scan to save my contact",
  });
});

test("bulk QR SVG export is tenant-scoped and encodes tracked card URLs", async () => {
  const updated = await adminA.patch("/api/org/settings/company", {
    branding: { qr: { foreground: "#000000", background: "#FFFFFF", frame: "label", frameText: "Scan to connect" } },
  });
  assert.equal(updated.status, 200, updated.message);

  const exportA = await adminA.get("/api/org/employees/qr-export", { raw: true });
  assert.equal(exportA.status, 200);
  assert.match(exportA.headers.get("content-type"), /application\/zip/);
  const entriesA = zipEntries(Buffer.from(await exportA.arrayBuffer()));
  assert.equal(entriesA.length, 1);
  assert.match(entriesA[0].content, /http:\/\/localhost:3000\/c\/abc-company\/rahul-sharma\?src=qr/);
  assert.match(entriesA[0].content, /Scan to connect/);
  assert.doesNotMatch(entriesA[0].content, /xyz-company/);

  const exportB = await adminB.get("/api/org/employees/qr-export", { raw: true });
  assert.equal(exportB.status, 200);
  const entriesB = zipEntries(Buffer.from(await exportB.arrayBuffer()));
  assert.equal(entriesB.length, 2);
  assert.ok(entriesB.some((entry) => /\/c\/xyz-company\/mohit\?src=qr/.test(entry.content)));
  assert.ok(entriesB.every((entry) => !entry.content.includes("abc-company")));
  assert.ok(entriesB.every((entry) => !entry.content.includes("Scan to connect")));
});

test("bulk import validates rows, detects duplicates and reports errors", async () => {
  const csv = [
    "Employee ID,First Name,Last Name,Designation,Department,Work Email,Mobile Number,WhatsApp Number,Card Status",
    "A-2,Priya,Singh,Head of Marketing,Marketing,priya@abc.test,9876500001,,active",
    "A-3,Amit,Verma,Area Manager,Sales,amit@abc.test,+91 98765 00002,,active",
    "A-3,Dup,InFile,,,,,,",
    "A-4,,NoFirst,,,,,,",
    "A-5,Bad,Email,,,not-an-email,,,",
    "A-6,Bad,Phone,,,,12345,,",
    "A-1,Rahul,Again,,,,,,",
    "A-7,Same,Email,,,priya@abc.test,,,",
    "A-8,Neha,Gupta,BD,Sales,neha@abc.test,9876500008,,inactive",
    "A-9,Rahul,Sharma,Engineer,Service,,,,",
  ].join("\n");
  const fd = new FormData();
  fd.append("file", new Blob([csv], { type: "text/csv" }), "staff.csv");
  fd.append("mode", "create");
  const r = await adminA.post("/api/org/import", fd);
  assert.equal(r.status, 202, r.message);
  let job;
  for (let i = 0; i < 50; i++) {
    job = (await adminA.get(`/api/org/import/jobs/${r.data._id}`)).data;
    if (job.status === "completed" || job.status === "failed") break;
    await new Promise((s) => setTimeout(s, 100));
  }
  assert.equal(job.status, "completed", job.errorMessage);
  assert.equal(job.total, 10);
  assert.equal(job.created, 4, JSON.stringify(job.rowErrors)); // A-2, A-3, A-8, A-9
  assert.equal(job.duplicates, 1); // A-1 exists
  assert.equal(job.failed, 5);
  const rows = job.rowErrors.map((e) => e.row);
  assert.deepEqual(rows, [4, 5, 6, 7, 8, 9]);
  const errCsv = await adminA.get(`/api/org/import/jobs/${r.data._id}/errors.csv`, { raw: true });
  assert.match(await errCsv.text(), /Invalid email/);
  // duplicate name gets a unique slug
  const list = await adminA.get("/api/org/employees?search=rahul");
  assert.deepEqual(list.data.map((e) => e.slug).sort(), ["rahul-sharma", "rahul-sharma-2"]);
  // upsert updates existing
  const fd2 = new FormData();
  fd2.append("file", new Blob(["Employee ID,First Name,Designation\nA-2,Priya,CMO\n"], { type: "text/csv" }), "u.csv");
  fd2.append("mode", "upsert");
  const r2 = await adminA.post("/api/org/import", fd2);
  for (let i = 0; i < 50; i++) {
    job = (await adminA.get(`/api/org/import/jobs/${r2.data._id}`)).data;
    if (job.status === "completed") break;
    await new Promise((s) => setTimeout(s, 100));
  }
  assert.equal(job.updated, 1);
  const priya = await M.Employee.findOne({ organizationId: orgA._id, employeeCode: "A-2" }).lean();
  assert.equal(priya.designation, "CMO");
  assert.equal(priya.workEmail, "priya@abc.test", "blank cells do not wipe data");
});

test("xlsx template downloads and imports", async () => {
  const res = await adminA.get("/api/org/import/template", { raw: true });
  assert.equal(res.status, 200);
  const buf = Buffer.from(await res.arrayBuffer());
  const fd = new FormData();
  fd.append("file", new Blob([buf]), "template.xlsx");
  const r = await adminA.post("/api/org/import", fd);
  let job;
  for (let i = 0; i < 50; i++) {
    job = (await adminA.get(`/api/org/import/jobs/${r.data._id}`)).data;
    if (job.status === "completed" || job.status === "failed") break;
    await new Promise((s) => setTimeout(s, 100));
  }
  assert.equal(job.status, "completed", job.errorMessage);
  assert.equal(job.created, 1); // the example row EMP-0001
});

test("public card shows only whitelisted data and tracks events", async () => {
  await adminA.patch("/api/org/settings/company", { branding: { primaryColor: "#0E7490" }, contact: { website: "www.abc.test" }, privacyPolicyUrl: "https://abc.test/privacy" });
  await adminA.post("/api/org/content", { kind: "product", title: "Pumps", description: "Industrial" });
  await adminA.post("/api/org/content", { kind: "video", title: "Intro", url: "https://youtu.be/aqz-KE-bpKQ" });
  const r = await anon.get("/api/public/cards/abc-company/rahul-sharma");
  assert.equal(r.status, 200, r.message);
  const c = r.data;
  assert.equal(c.employee.name, "Rahul Sharma");
  assert.equal(c.company.primaryColor, "#0E7490");
  assert.equal(c.company.privacyPolicyUrl, "https://abc.test/privacy");
  assert.equal(c.content.products.length, 1);
  assert.equal(c.content.videos[0].youtubeId, "aqz-KE-bpKQ");
  const json = JSON.stringify(c);
  for (const secret of ["organizationId", "userId", "stats", "_id", "employeeCode", "lastReminderAt"]) assert.ok(!json.includes(`"${secret}"`), `${secret} must not be public`);

  for (const type of ["view", "view", "share", "whatsapp_click"]) {
    await anon.post("/api/public/events", { orgSlug: "abc-company", slug: "rahul-sharma", type, source: "qr" });
  }
  const v = await anon.get("/api/public/cards/abc-company/rahul-sharma/vcard", { raw: true });
  assert.match(await v.text(), /FN:Rahul Sharma/);
  const q = await anon.get("/api/public/cards/abc-company/rahul-sharma/qr.png", { raw: true });
  assert.equal(q.headers.get("content-type"), "image/png");

  const missingConsent = await anon.post("/api/public/enquiries", { orgSlug: "abc-company", slug: "rahul-sharma", name: "Visitor", phone: "9876512345", message: "Need pumps" });
  assert.equal(missingConsent.status, 400);
  const enq = await anon.post("/api/public/enquiries", { orgSlug: "abc-company", slug: "rahul-sharma", name: "Visitor", phone: "9876512345", message: "Need pumps", consent: true });
  assert.equal(enq.status, 201, JSON.stringify(enq));
  const honey = await anon.post("/api/public/enquiries", { orgSlug: "abc-company", slug: "rahul-sharma", name: "Bot", phone: "9876512345", website: "spam" });
  assert.equal(honey.status, 201);

  const a = await adminA.get("/api/org/analytics?range=7d");
  assert.equal(a.data.totals.view, 2);
  assert.equal(a.data.totals.unique, 1);
  assert.equal(a.data.totals.qr_scan, 2);
  assert.equal(a.data.totals.vcard_download, 1);
  assert.equal(a.data.totals.enquiry, 1);
  assert.equal(a.data.employees[0].name, "Rahul Sharma");
  const enquiries = await adminA.get("/api/org/enquiries");
  assert.equal(enquiries.data.length, 1, "honeypot enquiry dropped");
  assert.equal(enquiries.data[0].consent, true);
  assert.match(enquiries.data[0].consentText, /ABC Company/);
  assert.ok(enquiries.data[0].consentAt);
  const exportResponse = await adminA.get("/api/org/enquiries/export.csv", { raw: true });
  assert.match(await exportResponse.text(), /Consent,Consent at/);
  // B cannot see A's enquiries or analytics
  assert.equal((await adminB.get("/api/org/enquiries")).data.length, 0);
  assert.equal((await adminB.get("/api/org/analytics?range=7d")).data.totals.view, 0);
  assert.equal((await adminB.patch(`/api/org/enquiries/${enquiries.data[0]._id}`, { status: "closed" })).status, 404);
});

test("enquiry consent is required and stored with the organization wording", async () => {
  const missingConsent = await anon.post("/api/public/enquiries", { orgSlug: "abc-company", slug: "rahul-sharma", name: "No Consent", phone: "9876512345" });
  assert.equal(missingConsent.status, 400);

  const created = await anon.post("/api/public/enquiries", { orgSlug: "abc-company", slug: "rahul-sharma", name: "Consent Visitor", phone: "9876512345", consent: true });
  assert.equal(created.status, 201, JSON.stringify(created));
  const stored = await M.Enquiry.findOne({ organizationId: orgA._id, name: "Consent Visitor" }).sort({ createdAt: -1 }).lean();
  assert.equal(stored.consent, true);
  assert.match(stored.consentText, /ABC Company/);
  assert.ok(stored.consentAt instanceof Date);
});

test("privacy policy URL accepts only HTTPS URLs", async () => {
  assert.equal((await adminA.patch("/api/org/settings/company", { privacyPolicyUrl: "http://abc.test/privacy" })).status, 400);
  assert.equal((await adminA.patch("/api/org/settings/company", { privacyPolicyUrl: "javascript:alert(1)" })).status, 400);
});

test("company admins cannot set organization verification", async () => {
  assert.equal((await adminA.patch("/api/org/settings/company", { verification: { isVerified: true } })).status, 200);
  assert.equal((await M.Organization.findById(orgA._id).lean()).verification.isVerified, false);
  assert.equal((await adminA.patch(`/api/platform/organizations/${orgA._id}/verification`, { isVerified: true })).status, 403);
});

test("super admin can verify and unverify organizations with audit entries", async () => {
  let r = await sa.patch(`/api/platform/organizations/${orgA._id}/verification`, { isVerified: true, note: "Documents reviewed" });
  assert.equal(r.status, 200, r.message);
  assert.equal(r.data.isVerified, true);
  assert.ok(r.data.verifiedAt);
  r = await sa.patch(`/api/platform/organizations/${orgA._id}/verification`, { isVerified: false });
  assert.equal(r.status, 200);
  assert.equal(r.data.isVerified, false);
  assert.equal(r.data.verifiedAt, null);
  const audit = await sa.get("/api/platform/audit-logs?limit=100");
  assert.ok(audit.data.some((a) => a.action === "organization.verified"));
  assert.ok(audit.data.some((a) => a.action === "organization.unverified"));
});

test("public cards expose only safe verification fields", async () => {
  await sa.patch(`/api/platform/organizations/${orgA._id}/verification`, { isVerified: true, note: "Internal note" });
  const card = await anon.get("/api/public/cards/abc-company/rahul-sharma");
  assert.deepEqual(Object.keys(card.data.verified).sort(), ["isVerified", "verifiedAt"]);
  assert.equal(card.data.verified.isVerified, true);
  assert.ok(card.data.verified.verifiedAt);
  assert.equal(card.data.verified.note, undefined);
  assert.equal(card.data.verified.verifiedBy, undefined);
  await sa.patch(`/api/platform/organizations/${orgA._id}/verification`, { isVerified: false });
});

test("unpublished / inactive cards are hidden", async () => {
  await adminA.patch(`/api/org/employees/${empA._id}`, { isPublished: false });
  assert.equal((await anon.get("/api/public/cards/abc-company/rahul-sharma")).status, 404);
  await adminA.patch(`/api/org/employees/${empA._id}`, { isPublished: true });
  assert.equal((await anon.get("/api/public/cards/abc-company/rahul-sharma")).status, 200);
});

test("employee login: invite, edit only allowed fields, cannot touch others", async () => {
  const inv = await adminA.post(`/api/org/employees/${empA._id}/invite`);
  assert.equal(inv.status, 200, inv.message);
  const emp = client();
  const acc = await emp.post("/api/auth/accept-invite", { token: tokenFromLink(inv.data.invite.link), password: "EmpPass123" });
  assert.equal(acc.status, 200, acc.message);
  emp.setToken(acc.data.accessToken);
  const me = await emp.get("/api/me/card");
  assert.equal(me.data.employee.name, "Rahul Sharma");
  assert.ok((await M.Employee.findOne({ _id: empA._id, organizationId: orgA._id })).activatedAt);

  assert.equal((await emp.patch("/api/me/card", { bio: "Hello", mobile: "+91 99999 88888" })).status, 200);
  assert.equal((await emp.patch("/api/me/card", { designation: "CEO" })).status, 403, "designation not editable by default");
  assert.equal((await emp.patch("/api/me/card", { organizationId: orgB._id })).status, 403);
  assert.equal((await emp.get("/api/org/employees")).status, 403);
  assert.equal((await emp.get("/api/platform/dashboard")).status, 403);

  // admin turns off employee login → session stops working
  await adminA.patch("/api/org/settings/card", { allowEmployeeLogin: false });
  assert.equal((await emp.get("/api/me/card")).status, 403);
  await adminA.patch("/api/org/settings/card", { allowEmployeeLogin: true });
});

test("refresh rotates tokens and detects reuse", async () => {
  const c = client();
  const l = await c.post("/api/auth/login", { email: "asha@abc.test", password: "AdminPass1" });
  assert.equal(l.status, 200);
  const first = c.jar.bdc_rt;
  const r1 = await c.post("/api/auth/refresh");
  assert.equal(r1.status, 200);
  assert.notEqual(c.jar.bdc_rt, first);
  // replay the old token after the grace window → everything revoked
  await M.RefreshToken.updateOne({ tokenHash: (await import("../src/common/crypto.js")).sha256(first) }, { revokedAt: new Date(Date.now() - 5 * 60_000) });
  const thief = client();
  thief.jar.bdc_rt = first;
  assert.equal((await thief.post("/api/auth/refresh")).status, 401);
  assert.equal((await c.post("/api/auth/refresh")).status, 401, "legit session also revoked after reuse");
  c.setToken(r1.data.accessToken);
  assert.equal((await c.get("/api/org/employees")).status, 401, "access token invalidated by tokenVersion bump");
  // log admin A back in for later tests
  const again = await adminA.post("/api/auth/login", { email: "asha@abc.test", password: "AdminPass1" });
  adminA.setToken(again.data.accessToken);
});

test("expired subscription: read-only admin, cards offline", async () => {
  const subs = await sa.get(`/api/platform/organizations/${orgA._id}`);
  const current = subs.data.subscriptions.find((s) => s.isCurrent);
  await sa.patch(`/api/platform/subscriptions/${current._id}`, { startDate: "2020-01-01", endDate: "2020-12-31" });
  const w = await adminA.post("/api/org/employees", { employeeCode: "A-99", firstName: "Late" });
  assert.equal(w.status, 402);
  assert.equal((await adminA.get("/api/org/employees")).status, 200, "reads still allowed");
  assert.equal((await anon.get("/api/public/cards/abc-company/rahul-sharma")).status, 404);
  await sa.patch(`/api/platform/subscriptions/${current._id}`, { startDate: new Date().toISOString(), endDate: new Date(Date.now() + 30 * 864e5).toISOString(), status: "active" });
  assert.equal((await anon.get("/api/public/cards/abc-company/rahul-sharma")).status, 200);
});

test("deactivated organization is locked out", async () => {
  await sa.post(`/api/platform/organizations/${orgB._id}/status`, { status: "inactive" });
  assert.equal((await adminB.get("/api/org/employees")).status, 403);
  assert.equal((await adminB.post("/api/auth/login", { email: "ben@xyz.test", password: "AdminPass2" })).status, 403);
  await sa.post(`/api/platform/organizations/${orgB._id}/status`, { status: "active" });
});

test("platform dashboard and reminders", async () => {
  const d = await sa.get("/api/platform/dashboard");
  assert.equal(d.status, 200, d.message);
  assert.equal(d.data.organizations.total, 2);
  assert.ok(d.data.employees.total >= 8);
  const pre = await adminA.get("/api/org/reminders");
  assert.equal(pre.status, 200, pre.message);
  assert.ok(pre.data.preview.noPhoto >= 1);
  await adminA.put("/api/org/reminders", { enabled: true, channels: { email: true, whatsapp: true }, criteria: { notActivated: true, noPhoto: true, inactiveDays: 0 }, schedule: { dayOfWeek: 1, hour: 10 }, minDaysBetween: 7 });
  const run = await adminA.post("/api/org/reminders/run");
  assert.equal(run.status, 200, run.message);
  assert.ok(run.data.matched >= 1);
  assert.ok(run.data.whatsapp.skipped >= 1, "whatsapp not configured → skipped, never faked");
  const logs = await adminA.get("/api/org/reminders");
  assert.ok(logs.data.logs.length >= 1);
});

test("audit logs are tenant scoped", async () => {
  const a = await adminA.get("/api/org/audit-logs?limit=200");
  const b = await adminB.get("/api/org/audit-logs?limit=200");
  assert.ok(a.data.every((l) => String(l.organizationId) === String(orgA._id)));
  assert.ok(b.data.every((l) => String(l.organizationId) === String(orgB._id)));
});
