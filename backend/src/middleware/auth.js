import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { User, Organization } from "../models/index.js";
import { unauthorized, forbidden } from "../common/errors.js";
import { ROLES } from "../common/constants.js";
import { getEntitlements, assertActive, assertFeature } from "../services/entitlements.js";

export function signAccessToken(user) {
  return jwt.sign(
    {
      sub: String(user._id),
      role: user.role,
      org: user.organizationId ? String(user.organizationId) : null,
      tv: user.tokenVersion || 0,
    },
    env.jwtAccessSecret,
    { expiresIn: env.accessTokenTtl, issuer: "beno-digital-card" }
  );
}

/**
 * Verifies the Bearer token AND re-checks the user in the database on every request,
 * so disabled users, changed roles and revoked sessions take effect immediately.
 * The organization id always comes from the user record — never from the request.
 */
export async function authenticate(req, _res, next) {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Bearer ")) return next(unauthorized());
  let payload;
  try {
    payload = jwt.verify(h.slice(7), env.jwtAccessSecret, { issuer: "beno-digital-card" });
  } catch (e) {
    return next(unauthorized(e.name === "TokenExpiredError" ? "Session expired." : "Invalid session.", e.name === "TokenExpiredError" ? "TOKEN_EXPIRED" : "UNAUTHORIZED"));
  }
  const user = await User.findById(payload.sub).select("name email role organizationId employeeId status tokenVersion").lean();
  if (!user || user.status !== "active" || (user.tokenVersion || 0) !== payload.tv) {
    return next(unauthorized("Your session is no longer valid. Please log in again."));
  }
  req.auth = {
    userId: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId || null,
    employeeId: user.employeeId || null,
  };
  next();
}

export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!req.auth) return next(unauthorized());
    if (!roles.includes(req.auth.role)) return next(forbidden());
    next();
  };

/**
 * Loads the caller's organization + subscription entitlements into req.tenant.
 * - Organization must exist and be active.
 * - When the subscription is not usable, only GET requests are allowed (read-only),
 *   except for paths listed in `allowWhenInactive`.
 */
export function tenantContext({ allowWhenInactive = [] } = {}) {
  return async (req, _res, next) => {
    const orgId = req.auth?.organizationId;
    if (!orgId || req.auth.role === ROLES.SUPER_ADMIN) return next(forbidden("This area is for company accounts."));
    const org = await Organization.findById(orgId).lean();
    if (!org) return next(forbidden("Your company account was not found."));
    if (org.status !== "active") return next(forbidden("Your company account is deactivated. Contact Beno support.", "ORG_INACTIVE"));
    const ent = await getEntitlements(org._id);
    req.tenant = { organizationId: org._id, org, ent };
    if (req.method !== "GET" && !allowWhenInactive.some((p) => req.path.startsWith(p))) {
      try {
        assertActive(ent);
      } catch (e) {
        return next(e);
      }
    }
    next();
  };
}

export const requireFeature = (key, label) => (req, _res, next) => {
  try {
    assertFeature(req.tenant.ent, key, label);
    next();
  } catch (e) {
    next(e);
  }
};
