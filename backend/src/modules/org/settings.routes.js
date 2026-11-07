import { Router } from "express";
import { z } from "zod";
import { Organization, ContentItem } from "../../models/index.js";
import { parse, assertId, emailSchema, phoneSchema, urlish, optStr, hexColor } from "../../common/validate.js";
import { notFound, badRequest } from "../../common/errors.js";
import { CARD_TEMPLATES, CARD_SECTIONS, EMPLOYEE_EDITABLE_FIELDS } from "../../common/constants.js";
import { assertFeature } from "../../services/entitlements.js";
import { requireFeature } from "../../middleware/auth.js";
import { imageUpload } from "../../middleware/upload.js";
import { saveImage, deleteFile } from "../../storage/index.js";
import { youtubeId } from "../../services/cards.js";
import { audit } from "../../services/audit.js";
import { canEncrypt, encrypt } from "../../common/crypto.js";

/* ═════════════ Company settings & branding ═════════════ */
export const settingsRouter = Router();

function settingsDto(org) {
  return {
    name: org.name,
    slug: org.slug,
    privacyPolicyUrl: org.privacyPolicyUrl || "",
    contact: org.contact,
    branding: org.branding,
    cardSettings: org.cardSettings,
    timezone: org.timezone,
  };
}

settingsRouter.get("/", async (req, res) => {
  res.json({ success: true, data: settingsDto(req.tenant.org), meta: { templates: CARD_TEMPLATES, sections: CARD_SECTIONS, editableFields: EMPLOYEE_EDITABLE_FIELDS } });
});

const socialSchema = z.object({ linkedin: urlish, instagram: urlish, facebook: urlish, youtube: urlish, twitter: urlish }).partial();

settingsRouter.patch("/company", async (req, res) => {
  const { ent } = req.tenant;
  const b = parse(
    z.object({
      name: z.string().trim().min(2).max(120).optional(),
      privacyPolicyUrl: z
        .string()
        .trim()
        .max(300)
        .refine((value) => value === "" || /^https:\/\//i.test(value), "Privacy policy URL must use https://")
        .optional(),
      contact: z.object({ email: z.union([emailSchema, z.literal("")]).optional(), phone: phoneSchema, website: urlish, address: optStr(400), gstin: optStr(20) }).partial().optional(),
      branding: z
        .object({
          primaryColor: hexColor.optional(),
          secondaryColor: hexColor.optional(),
          description: optStr(1000),
          tagline: optStr(120),
          social: socialSchema.optional(),
        })
        .partial()
        .optional(),
      timezone: z.string().max(60).optional(),
    }),
    req.body
  );
  if (b.branding && (b.branding.primaryColor || b.branding.secondaryColor)) assertFeature(ent, "customBranding", "Custom brand colours");
  if (b.timezone) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: b.timezone });
    } catch {
      throw badRequest("Unknown timezone.");
    }
  }
  const org = await Organization.findById(req.tenant.organizationId);
  if (b.name) org.name = b.name;
  if (b.privacyPolicyUrl !== undefined) org.privacyPolicyUrl = b.privacyPolicyUrl;
  if (b.timezone) org.timezone = b.timezone;
  if (b.contact) for (const [k, v] of Object.entries(b.contact)) if (v !== undefined) org.contact[k] = v;
  if (b.branding) {
    const { social, ...rest } = b.branding;
    for (const [k, v] of Object.entries(rest)) if (v !== undefined) org.branding[k] = v;
    if (social) for (const [k, v] of Object.entries(social)) if (v !== undefined) org.branding.social[k] = v;
  }
  await org.save();
  audit(req, { action: "settings.company_updated", entity: "Organization", entityId: org._id, summary: Object.keys(b).join(", ") });
  res.json({ success: true, data: settingsDto(org.toObject()) });
});

settingsRouter.post("/logo", requireFeature("customBranding", "Company logo"), imageUpload, async (req, res) => {
  const org = await Organization.findById(req.tenant.organizationId);
  const saved = await saveImage(req.file, `org-${org._id}/brand`);
  if (org.branding.logoKey) await deleteFile(org.branding.logoKey);
  org.branding.logoUrl = saved.url;
  org.branding.logoKey = saved.key;
  await org.save();
  audit(req, { action: "settings.logo_updated", entity: "Organization", entityId: org._id });
  res.json({ success: true, data: { logoUrl: org.branding.logoUrl } });
});

settingsRouter.delete("/logo", async (req, res) => {
  const org = await Organization.findById(req.tenant.organizationId);
  if (org.branding.logoKey) await deleteFile(org.branding.logoKey);
  org.branding.logoUrl = "";
  org.branding.logoKey = "";
  await org.save();
  res.json({ success: true });
});

settingsRouter.patch("/card", async (req, res) => {
  const { ent } = req.tenant;
  const b = parse(
    z.object({
      template: z.enum(CARD_TEMPLATES).optional(),
      allowEmployeeTemplate: z.boolean().optional(),
      sections: z.object(Object.fromEntries(CARD_SECTIONS.map((k) => [k, z.boolean().optional()]))).partial().optional(),
      employeeEditableFields: z.array(z.enum(EMPLOYEE_EDITABLE_FIELDS)).optional(),
      allowEmployeeLogin: z.boolean().optional(),
    }),
    req.body
  );
  if (b.template && b.template !== "classic") assertFeature(ent, "customBranding", "Card templates");
  const org = await Organization.findById(req.tenant.organizationId);
  const cs = org.cardSettings;
  if (b.template) cs.template = b.template;
  if (b.allowEmployeeTemplate !== undefined) cs.allowEmployeeTemplate = b.allowEmployeeTemplate;
  if (b.allowEmployeeLogin !== undefined) cs.allowEmployeeLogin = b.allowEmployeeLogin;
  if (b.employeeEditableFields) cs.employeeEditableFields = [...new Set(b.employeeEditableFields)];
  if (b.sections) for (const [k, v] of Object.entries(b.sections)) if (typeof v === "boolean") cs.sections[k] = v;
  await org.save();
  audit(req, { action: "settings.card_updated", entity: "Organization", entityId: org._id, summary: Object.keys(b).join(", ") });
  res.json({ success: true, data: settingsDto(org.toObject()) });
});

