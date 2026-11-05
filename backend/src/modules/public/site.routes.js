import { Router } from "express";
import { z } from "zod";
import { Lead, Plan, PlatformSetting, User } from "../../models/index.js";
import { FEATURES, ROLES } from "../../common/constants.js";
import { parse, emailSchema, isValidPhone, normalizePhone, pageParams, escapeRegex } from "../../common/validate.js";
import { badRequest, notFound } from "../../common/errors.js";
import { rateLimit } from "../../common/rateLimit.js";
import { sendEmail, templates } from "../../services/email.js";
import { audit } from "../../services/audit.js";
import { env } from "../../config/env.js";

const router = Router();
const plansLimiter = rateLimit({ windowMs: 60_000, max: 120 });
const leadLimiter = rateLimit({ windowMs: 60 * 60_000, max: 5 });
const employeeRanges = ["1-25", "26-100", "101-500", "501-2000", "2000+"];

router.get("/plans", plansLimiter, async (_req, res) => {
  const [plans, settings] = await Promise.all([
    Plan.find({ isActive: true }).sort({ sortOrder: 1, price: 1 }).lean(),
    PlatformSetting.findOne({ key: "platform" }).lean(),
  ]);
  res.setHeader("Cache-Control", "public, max-age=60");
  res.json({
    success: true,
    data: {
      plans: plans.map((plan) => ({
        id: plan._id,
        name: plan.name,
        code: plan.code,
        description: plan.description,
        price: plan.price,
        currency: plan.currency,
        billingCycle: plan.billingCycle,
        durationDays: plan.durationDays,
        employeeLimit: plan.employeeLimit,
        features: Object.entries(FEATURES).map(([key, label]) => ({ key, label, included: Boolean(plan.features?.[key]) })),
      })),
      support: { email: settings?.supportEmail || "", phone: settings?.supportPhone || "" },
      trialDays: settings?.defaultTrialDays || 14,
    },
  });
});

const demoSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(120),
  email: emailSchema,
  phone: z.string().trim().max(20).optional(),
  company: z.string().trim().min(2, "Please enter your company").max(160),
  designation: z.string().trim().max(120).optional(),
  employees: z.enum(employeeRanges),
  city: z.string().trim().max(120).optional(),
  interest: z.enum(["demo", "trial", "pricing", "other"]).default("demo"),
  planInterest: z.string().trim().max(120).optional(),
  message: z.string().trim().max(2000).optional(),
  consent: z.literal(true, { error: "Consent is required" }),
  website: z.string().max(200).optional(),
});

router.post("/demo-requests", leadLimiter, async (req, res) => {
  const b = parse(demoSchema, req.body);
  if (b.website) return res.status(201).json({ success: true, message: "Thank you! Our team will contact you within one working day." });
  if (b.phone && !isValidPhone(b.phone)) throw badRequest("phone: Enter a valid phone number with 10-15 digits");

  const lead = await Lead.create({
    ...b,
    phone: normalizePhone(b.phone),
    designation: b.designation || "",
    city: b.city || "",
    planInterest: b.planInterest || "",
    message: b.message || "",
    source: "website",
  });
  const [settings, admins] = await Promise.all([
    PlatformSetting.findOne({ key: "platform" }).lean(),
    User.find({ role: ROLES.SUPER_ADMIN, status: "active" }).select("email").lean(),
  ]);
  const recipients = new Set(admins.map((admin) => admin.email).filter(Boolean));
  if (settings?.supportEmail) recipients.add(settings.supportEmail);
  const email = templates.leadRequest({ lead, adminLink: `${env.frontendUrl}/platform/leads` });
  for (const to of recipients) sendEmail({ to, ...email }).catch(() => {});
  res.status(201).json({ success: true, message: "Thank you! Our team will contact you within one working day." });
});

export default router;
