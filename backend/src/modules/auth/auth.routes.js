import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { env } from "../../config/env.js";
import { User, RefreshToken, Organization, Employee } from "../../models/index.js";
import { parse, emailSchema, passwordSchema } from "../../common/validate.js";
import { randomToken, sha256 } from "../../common/crypto.js";
import { unauthorized, forbidden, badRequest } from "../../common/errors.js";
import { rateLimit } from "../../common/rateLimit.js";
import { ROLES } from "../../common/constants.js";
import { authenticate, signAccessToken } from "../../middleware/auth.js";
import { getEntitlements } from "../../services/entitlements.js";
import { sendEmail, templates } from "../../services/email.js";
import { audit } from "../../services/audit.js";

const router = Router();

export const REFRESH_COOKIE = "bdc_rt";
export const SESSION_COOKIE = "bdc_session";

const cookieBase = () => ({
  httpOnly: true,
  secure: env.isProd,
  sameSite: "lax",
});

async function issueSession(req, res, user) {
  const raw = randomToken(48);
  const expiresAt = new Date(Date.now() + env.refreshTokenDays * 864e5);
  await RefreshToken.create({
    userId: user._id,
    tokenHash: sha256(raw),
    expiresAt,
    userAgent: String(req.headers["user-agent"] || "").slice(0, 300),
    ip: req.ip,
  });
  res.cookie(REFRESH_COOKIE, raw, { ...cookieBase(), path: "/api/auth", expires: expiresAt });
  // Non-sensitive hint ("1") so the web app can redirect logged-out visitors before rendering.
  // Readable by JavaScript on purpose; it grants no access by itself.
  res.cookie(SESSION_COOKIE, "1", { ...cookieBase(), httpOnly: false, path: "/", expires: expiresAt });
  return raw;
}

function clearSession(res) {
  res.clearCookie(REFRESH_COOKIE, { ...cookieBase(), path: "/api/auth" });
  res.clearCookie(SESSION_COOKIE, { ...cookieBase(), httpOnly: false, path: "/" });
}

/** Public profile returned to the web app after login / refresh. */
async function sessionPayload(user) {
  const base = {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId ? String(user.organizationId) : null,
    employeeId: user.employeeId ? String(user.employeeId) : null,
  };
  if (!user.organizationId) return { user: base, organization: null, subscription: null };
  const org = await Organization.findById(user.organizationId).select("name slug status branding.logoUrl branding.primaryColor cardSettings.allowEmployeeLogin").lean();
  const ent = await getEntitlements(user.organizationId);
  return {
    user: base,
    organization: org && {
      id: String(org._id),
      name: org.name,
      slug: org.slug,
      status: org.status,
      logoUrl: org.branding?.logoUrl || "",
      primaryColor: org.branding?.primaryColor || "",
    },
    subscription: {
      status: ent.status,
      active: ent.active,
      planName: ent.plan?.name || null,
      endDate: ent.endDate,
      employeeLimit: ent.employeeLimit,
      features: ent.features,
    },
  };
}

/** Throws if this user may not sign in right now (company inactive, employee login off, ...). */
async function assertCanSignIn(user) {
  if (user.status === "disabled") throw forbidden("Your account is disabled. Contact your administrator.");
  if (user.role === ROLES.SUPER_ADMIN) return;
  const org = await Organization.findById(user.organizationId).select("status cardSettings.allowEmployeeLogin").lean();
  if (!org || org.status !== "active") throw forbidden("Your company account is deactivated. Contact Beno support.", "ORG_INACTIVE");
  if (user.role === ROLES.EMPLOYEE) {
    const ent = await getEntitlements(user.organizationId);
    if (!ent.features.employeeLogin || !org.cardSettings?.allowEmployeeLogin) {
      throw forbidden("Employee login is not enabled for your company. Ask your admin for help.", "EMPLOYEE_LOGIN_DISABLED");
    }
  }
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  key: (req) => `${req.ip}|${String(req.body?.email || "").toLowerCase()}`,
  message: "Too many login attempts. Please wait 15 minutes and try again.",
});
const emailLimiter = rateLimit({ windowMs: 60 * 60_000, max: 5, message: "Too many requests. Please try again in an hour." });

