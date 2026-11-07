/**
 * Public API — no login. Mounted at /api/public.
 * Returns only whitelisted card data, and only for cards that are
 * published + active, in an active company with a usable subscription.
 */
import { Router } from "express";
import { z } from "zod";
import QRCode from "qrcode";
import { Organization, Employee, Enquiry, User } from "../../models/index.js";
import { parse, isValidPhone, normalizePhone } from "../../common/validate.js";
import { badRequest, notFound } from "../../common/errors.js";
import { rateLimit } from "../../common/rateLimit.js";
import { EVENT_TYPES, EVENT_SOURCES, ROLES } from "../../common/constants.js";
import { visitorHash } from "../../common/crypto.js";
import { getEntitlements } from "../../services/entitlements.js";
import { buildCardPayload, loadCardContent, buildVcard, cardUrl, fullName } from "../../services/cards.js";
import { trackEvent } from "../../services/analytics.js";
import { directoryPage } from "../../services/directory.js";
import { sendEmail, templates } from "../../services/email.js";
import { dayKey } from "../../services/time.js";
import { env } from "../../config/env.js";

const router = Router();
const BOT_RE = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|preview|curl|wget|python-requests|headless|lighthouse/i;
const SLUG_RE = /^[a-z0-9-]{1,80}$/;

/** Resolve an org + employee pair that is allowed to be shown publicly, or throw 404. */
async function resolveCard(orgSlug, empSlug) {
  if (!SLUG_RE.test(orgSlug || "") || !SLUG_RE.test(empSlug || "")) throw notFound("Card not found.");
  const org = await Organization.findOne({ slug: orgSlug }).lean();
  if (!org) throw notFound("Card not found.");
  const employee = await Employee.findOne({ organizationId: org._id, slug: empSlug }).lean();
  if (!employee) throw notFound("Card not found.");
  const ent = await getEntitlements(org._id);
  if (org.status !== "active" || !ent.active || employee.cardStatus !== "active" || !employee.isPublished) {
    const e = notFound("This card is not available right now.");
    e.code = "CARD_UNAVAILABLE";
    throw e;
  }
  return { org, employee, ent };
}

// Server-side rendering of cards comes from the web server's single IP; it identifies itself with INTERNAL_API_KEY.
const isInternal = (req) => Boolean(env.internalApiKey) && req.headers["x-internal-key"] === env.internalApiKey;
const cardLimiter = rateLimit({ windowMs: 60_000, max: 120, skip: isInternal });
const eventLimiter = rateLimit({ windowMs: 60_000, max: 60 });
const directoryLimiter = rateLimit({ windowMs: 60_000, max: 30 });
const enquiryLimiter = rateLimit({ windowMs: 60 * 60_000, max: 5, message: "You have sent several enquiries already. Please try again later." });

router.get("/directory/:orgSlug", directoryLimiter, async (req, res) => {
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  const org = await Organization.findOne({ slug: req.params.orgSlug }).lean();
  if (!org || org.status !== "active" || !org.directory?.enabled || !org.directory?.public) throw notFound("Company directory not found.");
  const ent = await getEntitlements(org._id);
  if (!ent.active || !ent.features.companyDirectory) throw notFound("Company directory not found.");
  const result = await directoryPage(org, req.query);
  res.json({ success: true, ...result });
});

router.get("/cards/:orgSlug/:empSlug", cardLimiter, async (req, res) => {
  const { org, employee, ent } = await resolveCard(req.params.orgSlug, req.params.empSlug);
  const card = await buildCardPayload({ org, employee, ent, content: await loadCardContent(org._id, ent) });
  res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
  res.json({ success: true, data: card });
});

