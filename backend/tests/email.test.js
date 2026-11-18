import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

process.env.NODE_ENV = "test";
process.env.MONGO_URI = process.env.TEST_MONGO_URI || "mongodb://127.0.0.1:27017/beno_card_test";
process.env.EMAIL_PROVIDER = "resend";
process.env.EMAIL_DAILY_LIMIT = "450";
process.env.RESEND_API_KEY = "test-key";

const { env } = await import("../src/config/env.js");
const { EmailOutbox, PlatformSetting } = await import("../src/models/index.js");
const { buildGmailRaw, getEmailMetrics, runQueuedEmails, sendEmail } = await import("../src/services/email.js");
const originalFetch = globalThis.fetch;
const testRecipients = [
  "person@example.com",
  "gmail-cache-one@example.com",
  "gmail-cache-two@example.com",
  "invalid-grant@example.com",
  "quota-sent@example.com",
  "quota-queued@example.com",
  "retry-email@example.com",
];
let priorPlatformSettings;

before(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  priorPlatformSettings = await PlatformSetting.findOne({ key: "platform" }).lean();
  await EmailOutbox.deleteMany({ to: { $in: testRecipients } });
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  env.emailProvider = "resend";
  env.emailDailyLimit = 450;
  env.resendApiKey = "test-key";
  await EmailOutbox.deleteMany({ to: { $in: testRecipients } });
});

after(async () => {
  if (priorPlatformSettings) {
    await PlatformSetting.updateOne({ key: "platform" }, { $set: { supportEmail: priorPlatformSettings.supportEmail || "" } });
  } else {
    await PlatformSetting.deleteOne({ key: "platform" });
  }
  await mongoose.disconnect();
});

const request = (to = "person@example.com", subject = "Invite") =>
  sendEmail({ to, subject, html: "<p>Invite</p>", text: "Invite", kind: "email-test" });

test("classifies Resend testing-mode failures", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ message: "You can only send testing emails to your own email address." }), { status: 403 });
  const result = await request();
  assert.deepEqual({ sent: result.sent, code: result.code }, { sent: false, code: "testing_mode" });
});

test("classifies unverified sender failures", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ message: "The from address domain is not verified." }), { status: 403 });
  const result = await request();
  assert.deepEqual({ sent: result.sent, code: result.code }, { sent: false, code: "invalid_from" });
});

test("classifies unexpected Resend failures", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ message: "Temporary provider failure" }), { status: 500 });
  const result = await request();
  assert.deepEqual({ sent: result.sent, queued: result.queued, code: result.code }, { sent: false, queued: true, code: "send_failed" });
});

test("Resend provider request keeps its existing API shape", async () => {
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url, options };
    return new Response(JSON.stringify({ id: "resend-message-id" }), { status: 200 });
  };
  const result = await request();
  assert.equal(result.sent, true);
  assert.equal(captured.url, "https://api.resend.com/emails");
  assert.deepEqual(JSON.parse(captured.options.body), {
    from: env.emailFrom,
    to: ["person@example.com"],
    subject: "Invite",
    html: "<p>Invite</p>",
    text: "Invite",
  });
});

test("Gmail sends RFC 2047 MIME and reuses a cached access token", async () => {
  env.emailProvider = "gmail";
  env.emailDailyLimit = (await getEmailMetrics()).sentToday + 2;
  env.gmailClientId = "gmail-cache-client";
  env.gmailClientSecret = "gmail-cache-secret";
  env.gmailRefreshToken = "gmail-cache-refresh";
  env.gmailSender = "sender@example.com";
  await PlatformSetting.findOneAndUpdate(
    { key: "platform" },
    { $set: { supportEmail: "support@example.com" } },
    { upsert: true, returnDocument: "after" }
  );
  let tokenRequests = 0;
  let sendRequests = 0;
  globalThis.fetch = async (url, options) => {
    if (url === "https://oauth2.googleapis.com/token") {
      tokenRequests++;
      assert.equal(options.method, "POST");
      assert.match(String(options.body), /grant_type=refresh_token/);
      return new Response(JSON.stringify({ access_token: "mock-access-token", expires_in: 3600 }), { status: 200 });
    }
    sendRequests++;
    assert.equal(url, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
    assert.equal(options.headers.Authorization, "Bearer mock-access-token");
    const raw = JSON.parse(options.body).raw;
    assert.match(raw, /^[A-Za-z0-9_-]+$/);
    const mime = Buffer.from(raw, "base64url").toString("utf8");
    assert.match(mime, /From: =\?UTF-8\?B\?QmVubyBDYXJk\?= <sender@example\.com>/);
    assert.match(mime, /To: gmail-cache-(one|two)@example\.com/);
    assert.match(mime, /Reply-To: support@example\.com/);
    assert.ok(mime.includes(`Subject: =?UTF-8?B?${Buffer.from("Résumé invite").toString("base64")}?=`));
    assert.match(mime, /Content-Type: text\/plain; charset=UTF-8/);
    assert.match(mime, /Content-Type: text\/html; charset=UTF-8/);
    const boundary = mime.match(/boundary="([^"]+)"/)[1];
    const plainPart = mime.match(new RegExp(`Content-Type: text/plain; charset=UTF-8\\r\\nContent-Transfer-Encoding: base64\\r\\n\\r\\n([\\s\\S]*?)\\r\\n--${boundary}`))[1];
    const htmlPart = mime.match(new RegExp(`Content-Type: text/html; charset=UTF-8\\r\\nContent-Transfer-Encoding: base64\\r\\n\\r\\n([\\s\\S]*?)\\r\\n--${boundary}--`))[1];
    assert.equal(Buffer.from(plainPart.replace(/\r\n/g, ""), "base64").toString("utf8"), "Plain text");
    assert.equal(Buffer.from(htmlPart.replace(/\r\n/g, ""), "base64").toString("utf8"), "<p>HTML</p>");
    return new Response(JSON.stringify({ id: `gmail-message-${sendRequests}` }), { status: 200 });
  };

  const first = await sendEmail({ to: "gmail-cache-one@example.com", subject: "Résumé invite", text: "Plain text", html: "<p>HTML</p>" });
  const second = await sendEmail({ to: "gmail-cache-two@example.com", subject: "Résumé invite", text: "Plain text", html: "<p>HTML</p>" });
  assert.equal(first.sent, true);
  assert.equal(second.sent, true);
  assert.equal(tokenRequests, 1);
  assert.equal(sendRequests, 2);

  const raw = buildGmailRaw({
    to: "person@example.com",
    subject: "Résumé invite",
    text: "Plain text",
    html: "<p>HTML</p>",
    sender: "sender@example.com",
    replyTo: "support@example.com",
  });
  assert.doesNotMatch(raw, /[+/=]/);
});

