import { test, afterEach } from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.RESEND_API_KEY = "test-key";

const { sendEmail } = await import("../src/services/email.js");
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const request = () => sendEmail({ to: "person@example.com", subject: "Invite", html: "<p>Invite</p>", text: "Invite" });

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

test("classifies unexpected email failures", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ message: "Temporary provider failure" }), { status: 500 });
  const result = await request();
  assert.deepEqual({ sent: result.sent, code: result.code }, { sent: false, code: "send_failed" });
});