router.get("/cards/:orgSlug/:empSlug/vcard", cardLimiter, async (req, res) => {
  const { org, employee, ent } = await resolveCard(req.params.orgSlug, req.params.empSlug);
  const card = await buildCardPayload({ org, employee, ent, content: { products: [], gallery: [], videos: [] } });
  const ua = String(req.headers["user-agent"] || "");
  if (!BOT_RE.test(ua)) {
    trackEvent({ org, employee, type: "vcard_download", source: sourceOf(req.query.src), visitor: visitorHash(req.ip, ua, dayKey(new Date(), org.timezone)) }).catch(() => {});
  }
  const name = (fullName(employee) || "contact").replace(/[^\w.-]+/g, "_");
  res.setHeader("Content-Type", "text/vcard; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${name}.vcf"`);
  res.send(buildVcard(card));
});

router.get("/cards/:orgSlug/:empSlug/qr.:fmt", cardLimiter, async (req, res) => {
  const { org, employee } = await resolveCard(req.params.orgSlug, req.params.empSlug);
  const url = `${cardUrl(org.slug, employee.slug)}?src=qr`;
  const size = Math.min(1200, Math.max(200, parseInt(req.query.size, 10) || 600));
  if (req.params.fmt === "svg") {
    res.setHeader("Content-Type", "image/svg+xml");
    return res.send(await QRCode.toString(url, { type: "svg", margin: 2, errorCorrectionLevel: "M" }));
  }
  if (req.params.fmt !== "png") throw notFound("Unknown format.");
  res.setHeader("Content-Type", "image/png");
  if (req.query.download) res.setHeader("Content-Disposition", `attachment; filename="${employee.slug}-qr.png"`);
  res.send(await QRCode.toBuffer(url, { width: size, margin: 2, errorCorrectionLevel: "M" }));
});

const sourceOf = (s) => (EVENT_SOURCES.includes(s) ? s : "direct");

router.post("/events", eventLimiter, async (req, res) => {
  const b = parse(
    z.object({
      orgSlug: z.string().max(80),
      slug: z.string().max(80),
      type: z.enum(EVENT_TYPES.filter((t) => !["enquiry", "vcard_download", "qr_scan"].includes(t))),
      source: z.string().max(20).optional(),
      meta: z.string().max(40).optional(),
    }),
    req.body
  );
  const ua = String(req.headers["user-agent"] || "");
  if (BOT_RE.test(ua)) return res.status(204).end();
  let ctx;
  try {
    ctx = await resolveCard(b.orgSlug, b.slug);
  } catch {
    return res.status(204).end(); // never reveal card existence via the beacon
  }
  await trackEvent({ ...ctx, type: b.type, source: sourceOf(b.source), visitor: visitorHash(req.ip, ua, dayKey(new Date(), ctx.org.timezone)), meta: b.meta || "" });
  res.status(204).end();
});

router.post("/enquiries", enquiryLimiter, async (req, res) => {
  const b = parse(
    z.object({
      orgSlug: z.string().max(80),
      slug: z.string().max(80),
      name: z.string().trim().min(2, "Please enter your name").max(120),
      email: z.union([z.string().trim().toLowerCase().email("Enter a valid email"), z.literal("")]).optional(),
      phone: z.string().trim().max(20).optional(),
      company: z.string().trim().max(120).optional(),
      message: z.string().trim().max(2000).optional(),
      consent: z.boolean().optional(),
      website: z.string().max(200).optional(), // honeypot: real users never fill this hidden field
      source: z.string().max(20).optional(),
    }),
    req.body
  );
  if (b.website) return res.status(201).json({ success: true }); // silently drop bots
  parse(z.object({ consent: z.literal(true, { error: "Please agree to be contacted" }) }), b);
  if (!b.email && !b.phone) throw badRequest("Enter your phone number or email so we can reply.");
  if (b.phone && !isValidPhone(b.phone)) throw badRequest("Enter a valid phone number.");
  const { org, employee, ent } = await resolveCard(b.orgSlug, b.slug);
  if (!ent.features.enquiryForm || org.cardSettings?.sections?.enquiry === false) throw badRequest("Enquiries are not enabled for this card.");
  const enquiry = await Enquiry.create({
    organizationId: org._id,
    employeeId: employee._id,
    name: b.name,
    email: b.email || "",
    phone: b.phone ? normalizePhone(b.phone) : "",
    company: b.company || "",
    message: b.message || "",
    consent: true,
    consentText: `I agree that ${org.name} may contact me about this enquiry.`,
    consentAt: new Date(),
    source: sourceOf(b.source),
  });
  const ua = String(req.headers["user-agent"] || "");
  await trackEvent({ org, employee, type: "enquiry", source: sourceOf(b.source), visitor: visitorHash(req.ip, ua, dayKey(new Date(), org.timezone)) });

  // Notify the employee (and company admins) by email when configured.
  const recipients = new Set();
  if (employee.workEmail) recipients.add(employee.workEmail);
  const admins = await User.find({ organizationId: org._id, role: ROLES.COMPANY_ADMIN, status: "active" }).select("email").lean();
  admins.forEach((a) => recipients.add(a.email));
  const t = templates.enquiry({ employeeName: fullName(employee), orgName: org.name, enquiry, adminLink: `${env.frontendUrl}/admin/enquiries` });
  for (const to of recipients) sendEmail({ to, ...t }).catch(() => {});

  res.status(201).json({ success: true, message: "Thank you! Your enquiry has been sent." });
});

export default router;
