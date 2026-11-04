import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

process.env.NODE_ENV = "test";
process.env.MONGO_URI = process.env.TEST_MONGO_URI || "mongodb://127.0.0.1:27017/beno_card_test";
process.env.JWT_ACCESS_SECRET ||= "test-secret-test-secret-test-secret-1234";
process.env.SEED_SUPERADMIN_EMAIL = "bootstrap@beno.test";
process.env.SEED_SUPERADMIN_PASSWORD = "BootstrapPass123";
process.env.SEED_SUPERADMIN_NAME = "Bootstrap Admin";

const { connectDB, disconnectDB } = await import("../src/config/db.js");
const { User } = await import("../src/models/index.js");
const { ensureSuperAdmin } = await import("../src/services/bootstrap.js");

before(async () => {
  await connectDB();
  await User.deleteMany({ role: "super_admin" }).setOptions({ skipTenantGuard: true });
});

after(async () => {
  await User.deleteMany({ role: "super_admin" }).setOptions({ skipTenantGuard: true });
  await disconnectDB();
});

test("creates the first Super Admin once and preserves its password", async () => {
  const first = await ensureSuperAdmin();
  assert.equal(first.created, true);
  const created = await User.findOne({ email: "bootstrap@beno.test" }).select("+passwordHash").lean();
  assert.equal(created.name, "Bootstrap Admin");
  const originalHash = created.passwordHash;
  assert.equal(await bcrypt.compare("BootstrapPass123", originalHash), true);

  const second = await ensureSuperAdmin();
  assert.equal(second.created, false);
  const unchanged = await User.findOne({ email: "bootstrap@beno.test" }).select("+passwordHash").lean();
  assert.equal(unchanged.passwordHash, originalHash);
});

test("does not create an account when bootstrap credentials are missing", async () => {
  await User.deleteMany({ role: "super_admin" }).setOptions({ skipTenantGuard: true });
  delete process.env.SEED_SUPERADMIN_EMAIL;
  delete process.env.SEED_SUPERADMIN_PASSWORD;
  const result = await ensureSuperAdmin();
  assert.equal(result.created, false);
  assert.equal(await User.countDocuments({ role: "super_admin" }).setOptions({ skipTenantGuard: true }), 0);
});
