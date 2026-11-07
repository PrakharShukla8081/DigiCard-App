import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

process.env.NODE_ENV = "test";
process.env.MONGO_URI = process.env.TEST_MONGO_URI || "mongodb://127.0.0.1:27017/beno_card_test";
process.env.JWT_ACCESS_SECRET ||= "test-secret-test-secret-test-secret-1234";

const { createApp } = await import("../src/app.js");
const { env } = await import("../src/config/env.js");
const { JobLock, Organization, NotificationLog } = await import("../src/models/index.js");
const { runDueReminders } = await import("../src/jobs/scheduler.js");
const { localParts } = await import("../src/services/time.js");

let server;
let base;
const secret = "test-cron-secret-test-cron-secret-1234";

before(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  env.cronSecret = secret;
  await JobLock.deleteMany({});
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server?.close();
  await mongoose.disconnect();
});

async function post(path, body, headers = {}) {
  const response = await fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

test("cron trigger rejects missing and wrong secrets", async () => {
  assert.equal((await post("/api/internal/jobs/run")).status, 401);
  assert.equal((await post("/api/internal/jobs/run", undefined, { "x-cron-secret": "wrong" })).status, 401);
});

test("cron trigger returns both job summaries with the correct secret", async () => {
  const result = await post("/api/internal/jobs/run", undefined, { "x-cron-secret": secret });
  assert.equal(result.status, 200);
  assert.ok(result.body.data.reminders.status);
  assert.ok(result.body.data.subscriptions.status);
  assert.equal(typeof result.body.data.durationMs, "number");
});

test("cron trigger is disabled when the secret is unset", async () => {
  env.cronSecret = "";
  assert.equal((await post("/api/internal/jobs/run")).status, 404);
  env.cronSecret = secret;
});

test("job lock is skipped while held and released after a run", async () => {
  await JobLock.updateOne(
    { name: "subscriptions" },
    { $set: { lockedUntil: new Date(Date.now() + 60_000), lockedBy: "test" } },
    { upsert: true }
  );
  let result = await post("/api/internal/jobs/run", { jobs: ["subscriptions"] }, { "x-cron-secret": secret });
  assert.equal(result.status, 200);
  assert.equal(result.body.data.subscriptions.status, "skipped: already running");

  await JobLock.updateOne({ name: "subscriptions" }, { $set: { lockedUntil: new Date(0) } });
  result = await post("/api/internal/jobs/run", { jobs: ["subscriptions"] }, { "x-cron-secret": secret });
  assert.equal(result.body.data.subscriptions.status, "completed");
  const lock = await JobLock.findOne({ name: "subscriptions" }).lean();
  assert.ok(lock.lastRunAt);
  assert.ok(lock.lastResult);
});

test("running due reminders twice does not duplicate notification logs", async () => {
  const organization = await Organization.findOne({ status: "active" }).lean();
  assert.ok(organization, "an active organization is required");
  const now = new Date();
  const parts = localParts(now, organization.timezone || "Asia/Kolkata");
  await Organization.updateOne(
    { _id: organization._id },
    {
      $set: {
        "reminders.enabled": true,
        "reminders.channels": { email: true, whatsapp: false },
        "reminders.criteria": { notActivated: false, noPhoto: true, inactiveDays: 0 },
        "reminders.schedule": { dayOfWeek: parts.dayOfWeek, hour: parts.hour },
        "reminders.lastRunAt": null,
      },
    }
  );
  const before = await NotificationLog.countDocuments({ organizationId: organization._id, kind: "reminder" });
  await runDueReminders(now);
  const afterFirst = await NotificationLog.countDocuments({ organizationId: organization._id, kind: "reminder" });
  await runDueReminders(now);
  const afterSecond = await NotificationLog.countDocuments({ organizationId: organization._id, kind: "reminder" });
  assert.ok(afterFirst >= before);
  assert.equal(afterSecond, afterFirst);
});

test("deep health reports the database status", async () => {
  const response = await fetch(`${base}/api/health?deep=1`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.status, "ok");
  assert.equal(body.db, "ok");
});