test("Gmail invalid_grant returns the refresh-token recovery message", async () => {
  env.emailProvider = "gmail";
  env.emailDailyLimit = (await getEmailMetrics()).sentToday + 1;
  env.gmailClientId = "gmail-invalid-client";
  env.gmailClientSecret = "gmail-invalid-secret";
  env.gmailRefreshToken = "gmail-invalid-refresh";
  env.gmailSender = "sender@example.com";
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: "invalid_grant",
    error_description: "Token has been expired or revoked.",
  }), { status: 400 });

  const result = await request("invalid-grant@example.com");
  assert.equal(result.sent, false);
  assert.equal(result.code, "invalid_grant");
  assert.equal(result.reason, "Gmail authorisation expired, generate a new refresh token");
  const saved = await EmailOutbox.findOne({ to: "invalid-grant@example.com" }).lean();
  assert.equal(saved.status, "failed");
  assert.equal(saved.lastError, result.reason);
});

test("emails over the daily cap queue and send after the next India day begins", async () => {
  env.emailProvider = "resend";
  env.emailDailyLimit = (await getEmailMetrics()).sentToday + 1;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ id: "quota-message" }), { status: 200 });
  };

  const sent = await request("quota-sent@example.com");
  const queued = await request("quota-queued@example.com");
  assert.equal(sent.sent, true);
  assert.equal(queued.queued, true);
  assert.equal(calls, 1);
  const queuedId = (await EmailOutbox.findOne({ to: "quota-queued@example.com" }).select("_id").lean())._id;
  await EmailOutbox.collection.updateOne({ _id: queuedId }, { $set: { createdAt: new Date(0) } });
  const queuedRecord = await EmailOutbox.findOne({ to: "quota-queued@example.com" }).lean();
  assert.equal(queuedRecord.status, "queued");
  assert.ok(queuedRecord.sendAfter.getTime() > Date.now());

  const tomorrow = new Date(Date.now() + 36 * 60 * 60_000);
  const futureMetrics = await getEmailMetrics(tomorrow);
  env.emailDailyLimit = futureMetrics.sentToday + 1;
  const summary = await runQueuedEmails(tomorrow);
  assert.ok(summary.sent >= 1);
  const delivered = await EmailOutbox.findById(queuedRecord._id).lean();
  assert.equal(delivered.status, "sent");
  assert.equal(delivered.attempts, 1);
  assert.ok(delivered.sentAt.getTime() >= tomorrow.getTime());
});

test("queued transient email retries with backoff and fails after five attempts", async () => {
  env.emailProvider = "resend";
  env.emailDailyLimit = (await getEmailMetrics()).sentToday + 1;
  globalThis.fetch = async () => new Response(JSON.stringify({ message: "Temporary provider failure" }), { status: 503 });
  const record = await EmailOutbox.create({
    to: "retry-email@example.com",
    subject: "Retry",
    html: "<p>Retry</p>",
    text: "Retry",
    kind: "email-test",
    status: "queued",
    sendAfter: new Date(),
  });
  await EmailOutbox.collection.updateOne({ _id: record._id }, { $set: { createdAt: new Date(0) } });

  let now = new Date();
  for (let attempt = 1; attempt <= 5; attempt++) {
    await runQueuedEmails(now);
    const updated = await EmailOutbox.findById(record._id).lean();
    assert.equal(updated.attempts, attempt);
    if (attempt < 5) {
      assert.equal(updated.status, "queued");
      assert.ok(updated.sendAfter.getTime() > now.getTime());
      now = updated.sendAfter;
    } else {
      assert.equal(updated.status, "failed");
      assert.equal(updated.lastError, "Temporary provider failure");
    }
  }
});
