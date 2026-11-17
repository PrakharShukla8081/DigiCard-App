import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { generate, verify } from "otplib";

process.env.NODE_ENV = "test";
process.env.JWT_ACCESS_SECRET ||= "test-secret-test-secret-test-secret-1234";
process.env.ENCRYPTION_KEY ||= "a".repeat(64);
process.env.MONGO_URI = process.env.TEST_MONGO_URI || "mongodb://127.0.0.1:27017/beno_card_test";
process.env.FRONTEND_URL = "http://localhost:3000";
process.env.PUBLIC_CARD_BASE_URL = "http://localhost:3000";

const { createApp } = await import("../src/app.js");
const M = await import("../src/models/index.js");
const { runJobs } = await import("../src/jobs/runner.js");
const { ROLES } = await import("../src/common/constants.js");
const { signAccessToken } = await import("../src/middleware/auth.js");
const { resetTwoFactorForUser } = await import("../src/scripts/reset-2fa.js");

const password = "SecurityPass123";
const twoFactorEmail = "security-2fa@beno.test";
const lockoutEmail = "security-lockout@beno.test";
const organizationIds = [];
const orphanOrganizationIds = [];
const enquiryIds = [];
const leadIds = [];
let server;
let base;
let priorSettings;
let twoFactorUserId;
let lockoutUserId;

async function request(method, path, body, token) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

async function login(email, loginPassword = password) {
  return request("POST", "/api/auth/login", { email, password: loginPassword });
}

async function wrongTotp(secret) {
  let candidate = "000000";
  while ((await verify({ secret, token: candidate, epochTolerance: 30 })).valid) {
    candidate = String((Number(candidate) + 1) % 1_000_000).padStart(6, "0");
  }
  return candidate;
}

before(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  await M.LoginChallenge.syncIndexes();
  await M.User.deleteMany({ email: { $in: [twoFactorEmail, lockoutEmail] } });
  priorSettings = await M.PlatformSetting.findOne({ key: "platform" }).lean();
  await M.PlatformSetting.findOneAndUpdate(
    { key: "platform" },
    { $set: { require2faForSuperAdmin: false, enquiryRetentionDays: 730, leadRetentionDays: 730 } },
    { upsert: true, returnDocument: "after" }
  );
  const [twoFactorUser, lockoutUser] = await M.User.create([
    { name: "2FA Test", email: twoFactorEmail, role: ROLES.SUPER_ADMIN, status: "active", passwordHash: await bcrypt.hash(password, 4) },
    { name: "Lockout Test", email: lockoutEmail, role: ROLES.SUPER_ADMIN, status: "active", passwordHash: await bcrypt.hash(password, 4) },
  ]);
  twoFactorUserId = twoFactorUser._id;
  lockoutUserId = lockoutUser._id;
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server?.close();
  await M.LoginChallenge.deleteMany({ userId: { $in: [twoFactorUserId, lockoutUserId].filter(Boolean) } });
  await M.RefreshToken.deleteMany({ userId: { $in: [twoFactorUserId, lockoutUserId].filter(Boolean) } });
  await M.AuditLog.deleteMany({ entityId: { $in: [twoFactorUserId, lockoutUserId].filter(Boolean).map(String) } });
  await M.User.deleteMany({ _id: { $in: [twoFactorUserId, lockoutUserId].filter(Boolean) } });
  if (organizationIds.length) {
    await M.Enquiry.deleteMany({ organizationId: { $in: organizationIds } }).setOptions({ skipTenantGuard: true });
    await M.Organization.deleteMany({ _id: { $in: organizationIds } });
  }
  if (enquiryIds.length) {
    await M.Enquiry.deleteMany({ organizationId: { $in: orphanOrganizationIds }, _id: { $in: enquiryIds } }).setOptions({ skipTenantGuard: true });
  }
  if (leadIds.length) await M.Lead.deleteMany({ _id: { $in: leadIds } });
  await M.JobLock.deleteOne({ name: "retention" });
  if (priorSettings) {
    await M.PlatformSetting.updateOne(
      { key: "platform" },
      {
        $set: {
          require2faForSuperAdmin: priorSettings.require2faForSuperAdmin ?? false,
          enquiryRetentionDays: priorSettings.enquiryRetentionDays ?? 730,
          leadRetentionDays: priorSettings.leadRetentionDays ?? 730,
        },
      }
    );
  } else {
    await M.PlatformSetting.deleteOne({ key: "platform" });
  }
  await mongoose.disconnect();
});

