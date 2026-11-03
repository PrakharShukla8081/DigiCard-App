/**
 * Move images stored on the local disk to Cloudinary.
 *
 *   1. Put CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET in .env
 *   2. npm run migrate:cloudinary            (dry run — lists what would move)
 *   3. npm run migrate:cloudinary -- --apply (uploads and updates the database)
 *   4. Set STORAGE_DRIVER=cloudinary and restart the API
 *
 * Safe to run more than once: only keys that still start with "local:" are processed.
 * Local files are NOT deleted; remove the uploads folder yourself after checking the cards.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.js";
import { connectDB, disconnectDB } from "../config/db.js";
import { Organization, Employee, ContentItem } from "../models/index.js";
import { uploadBufferToCloudinary } from "../storage/index.js";

const apply = process.argv.includes("--apply");
const SKIP = { skipTenantGuard: true };

async function move(key, folder) {
  const rel = key.slice("local:".length);
  const abs = path.resolve(env.uploadDir, rel);
  const buf = await fs.readFile(abs);
  return uploadBufferToCloudinary(buf, folder);
}

async function main() {
  const c = env.cloudinary;
  if (apply && (!c.cloudName || !c.apiKey || !c.apiSecret)) throw new Error("Set the CLOUDINARY_* variables in .env first.");
  await connectDB();
  let count = 0;
  let failed = 0;

  const orgs = await Organization.find({ "branding.logoKey": /^local:/ });
  for (const o of orgs) {
    count++;
    console.log(`${apply ? "Moving" : "Would move"} logo of ${o.name}`);
    if (!apply) continue;
    try {
      const r = await move(o.branding.logoKey, `org-${o._id}/brand`);
      o.branding.logoUrl = r.url;
      o.branding.logoKey = r.key;
      await o.save();
    } catch (e) {
      failed++;
      console.error("  failed:", e.message);
    }
  }

  const emps = await Employee.find({ photoKey: /^local:/ }).setOptions(SKIP);
  for (const e of emps) {
    count++;
    if (!apply) continue;
    try {
      const r = await move(e.photoKey, `org-${e.organizationId}/photos`);
      await Employee.updateOne({ _id: e._id, organizationId: e.organizationId }, { photoUrl: r.url, photoKey: r.key });
    } catch (err) {
      failed++;
      console.error(`  photo of ${e.firstName} ${e.lastName} failed:`, err.message);
    }
  }
  if (!apply) console.log(`Would move ${emps.length} employee photo(s)`);

  const items = await ContentItem.find({ imageKey: /^local:/ }).setOptions(SKIP);
  for (const it of items) {
    count++;
    if (!apply) continue;
    try {
      const r = await move(it.imageKey, `org-${it.organizationId}/content`);
      await ContentItem.updateOne({ _id: it._id, organizationId: it.organizationId }, { imageUrl: r.url, imageKey: r.key });
    } catch (err) {
      failed++;
      console.error(`  content image ${it._id} failed:`, err.message);
    }
  }
  if (!apply) console.log(`Would move ${items.length} product/gallery image(s)`);

  console.log(apply ? `Done. ${count - failed} moved, ${failed} failed.` : `Dry run: ${count} file(s). Run again with --apply to move them.`);
  await disconnectDB();
}

main().catch(async (e) => {
  console.error(e.message);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
