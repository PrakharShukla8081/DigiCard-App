/**
 * Storage adapter. The rest of the app only calls saveImage() / deleteFile().
 * Switch drivers with STORAGE_DRIVER=local|cloudinary — no other code changes.
 *
 * Stored keys are prefixed with the driver ("local:..." / "cloudinary:..."),
 * so files uploaded before a switch can still be deleted correctly afterwards.
 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { env } from "../config/env.js";
import { badRequest } from "../common/errors.js";
import { logger } from "../common/logger.js";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Detect real image type from the first bytes (never trust the client's mimetype). SVG is rejected on purpose. */
export function sniffImage(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { ext: "png", mime: "image/png" };
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return { ext: "webp", mime: "image/webp" };
  if (buf.toString("ascii", 0, 3) === "GIF") return { ext: "gif", mime: "image/gif" };
  return null;
}

function assertImage(file) {
  if (!file?.buffer?.length) throw badRequest("Please choose an image file.");
  if (file.buffer.length > MAX_IMAGE_BYTES) throw badRequest("Image must be 5 MB or smaller.");
  const t = sniffImage(file.buffer);
  if (!t) throw badRequest("Only JPG, PNG, WEBP or GIF images are allowed.");
  return t;
}

const safeFolder = (f) => String(f).replace(/[^a-zA-Z0-9/_-]/g, "").replace(/\.\./g, "");

/* ───── Local disk ───── */
const local = {
  async save(buf, folder, ext) {
    const name = `${crypto.randomBytes(12).toString("hex")}.${ext}`;
    const rel = path.posix.join(safeFolder(folder), name);
    const abs = path.resolve(env.uploadDir, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, buf);
    return { url: `/uploads/${rel}`, key: `local:${rel}` };
  },
  async remove(rel) {
    const root = path.resolve(env.uploadDir);
    const abs = path.resolve(root, rel);
    if (!abs.startsWith(root + path.sep)) return; // never delete outside the upload dir
    await fs.unlink(abs).catch(() => {});
  },
};

/* ───── Cloudinary (signed REST upload, no SDK needed) ───── */
function cloudSign(params) {
  const str = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return crypto.createHash("sha1").update(str + env.cloudinary.apiSecret).digest("hex");
}

const cloudinary = {
  async save(buf, folder, ext, mime) {
    const c = env.cloudinary;
    const params = { folder: `${c.folder}/${safeFolder(folder)}`, timestamp: Math.floor(Date.now() / 1000) };
    const form = new FormData();
    form.append("file", `data:${mime};base64,${buf.toString("base64")}`);
    form.append("api_key", c.apiKey);
    form.append("timestamp", String(params.timestamp));
    form.append("folder", params.folder);
    form.append("signature", cloudSign(params));
    const res = await fetch(`https://api.cloudinary.com/v1_1/${c.cloudName}/image/upload`, { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Cloudinary upload failed: ${data?.error?.message || res.status}`);
    return { url: data.secure_url, key: `cloudinary:${data.public_id}` };
  },
  async remove(publicId) {
    const c = env.cloudinary;
    if (!c.cloudName || !c.apiKey || !c.apiSecret) return;
    const params = { public_id: publicId, timestamp: Math.floor(Date.now() / 1000) };
    const form = new FormData();
    form.append("public_id", publicId);
    form.append("api_key", c.apiKey);
    form.append("timestamp", String(params.timestamp));
    form.append("signature", cloudSign(params));
    await fetch(`https://api.cloudinary.com/v1_1/${c.cloudName}/image/destroy`, { method: "POST", body: form }).catch(() => {});
  },
};

/** Validate and store an uploaded image (multer memory file). Returns { url, key }. */
export async function saveImage(file, folder) {
  const t = assertImage(file);
  if (env.storageDriver === "cloudinary") return cloudinary.save(file.buffer, folder, t.ext, t.mime);
  return local.save(file.buffer, folder, t.ext);
}

/** Delete a stored file by key. Never throws. */
export async function deleteFile(key) {
  if (!key) return;
  try {
    const i = key.indexOf(":");
    const driver = key.slice(0, i);
    const id = key.slice(i + 1);
    if (driver === "local") await local.remove(id);
    else if (driver === "cloudinary") await cloudinary.remove(id);
  } catch (e) {
    logger.warn("deleteFile failed:", e.message);
  }
}

/** Used by the local → Cloudinary migration script. */
export async function uploadBufferToCloudinary(buf, folder) {
  const t = sniffImage(buf);
  if (!t) throw new Error("Not a supported image");
  return cloudinary.save(buf, folder, t.ext, t.mime);
}

export { local as _localDriver };
