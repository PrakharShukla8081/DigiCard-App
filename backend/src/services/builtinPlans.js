import { Plan, Subscription } from "../models/index.js";
import { logger } from "../common/logger.js";

const allFeatures = {
  bulkUpload: false,
  customBranding: false,
  employeeLogin: true,
  companyDirectory: false,
  advancedAnalytics: false,
  enquiryForm: false,
  productsGallery: false,
  emailReminders: false,
  whatsappReminders: false,
  removeBranding: false,
};

export const BUILTIN_PLANS = [
  {
    code: "personal",
    name: "Personal",
    sortOrder: 10,
    price: 0,
    currency: "USD",
    billingCycle: "yearly",
    durationDays: 3650,
    employeeLimit: 1,
    features: allFeatures,
    website: {
      showOnWebsite: true, group: "For Individuals", groupSubtitle: "One person, one card", userRangeLabel: "1 user",
      priceMode: "price", freeLabel: "forever", priceNote: "No credit card needed", ctaType: "trial", ctaLabel: "Get started free",
      description: "A digital visiting card for sharing with clients and new connections.",
      featureGroups: [
        { title: "Cards & sharing", items: ["1 digital visiting card", "Share by link, QR, WhatsApp and email", "Save contact in one tap (vCard)"] },
        { title: "Networking tools", items: ["Email signature card", "Virtual background for Zoom, Teams and Meet", "Download your QR code"] },
      ],
    },
  },
  {
    code: "professional",
    name: "Professional",
    sortOrder: 20,
    price: 48,
    currency: "USD",
    billingCycle: "yearly",
    durationDays: 365,
    employeeLimit: 1,
    features: { ...allFeatures, customBranding: true, productsGallery: true, enquiryForm: true, advancedAnalytics: true },
    website: {
      showOnWebsite: true, group: "For Individuals", userRangeLabel: "1 user", priceMode: "price", showMonthlyEquivalent: true, monthlyPrice: 5,
      ctaType: "trial", ctaLabel: "Start free trial", description: "For professionals who care about how they show up, and about every connection.",
      inheritsLabel: "Everything in Personal, plus",
      featureGroups: [
        { title: "Cards & branding", items: ["Your colours, logo and card design", "Products, gallery and videos on your card", "A permanent card link", "Branded QR codes (coming soon)"] },
        { title: "Analytics & lead capture", items: ["Card analytics: views, saves and button taps", "Enquiry form with consent"] },
      ],
    },
  },
  {
    code: "business",
    name: "Business",
    sortOrder: 30,
    price: 36,
    currency: "USD",
    billingCycle: "yearly",
    durationDays: 365,
    employeeLimit: 100,
    features: { ...allFeatures, bulkUpload: true, customBranding: true, companyDirectory: true, advancedAnalytics: true, enquiryForm: true, productsGallery: true, emailReminders: true, whatsappReminders: true },
    website: {
      showOnWebsite: true, group: "For Organizations", groupSubtitle: "A team, or a whole company", userRangeLabel: "5–100 users",
      badge: "Most popular", priceMode: "per_user", showMonthlyEquivalent: true, monthlyPrice: 4, ctaType: "trial", ctaLabel: "Start free trial", ctaNote: "14 days free · 5 users minimum",
      description: "You buy and deploy. Get your whole team on brand and live the same day.", inheritsLabel: "Everything in Professional, plus",
      featureGroups: [
        { title: "Brand management", items: ["One brand applied to every employee card", "4 card templates to choose from"] },
        { title: "Team & admin", items: ["Bulk upload from Excel/CSV with error report", "Employee login with admin-controlled editing", "Admin dashboard, team analytics and leaderboard", "Audit log of admin actions", "Company directory"] },
        { title: "Reminders", items: ["Email and WhatsApp reminders"] },
        { title: "Integrations", items: ["Google and Microsoft sign-in (coming soon)", "Zoho and HubSpot CRM (coming soon)"] },
      ],
    },
  },
  {
    code: "enterprise",
    name: "Enterprise",
    sortOrder: 40,
    price: 0,
    currency: "USD",
    billingCycle: "yearly",
    durationDays: 365,
    employeeLimit: 10000,
    features: Object.fromEntries(Object.keys(allFeatures).map((key) => [key, true])),
    website: {
      showOnWebsite: true, group: "For Organizations", userRangeLabel: "100+ users", priceMode: "custom", featured: true, ctaType: "contact_sales", ctaLabel: "Talk to sales",
      description: "We deploy with you, across HR, marketing, IT and procurement.", inheritsLabel: "Everything in Business, plus",
      featureGroups: [
        { title: "Scale & flexibility", items: ["Custom employee limits for thousands of employees", "Bulk rollout support for large teams"] },
        { title: "Brand control", items: ["Remove Beno branding from cards", "Verified badge on cards (coming soon)", "Your own card domain (coming soon)"] },
        { title: "Procurement & support", items: ["Invoice billing and custom terms", "Guided onboarding and dedicated account support"] },
      ],
    },
  },
];

