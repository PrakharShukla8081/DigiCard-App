import { Subscription, Plan, Employee } from "../models/index.js";
import { FEATURE_KEYS } from "../common/constants.js";
import { forbidden, paymentRequired } from "../common/errors.js";

/** Subscription status after applying the end date (a past end date means expired). */
export function effectiveStatus(sub, now = new Date()) {
  if (!sub) return "none";
  if ((sub.status === "active" || sub.status === "trial") && sub.endDate && new Date(sub.endDate) < now) return "expired";
  return sub.status;
}

export const isUsable = (status) => status === "active" || status === "trial";

/** Load current subscription + plan and compute what the organization may do. */
export async function getEntitlements(organizationId) {
  const sub = await Subscription.findOne({ organizationId, isCurrent: true }).sort({ createdAt: -1 }).lean();
  const plan = sub ? await Plan.findById(sub.planId).lean() : null;
  const status = effectiveStatus(sub);
  const features = {};
  const overrides = sub?.featureOverrides || {};
  for (const k of FEATURE_KEYS) {
    const o = overrides instanceof Map ? overrides.get(k) : overrides[k];
    features[k] = typeof o === "boolean" ? o : Boolean(plan?.features?.[k]);
  }
  const employeeLimit = sub?.employeeLimitOverride ?? plan?.employeeLimit ?? null;
  return {
    subscription: sub,
    plan,
    status,
    active: isUsable(status),
    features,
    employeeLimit,
    endDate: sub?.endDate || null,
  };
}

export function assertFeature(ent, key, label) {
  if (!ent.features[key]) {
    throw forbidden(`${label || key} is not included in your current plan. Contact Beno to upgrade.`, "FEATURE_NOT_IN_PLAN");
  }
}

export function assertActive(ent) {
  if (!ent.active) {
    throw paymentRequired(
      ent.status === "none"
        ? "Your company has no subscription yet. Contact Beno to activate one."
        : `Your subscription is ${ent.status}. Renew it to make changes.`
    );
  }
}

/** Seats left for new employees (Infinity when the plan is unlimited). */
export async function seatsLeft(organizationId, ent) {
  if (!ent.employeeLimit) return Infinity;
  const used = await Employee.countDocuments({ organizationId });
  return Math.max(0, ent.employeeLimit - used);
}
