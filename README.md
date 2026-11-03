# Beno Digital Card

A multi-tenant SaaS platform for digital visiting cards, built for **Beno Support Technologies**.

Beno sells subscriptions to companies. Each company gets its own isolated account where its admin uploads employees (one by one or from Excel/CSV), applies the company branding once, and every employee automatically gets a mobile-first digital card with a permanent link and QR code. Usage is tracked, and employees who don't use their card can be reminded by email or WhatsApp.

```
beno-digital-card/
├── backend/    Node.js + Express 5 + MongoDB (Mongoose 9) REST API
├── frontend/   Next.js 16 (App Router) + React 19 + Tailwind CSS 4 web app
├── docs/       Architecture, security and API notes
└── README.md   ← you are here
```

---

## 1. Requirements

| Tool | Version |
|---|---|
| Node.js | 20.10 or newer (22 LTS recommended) |
| MongoDB | 6.0+ — local install, Docker, or a free **MongoDB Atlas** cluster |
| npm | comes with Node |

---

## 2. Run it locally (VS Code)

Open the `beno-digital-card` folder in VS Code and use two terminals.

### Terminal 1 — backend API

```bash
cd backend
npm install
cp .env.example .env        # Windows: copy .env.example .env
```

Edit `backend/.env` and fill in at least:

```env
MONGO_URI=mongodb://127.0.0.1:27017/beno_digital_card     # or your Atlas connection string
JWT_ACCESS_SECRET=<a long random string, 32+ characters>
INTERNAL_API_KEY=<another random string>
SEED_SUPERADMIN_EMAIL=you@yourcompany.com
SEED_SUPERADMIN_PASSWORD=<min 8 chars, letters + numbers>
```

Generate random secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Create the first Super Admin (and, optionally, example plans and a demo company):

```bash
npm run seed                      # Super Admin only
npm run seed -- --sample-plans    # + three EXAMPLE plans (edit price/limits later)
npm run seed -- --demo            # + sample plans + "Demo Industries" with 5 employees
```

The `--demo` option prints the demo company admin's password once. Save it.

Start the API:

```bash
npm run dev          # http://localhost:5000  (health check: /health)
```

### Terminal 2 — web app

```bash
cd frontend
npm install
cp .env.example .env.local    # Windows: copy .env.example .env.local
```

`frontend/.env.local`:

```env
BACKEND_URL=http://localhost:5000
NEXT_PUBLIC_APP_URL=http://localhost:3000
INTERNAL_API_KEY=<same value as in backend/.env>
```

```bash
npm run dev          # http://localhost:3000
```

Open **http://localhost:3000/login** and sign in with the Super Admin email and password from `backend/.env`.

> Without `RESEND_API_KEY` emails are not sent; they are printed in the backend terminal instead.
> Every invite screen also shows the invite link so you can copy it and share it manually.

---

## 3. How the product works

### Roles

| Role | Where | Can do |
|---|---|---|
| **Super Admin** (Beno staff) | `/platform` | Create companies, assign/renew subscriptions, manage plans, activate/deactivate companies, invite company admins, platform analytics, platform settings, audit log |
| **Company Admin** | `/admin` | Employees, bulk upload, branding & card design, products/gallery/videos, analytics, enquiries, reminders, admin team, view subscription |
| **Employee** | `/me` | View own card & stats, edit only the fields the admin allows, upload photo, share kit (WhatsApp, link, email signature, Zoom/Teams background, QR) |
| **Visitor** | `/c/{company}/{employee}` | Public card — no login |

### Typical flow

1. **Super Admin → Plans:** create plans (name, price, billing cycle, duration, employee limit, features). Nothing is hardcoded.
2. **Super Admin → Companies → New company:** company details, first admin's email and the subscription. The admin receives an invite email.
3. **Company Admin:** sets the logo, colours and card design in **Branding**, then adds employees manually or with **Bulk upload** (download the template first).
4. Every employee gets a card at `https://your-domain/c/company-slug/employee-name` and a QR code. Editing a profile never changes the link, so printed QR codes keep working.
5. **Employees** (if employee login is in the plan and switched on) get an invite, log in at `/login`, and manage their card.
6. **Analytics** shows views, unique visitors, shares, contact saves, QR visits, button taps and enquiries, with Today / 7 days / 30 days / custom ranges.
7. **Reminders** send weekly email/WhatsApp nudges to employees who haven't activated their card, have no photo, or had no activity for N days.

### Subscriptions

- Statuses: **trial, active, expired, suspended, cancelled**. An active/trial subscription past its end date is treated as **expired** automatically.
- When the subscription is not usable, the company admin can still log in and **read** everything, but changes are blocked and **public cards go offline**.
- Admins are emailed before expiry (Platform settings → "Warn admins before expiry").
- Payments are recorded manually (invoice/reference field). The `Subscription.payment` field is ready for a gateway such as Razorpay later; no fake payment is simulated.

---

## 4. Configuration reference

