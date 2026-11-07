export type Social = Partial<Record<"linkedin" | "instagram" | "facebook" | "youtube" | "twitter", string>>;

export type CardPayload = {
  url: string;
  orgSlug: string;
  slug: string;
  template: "classic" | "modern" | "executive" | "minimal";
  sections: Record<"about" | "contact" | "social" | "products" | "gallery" | "videos" | "companyInfo" | "enquiry" | "qr", boolean>;
  employee: {
    name: string;
    firstName: string;
    designation: string;
    department: string;
    email: string;
    mobile: string;
    whatsapp: string;
    photoUrl: string;
    bio: string;
    location: string;
    website: string;
  };
  social: Social;
  company: {
    name: string;
    cardLanguage: "en" | "hi";
    privacyPolicyUrl: string;
    logoUrl: string;
    primaryColor: string;
    secondaryColor: string;
    description: string;
    tagline: string;
    website: string;
    email: string;
    phone: string;
    address: string;
    qr?: QrStyle;
  };
  verified: { isVerified: boolean; verifiedAt: string | null };
  content: {
    products: { id: string; title: string; description: string; imageUrl: string; url: string }[];
    gallery: { id: string; title: string; imageUrl: string }[];
    videos: { id: string; title: string; youtubeId: string; url: string }[];
  };

  poweredBy: string;
};

export type QrStyle = {
  foreground: string;
  background: string;
  useLogo: boolean;
  frame: "none" | "label";
  frameText: string;
  logoUrl?: string;
  name?: string;
};

export type Employee = {
  _id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  name: string;
  designation: string;
  department: string;
  hideFromDirectory: boolean;
  workEmail: string;
  mobile: string;
  whatsapp: string;
  photoUrl: string;
  bio: string;
  location: string;
  website: string;
  social: Social;
  template: string;
  slug: string;
  url: string;
  cardStatus: "active" | "inactive";
  isPublished: boolean;
  publishedAt: string | null;
  activatedAt: string | null;
  lastEngagementAt: string | null;
  lastReminderAt: string | null;
  stats: { views?: number; shares?: number; saves?: number; enquiries?: number };
  login: { status: "invited" | "active" | "disabled"; lastLoginAt: string | null; invitedAt: string | null } | null;
  createdAt: string;
  card?: CardPayload;
  qr?: QrStyle;
};

export type DirectoryEntry = {
  name: string;
  designation: string;
  department: string;
  photo: string;
  cardUrl: string;
};

export type Plan = {
  _id: string;
  name: string;
  code: string;
  description: string;
  price: number;
  currency: "INR" | "USD";
  billingCycle: string;
  durationDays: number;
  employeeLimit: number | null;
  features: Record<string, boolean>;
  isActive: boolean;
  sortOrder: number;
  organizations?: number;
  isBuiltIn?: boolean;
  website?: {
    showOnWebsite?: boolean;
    group?: string;
    groupSubtitle?: string;
    userRangeLabel?: string;
    description?: string;
    badge?: string;
    featured?: boolean;
    priceMode?: "price" | "per_user" | "custom";
    showMonthlyEquivalent?: boolean;
    monthlyPrice?: number;
    ctaType?: "trial" | "demo" | "contact_sales";
    ctaLabel?: string;
    featureGroups?: { title: string; items: string[] }[];
  };
};

export type Invite = { link: string; emailSent: boolean; emailError: "not_configured" | "testing_mode" | "invalid_from" | "send_failed" | null };
