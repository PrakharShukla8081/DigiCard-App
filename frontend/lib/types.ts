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
    logoUrl: string;
    primaryColor: string;
    secondaryColor: string;
    description: string;
    tagline: string;
    website: string;
    email: string;
    phone: string;
    address: string;
  };
  content: {
    products: { id: string; title: string; description: string; imageUrl: string; url: string }[];
    gallery: { id: string; title: string; imageUrl: string }[];
    videos: { id: string; title: string; youtubeId: string; url: string }[];
  };
  poweredBy: string;
};

export type Employee = {
  _id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  name: string;
  designation: string;
  department: string;
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
};

export type Plan = {
  _id: string;
  name: string;
  code: string;
  description: string;
  price: number;
  currency: string;
  billingCycle: string;
  durationDays: number;
  employeeLimit: number | null;
  features: Record<string, boolean>;
  isActive: boolean;
  sortOrder: number;
  organizations?: number;
};

export type Invite = { link: string; emailSent: boolean; emailError: string | null };
