export const ROLES = Object.freeze({
  SUPER_ADMIN: "super_admin",
  COMPANY_ADMIN: "company_admin",
  EMPLOYEE: "employee",
});

/** Every switchable plan feature. Basic cards, QR codes and basic analytics are always included. */
export const FEATURES = Object.freeze({
  bulkUpload: "Bulk employee upload (CSV/Excel)",
  customBranding: "Custom branding (logo, colours, templates)",
  employeeLogin: "Employee self-service login",
  companyDirectory: "Company directory",
  advancedAnalytics: "Advanced analytics (custom ranges, per-employee, leaderboard, export)",
  enquiryForm: "Enquiry form on cards",
  productsGallery: "Products, gallery and video sections",
  emailReminders: "Automated email reminders",
  whatsappReminders: "WhatsApp reminders",
  removeBranding: "Hide 'Powered by' footer",
});
export const FEATURE_KEYS = Object.keys(FEATURES);

export const SUBSCRIPTION_STATUSES = ["trial", "active", "expired", "suspended", "cancelled"];
export const BILLING_CYCLES = ["monthly", "quarterly", "half_yearly", "yearly", "custom"];

export const CARD_TEMPLATES = ["classic", "modern", "executive", "minimal"];
export const CARD_SECTIONS = ["about", "contact", "social", "products", "gallery", "videos", "companyInfo", "enquiry", "qr"];

/** Employee profile fields an admin may allow employees to edit themselves. */
export const EMPLOYEE_EDITABLE_FIELDS = [
  "photo",
  "mobile",
  "whatsapp",
  "workEmail",
  "designation",
  "department",
  "bio",
  "location",
  "linkedin",
  "instagram",
  "facebook",
  "youtube",
  "twitter",
  "website",
];
export const DEFAULT_EMPLOYEE_EDITABLE = ["photo", "mobile", "whatsapp", "bio", "linkedin", "instagram", "facebook", "youtube", "twitter"];

export const EVENT_TYPES = [
  "view",
  "share",
  "call_click",
  "whatsapp_click",
  "email_click",
  "website_click",
  "social_click",
  "vcard_download",
  "enquiry",
  "contact_exchange",
  "qr_scan",
];
export const EVENT_SOURCES = ["qr", "link", "direct", "nfc", "email", "whatsapp"];