test("2FA requires a valid code and consumes recovery codes once", async () => {
  const initialLogin = await login(twoFactorEmail);
  assert.equal(initialLogin.status, 200);
  const authToken = initialLogin.body.data.accessToken;
  const setup = await request("POST", "/api/auth/2fa/setup", {}, authToken);
  assert.equal(setup.status, 200, setup.body.message);
  assert.match(setup.body.data.qrDataUrl, /^data:image\/png;base64,/);

  const enabled = await request(
    "POST",
    "/api/auth/2fa/enable",
    { code: await generate({ secret: setup.body.data.secret }) },
    authToken
  );
  assert.equal(enabled.status, 200, enabled.body.message);
  assert.equal(enabled.body.data.recoveryCodes.length, 8);
  const storedUser = await M.User.findById(twoFactorUserId).select("+totpSecretEnc +recoveryCodeHashes").lean();
  assert.notEqual(storedUser.totpSecretEnc, setup.body.data.secret);
  assert.equal(storedUser.recoveryCodeHashes.length, 8);

  let challenge = await login(twoFactorEmail);
  assert.equal(challenge.status, 200);
  assert.equal(challenge.body.data.challengeRequired, true);
  assert.equal("accessToken" in challenge.body.data, false);
  const challengeToken = challenge.body.data.challengeToken;
  const rejected = await request("POST", "/api/auth/2fa", { challengeToken, code: await wrongTotp(setup.body.data.secret) });
  assert.equal(rejected.status, 401);
  assert.equal(rejected.body.message, "Incorrect email or password.");

  const accepted = await request("POST", "/api/auth/2fa", {
    challengeToken,
    code: await generate({ secret: setup.body.data.secret }),
  });
  assert.equal(accepted.status, 200, accepted.body.message);
  assert.ok(accepted.body.data.accessToken);

  challenge = await login(twoFactorEmail);
  const recoveryCode = enabled.body.data.recoveryCodes[0];
  const recoveryAccepted = await request("POST", "/api/auth/2fa", {
    challengeToken: challenge.body.data.challengeToken,
    code: recoveryCode,
  });
  assert.equal(recoveryAccepted.status, 200, recoveryAccepted.body.message);

  challenge = await login(twoFactorEmail);
  const reused = await request("POST", "/api/auth/2fa", {
    challengeToken: challenge.body.data.challengeToken,
    code: recoveryCode,
  });
  assert.equal(reused.status, 401);

  const prematurePolicy = await request(
    "PUT",
    "/api/platform/settings",
    { require2faForSuperAdmin: true },
    accepted.body.data.accessToken
  );
  assert.equal(prematurePolicy.status, 400);
  await M.PlatformSetting.updateOne({ key: "platform" }, { $set: { require2faForSuperAdmin: true } });
  try {
    const unenrolledLogin = await login(lockoutEmail);
    assert.equal(unenrolledLogin.status, 403);
    const unenrolledUser = await M.User.findById(lockoutUserId);
    const blockedPlatformRequest = await request(
      "GET",
      "/api/platform/settings",
      undefined,
      signAccessToken(unenrolledUser)
    );
    assert.equal(blockedPlatformRequest.status, 403);
  } finally {
    await M.PlatformSetting.updateOne({ key: "platform" }, { $set: { require2faForSuperAdmin: false } });
  }

  const disableCode = await generate({ secret: setup.body.data.secret });
  const wrongPassword = await request(
    "POST",
    "/api/auth/2fa/disable",
    { password: "WrongPassword123", code: disableCode },
    recoveryAccepted.body.data.accessToken
  );
  assert.equal(wrongPassword.status, 400);
  const disabled = await request(
    "POST",
    "/api/auth/2fa/disable",
    { password, code: disableCode },
    recoveryAccepted.body.data.accessToken
  );
  assert.equal(disabled.status, 200);
  assert.equal((await login(twoFactorEmail)).body.data.challengeRequired, undefined);
});

test("five failed sign-ins lock the account and write an audit entry", async () => {
  const wrong = await login(lockoutEmail, "WrongPassword123");
  const unknown = await login("missing-security-user@beno.test", "WrongPassword123");
  assert.equal(wrong.status, 401);
  assert.equal(wrong.body.message, unknown.body.message);

  for (let attempt = 1; attempt < 5; attempt += 1) {
    const result = await login(lockoutEmail, "WrongPassword123");
    assert.equal(result.status, 401);
    assert.equal(result.body.message, wrong.body.message);
  }
  const locked = await M.User.findById(lockoutUserId).lean();
  assert.equal(locked.failedLoginAttempts, 5);
  assert.ok(locked.loginLockedUntil.getTime() > Date.now());
  assert.ok(locked.loginLockedUntil.getTime() <= Date.now() + 15 * 60_000);

  const correctPasswordWhileLocked = await login(lockoutEmail);
  assert.equal(correctPasswordWhileLocked.status, 401);
  assert.equal(correctPasswordWhileLocked.body.message, wrong.body.message);
  assert.ok(await M.AuditLog.exists({ action: "auth.account_locked", entityId: String(lockoutUserId) }));

  await M.User.updateOne(
    { _id: lockoutUserId },
    { $set: { loginLockedUntil: new Date(Date.now() - 1000), failedLoginAttempts: 5 } }
  );
  const afterLockExpires = await login(lockoutEmail);
  assert.equal(afterLockExpires.status, 200);
  const reset = await M.User.findById(lockoutUserId).lean();
  assert.equal(reset.failedLoginAttempts, 0);
  assert.equal(reset.loginLockedUntil, null);
});

