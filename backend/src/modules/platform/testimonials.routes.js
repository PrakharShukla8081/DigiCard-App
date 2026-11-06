import { Router } from "express";
import { z } from "zod";
import { Testimonial } from "../../models/testimonial.js";
import { ROLES } from "../../common/constants.js";
import { authenticate, requireRole } from "../../middleware/auth.js";
import { parse, assertId } from "../../common/validate.js";
import { badRequest, notFound } from "../../common/errors.js";
import { audit } from "../../services/audit.js";

const router = Router();
router.use(authenticate, requireRole(ROLES.SUPER_ADMIN));

const testimonialBody = z.object({
  name: z.string().trim().min(1).max(80),
  role: z.string().trim().max(80).optional(),
  company: z.string().trim().min(1).max(100),
  quote: z.string().trim().min(20).max(500),
  rating: z.union([z.coerce.number().int().min(1).max(5), z.null()]).optional(),
  consentConfirmed: z.boolean(),
  isPublished: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

function assertPublishable(body) {
  if (body.isPublished === true && body.consentConfirmed !== true) {
    throw badRequest("Written consent is required before publishing a testimonial.");
  }
}

router.get("/", async (_req, res) => {
  const testimonials = await Testimonial.find({}).sort({ sortOrder: 1, createdAt: -1 }).lean();
  res.json({ success: true, data: testimonials });
});

router.post("/", async (req, res) => {
  const body = parse(testimonialBody, req.body);
  assertPublishable(body);
  const testimonial = await Testimonial.create({ ...body, role: body.role || "", sortOrder: body.sortOrder || 0 });
  audit(req, { action: "testimonial.created", entity: "Testimonial", entityId: testimonial._id, summary: `${testimonial.name} (${testimonial.company})`, organizationId: null });
  res.status(201).json({ success: true, data: testimonial });
});

router.patch("/:id", async (req, res) => {
  assertId(req.params.id);
  const body = parse(testimonialBody.partial(), req.body);
  const current = await Testimonial.findById(req.params.id).lean();
  if (!current) throw notFound("Testimonial not found.");
  assertPublishable({ ...current, ...body });
  const testimonial = await Testimonial.findByIdAndUpdate(req.params.id, { $set: body }, { returnDocument: "after", runValidators: true }).lean();
  audit(req, { action: "testimonial.updated", entity: "Testimonial", entityId: testimonial._id, summary: `${testimonial.name} (${testimonial.company})`, organizationId: null });
  res.json({ success: true, data: testimonial });
});

router.delete("/:id", async (req, res) => {
  assertId(req.params.id);
  const testimonial = await Testimonial.findByIdAndDelete(req.params.id).lean();
  if (!testimonial) throw notFound("Testimonial not found.");
  audit(req, { action: "testimonial.deleted", entity: "Testimonial", entityId: testimonial._id, summary: `${testimonial.name} (${testimonial.company})`, organizationId: null });
  res.json({ success: true, message: "Testimonial deleted." });
});

export default router;