/* ───── POST /api/auth/login ───── */
router.post("/login", loginLimiter, async (req, res) => {
  const { email, password } = parse(z.object({ email: emailSchema, password: z.string().min(1).max(128) }), req.body);
  const user = await User.findOne({ email }).select("+passwordHash");
  // Same message for unknown email and wrong password, to avoid revealing which emails exist.
  if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    throw unauthorized("Incorrect email or password.", "INVALID_CREDENTIALS");
  }
  if (user.status === "invited") throw forbidden("Please finish setting up your account using the invite link in your email.", "INVITE_PENDING");
  await assertCanSignIn(user);
  user.lastLoginAt = new Date();
  await user.save();
  await issueSession(req, res, user);
  req.auth = { userId: user._id, name: user.name, role: user.role, organizationId: user.organizationId };
  audit(req, { action: "auth.login", entity: "User", entityId: user._id, summary: `${user.email} signed in` });
  res.json({ success: true, data: { accessToken: signAccessToken(user), ...(await sessionPayload(user)) } });
});

/* ───── POST /api/auth/refresh  (rotates the refresh token) ───── */
router.post("/refresh", async (req, res) => {
  const raw = req.cookies?.[REFRESH_COOKIE];
  if (!raw) throw unauthorized("No active session.", "NO_SESSION");
  const rt = await RefreshToken.findOne({ tokenHash: sha256(raw) });
  if (!rt || rt.expiresAt < new Date()) {
    clearSession(res);
    throw unauthorized("Session expired. Please log in again.", "NO_SESSION");
  }
  // Grace window: two tabs refreshing at once, or a page navigation that aborts the
  // response carrying the new cookie, can legitimately replay a just-rotated token.
  const graceMs = env.refreshReuseGraceSeconds * 1000;
  const benignReplay = rt.revokedAt && rt.replacedByHash && Date.now() - rt.revokedAt.getTime() < graceMs;
  if (rt.revokedAt && !benignReplay) {
    // A rotated token was used again: possible theft. Revoke every session of this user.
    await RefreshToken.updateMany({ userId: rt.userId, revokedAt: null }, { revokedAt: new Date() });
    await User.updateOne({ _id: rt.userId }, { $inc: { tokenVersion: 1 } });
    clearSession(res);
    throw unauthorized("Session expired. Please log in again.", "NO_SESSION");
  }
  const user = await User.findById(rt.userId);
  try {
    if (!user || user.status !== "active") throw unauthorized("Session expired. Please log in again.", "NO_SESSION");
    await assertCanSignIn(user);
  } catch (e) {
    rt.revokedAt = new Date();
    await rt.save();
    clearSession(res);
    throw e;
  }
  const next = await issueSession(req, res, user);
  if (!rt.revokedAt) {
    rt.revokedAt = new Date();
    rt.replacedByHash = sha256(next);
    await rt.save();
  }
  res.json({ success: true, data: { accessToken: signAccessToken(user), ...(await sessionPayload(user)) } });
});

/* ───── POST /api/auth/logout ───── */
router.post("/logout", async (req, res) => {
  const raw = req.cookies?.[REFRESH_COOKIE];
  if (raw) await RefreshToken.updateOne({ tokenHash: sha256(raw) }, { revokedAt: new Date() });
  clearSession(res);
  res.json({ success: true });
});

/* ───── POST /api/auth/logout-all  (signs out every device) ───── */
router.post("/logout-all", authenticate, async (req, res) => {
  await User.updateOne({ _id: req.auth.userId }, { $inc: { tokenVersion: 1 } });
  await RefreshToken.updateMany({ userId: req.auth.userId, revokedAt: null }, { revokedAt: new Date() });
  clearSession(res);
  res.json({ success: true });
});

/* ───── GET /api/auth/me ───── */
router.get("/me", authenticate, async (req, res) => {
  const user = await User.findById(req.auth.userId).lean();
  res.json({ success: true, data: await sessionPayload(user) });
});

