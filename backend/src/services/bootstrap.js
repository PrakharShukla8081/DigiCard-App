import bcrypt from "bcryptjs";
import { passwordSchema } from "../common/validate.js";
import { logger } from "../common/logger.js";
import { ROLES } from "../common/constants.js";
import { User } from "../models/index.js";

export async function ensureSuperAdmin() {
  const existing = await User.findOne({ role: ROLES.SUPER_ADMIN }).select("_id").lean();
  if (existing) return { created: false };

  const email = String(process.env.SEED_SUPERADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.SEED_SUPERADMIN_PASSWORD || "";
  if (!email || !password) {
    logger.warn("No Super Admin yet. Set SEED_SUPERADMIN_EMAIL and SEED_SUPERADMIN_PASSWORD, or run npm run seed.");
    return { created: false };
  }

  const validPassword = passwordSchema.safeParse(password);
  if (!validPassword.success) throw new Error(`SEED_SUPERADMIN_PASSWORD: ${validPassword.error.issues[0].message}`);

  const name = String(process.env.SEED_SUPERADMIN_NAME || "Beno Super Admin").trim() || "Beno Super Admin";
  await User.create({
    name,
    email,
    role: ROLES.SUPER_ADMIN,
    status: "active",
    passwordHash: await bcrypt.hash(password, 12),
  });
  logger.info(`Created first Super Admin ${email}`);
  return { created: true };
}