export async function ensureBuiltInPlans() {
  let created = 0;
  for (const plan of BUILTIN_PLANS) {
    if (await Plan.exists({ code: plan.code })) continue;
    await Plan.create({ ...plan, isBuiltIn: true, isActive: true });
    created += 1;
  }
  if (created) logger.info(`Created ${created} built-in pricing plan${created === 1 ? "" : "s"}.`);
  return { created };
}

export async function syncBuiltInPlans({ apply = false } = {}) {
  const summary = [];
  for (const definition of BUILTIN_PLANS) {
    const plan = await Plan.findOne({ code: definition.code });
    if (!plan) continue;
    if (plan.isBuiltIn) {
      const missing = fillMissing(plan.website?.toObject?.() || plan.website || {}, definition.website);
      if (!Object.keys(missing).length) continue;
      if (apply) {
        await Plan.updateOne({ _id: plan._id }, { $set: flattenWebsiteFields(missing) });
      } else {
        logger.info(`[dry run] Would fill missing website fields on "${definition.code}".`);
      }
      summary.push({ code: definition.code, action: "fill-missing-fields", applied: apply });
      continue;
    }
    const hasSubscriptions = Boolean(await Subscription.exists({ planId: plan._id }).setOptions({ skipTenantGuard: true }));
    const action = hasSubscriptions ? "protect-existing-subscriptions" : "replace-with-built-in";
    if (apply) {
      if (hasSubscriptions) {
        await Plan.updateOne({ _id: plan._id }, { $set: { isBuiltIn: true, name: definition.name, sortOrder: definition.sortOrder, website: definition.website } });
        logger.warn(`Built-in plan "${definition.code}" has subscriptions; preserved price and entitlements. Super Admin must review its price.`);
      } else {
        await Plan.updateOne(
          { _id: plan._id },
          { $set: { ...definition, isBuiltIn: true, isActive: true } },
        );
        logger.info(`Synced existing plan "${definition.code}" to the built-in definition.`);
      }
    } else {
      logger.info(`[dry run] Would ${hasSubscriptions ? "protect" : "replace"} existing plan "${definition.code}"${hasSubscriptions ? " and preserve its price and entitlements" : ""}.`);
    }
    summary.push({ code: definition.code, action, hasSubscriptions, applied: apply });
  }
  return { apply, summary };
}

function fillMissing(current, definition) {
  const missing = {};
  for (const [key, value] of Object.entries(definition)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = fillMissing(current?.[key] || {}, value);
      if (Object.keys(nested).length) missing[key] = nested;
    } else if (current?.[key] === undefined || current?.[key] === null || current?.[key] === "") {
      missing[key] = value;
    }
  }
  return missing;
}

function flattenWebsiteFields(value, prefix = "website", output = {}) {
  for (const [key, item] of Object.entries(value)) {
    const path = `${prefix}.${key}`;
    if (item && typeof item === "object" && !Array.isArray(item)) flattenWebsiteFields(item, path, output);
    else output[path] = item;
  }
  return output;
}
