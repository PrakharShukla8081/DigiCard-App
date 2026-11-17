import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../config/env.js";
import { connectDB, disconnectDB } from "../config/db.js";
import { AuditLog, LoginChallenge, RefreshToken, User } from "../models/index.js";

export async function resetTwoFactorForUser(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) throw new Error("A user email is required.");

  const user = await User.findOneAndUpdate(
    { email: normalizedEmail },
    {
      $set: {
        totpSecretEnc: null,
        pendingTotpSecretEnc: null,
        recoveryCodeHashes: [],
        failedLoginAttempts: 0,
        loginLockedUntil: null,
      },
      $inc: { tokenVersion: 1 },
    },
    { returnDocument: "after" }
  )
    .select("email organizationId")
    .lean();

  if (!user) throw new Error(`No user found for ${normalizedEmail}.`);

  await Promise.all([
    RefreshToken.updateMany({ userId: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } }),
    LoginChallenge.deleteMany({ userId: user._id }),
  ]);

  await AuditLog.create({
    organizationId: user.organizationId || null,
    actorName: "Break-glass CLI",
    actorRole: "break_glass_cli",
    action: "auth.2fa_reset_cli",
    entity: "User",
    entityId: String(user._id),
    summary: "Two-factor authentication and lockout reset through the break-glass CLI.",
  });

  return { email: user.email };
}

async function main() {
  const [email, ...extraArgs] = process.argv.slice(2);
  if (!email || extraArgs.length) {
    throw new Error("Usage: npm run auth:reset-2fa -- <user-email>");
  }
  if (!env.mongoUri) throw new Error("MONGO_URI is required.");

  await connectDB();
  try {
    const result = await resetTwoFactorForUser(email);
    console.log(`2FA reset complete for ${result.email}.`);
  } finally {
    await disconnectDB();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`2FA reset failed: ${error.message}`);
    process.exitCode = 1;
  });
}
