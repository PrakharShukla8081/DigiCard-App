import mongoose from "mongoose";
import { tenantGuard } from "../common/tenantGuard.js";
import {
  FEATURE_KEYS,
  SUBSCRIPTION_STATUSES,
  BILLING_CYCLES,
  CARD_TEMPLATES,
  DEFAULT_EMPLOYEE_EDITABLE,
  EVENT_TYPES,
  EVENT_SOURCES,
  ROLES,
} from "../common/constants.js";
export { Testimonial } from "./testimonial.js";

const { Schema, model, Types } = mongoose;
const ObjectId = Schema.Types.ObjectId;
const ts = { timestamps: true };

const featuresShape = Object.fromEntries(FEATURE_KEYS.map((k) => [k, { type: Boolean, default: false }]));

/* ───────────────────────── Plan ───────────────────────── */
const planSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    code: { type: String, required: true, trim: true, lowercase: true, unique: true, maxlength: 40 },
    description: { type: String, trim: true, maxlength: 500, default: "" },
    price: { type: Number, min: 0, default: 0 },
    currency: { type: String, enum: ["INR", "USD"], default: "INR" },
    billingCycle: { type: String, enum: BILLING_CYCLES, default: "yearly" },
    durationDays: { type: Number, min: 1, max: 3650, default: 365 },
    employeeLimit: { type: Number, min: 1, default: null }, // null = unlimited
    features: featuresShape,
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    isBuiltIn: { type: Boolean, default: false },
    website: {
      showOnWebsite: { type: Boolean, default: true },
      group: { type: String, trim: true, maxlength: 40, default: "" },
      groupSubtitle: { type: String, trim: true, maxlength: 80, default: "" },
      userRangeLabel: { type: String, trim: true, maxlength: 30, default: "" },
      description: { type: String, trim: true, maxlength: 200, default: "" },
      badge: { type: String, trim: true, maxlength: 24, default: "" },
      featured: { type: Boolean, default: false },
      priceMode: { type: String, enum: ["price", "per_user", "custom"], default: "price" },
      showMonthlyEquivalent: { type: Boolean, default: false },
      monthlyPrice: { type: Number, min: 0, validate: { validator: (value) => value === undefined || Number.isInteger(value), message: "Monthly price must be a whole number." } },
      freeLabel: { type: String, trim: true, maxlength: 20, default: "" },
      priceSuffix: { type: String, trim: true, maxlength: 30, default: "" },
      priceNote: { type: String, trim: true, maxlength: 80, default: "" },
      ctaType: { type: String, enum: ["trial", "demo", "contact_sales"], default: "demo" },
      ctaLabel: { type: String, trim: true, maxlength: 30, default: "" },
      ctaNote: { type: String, trim: true, maxlength: 60, default: "" },
      inheritsLabel: { type: String, trim: true, maxlength: 60, default: "" },
      featureGroups: {
        type: [
          {
            title: { type: String, trim: true, maxlength: 40 },
            items: [{ type: String, trim: true, maxlength: 120 }],
          },
        ],
        default: [],
        validate: { validator: (groups) => groups.length <= 6, message: "A plan can have at most 6 feature groups." },
      },
    },
  },
  ts
);
export const Plan = model("Plan", planSchema);

/* ───────────────────────── Organization ───────────────────────── */
const socialShape = {
  linkedin: { type: String, default: "" },
  instagram: { type: String, default: "" },
  facebook: { type: String, default: "" },
  youtube: { type: String, default: "" },
  twitter: { type: String, default: "" },
};

const organizationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 60 },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    contact: {
      email: { type: String, default: "" },
      phone: { type: String, default: "" },
      website: { type: String, default: "" },
      address: { type: String, default: "" },
      gstin: { type: String, default: "" },
    },
    branding: {
      logoUrl: { type: String, default: "" },
      logoKey: { type: String, default: "" },
      primaryColor: { type: String, default: "#4F46E5" },
      secondaryColor: { type: String, default: "#10B981" },
      description: { type: String, default: "" },
      tagline: { type: String, default: "" },
      social: socialShape,
    },
    cardSettings: {
      template: { type: String, enum: CARD_TEMPLATES, default: "classic" },
      allowEmployeeTemplate: { type: Boolean, default: false },
      sections: {
        about: { type: Boolean, default: true },
        contact: { type: Boolean, default: true },
        social: { type: Boolean, default: true },
        products: { type: Boolean, default: true },
        gallery: { type: Boolean, default: true },
        videos: { type: Boolean, default: true },
        companyInfo: { type: Boolean, default: true },
        enquiry: { type: Boolean, default: true },
        qr: { type: Boolean, default: true },
      },
      employeeEditableFields: { type: [String], default: DEFAULT_EMPLOYEE_EDITABLE },
      allowEmployeeLogin: { type: Boolean, default: true },
    },
    reminders: {
      enabled: { type: Boolean, default: false },
      channels: {
        email: { type: Boolean, default: true },
        whatsapp: { type: Boolean, default: false },
      },
      criteria: {
        notActivated: { type: Boolean, default: true },
        noPhoto: { type: Boolean, default: true },
        inactiveDays: { type: Number, default: 30, min: 0, max: 365 }, // 0 = off
      },
      schedule: {
        dayOfWeek: { type: Number, default: 1, min: 0, max: 6 }, // 0 = Sunday
        hour: { type: Number, default: 10, min: 0, max: 23 },
      },
      minDaysBetween: { type: Number, default: 7, min: 1, max: 90 },
      lastRunAt: { type: Date, default: null },
    },
    whatsapp: {
      useOwn: { type: Boolean, default: false },
      phoneNumberId: { type: String, default: "" },
      accessTokenEnc: { type: String, default: "", select: false },
      templateName: { type: String, default: "" },
      templateLang: { type: String, default: "en" },
    },
    timezone: { type: String, default: "Asia/Kolkata" },
    createdBy: { type: ObjectId, ref: "User" },
  },
  ts
);
export const Organization = model("Organization", organizationSchema);

/* ───────────────────────── Subscription ───────────────────────── */
const subscriptionSchema = new Schema(
  {
    organizationId: { type: ObjectId, ref: "Organization", required: true, index: true },
    planId: { type: ObjectId, ref: "Plan", required: true },
    status: { type: String, enum: SUBSCRIPTION_STATUSES, default: "active" },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    employeeLimitOverride: { type: Number, min: 1, default: null },
    featureOverrides: { type: Map, of: Boolean, default: {} },
    priceOverride: { type: Number, min: 0, default: null },
    notes: { type: String, default: "", maxlength: 1000 },
    isCurrent: { type: Boolean, default: true },
    // Ready for a payment gateway later (Razorpay/Stripe). Never filled with fake data.
    payment: {
      provider: { type: String, default: "manual" },
      reference: { type: String, default: "" },
    },
    expiryNotifiedAt: { type: Date, default: null },
    createdBy: { type: ObjectId, ref: "User" },
  },
  ts
);
subscriptionSchema.index({ organizationId: 1, isCurrent: 1 });
subscriptionSchema.index({ endDate: 1, status: 1 });
subscriptionSchema.plugin(tenantGuard);
export const Subscription = model("Subscription", subscriptionSchema);

/* ───────────────────────── User (login accounts) ───────────────────────── */
const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, select: false, default: null },
    role: { type: String, enum: Object.values(ROLES), required: true },
    organizationId: { type: ObjectId, ref: "Organization", default: null, index: true },
    employeeId: { type: ObjectId, ref: "Employee", default: null },
    status: { type: String, enum: ["invited", "active", "disabled"], default: "invited" },
    tokenVersion: { type: Number, default: 0 },
    inviteTokenHash: { type: String, select: false, default: null },
    inviteExpires: { type: Date, default: null },
    invitedAt: { type: Date, default: null },
    resetTokenHash: { type: String, select: false, default: null },
    resetExpires: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
  },
  ts
);
userSchema.index({ inviteTokenHash: 1 }, { sparse: true });
userSchema.index({ resetTokenHash: 1 }, { sparse: true });
export const User = model("User", userSchema);

