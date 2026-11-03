import crypto from "node:crypto";
import { env } from "../config/env.js";

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");
export const sha256 = (v) => crypto.createHash("sha256").update(String(v)).digest("hex");

/** AES-256-GCM encryption for third-party secrets stored in the DB. */
export function canEncrypt() {
  return Boolean(env.encryptionKey);
}

export function encrypt(plain) {
  if (!env.encryptionKey) throw new Error("ENCRYPTION_KEY is not configured");
  const key = Buffer.from(env.encryptionKey, "hex");
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([c.update(String(plain), "utf8"), c.final()]);
  return [iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}

export function decrypt(payload) {
  if (!payload) return "";
  if (!env.encryptionKey) throw new Error("ENCRYPTION_KEY is not configured");
  const [iv, tag, data] = String(payload).split(".");
  const key = Buffer.from(env.encryptionKey, "hex");
  const d = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}

/** Privacy-preserving visitor id: hash of IP + user agent + day, so it cannot be reversed or tracked across days. */
export function visitorHash(ip, ua, day) {
  return sha256(`${ip}|${ua}|${day}|${env.jwtAccessSecret}`).slice(0, 32);
}
