import { Router } from "express";
import { z } from "zod";
import { Lead } from "../../models/index.js";
import { ROLES } from "../../common/constants.js";
import { authenticate, requireRole } from "../../middleware/auth.js";
import { parse, pageParams, escapeRegex, assertId } from "../../common/validate.js";
import { notFound } from "../../common/errors.js";
import { toCsv } from "../../common/csv.js";
import { audit } from "../../services/audit.js";

const router = Router();
router.use(authenticate, requireRole(ROLES.SUPER_ADMIN));
const statuses = ["new", "contacted", "qualified", "won", "lost"];
const interests = ["demo", "trial", "pricing", "sales", "other"];

function filters(query) {
  const out = {};
  if (statuses.includes(query.status)) out.status = query.status;
  if (interests.includes(query.interest)) out.interest = query.interest;
  if (query.search?.trim()) {
    const term = escapeRegex(query.search.trim());
    out.$or = ["name", "company", "email", "phone", "city"].map((field) => ({ [field]: { $regex: term, $options: "i" } }));
  }
  return out;
}

router.get("/", async (req, res) => {
  const { page, limit, skip } = pageParams(req.query);
  const where = filters(req.query);
  const [items, total, newCount] = await Promise.all([
    Lead.find(where).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Lead.countDocuments(where),
    Lead.countDocuments({ status: "new" }),
  ]);
  res.json({ success: true, data: items, pagination: { page, limit, total }, meta: { newCount } });
});

router.get("/export.csv", async (req, res) => {
  const items = await Lead.find(filters(req.query)).sort({ createdAt: -1 }).lean();
  const csv = toCsv(
    ["Date", "Name", "Email", "Phone", "Company", "Designation", "Team size", "City", "Interest", "Plan", "Billing", "Message", "Consent", "Status", "Notes"],
    items.map((lead) => [
      new Date(lead.createdAt).toISOString(),
      lead.name,
      lead.email,
      lead.phone,
      lead.company,
      lead.designation,
      lead.employees,
      lead.city,
      lead.interest,
      lead.planInterest,
      lead.billingPreference,
      lead.message,
      lead.consent ? "Yes" : "No",
      lead.status,
      lead.notes,
    ])
  );
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="website-leads.csv"');
  res.send(csv);
});

router.patch("/:id", async (req, res) => {
  assertId(req.params.id);
  const body = parse(
    z
      .object({ status: z.enum(statuses).optional(), notes: z.string().trim().max(2000).optional() })
      .refine((value) => value.status !== undefined || value.notes !== undefined, "Provide a status or notes")
      .strict(),
    req.body
  );
  const lead = await Lead.findByIdAndUpdate(req.params.id, { $set: body }, { new: true, runValidators: true }).lean();
  if (!lead) throw notFound("Lead not found.");
  audit(req, { action: "lead.updated", entity: "Lead", entityId: lead._id, summary: `${lead.name} (${lead.company})`, organizationId: null });
  res.json({ success: true, data: lead });
});

router.delete("/:id", async (req, res) => {
  assertId(req.params.id);
  const lead = await Lead.findByIdAndDelete(req.params.id).lean();
  if (!lead) throw notFound("Lead not found.");
  audit(req, { action: "lead.deleted", entity: "Lead", entityId: lead._id, summary: `${lead.name} (${lead.company})`, organizationId: null });
  res.json({ success: true, message: "Lead deleted." });
});

export default router;
