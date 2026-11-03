/**
 * npm run seed                 → creates the first Super Admin from SEED_SUPERADMIN_* env vars
 * npm run seed -- --sample-plans → also creates three EXAMPLE plans (edit prices/limits in the Super Admin panel)
 * npm run seed -- --demo        → also creates a demo company "Demo Industries" with sample employees
 *
 * Nothing here is hardcoded commercial pricing: sample plans are clearly marked and fully editable.
 */
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { env } from "../config/env.js";
import { connectDB, disconnectDB } from "../config/db.js";
import { Plan, User, Organization, Subscription, Employee, ContentItem, getPlatformSettings } from "../models/index.js";
import { ROLES, FEATURE_KEYS } from "../common/constants.js";
import { passwordSchema } from "../common/validate.js";
import { slugify } from "../common/slug.js";

const args = new Set(process.argv.slice(2));
const all = Object.fromEntries(FEATURE_KEYS.map((k) => [k, true]));

async function main() {
  if (!env.mongoUri) throw new Error("MONGO_URI is not set. Copy .env.example to .env first.");
  await connectDB();
  await getPlatformSettings();

  const email = (process.env.SEED_SUPERADMIN_EMAIL || "").toLowerCase().trim();
  const password = process.env.SEED_SUPERADMIN_PASSWORD || "";
  const name = process.env.SEED_SUPERADMIN_NAME || "Beno Super Admin";
  if (!email || !password) {
    console.log("Skipping Super Admin: set SEED_SUPERADMIN_EMAIL and SEED_SUPERADMIN_PASSWORD in .env");
  } else {
    const ok = passwordSchema.safeParse(password);
    if (!ok.success) throw new Error("SEED_SUPERADMIN_PASSWORD: " + ok.error.issues[0].message);
    const existing = await User.findOne({ email });
    if (existing) {
      console.log(`Super Admin ${email} already exists — left unchanged.`);
    } else {
      await User.create({ name, email, role: ROLES.SUPER_ADMIN, status: "active", passwordHash: await bcrypt.hash(password, 12) });
      console.log(`✔ Super Admin created: ${email}`);
    }
  }

  if (args.has("--sample-plans") || args.has("--demo")) {
    const samples = [
      { code: "starter", name: "Starter (sample)", price: 0, billingCycle: "yearly", durationDays: 365, employeeLimit: 25, sortOrder: 1, features: { enquiryForm: true } },
      {
        code: "business",
        name: "Business (sample)",
        price: 0,
        billingCycle: "yearly",
        durationDays: 365,
        employeeLimit: 500,
        sortOrder: 2,
        features: { bulkUpload: true, customBranding: true, employeeLogin: true, advancedAnalytics: true, enquiryForm: true, productsGallery: true, emailReminders: true },
      },
      { code: "enterprise", name: "Enterprise (sample)", price: 0, billingCycle: "yearly", durationDays: 365, employeeLimit: 5000, sortOrder: 3, features: all },
    ];
    for (const p of samples) {
      if (await Plan.exists({ code: p.code })) continue;
      await Plan.create({ ...p, description: "Example plan created by the seed script. Set the real price and limits in Super Admin > Plans." });
      console.log(`✔ Sample plan: ${p.name}`);
    }
  }

  if (args.has("--demo")) {
    const slug = "demo-industries";
    let org = await Organization.findOne({ slug });
    if (!org) {
      org = await Organization.create({
        name: "Demo Industries",
        slug,
        contact: { email: "hello@demo-industries.example", phone: "+91 98765 00000", website: "www.demo-industries.example", address: "Pune, Maharashtra, India" },
        branding: { primaryColor: "#0E7490", secondaryColor: "#F59E0B", description: "Industrial pumps and energy-saving solutions since 2004.", tagline: "Engineering that saves energy" },
        cardSettings: { template: "modern" },
      });
      const plan = await Plan.findOne({ code: "enterprise" });
      await Subscription.create({ organizationId: org._id, planId: plan._id, status: "trial", startDate: new Date(), endDate: new Date(Date.now() + 30 * 864e5), isCurrent: true });
      const adminEmail = "admin@demo-industries.example";
      // Random password printed once — never a fixed, guessable credential.
      const demoPassword = process.env.SEED_DEMO_ADMIN_PASSWORD || `Demo-${crypto.randomBytes(5).toString("hex")}9`;
      if (!(await User.exists({ email: adminEmail }))) {
        await User.create({ name: "Demo Admin", email: adminEmail, role: ROLES.COMPANY_ADMIN, organizationId: org._id, status: "active", passwordHash: await bcrypt.hash(demoPassword, 12) });
      }
      const people = [
        ["Rahul", "Sharma", "Senior Sales Manager", "Business Development"],
        ["Priya", "Singh", "Head of Marketing", "Marketing"],
        ["Amit", "Verma", "Area Sales Manager", "Sales"],
        ["Neha", "Gupta", "Key Account Manager", "Sales"],
        ["Mohit", "Kumar", "Field Service Engineer", "Service"],
      ];
      let i = 1;
      for (const [f, l, d, dep] of people) {
        await Employee.create({
          organizationId: org._id,
          employeeCode: `DI-${String(i++).padStart(4, "0")}`,
          firstName: f,
          lastName: l,
          designation: d,
          department: dep,
          workEmail: `${f}.${l}@demo-industries.example`.toLowerCase(),
          mobile: "+9198765" + String(10000 + i * 111).slice(0, 5),
          whatsapp: "+9198765" + String(10000 + i * 111).slice(0, 5),
          location: "Pune, Maharashtra",
          bio: `${d} at Demo Industries.`,
          slug: slugify(`${f} ${l}`),
          publishedAt: new Date(),
        });
      }
      await ContentItem.insertMany([
        { organizationId: org._id, kind: "product", title: "Industrial pumps", description: "Centrifugal and multistage", sortOrder: 1 },
        { organizationId: org._id, kind: "product", title: "Energy audits", description: "Plant-wide savings report", sortOrder: 2 },
        { organizationId: org._id, kind: "video", title: "Company overview", url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ", youtubeId: "aqz-KE-bpKQ", sortOrder: 1 },
      ]);
      console.log(`✔ Demo company created. Admin login: ${adminEmail} / ${demoPassword}  (shown once — save it)`);
    } else {
      console.log("Demo company already exists.");
    }
  }

  await disconnectDB();
}

main().catch(async (e) => {
  console.error("Seed failed:", e.message);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