test("break-glass reset disables 2FA, clears lockout, invalidates tokens, and audits", async () => {
  const refreshToken = await M.RefreshToken.create({
    userId: lockoutUserId,
    tokenHash: new mongoose.Types.ObjectId().toString(),
    expiresAt: new Date(Date.now() + 864e5),
  });
  const challenge = await M.LoginChallenge.create({
    userId: lockoutUserId,
    tokenHash: new mongoose.Types.ObjectId().toString(),
    expiresAt: new Date(Date.now() + 5 * 60_000),
  });
  await M.User.updateOne(
    { _id: lockoutUserId },
    {
      $set: {
        totpSecretEnc: "encrypted-test-secret",
        pendingTotpSecretEnc: "pending-test-secret",
        recoveryCodeHashes: ["recovery-hash"],
        failedLoginAttempts: 5,
        loginLockedUntil: new Date(Date.now() + 15 * 60_000),
        tokenVersion: 9,
      },
    }
  );

  const result = await resetTwoFactorForUser(` ${lockoutEmail.toUpperCase()} `);
  assert.equal(result.email, lockoutEmail);
  const user = await M.User.findById(lockoutUserId)
    .select("+totpSecretEnc +pendingTotpSecretEnc +recoveryCodeHashes")
    .lean();
  assert.equal(user.totpSecretEnc, null);
  assert.equal(user.pendingTotpSecretEnc, null);
  assert.deepEqual(user.recoveryCodeHashes, []);
  assert.equal(user.failedLoginAttempts, 0);
  assert.equal(user.loginLockedUntil, null);
  assert.equal(user.tokenVersion, 10);
  assert.ok((await M.RefreshToken.findById(refreshToken._id)).revokedAt);
  assert.equal(await M.LoginChallenge.exists({ _id: challenge._id }), null);
  assert.ok(await M.AuditLog.exists({ action: "auth.2fa_reset_cli", entityId: String(lockoutUserId) }));
});

test("retention removes old records only within known tenant scopes", async () => {
  await M.PlatformSetting.updateOne(
    { key: "platform" },
    { $set: { enquiryRetentionDays: 30, leadRetentionDays: 45 } }
  );
  const suffix = new mongoose.Types.ObjectId().toString();
  const [orgA, orgB] = await M.Organization.create([
    { name: "Retention A", slug: `retention-a-${suffix}` },
    { name: "Retention B", slug: `retention-b-${suffix}` },
  ]);
  organizationIds.push(orgA._id, orgB._id);
  const orphanOrgId = new mongoose.Types.ObjectId();
  orphanOrganizationIds.push(orphanOrgId);
  const employeeId = new mongoose.Types.ObjectId();
  const enquiries = await M.Enquiry.create([
    { organizationId: orgA._id, employeeId, name: "Old A" },
    { organizationId: orgA._id, employeeId, name: "New A" },
    { organizationId: orgB._id, employeeId, name: "Old B" },
    { organizationId: orgB._id, employeeId, name: "New B" },
    { organizationId: orphanOrgId, employeeId, name: "Orphan old" },
  ]);
  enquiryIds.push(...enquiries.map((item) => item._id));
  const oldDate = new Date(Date.now() - 31 * 864e5);
  const recentDate = new Date(Date.now() - 10 * 864e5);
  const oldLeadDate = new Date(Date.now() - 61 * 864e5);
  await M.Enquiry.collection.updateMany({ _id: { $in: [enquiries[0]._id, enquiries[2]._id, enquiries[4]._id] } }, { $set: { createdAt: oldDate } });
  await M.Enquiry.collection.updateMany({ _id: { $in: [enquiries[1]._id, enquiries[3]._id] } }, { $set: { createdAt: recentDate } });

  const leads = await M.Lead.create([
    { name: "Old lead", email: "old-retention@beno.test", company: "Old Co", employees: "1-25", consent: true },
    { name: "Recent lead", email: "new-retention@beno.test", company: "New Co", employees: "1-25", consent: true },
  ]);
  leadIds.push(...leads.map((item) => item._id));
  await M.Lead.collection.updateOne({ _id: leads[0]._id }, { $set: { createdAt: oldLeadDate } });
  await M.Lead.collection.updateOne({ _id: leads[1]._id }, { $set: { createdAt: recentDate } });

  const result = await runJobs(["retention"], { trigger: "test" });
  assert.equal(result.retention.status, "completed");
  assert.ok(result.retention.enquiries >= 2);
  assert.ok(result.retention.leads >= 1);
  for (const [organizationId, oldRecord, freshRecord] of [
    [orgA._id, enquiries[0]._id, enquiries[1]._id],
    [orgB._id, enquiries[2]._id, enquiries[3]._id],
  ]) {
    assert.equal(await M.Enquiry.exists({ organizationId, _id: oldRecord }), null);
    assert.ok(await M.Enquiry.exists({ organizationId, _id: freshRecord }));
  }
  assert.ok(await M.Enquiry.exists({ organizationId: orphanOrgId, _id: enquiries[4]._id }));
  assert.equal(await M.Lead.exists({ _id: leads[0]._id }), null);
  assert.ok(await M.Lead.exists({ _id: leads[1]._id }));
});
