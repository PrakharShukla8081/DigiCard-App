import { Router } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import QRCode from "qrcode";
import { ZipArchive } from "archiver";
import { Employee, User, RefreshToken } from "../../models/index.js";
import { parse, assertId, emailSchema, phoneSchema, urlish, optStr, pageParams, escapeRegex, normalizePhone, objectId } from "../../common/validate.js";
import { badRequest, conflict, notFound, forbidden } from "../../common/errors.js";
import { slugify, uniqueSlug } from "../../common/slug.js";
import { toCsv } from "../../common/csv.js";
import { ROLES, CARD_TEMPLATES } from "../../common/constants.js";
import { seatsLeft, assertFeature } from "../../services/entitlements.js";
import { saveImage, deleteFile } from "../../storage/index.js";
import { imageUpload } from "../../middleware/upload.js";
import { issueInvite } from "../../services/invites.js";
import { audit } from "../../services/audit.js";
import { cardUrl, fullName, buildCardPayload, loadCardContent } from "../../services/cards.js";

const router = Router();

const socialSchema = z.object({ linkedin: urlish, instagram: urlish, facebook: urlish, youtube: urlish, twitter: urlish }).partial();
const empBody = z.object({
  employeeCode: z.string().trim().min(1).max(50),
  firstName: z.string().trim().min(1).max(60),
  lastName: optStr(60),
  designation: optStr(100),
  department: optStr(100),
  workEmail: z.union([emailSchema, z.literal("")]).optional(),
  mobile: phoneSchema,
  whatsapp: phoneSchema,
  bio: optStr(600),
  location: optStr(120),
  website: urlish,
  social: socialSchema.optional(),
  template: z.enum([...CARD_TEMPLATES, ""]).optional(),
  cardStatus: z.enum(["active", "inactive"]).optional(),
  isPublished: z.boolean().optional(),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,80}$/, "Use 2-80 lowercase letters, numbers or dashes").optional(),
  photoUrl: z.union([z.string().trim().regex(/^https:\/\//, "Photo URL must start with https://").max(500), z.literal("")]).optional(),
});

/** Shape returned to the admin UI. */
export function employeeDto(e, org) {
  return {
    _id: e._id,
    employeeCode: e.employeeCode,
    firstName: e.firstName,
    lastName: e.lastName,
    name: fullName(e),
    designation: e.designation,
    department: e.department,
    workEmail: e.workEmail,
    mobile: e.mobile,
    whatsapp: e.whatsapp,
    photoUrl: e.photoUrl,
    bio: e.bio,
    location: e.location,
    website: e.website,
    social: e.social || {},
    template: e.template || "",
    slug: e.slug,
    url: cardUrl(org.slug, e.slug),
    cardStatus: e.cardStatus,
    isPublished: e.isPublished,
    publishedAt: e.publishedAt,
    activatedAt: e.activatedAt,
    lastEngagementAt: e.lastEngagementAt,
    lastReminderAt: e.lastReminderAt,
    stats: e.stats || {},
    login: e._login || null,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

async function attachLogins(orgId, list) {
  const ids = list.map((e) => e.userId).filter(Boolean);
  if (!ids.length) return list;
  const users = await User.find({ _id: { $in: ids }, organizationId: orgId }).select("status lastLoginAt invitedAt").lean();
  const um = Object.fromEntries(users.map((u) => [String(u._id), u]));
  for (const e of list) if (e.userId && um[String(e.userId)]) e._login = um[String(e.userId)];
  return list;
}

function buildFilter(orgId, q) {
  const f = { organizationId: orgId };
  if (q.search) {
    const rx = { $regex: escapeRegex(String(q.search).slice(0, 80)), $options: "i" };
    f.$or = [{ firstName: rx }, { lastName: rx }, { employeeCode: rx }, { workEmail: rx }, { designation: rx }, { department: rx }, { mobile: rx }];
  }
  if (q.department) f.department = String(q.department);
  if (q.cardStatus === "active" || q.cardStatus === "inactive") f.cardStatus = q.cardStatus;
  if (q.published === "true") f.isPublished = true;
  if (q.published === "false") f.isPublished = false;
  if (q.activated === "true") f.activatedAt = { $ne: null };
  if (q.activated === "false") f.activatedAt = null;
  if (q.photo === "false") f.photoUrl = "";
  if (Array.isArray(q.ids)) f._id = { $in: q.ids.filter((i) => mongoose.isValidObjectId(i)) };
  return f;
}

const SORTS = { name: { firstName: 1, lastName: 1 }, newest: { createdAt: -1 }, oldest: { createdAt: 1 }, views: { "stats.views": -1 }, code: { employeeCode: 1 } };

/* ───── list ───── */
router.get("/", async (req, res) => {
  const { org } = req.tenant;
  const { page, limit, skip } = pageParams(req.query);
  const f = buildFilter(org._id, req.query);
  const sort = SORTS[req.query.sort] || SORTS.newest;
  const [items, total] = await Promise.all([Employee.find(f).sort(sort).skip(skip).limit(limit).lean(), Employee.countDocuments(f)]);
  await attachLogins(org._id, items);
  res.json({ success: true, data: items.map((e) => employeeDto(e, org)), pagination: { page, limit, total } });
});

router.get("/departments", async (req, res) => {
  const list = await Employee.distinct("department", { organizationId: req.tenant.organizationId });
  res.json({ success: true, data: list.filter(Boolean).sort() });
});

/* ───── export CSV ───── */
router.get("/export.csv", async (req, res) => {
  const { org } = req.tenant;
  const items = await Employee.find(buildFilter(org._id, req.query)).sort({ employeeCode: 1 }).lean();
  const csv = toCsv(
    ["Employee ID", "First Name", "Last Name", "Designation", "Department", "Work Email", "Mobile Number", "WhatsApp Number", "Location", "Card Status", "Published", "Card URL", "Views", "Shares", "Contact Saves", "Enquiries"],
    items.map((e) => [e.employeeCode, e.firstName, e.lastName, e.designation, e.department, e.workEmail, e.mobile, e.whatsapp, e.location, e.cardStatus, e.isPublished ? "yes" : "no", cardUrl(org.slug, e.slug), e.stats?.views || 0, e.stats?.shares || 0, e.stats?.saves || 0, e.stats?.enquiries || 0])
  );
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${org.slug}-employees.csv"`);
  res.send(csv);
});

/* ───── bulk QR ZIP (one PNG per employee) ───── */
router.get("/qr.zip", async (req, res) => {
  const { org } = req.tenant;
  const f = buildFilter(org._id, req.query);
  if (req.query.ids && typeof req.query.ids === "string") f._id = { $in: req.query.ids.split(",").filter((i) => mongoose.isValidObjectId(i)) };
  const items = await Employee.find(f).select("employeeCode firstName lastName slug").sort({ employeeCode: 1 }).lean();
  if (!items.length) throw badRequest("No employees match this selection.");
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${org.slug}-qr-codes.zip"`);
  const zip = new ZipArchive({ zlib: { level: 6 } });
  zip.on("error", (e) => res.destroy(e));
  zip.pipe(res);
  for (const e of items) {
    const png = await QRCode.toBuffer(`${cardUrl(org.slug, e.slug)}?src=qr`, { width: 800, margin: 2, errorCorrectionLevel: "M" });
    const safeCode = String(e.employeeCode).replace(/[^\w.-]/g, "_");
    zip.append(png, { name: `${safeCode}-${e.slug}.png` });
  }
  await zip.finalize();
});

/* ───── create ───── */
router.post("/", async (req, res) => {
  const { org, ent } = req.tenant;
  const b = parse(empBody, req.body);
  if ((await seatsLeft(org._id, ent)) <= 0) throw forbidden(`Your plan allows ${ent.employeeLimit} employees. Contact Beno to upgrade.`, "EMPLOYEE_LIMIT");
  if (await Employee.exists({ organizationId: org._id, employeeCode: b.employeeCode })) throw conflict(`Employee ID "${b.employeeCode}" already exists.`);
  if (b.workEmail && (await Employee.exists({ organizationId: org._id, workEmail: b.workEmail }))) throw conflict("Another employee already uses this email.");
  let slug = b.slug || slugify(`${b.firstName} ${b.lastName || ""}`) || slugify(b.employeeCode);
  const taken = new Set((await Employee.find({ organizationId: org._id, slug: { $regex: `^${escapeRegex(slug)}` } }).select("slug").lean()).map((e) => e.slug));
  if (b.slug && taken.has(b.slug)) throw conflict(`The card address "${b.slug}" is already used.`);
  slug = uniqueSlug(slug, taken);
  const isPublished = b.isPublished ?? true;
  const emp = await Employee.create({
    ...b,
    mobile: normalizePhone(b.mobile),
    whatsapp: normalizePhone(b.whatsapp || b.mobile),
    organizationId: org._id,
    slug,
    isPublished,
    publishedAt: isPublished ? new Date() : null,
  });
  audit(req, { action: "employee.created", entity: "Employee", entityId: emp._id, summary: `${fullName(emp)} (${emp.employeeCode})` });
  res.status(201).json({ success: true, data: employeeDto(emp.toObject(), org) });
});

async function loadEmployee(req) {
  assertId(req.params.id, "employee id");
  const e = await Employee.findOne({ _id: req.params.id, organizationId: req.tenant.organizationId });
  if (!e) throw notFound("Employee not found.");
  return e;
}

/* ───── read one (+ card preview payload) ───── */
router.get("/:id", async (req, res) => {
  const { org, ent } = req.tenant;
  const e = await loadEmployee(req);
  const obj = e.toObject();
  await attachLogins(org._id, [obj]);
  const card = await buildCardPayload({ org, employee: obj, ent, content: await loadCardContent(org._id, ent) });
  res.json({ success: true, data: { ...employeeDto(obj, org), card } });
});

/* ───── update ───── */
router.patch("/:id", async (req, res) => {
  const { org } = req.tenant;
  const e = await loadEmployee(req);
  const b = parse(empBody.partial(), req.body);
  if (b.employeeCode && b.employeeCode !== e.employeeCode && (await Employee.exists({ organizationId: org._id, employeeCode: b.employeeCode }))) {
    throw conflict(`Employee ID "${b.employeeCode}" already exists.`);
  }
  if (b.workEmail && b.workEmail !== e.workEmail && (await Employee.exists({ organizationId: org._id, workEmail: b.workEmail, _id: { $ne: e._id } }))) {
    throw conflict("Another employee already uses this email.");
  }
  if (b.slug && b.slug !== e.slug && (await Employee.exists({ organizationId: org._id, slug: b.slug }))) throw conflict(`The card address "${b.slug}" is already used.`);
  const { social, ...rest } = b;
  if (rest.mobile !== undefined) rest.mobile = normalizePhone(rest.mobile);
  if (rest.whatsapp !== undefined) rest.whatsapp = normalizePhone(rest.whatsapp);
  if (rest.photoUrl !== undefined && rest.photoUrl !== e.photoUrl && e.photoKey) {
    await deleteFile(e.photoKey);
    e.photoKey = "";
  }
  Object.assign(e, rest);
  if (social) for (const [k, v] of Object.entries(social)) if (v !== undefined) e.social[k] = v;
  if (b.isPublished === true && !e.publishedAt) e.publishedAt = new Date();
  await e.save();
  audit(req, { action: "employee.updated", entity: "Employee", entityId: e._id, summary: `${fullName(e)} (${Object.keys(b).join(", ")})` });
  res.json({ success: true, data: employeeDto(e.toObject(), org) });
});

/* ───── delete ───── */
async function deleteEmployees(orgId, ids) {
  const emps = await Employee.find({ organizationId: orgId, _id: { $in: ids } }).select("photoKey userId").lean();
  const userIds = emps.map((e) => e.userId).filter(Boolean);
  if (userIds.length) {
    await RefreshToken.deleteMany({ userId: { $in: userIds } });
    await User.deleteMany({ _id: { $in: userIds }, organizationId: orgId, role: ROLES.EMPLOYEE });
  }
  await Employee.deleteMany({ organizationId: orgId, _id: { $in: emps.map((e) => e._id) } });
  for (const e of emps) if (e.photoKey) await deleteFile(e.photoKey);
  return emps.length;
}

router.delete("/:id", async (req, res) => {
  const e = await loadEmployee(req);
  await deleteEmployees(req.tenant.organizationId, [e._id]);
  audit(req, { action: "employee.deleted", entity: "Employee", entityId: e._id, summary: `${fullName(e)} (${e.employeeCode})` });
  res.json({ success: true, message: "Employee deleted." });
});

/* ───── bulk actions ───── */
router.post("/bulk", async (req, res) => {
  const { org, ent } = req.tenant;
  const b = parse(
    z.object({
      ids: z.array(objectId).min(1).max(20000).optional(),
      all: z.boolean().optional(), // apply to every employee matching `filter`
      filter: z.record(z.string(), z.any()).optional(),
      action: z.enum(["publish", "unpublish", "activate", "deactivate", "delete", "invite"]),
    }),
    req.body
  );
  if (!b.ids && !b.all) throw badRequest("Select at least one employee.");
  const f = b.all ? buildFilter(org._id, b.filter || {}) : { organizationId: org._id, _id: { $in: b.ids } };
  let affected = 0;
  let extra = {};
  switch (b.action) {
    case "publish":
      affected = (await Employee.updateMany(f, { $set: { isPublished: true, publishedAt: new Date() } })).modifiedCount;
      break;
    case "unpublish":
      affected = (await Employee.updateMany(f, { $set: { isPublished: false } })).modifiedCount;
      break;
    case "activate":
      affected = (await Employee.updateMany(f, { $set: { cardStatus: "active" } })).modifiedCount;
      break;
    case "deactivate":
      affected = (await Employee.updateMany(f, { $set: { cardStatus: "inactive" } })).modifiedCount;
      break;
    case "delete": {
      const ids = await Employee.distinct("_id", f);
      affected = await deleteEmployees(org._id, ids);
      break;
    }
    case "invite": {
      assertFeature(ent, "employeeLogin", "Employee login");
      const emps = await Employee.find(f).limit(5000);
      const result = { invited: 0, skipped: 0, reasons: [] };
      for (const e of emps) {
        try {
          await inviteEmployee(org, e);
          result.invited++;
        } catch (err) {
          result.skipped++;
          if (result.reasons.length < 50) result.reasons.push(`${fullName(e)}: ${err.message}`);
        }
      }
      affected = result.invited;
      extra = result;
      break;
    }
  }
  audit(req, { action: `employee.bulk_${b.action}`, entity: "Employee", summary: `${affected} employee(s)` });
  res.json({ success: true, data: { affected, ...extra } });
});

/* ───── photo ───── */
router.post("/:id/photo", imageUpload, async (req, res) => {
  const e = await loadEmployee(req);
  const saved = await saveImage(req.file, `org-${req.tenant.organizationId}/photos`);
  if (e.photoKey) await deleteFile(e.photoKey);
  e.photoUrl = saved.url;
  e.photoKey = saved.key;
  await e.save();
  audit(req, { action: "employee.photo_updated", entity: "Employee", entityId: e._id, summary: fullName(e) });
  res.json({ success: true, data: { photoUrl: e.photoUrl } });
});

router.delete("/:id/photo", async (req, res) => {
  const e = await loadEmployee(req);
  if (e.photoKey) await deleteFile(e.photoKey);
  e.photoUrl = "";
  e.photoKey = "";
  await e.save();
  res.json({ success: true });
});

/* ───── employee login ───── */
async function inviteEmployee(org, e) {
  if (!e.workEmail) throw badRequest("Add a work email first");
  let user = e.userId ? await User.findOne({ _id: e.userId, organizationId: org._id }) : null;
  if (user?.status === "active") throw badRequest("Already has an active login");
  if (!user) {
    const other = await User.findOne({ email: e.workEmail });
    if (other) throw conflict("This email is already used by another login");
    user = new User({ name: fullName(e), email: e.workEmail, role: ROLES.EMPLOYEE, organizationId: org._id, employeeId: e._id, status: "invited" });
  } else if (user.email !== e.workEmail) {
    if (await User.exists({ email: e.workEmail, _id: { $ne: user._id } })) throw conflict("This email is already used by another login");
    user.email = e.workEmail;
  }
  const invite = await issueInvite(user, org.name);
  if (!e.userId) {
    e.userId = user._id;
    await e.save();
  }
  return invite;
}

router.post("/:id/invite", async (req, res) => {
  const { org, ent } = req.tenant;
  assertFeature(ent, "employeeLogin", "Employee login");
  if (!org.cardSettings?.allowEmployeeLogin) throw forbidden("Turn on employee login in Card settings first.");
  const e = await loadEmployee(req);
  const invite = await inviteEmployee(org, e);
  audit(req, { action: "employee.login_invited", entity: "Employee", entityId: e._id, summary: `${fullName(e)} <${e.workEmail}>` });
  res.json({ success: true, data: { invite } });
});

router.post("/:id/login-status", async (req, res) => {
  const e = await loadEmployee(req);
  const { status } = parse(z.object({ status: z.enum(["active", "disabled"]) }), req.body);
  if (!e.userId) throw badRequest("This employee has no login yet.");
  const user = await User.findOne({ _id: e.userId, organizationId: req.tenant.organizationId });
  if (!user) throw notFound("Login not found.");
  if (status === "active" && !user.passwordHash && user.status === "invited") throw badRequest("The employee has not accepted the invite yet.");
  user.status = status === "active" ? "active" : "disabled";
  if (status === "disabled") {
    user.tokenVersion += 1;
    await RefreshToken.updateMany({ userId: user._id, revokedAt: null }, { revokedAt: new Date() });
  }
  await user.save();
  audit(req, { action: `employee.login_${status}`, entity: "Employee", entityId: e._id, summary: fullName(e) });
  res.json({ success: true, data: { status: user.status } });
});

export default router;
export { inviteEmployee };