/* ───────────────────────── RefreshToken ───────────────────────── */
const refreshTokenSchema = new Schema(
  {
    userId: { type: ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    replacedByHash: { type: String, default: null },
    userAgent: { type: String, default: "" },
    ip: { type: String, default: "" },
  },
  ts
);
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const RefreshToken = model("RefreshToken", refreshTokenSchema);

/* ───────────────────────── Employee (+ card) ───────────────────────── */
const employeeSchema = new Schema(
  {
    organizationId: { type: ObjectId, ref: "Organization", required: true },
    employeeCode: { type: String, required: true, trim: true, maxlength: 50 },
    firstName: { type: String, required: true, trim: true, maxlength: 60 },
    lastName: { type: String, trim: true, maxlength: 60, default: "" },
    designation: { type: String, trim: true, maxlength: 100, default: "" },
    department: { type: String, trim: true, maxlength: 100, default: "" },
    workEmail: { type: String, trim: true, lowercase: true, maxlength: 254, default: "" },
    mobile: { type: String, trim: true, maxlength: 20, default: "" },
    whatsapp: { type: String, trim: true, maxlength: 20, default: "" },
    photoUrl: { type: String, default: "" },
    photoKey: { type: String, default: "" },
    bio: { type: String, trim: true, maxlength: 600, default: "" },
    location: { type: String, trim: true, maxlength: 120, default: "" },
    website: { type: String, trim: true, maxlength: 300, default: "" },
    social: socialShape,
    template: { type: String, enum: [...CARD_TEMPLATES, ""], default: "" }, // "" = company default
    slug: { type: String, required: true, lowercase: true, trim: true, maxlength: 80 },
    cardStatus: { type: String, enum: ["active", "inactive"], default: "active" },
    isPublished: { type: Boolean, default: true },
    publishedAt: { type: Date, default: null },
    userId: { type: ObjectId, ref: "User", default: null },
    activatedAt: { type: Date, default: null }, // first time the employee logged in to their card
    lastEngagementAt: { type: Date, default: null }, // last view/share/save on their card
    lastReminderAt: { type: Date, default: null },
    stats: {
      views: { type: Number, default: 0 },
      shares: { type: Number, default: 0 },
      saves: { type: Number, default: 0 },
      enquiries: { type: Number, default: 0 },
    },
    importJobId: { type: ObjectId, default: null },
  },
  ts
);
employeeSchema.index({ organizationId: 1, employeeCode: 1 }, { unique: true });
employeeSchema.index({ organizationId: 1, slug: 1 }, { unique: true });
employeeSchema.index({ organizationId: 1, workEmail: 1 });
employeeSchema.index({ organizationId: 1, department: 1 });
employeeSchema.index({ organizationId: 1, cardStatus: 1, isPublished: 1 });
employeeSchema.index({ organizationId: 1, createdAt: -1 });
employeeSchema.virtual("fullName").get(function () {
  return [this.firstName, this.lastName].filter(Boolean).join(" ");
});
employeeSchema.plugin(tenantGuard);
export const Employee = model("Employee", employeeSchema);

/* ───────────────────────── ContentItem (products / gallery / videos) ───────────────────────── */
const contentItemSchema = new Schema(
  {
    organizationId: { type: ObjectId, ref: "Organization", required: true },
    kind: { type: String, enum: ["product", "gallery", "video"], required: true },
    title: { type: String, trim: true, maxlength: 120, default: "" },
    description: { type: String, trim: true, maxlength: 500, default: "" },
    imageUrl: { type: String, default: "" },
    imageKey: { type: String, default: "" },
    url: { type: String, trim: true, maxlength: 500, default: "" },
    youtubeId: { type: String, default: "" },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  ts
);
contentItemSchema.index({ organizationId: 1, kind: 1, sortOrder: 1 });
contentItemSchema.plugin(tenantGuard);
export const ContentItem = model("ContentItem", contentItemSchema);

/* ───────────────────────── Enquiry ───────────────────────── */
const enquirySchema = new Schema(
  {
    organizationId: { type: ObjectId, ref: "Organization", required: true },
    employeeId: { type: ObjectId, ref: "Employee", required: true },
    name: { type: String, trim: true, maxlength: 120, required: true },
    email: { type: String, trim: true, lowercase: true, maxlength: 254, default: "" },
    phone: { type: String, trim: true, maxlength: 20, default: "" },
    company: { type: String, trim: true, maxlength: 120, default: "" },
    message: { type: String, trim: true, maxlength: 2000, default: "" },
    status: { type: String, enum: ["new", "contacted", "closed"], default: "new" },
    source: { type: String, default: "direct" },
  },
  ts
);
enquirySchema.index({ organizationId: 1, createdAt: -1 });
enquirySchema.index({ organizationId: 1, employeeId: 1, createdAt: -1 });
enquirySchema.plugin(tenantGuard);
export const Enquiry = model("Enquiry", enquirySchema);

/* ───────────────────────── Analytics ───────────────────────── */
const analyticsEventSchema = new Schema(
  {
    organizationId: { type: ObjectId, required: true },
    employeeId: { type: ObjectId, required: true },
    type: { type: String, enum: EVENT_TYPES, required: true },
    source: { type: String, enum: EVENT_SOURCES, default: "direct" },
    visitor: { type: String, default: "" },
    day: { type: String, required: true }, // YYYY-MM-DD in org timezone
    meta: { type: String, default: "" }, // e.g. which social network
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);
analyticsEventSchema.index({ organizationId: 1, employeeId: 1, day: 1, type: 1, visitor: 1 });
analyticsEventSchema.index({ organizationId: 1, createdAt: -1 });
// Raw events are kept for 13 months; daily totals below are kept forever.
analyticsEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 400 });
analyticsEventSchema.plugin(tenantGuard);
export const AnalyticsEvent = model("AnalyticsEvent", analyticsEventSchema);

const countsShape = Object.fromEntries(["unique", ...EVENT_TYPES].map((k) => [k, { type: Number, default: 0 }]));
const dailyStatSchema = new Schema(
  {
    organizationId: { type: ObjectId, required: true },
    employeeId: { type: ObjectId, required: true },
    day: { type: String, required: true },
    counts: countsShape,
  },
  { versionKey: false }
);
dailyStatSchema.index({ organizationId: 1, day: 1 });
dailyStatSchema.index({ organizationId: 1, employeeId: 1, day: 1 }, { unique: true });
dailyStatSchema.plugin(tenantGuard);
export const DailyStat = model("DailyStat", dailyStatSchema);

/* ───────────────────────── Import jobs ───────────────────────── */
const importJobSchema = new Schema(
  {
    organizationId: { type: ObjectId, required: true },
    createdBy: { type: ObjectId, ref: "User" },
    fileName: { type: String, default: "" },
    mode: { type: String, enum: ["create", "upsert"], default: "create" },
    status: { type: String, enum: ["queued", "processing", "completed", "failed"], default: "queued" },
    total: { type: Number, default: 0 },
    processed: { type: Number, default: 0 },
    created: { type: Number, default: 0 },
    updated: { type: Number, default: 0 },
    duplicates: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    rowErrors: [
      {
        _id: false,
        row: Number,
        employeeCode: String,
        field: String,
        message: String,
      },
    ],
    errorMessage: { type: String, default: "" },
    startedAt: Date,
    finishedAt: Date,
  },
  ts
);
importJobSchema.index({ organizationId: 1, createdAt: -1 });
importJobSchema.plugin(tenantGuard);
export const ImportJob = model("ImportJob", importJobSchema);

/* ───────────────────────── Notification log ───────────────────────── */
const notificationLogSchema = new Schema(
  {
    organizationId: { type: ObjectId, required: true },
    employeeId: { type: ObjectId, default: null },
    channel: { type: String, enum: ["email", "whatsapp"], required: true },
    kind: { type: String, default: "reminder" },
    to: { type: String, default: "" },
    status: { type: String, enum: ["sent", "failed", "skipped"], required: true },
    reason: { type: String, default: "" },
    providerId: { type: String, default: "" },
    runId: { type: String, default: "" },
  },
  ts
);
notificationLogSchema.index({ organizationId: 1, createdAt: -1 });
notificationLogSchema.plugin(tenantGuard);
export const NotificationLog = model("NotificationLog", notificationLogSchema);

/* ───────────────────────── Audit log ───────────────────────── */
// organizationId is null for platform-level actions, so this model is NOT tenant-guarded;
// every read path filters by organizationId explicitly.
const auditLogSchema = new Schema(
  {
    organizationId: { type: ObjectId, default: null },
    actorId: { type: ObjectId, ref: "User", default: null },
    actorName: { type: String, default: "" },
    actorRole: { type: String, default: "" },
    action: { type: String, required: true },
    entity: { type: String, default: "" },
    entityId: { type: String, default: "" },
    summary: { type: String, default: "" },
    ip: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
auditLogSchema.index({ organizationId: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });
export const AuditLog = model("AuditLog", auditLogSchema);

/* ───────────────────────── Website lead ───────────────────────── */
// Website leads are platform data, not tenant-owned.
const leadSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    phone: { type: String, trim: true, maxlength: 20, default: "" },
    company: { type: String, required: true, trim: true, maxlength: 160 },
    designation: { type: String, trim: true, maxlength: 120, default: "" },
    employees: { type: String, required: true, enum: ["1-25", "26-100", "101-500", "501-2000", "2000+"] },
    city: { type: String, trim: true, maxlength: 120, default: "" },
    interest: { type: String, enum: ["demo", "trial", "pricing", "sales", "other"], default: "demo" },
    billingPreference: { type: String, enum: ["monthly", "yearly"], default: null },
    planInterest: { type: String, trim: true, maxlength: 120, default: "" },
    message: { type: String, trim: true, maxlength: 2000, default: "" },
    source: { type: String, trim: true, maxlength: 80, default: "website" },
    consent: { type: Boolean, required: true },
    status: { type: String, enum: ["new", "contacted", "qualified", "won", "lost"], default: "new" },
    notes: { type: String, trim: true, maxlength: 2000, default: "" },
  },
  ts
);
leadSchema.index({ createdAt: -1 });
leadSchema.index({ status: 1, createdAt: -1 });
leadSchema.index({ email: 1 });
export const Lead = model("Lead", leadSchema);

/* ───────────────────────── Platform settings (singleton) ───────────────────────── */
const platformSettingSchema = new Schema(
  {
    key: { type: String, default: "platform", unique: true },
    platformName: { type: String, default: "Beno Digital Card" },
    supportEmail: { type: String, default: "" },
    supportPhone: { type: String, default: "" },
    defaultTrialDays: { type: Number, default: 14, min: 1, max: 365 },
    poweredByText: { type: String, default: "Powered by Beno Digital Card" },
    expiryReminderDays: { type: Number, default: 7, min: 1, max: 60 },
  },
  ts
);
export const PlatformSetting = model("PlatformSetting", platformSettingSchema);

export async function getPlatformSettings() {
  return PlatformSetting.findOneAndUpdate({ key: "platform" }, { $setOnInsert: { key: "platform" } }, { upsert: true, returnDocument: "after" }).lean();
}

export { Types };
