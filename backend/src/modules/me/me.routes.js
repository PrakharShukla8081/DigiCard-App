/**
 * Employee self-service API — mounted at /api/me.
 * An employee can only read/update their OWN employee record, and only the
 * fields their company admin has made editable.
 */
import { Router } from "express";
import { z } from "zod";
import { authenticate, requireRole, tenantContext } from "../../middleware/auth.js";
import { ROLES } from "../../common/constants.js";
import { Employee, Enquiry } from "../../models/index.js";
import { parse, emailSchema, phoneSchema, urlish, optStr, normalizePhone } from "../../common/validate.js";
import { forbidden, notFound, conflict } from "../../common/errors.js";
import { imageUpload } from "../../middleware/upload.js";
import { saveImage, deleteFile } from "../../storage/index.js";
import { buildCardPayload, loadCardContent, cardUrl, fullName } from "../../services/cards.js";
import { orgAnalytics, resolveRange } from "../../services/analytics.js";
import { audit } from "../../services/audit.js";

const router = Router();
router.use(authenticate, requireRole(ROLES.EMPLOYEE), tenantContext());
router.use((req, _res, next) => {
  const { org, ent } = req.tenant;
  if (!ent.features.employeeLogin || !org.cardSettings?.allowEmployeeLogin) return next(forbidden("Employee login is not enabled for your company.", "EMPLOYEE_LOGIN_DISABLED"));
  if (!req.auth.employeeId) return next(forbidden("Your login is not linked to an employee card."));
  next();
});

async function loadSelf(req) {
  const e = await Employee.findOne({ _id: req.auth.employeeId, organizationId: req.tenant.organizationId });
  if (!e) throw notFound("Your employee card was not found. Contact your admin.");
  return e;
}

router.get("/card", async (req, res) => {
  const { org, ent } = req.tenant;
  const e = await loadSelf(req);
  const card = await buildCardPayload({ org, employee: e.toObject(), ent, content: await loadCardContent(org._id, ent) });
  res.json({
    success: true,
    data: {
      employee: {
        _id: e._id,
        employeeCode: e.employeeCode,
        firstName: e.firstName,
        lastName: e.lastName,
        name: fullName(e),
        designation: e.designation,
        department: e.department,
        hideFromDirectory: Boolean(e.hideFromDirectory),
        workEmail: e.workEmail,
        mobile: e.mobile,
        whatsapp: e.whatsapp,
        photoUrl: e.photoUrl,
        bio: e.bio,
        location: e.location,
        website: e.website,
        social: e.social,
        cardStatus: e.cardStatus,
        isPublished: e.isPublished,
        stats: e.stats,
        url: cardUrl(org.slug, e.slug),
      },
      editableFields: org.cardSettings?.employeeEditableFields || [],
      card,
    },
  });
});

const SOCIAL = ["linkedin", "instagram", "facebook", "youtube", "twitter"];
const selfBody = z
  .object({
    designation: optStr(100),
    department: optStr(100),
    hideFromDirectory: z.boolean().optional(),
    workEmail: z.union([emailSchema, z.literal("")]).optional(),
    mobile: phoneSchema,
    whatsapp: phoneSchema,
    bio: optStr(600),
    location: optStr(120),
    website: urlish,
    linkedin: urlish,
    instagram: urlish,
    facebook: urlish,
    youtube: urlish,
    twitter: urlish,
  })
  .strict();

router.patch("/card", async (req, res) => {
  const { org } = req.tenant;
  const allowed = new Set(org.cardSettings?.employeeEditableFields || []);
  let b;
  try {
    b = parse(selfBody, req.body);
  } catch (e) {
    if (e.details?.some((d) => /unrecognized/i.test(d.message))) throw forbidden("You tried to change a field that cannot be edited here.");
    throw e;
  }
  const blocked = Object.keys(b).filter((k) => k !== "hideFromDirectory" && !allowed.has(k));
  if (blocked.length) throw forbidden(`Your admin has not allowed editing: ${blocked.join(", ")}.`);
  const e = await loadSelf(req);
  if (b.workEmail && b.workEmail !== e.workEmail && (await Employee.exists({ organizationId: org._id, workEmail: b.workEmail, _id: { $ne: e._id } }))) {
    throw conflict("Another employee already uses this email.");
  }
  for (const [k, v] of Object.entries(b)) {
    if (v === undefined) continue;
    if (SOCIAL.includes(k)) e.social[k] = v;
    else if (k === "mobile" || k === "whatsapp") e[k] = normalizePhone(v);
    else e[k] = v;
  }
  await e.save();
  audit(req, { action: "employee.self_updated", entity: "Employee", entityId: e._id, summary: `${fullName(e)} updated ${Object.keys(b).join(", ")}` });
  res.json({ success: true });
});

router.post("/card/photo", imageUpload, async (req, res) => {
  const allowed = req.tenant.org.cardSettings?.employeeEditableFields || [];
  if (!allowed.includes("photo")) throw forbidden("Your admin has not allowed changing the photo.");
  const e = await loadSelf(req);
  const saved = await saveImage(req.file, `org-${req.tenant.organizationId}/photos`);
  if (e.photoKey) await deleteFile(e.photoKey);
  e.photoUrl = saved.url;
  e.photoKey = saved.key;
  await e.save();
  audit(req, { action: "employee.self_photo", entity: "Employee", entityId: e._id, summary: fullName(e) });
  res.json({ success: true, data: { photoUrl: e.photoUrl } });
});

router.delete("/card/photo", async (req, res) => {
  const allowed = req.tenant.org.cardSettings?.employeeEditableFields || [];
  if (!allowed.includes("photo")) throw forbidden("Your admin has not allowed changing the photo.");
  const e = await loadSelf(req);
  if (e.photoKey) await deleteFile(e.photoKey);
  e.photoUrl = "";
  e.photoKey = "";
  await e.save();
  res.json({ success: true });
});

router.get("/stats", async (req, res) => {
  const { org } = req.tenant;
  const r = resolveRange({ range: ["7d", "30d", "90d"].includes(req.query.range) ? req.query.range : "30d" }, org.timezone);
  const data = await orgAnalytics(org._id, { from: r.from, to: r.to, employeeId: req.auth.employeeId });
  res.json({ success: true, data });
});

router.get("/enquiries", async (req, res) => {
  const items = await Enquiry.find({ organizationId: req.tenant.organizationId, employeeId: req.auth.employeeId }).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ success: true, data: items });
});

export default router;
