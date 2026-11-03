import "dotenv/config";

const bool = (v, d = false) => (v === undefined || v === "" ? d : ["1", "true", "yes", "on"].includes(String(v).toLowerCase()));
const trimSlash = (v) => String(v || "").trim().replace(/\/+$/, "");

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  isProd: process.env.NODE_ENV === "production",
  isTest: process.env.NODE_ENV === "test",
  port: Number(process.env.PORT || 5000),
  trustProxy: Number(process.env.TRUST_PROXY || 0),

  mongoUri: process.env.MONGO_URI,

  jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL || "15m",
  refreshTokenDays: Number(process.env.REFRESH_TOKEN_DAYS || 30),
  refreshReuseGraceSeconds: Number(process.env.REFRESH_REUSE_GRACE_SECONDS ?? 60),

  frontendUrl: trimSlash(process.env.FRONTEND_URL || "http://localhost:3000"),
  publicCardBaseUrl: trimSlash(process.env.PUBLIC_CARD_BASE_URL || process.env.FRONTEND_URL || "http://localhost:3000"),
  corsOrigins: String(process.env.CORS_ORIGINS || "").split(",").map(trimSlash).filter(Boolean),

  storageDriver: (process.env.STORAGE_DRIVER || "local").toLowerCase(),
  uploadDir: process.env.UPLOAD_DIR || "./uploads",
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
    folder: process.env.CLOUDINARY_FOLDER || "beno-digital-card",
  },

  resendApiKey: process.env.RESEND_API_KEY,
  emailFrom: process.env.EMAIL_FROM || "Beno Digital Card <no-reply@example.com>",

  whatsapp: {
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    templateName: process.env.WHATSAPP_TEMPLATE_NAME,
    templateLang: process.env.WHATSAPP_TEMPLATE_LANG || "en",
    apiVersion: process.env.WHATSAPP_API_VERSION || "v21.0",
  },

  encryptionKey: process.env.ENCRYPTION_KEY,
  internalApiKey: process.env.INTERNAL_API_KEY || "",
  jobsEnabled: bool(process.env.JOBS_ENABLED, true),
  defaultTimezone: process.env.DEFAULT_TIMEZONE || "Asia/Kolkata",
};

export function assertEnv() {
  const missing = [];
  if (!env.mongoUri) missing.push("MONGO_URI");
  if (!env.jwtAccessSecret) missing.push("JWT_ACCESS_SECRET");
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}. Copy .env.example to .env and fill them in.`);
  }
  if (env.jwtAccessSecret.length < 32) {
    throw new Error("JWT_ACCESS_SECRET must be at least 32 characters long.");
  }
  if (env.encryptionKey && !/^[0-9a-fA-F]{64}$/.test(env.encryptionKey)) {
    throw new Error("ENCRYPTION_KEY must be 64 hex characters (32 bytes).");
  }
  if (env.storageDriver === "cloudinary") {
    const c = env.cloudinary;
    if (!c.cloudName || !c.apiKey || !c.apiSecret) {
      throw new Error("STORAGE_DRIVER=cloudinary requires CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.");
    }
  }
}