/* WhatsApp credentials for this company (stored encrypted). */
settingsRouter.put("/whatsapp", requireFeature("whatsappReminders", "WhatsApp reminders"), async (req, res) => {
  const b = parse(
    z.object({
      useOwn: z.boolean(),
      phoneNumberId: z.string().trim().max(40).optional(),
      accessToken: z.string().trim().max(1000).optional(), // only sent when changing it
      templateName: z.string().trim().max(120).optional(),
      templateLang: z.string().trim().max(10).optional(),
    }),
    req.body
  );
  const org = await Organization.findById(req.tenant.organizationId).select("+whatsapp.accessTokenEnc");
  org.whatsapp.useOwn = b.useOwn;
  if (b.phoneNumberId !== undefined) org.whatsapp.phoneNumberId = b.phoneNumberId;
  if (b.templateName !== undefined) org.whatsapp.templateName = b.templateName;
  if (b.templateLang !== undefined) org.whatsapp.templateLang = b.templateLang || "en";
  if (b.accessToken) {
    if (!canEncrypt()) throw badRequest("The server has no ENCRYPTION_KEY, so WhatsApp tokens cannot be stored safely. Ask Beno to configure it.");
    org.whatsapp.accessTokenEnc = encrypt(b.accessToken);
  }
  await org.save();
  audit(req, { action: "settings.whatsapp_updated", entity: "Organization", entityId: org._id });
  res.json({ success: true, data: { useOwn: org.whatsapp.useOwn, phoneNumberId: org.whatsapp.phoneNumberId, templateName: org.whatsapp.templateName, templateLang: org.whatsapp.templateLang, hasToken: Boolean(org.whatsapp.accessTokenEnc) } });
});

/* ═════════════ Products / gallery / videos ═════════════ */
export const contentRouter = Router();
contentRouter.use(requireFeature("productsGallery", "Products, gallery and videos"));

const contentBody = z.object({
  kind: z.enum(["product", "gallery", "video"]),
  title: optStr(120),
  description: optStr(500),
  url: urlish,
  sortOrder: z.coerce.number().int().optional(),
  isActive: z.boolean().optional(),
});

contentRouter.get("/", async (req, res) => {
  const q = { organizationId: req.tenant.organizationId };
  if (["product", "gallery", "video"].includes(req.query.kind)) q.kind = req.query.kind;
  const items = await ContentItem.find(q).sort({ kind: 1, sortOrder: 1, createdAt: 1 }).lean();
  res.json({ success: true, data: items });
});

contentRouter.post("/", async (req, res) => {
  const b = parse(contentBody, req.body);
  const doc = { ...b, organizationId: req.tenant.organizationId };
  if (b.kind === "video") {
    doc.youtubeId = youtubeId(b.url);
    if (!doc.youtubeId) throw badRequest("Paste a YouTube link, for example https://www.youtube.com/watch?v=...");
  }
  if (b.kind === "product" && !b.title) throw badRequest("Product name is required.");
  if (doc.sortOrder === undefined) doc.sortOrder = (await ContentItem.countDocuments({ organizationId: req.tenant.organizationId, kind: b.kind })) + 1;
  const item = await ContentItem.create(doc);
  audit(req, { action: "content.created", entity: "ContentItem", entityId: item._id, summary: `${b.kind}: ${b.title || ""}` });
  res.status(201).json({ success: true, data: item });
});

async function loadItem(req) {
  assertId(req.params.id);
  const item = await ContentItem.findOne({ _id: req.params.id, organizationId: req.tenant.organizationId });
  if (!item) throw notFound("Item not found.");
  return item;
}

contentRouter.patch("/:id", async (req, res) => {
  const item = await loadItem(req);
  const b = parse(contentBody.omit({ kind: true }).partial(), req.body);
  Object.assign(item, b);
  if (item.kind === "video" && b.url !== undefined) {
    item.youtubeId = youtubeId(b.url);
    if (!item.youtubeId) throw badRequest("Paste a valid YouTube link.");
  }
  await item.save();
  res.json({ success: true, data: item });
});

contentRouter.delete("/:id", async (req, res) => {
  const item = await loadItem(req);
  if (item.imageKey) await deleteFile(item.imageKey);
  await ContentItem.deleteOne({ _id: item._id, organizationId: req.tenant.organizationId });
  audit(req, { action: "content.deleted", entity: "ContentItem", entityId: item._id, summary: `${item.kind}: ${item.title}` });
  res.json({ success: true });
});

contentRouter.post("/:id/image", imageUpload, async (req, res) => {
  const item = await loadItem(req);
  const saved = await saveImage(req.file, `org-${req.tenant.organizationId}/content`);
  if (item.imageKey) await deleteFile(item.imageKey);
  item.imageUrl = saved.url;
  item.imageKey = saved.key;
  await item.save();
  res.json({ success: true, data: item });
});

contentRouter.post("/reorder", async (req, res) => {
  const { ids } = parse(z.object({ ids: z.array(z.string()).max(500) }), req.body);
  const ops = ids.map((id, i) => ({ updateOne: { filter: { _id: id, organizationId: req.tenant.organizationId }, update: { $set: { sortOrder: i + 1 } } } }));
  if (ops.length) await ContentItem.bulkWrite(ops);
  res.json({ success: true });
});
