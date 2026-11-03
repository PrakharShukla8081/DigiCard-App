import { env } from "../config/env.js";
import { ContentItem, getPlatformSettings } from "../models/index.js";

export const fullName = (e) => [e.firstName, e.lastName].filter(Boolean).join(" ");
export const cardUrl = (orgSlug, empSlug) => `${env.publicCardBaseUrl}/c/${orgSlug}/${empSlug}`;
export const absoluteUrl = (u) => (!u ? "" : /^https?:\/\//i.test(u) ? u : `${env.publicCardBaseUrl}${u.startsWith("/") ? "" : "/"}${u}`);

/** Load the org-wide content shown on cards (only sections the plan allows). */
export async function loadCardContent(organizationId, ent) {
  if (!ent.features.productsGallery) return { products: [], gallery: [], videos: [] };
  const items = await ContentItem.find({ organizationId, isActive: true }).sort({ sortOrder: 1, createdAt: 1 }).lean();
  const pick = (kind) => items.filter((i) => i.kind === kind);
  return {
    products: pick("product").map((p) => ({ id: String(p._id), title: p.title, description: p.description, imageUrl: p.imageUrl, url: p.url })),
    gallery: pick("gallery").map((g) => ({ id: String(g._id), title: g.title, imageUrl: g.imageUrl })),
    videos: pick("video").map((v) => ({ id: String(v._id), title: v.title, youtubeId: v.youtubeId, url: v.url })),
  };
}

/**
 * Build the PUBLIC card payload. This is a whitelist: only fields meant to be
 * public are copied. Internal fields (ids, stats, login, reminders) never leave.
 */
export async function buildCardPayload({ org, employee, ent, content }) {
  const settings = await getPlatformSettings();
  const s = org.cardSettings?.sections || {};
  const custom = ent.features.customBranding;
  const template = custom ? (org.cardSettings?.allowEmployeeTemplate && employee.template) || org.cardSettings?.template || "classic" : "classic";
  const sections = {
    about: s.about !== false,
    contact: s.contact !== false,
    social: s.social !== false,
    products: Boolean(s.products !== false && ent.features.productsGallery && content.products.length),
    gallery: Boolean(s.gallery !== false && ent.features.productsGallery && content.gallery.length),
    videos: Boolean(s.videos !== false && ent.features.productsGallery && content.videos.length),
    companyInfo: s.companyInfo !== false,
    enquiry: Boolean(s.enquiry !== false && ent.features.enquiryForm),
    qr: s.qr !== false,
  };
  const b = org.branding || {};
  const social = { ...(b.social || {}) };
  for (const [k, v] of Object.entries(employee.social || {})) if (v) social[k] = v; // employee links win over company links
  return {
    url: cardUrl(org.slug, employee.slug),
    orgSlug: org.slug,
    slug: employee.slug,
    template,
    sections,
    employee: {
      name: fullName(employee),
      firstName: employee.firstName,
      designation: employee.designation,
      department: employee.department,
      email: employee.workEmail,
      mobile: employee.mobile,
      whatsapp: employee.whatsapp || employee.mobile,
      photoUrl: employee.photoUrl,
      bio: employee.bio,
      location: employee.location,
      website: employee.website || org.contact?.website || "",
    },
    social,
    company: {
      name: org.name,
      logoUrl: custom ? b.logoUrl : "",
      primaryColor: custom ? b.primaryColor || "#4F46E5" : "#4F46E5",
      secondaryColor: custom ? b.secondaryColor || "#10B981" : "#10B981",
      description: b.description || "",
      tagline: b.tagline || "",
      website: org.contact?.website || "",
      email: org.contact?.email || "",
      phone: org.contact?.phone || "",
      address: org.contact?.address || "",
    },
    content: {
      products: sections.products ? content.products : [],
      gallery: sections.gallery ? content.gallery : [],
      videos: sections.videos ? content.videos : [],
    },
    poweredBy: ent.features.removeBranding ? "" : settings.poweredByText || "Powered by Beno Digital Card",
  };
}

/** vCard 3.0 text for "Save contact". */
export function buildVcard(card) {
  const esc = (v) => String(v || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (m) => "\\" + m);
  const e = card.employee;
  const [first, ...rest] = (e.name || "").split(" ");
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${esc(rest.join(" "))};${esc(first)};;;`,
    `FN:${esc(e.name)}`,
    card.company.name && `ORG:${esc(card.company.name)}${e.department ? ";" + esc(e.department) : ""}`,
    e.designation && `TITLE:${esc(e.designation)}`,
    e.mobile && `TEL;TYPE=CELL,VOICE:${esc(e.mobile)}`,
    e.whatsapp && e.whatsapp !== e.mobile && `TEL;TYPE=CELL:${esc(e.whatsapp)}`,
    card.company.phone && `TEL;TYPE=WORK,VOICE:${esc(card.company.phone)}`,
    e.email && `EMAIL;TYPE=INTERNET,WORK:${esc(e.email)}`,
    e.website && `URL;TYPE=WORK:${esc(absoluteHttp(e.website))}`,
    `URL:${esc(card.url)}`,
    card.company.address && `ADR;TYPE=WORK:;;${esc(card.company.address)};;;;`,
    e.photoUrl && `PHOTO;VALUE=URI:${esc(absoluteUrl(e.photoUrl))}`,
    e.bio && `NOTE:${esc(e.bio)}`,
    "END:VCARD",
  ].filter(Boolean);
  return lines.join("\r\n") + "\r\n";
}

export const absoluteHttp = (u) => (!u ? "" : /^https?:\/\//i.test(u) ? u : `https://${u}`);

/** Extract a YouTube video id from common URL shapes. */
export function youtubeId(url) {
  const m = String(url || "").match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : "";
}