All backend settings are documented inline in `backend/.env.example`. The important ones:

| Variable | Purpose |
|---|---|
| `MONGO_URI` | MongoDB connection string |
| `JWT_ACCESS_SECRET` | Signs 15-minute access tokens (32+ chars) |
| `FRONTEND_URL` | Web app URL, used in invite/reset emails and CORS |
| `PUBLIC_CARD_BASE_URL` | Base for card links and QR codes (usually the same as `FRONTEND_URL`, or a dedicated card domain that serves this frontend) |
| `TRUST_PROXY` | Number of proxies in front of the API. Keep `1` (the Next.js app proxies `/api`); `2` if there is also a load balancer |
| `INTERNAL_API_KEY` | Shared secret so server-side card rendering is not rate-limited |
| `STORAGE_DRIVER` | `local` (default) or `cloudinary` |
| `RESEND_API_KEY`, `EMAIL_FROM` | Email delivery through [Resend](https://resend.com) |
| `WHATSAPP_*` | Optional platform-wide WhatsApp Business Cloud API sender |
| `ENCRYPTION_KEY` | 64 hex chars; required to store a company's own WhatsApp token encrypted |
| `JOBS_ENABLED` | Runs reminders and subscription-expiry jobs inside the API process |

### Image storage: local now, Cloudinary later

Uploaded logos, photos and gallery images go through one storage adapter (`backend/src/storage/index.js`).

- **Local (`STORAGE_DRIVER=local`)** saves files in `backend/uploads`. Use it on your computer or on a server with a **permanent disk** (VPS, Render with a paid disk). Free hosts that wipe the disk on every deploy will lose the images.
- **Switch to Cloudinary** without code changes:
  1. Add `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` to `.env`.
  2. `npm run migrate:cloudinary` (dry run) → `npm run migrate:cloudinary -- --apply` to move existing images.
  3. Set `STORAGE_DRIVER=cloudinary` and restart.

### Email

Set `RESEND_API_KEY` and a verified sender in `EMAIL_FROM`. Used for invites, password resets, enquiry notifications, reminders and expiry warnings.

### WhatsApp reminders

WhatsApp Business messages must use a **Meta-approved template**. Create one with two body variables — `{{1}}` = employee first name, `{{2}}` = card link — for example:

> Hi {{1}}, your company digital visiting card is ready. Open and share it with customers: {{2}}

Then either set `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_NAME` in the backend `.env` (Beno's number for all companies), or let each company enter its own details in **Admin → Reminders** (requires `ENCRYPTION_KEY`). Meta charges per delivered template message; the app never reports a message as sent unless Meta accepted it.

---

## 5. Deploying

A common setup:

| Part | Where |
|---|---|
| MongoDB | MongoDB Atlas |
| Backend | A VPS (PM2 / systemd + Nginx) or Render web service (always-on plan, with a disk if `STORAGE_DRIVER=local`) |
| Frontend | Vercel, Render or the same VPS (`npm run build && npm start`) |

Checklist:

- `NODE_ENV=production` on the backend (secure cookies need **HTTPS**).
- `FRONTEND_URL` and `PUBLIC_CARD_BASE_URL` = your real HTTPS domain; `BACKEND_URL` in the frontend points to the API.
- The browser only talks to the frontend domain; `/api/*` and `/uploads/*` are proxied by Next.js (see `frontend/next.config.mjs`). Do not expose the API publicly with `TRUST_PROXY` higher than the real number of proxies.
- Run **one** backend instance with `JOBS_ENABLED=true` (others `false`) if you scale out. The in-memory rate limiter and import jobs are per-process; move them to Redis/BullMQ when you run several API instances.
- Back up MongoDB (Atlas does this) and, with local storage, the `uploads` folder.

---

## 6. Tests

```bash
cd backend
TEST_MONGO_URI=mongodb://127.0.0.1:27017/beno_card_test npm test
```

17 end-to-end API tests cover login and token rotation, tenant isolation (company B cannot read, edit or delete company A's data even with exact IDs), the database-level tenant guard, plan limits and features, bulk import validation, public card whitelisting, analytics, employee field permissions, expired subscriptions, deactivated companies, reminders and audit-log scoping. The test database is wiped on each run.

> If you test against FerretDB instead of MongoDB, also set `TEST_FERRETDB=1`.

Frontend type-check and production build:

```bash
cd frontend
npm run typecheck
npm run build
```

---

## 7. What is not included (yet)

- **Online payments** (Razorpay/Stripe): subscriptions are assigned manually; the data model is ready.
- Apple/Google Wallet passes, NFC cards, CRM sync, SSO / directory sync, business-card scanner.
- **ISO/IEC 27001** is a certification of the organisation (Beno), not of software. The app follows security practices that support it (access control, audit logs, encrypted secrets, hashed tokens), but certification requires an audit of Beno's processes.

See `docs/ARCHITECTURE.md` for the data model, tenant isolation design and security notes.
