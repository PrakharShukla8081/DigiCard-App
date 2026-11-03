import { z } from "zod";
import mongoose from "mongoose";
import { badRequest } from "./errors.js";

/** Parse `data` with a zod schema; throws a 400 with field-level messages. */
export function parse(schema, data) {
  const r = schema.safeParse(data ?? {});
  if (!r.success) {
    const fields = r.error.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
    const first = fields[0];
    throw badRequest(first ? `${first.field ? first.field + ": " : ""}${first.message}` : "Invalid input", fields);
  }
  return r.data;
}

export const objectId = z.string().refine((v) => mongoose.isValidObjectId(v), "Invalid id");

export function assertId(id, label = "id") {
  if (!mongoose.isValidObjectId(id)) throw badRequest(`Invalid ${label}`);
  return id;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
export const hexColor = z.string().regex(HEX, "Use a 6-digit hex colour like #4F46E5");

/** Optional trimmed string; empty string becomes "" (lets clients clear a field). */
export const optStr = (max = 300) => z.string().trim().max(max).optional();

export const urlish = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}([/?#].*)?$/i.test(v), "Enter a valid web address")
  .optional();

export const emailSchema = z.string().trim().toLowerCase().max(254).email("Enter a valid email address");

export const phoneSchema = z
  .string()
  .trim()
  .max(20)
  .refine((v) => v === "" || isValidPhone(v), "Enter a valid phone number with 10-15 digits")
  .optional();

export function isValidPhone(v) {
  const digits = String(v).replace(/[\s\-().]/g, "");
  return /^\+?\d{10,15}$/.test(digits);
}

export function normalizePhone(v) {
  if (!v) return "";
  const s = String(v).trim();
  const plus = s.startsWith("+");
  const digits = s.replace(/\D/g, "");
  return (plus ? "+" : "") + digits;
}

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128)
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), "Password must contain letters and numbers");

export function pageParams(q) {
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(q.limit, 10) || 25));
  return { page, limit, skip: (page - 1) * limit };
}

export const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