/* ───── Invites ───── */
async function findInvite(token) {
  if (!token || typeof token !== "string") return null;
  return User.findOne({ inviteTokenHash: sha256(token), inviteExpires: { $gt: new Date() }, status: "invited" }).select("+inviteTokenHash");
}

router.get("/invite/:token", async (req, res) => {
  const user = await findInvite(req.params.token);
  if (!user) throw badRequest("This invite link is invalid or has expired. Ask your administrator to send a new one.");
  const org = user.organizationId ? await Organization.findById(user.organizationId).select("name").lean() : null;
  res.json({ success: true, data: { name: user.name, email: user.email, role: user.role, organizationName: org?.name || null } });
});

router.post("/accept-invite", emailLimiter, async (req, res) => {
  const { token, password, name } = parse(
    z.object({ token: z.string().min(10).max(200), password: passwordSchema, name: z.string().trim().min(2).max(120).optional() }),
    req.body
  );
  const user = await findInvite(token);
  if (!user) throw badRequest("This invite link is invalid or has expired. Ask your administrator to send a new one.");
  user.passwordHash = await bcrypt.hash(password, 12);
  if (name) user.name = name;
  user.status = "active";
  user.inviteTokenHash = null;
  user.inviteExpires = null;
  user.lastLoginAt = new Date();
  await assertCanSignIn(user);
  await user.save();
  if (user.role === ROLES.EMPLOYEE && user.employeeId) {
    await Employee.updateOne({ _id: user.employeeId, organizationId: user.organizationId, activatedAt: null }, { activatedAt: new Date() });
  }
  await issueSession(req, res, user);
  req.auth = { userId: user._id, name: user.name, role: user.role, organizationId: user.organizationId };
  audit(req, { action: "auth.invite_accepted", entity: "User", entityId: user._id, summary: `${user.email} accepted invite` });
  res.json({ success: true, data: { accessToken: signAccessToken(user), ...(await sessionPayload(user)) } });
});

/* ───── Password reset ───── */
router.post("/forgot-password", emailLimiter, async (req, res) => {
  const { email } = parse(z.object({ email: emailSchema }), req.body);
  const user = await User.findOne({ email, status: "active" });
  if (user) {
    const raw = randomToken(32);
    user.resetTokenHash = sha256(raw);
    user.resetExpires = new Date(Date.now() + 30 * 60_000);
    await user.save();
    const link = `${env.frontendUrl}/reset-password?token=${encodeURIComponent(raw)}`;
    const t = templates.reset({ name: user.name, link });
    await sendEmail({ to: user.email, ...t });
  }
  res.json({ success: true, message: "If an account exists for this email, a reset link has been sent." });
});

router.post("/reset-password", emailLimiter, async (req, res) => {
  const { token, password } = parse(z.object({ token: z.string().min(10).max(200), password: passwordSchema }), req.body);
  const user = await User.findOne({ resetTokenHash: sha256(token), resetExpires: { $gt: new Date() } }).select("+resetTokenHash");
  if (!user) throw badRequest("This reset link is invalid or has expired. Request a new one.");
  user.passwordHash = await bcrypt.hash(password, 12);
  user.resetTokenHash = null;
  user.resetExpires = null;
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();
  await RefreshToken.updateMany({ userId: user._id, revokedAt: null }, { revokedAt: new Date() });
  clearSession(res);
  res.json({ success: true, message: "Password updated. Please log in with your new password." });
});

router.post("/change-password", authenticate, async (req, res) => {
  const { currentPassword, newPassword } = parse(z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema }), req.body);
  const user = await User.findById(req.auth.userId).select("+passwordHash");
  if (!user?.passwordHash || !(await bcrypt.compare(currentPassword, user.passwordHash))) throw badRequest("Current password is incorrect.");
  user.passwordHash = await bcrypt.hash(newPassword, 12);
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();
  await RefreshToken.updateMany({ userId: user._id, revokedAt: null }, { revokedAt: new Date() });
  await issueSession(req, res, user);
  audit(req, { action: "auth.password_changed", entity: "User", entityId: user._id });
  res.json({ success: true, data: { accessToken: signAccessToken(user) } });
});

export default router;
