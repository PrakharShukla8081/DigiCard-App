# Architecture & security notes

## Overview

```
Browser ──► Next.js (frontend, :3000) ──/api/*, /uploads/*──► Express API (backend, :5000) ──► MongoDB
                │                                                      │
                └─ SSR of public cards (/c/:org/:slug) ───────────────┘── Resend (email), Meta WhatsApp, Cloudinary (optional)
```

- The browser talks only to the Next.js origin. API calls are proxied, so the refresh token can live in an **HttpOnly, SameSite=Lax cookie** and the access token stays **in memory** (never in localStorage).
- Public cards are server-rendered (fast first paint, link previews on WhatsApp/LinkedIn) and cached for 30 seconds.

## Backend layout

```
backend/src
├── app.js / server.js          Express app, error handler, startup
├── config/                      env + database
├── common/                      constants, validation (zod), errors, tenant guard, rate limiter, crypto, CSV
├── middleware/                  authenticate, requireRole, tenantContext, requireFeature, uploads
├── models/index.js              all Mongoose schemas
├── modules/
│   ├── auth/                    login, refresh (rotating), logout, invites, password reset/change
│   ├── platform/                Super Admin API  (/api/platform)
│   ├── org/                     Company Admin API (/api/org): employees, import, settings, content, analytics, enquiries, reminders, team
│   ├── me/                      Employee self-service (/api/me)
│   └── public/                  Public card, vCard, QR, events, enquiries (/api/public)
├── services/                    entitlements, cards, analytics, importer, reminders, email, whatsapp, audit, invites
├── storage/                     local / Cloudinary adapter
├── jobs/scheduler.js            reminders (every 10 min) + subscription expiry (hourly)
└── scripts/                     seed, migrate-to-cloudinary
```

## Data model

| Collection | Tenant-owned | Notes |
|---|---|---|
| `plans` | – | Name, price, cycle, duration, employee limit, feature flags |
| `organizations` | (is the tenant) | Slug, status, contact, branding, card settings, reminder settings, encrypted WhatsApp creds |
| `subscriptions` | ✔ | Plan, status, start/end, limit & feature overrides, manual payment reference, `isCurrent` |
| `users` | via `organizationId` | Role `super_admin` / `company_admin` / `employee`, status, `tokenVersion`, hashed invite/reset tokens |
| `refreshtokens` | – | SHA-256 hashed, rotation chain, TTL index |
| `employees` | ✔ | Profile + card (slug unique per company, status, published, stats, activation) |
| `contentitems` | ✔ | Products, gallery images, YouTube videos |
| `enquiries` | ✔ | Form submissions from cards |
| `analyticsevents` | ✔ | Raw events, 13-month TTL |
| `dailystats` | ✔ | Per employee per day counters (fast reports) |
| `importjobs` | ✔ | Bulk upload progress + row errors |
| `notificationlogs` | ✔ | Reminder deliveries (sent / failed / skipped) |
| `auditlogs` | explicit filter | `organizationId = null` for platform actions |

Every compound index on tenant data starts with `organizationId`.

## Tenant isolation (three layers)

1. **Identity:** the organization id is taken from the authenticated user's database record on every request — never from the request body, query or URL. `organizationId` sent by a client is ignored.
2. **Route scoping:** every company query includes `{ organizationId: req.tenant.organizationId }`. Lookups by id are `findOne({ _id, organizationId })`, so another company's id returns 404.
3. **Database guard:** a Mongoose plugin (`common/tenantGuard.js`) on all tenant collections throws if a query, update, delete, aggregate, insert or bulk write lacks `organizationId`. Super Admin code that legitimately reads across companies must opt out explicitly with `{ skipTenantGuard: true }`.

The test suite checks all three (cross-company read/update/delete/bulk, body injection, unscoped queries).

## Authentication & sessions

- Passwords: bcrypt (cost 12), min 8 chars with letters and numbers.
- Access token: JWT, 15 minutes, contains user id, role, org and `tokenVersion`.
- On **every** request the user is re-loaded: disabled users, role changes and "sign out everywhere" take effect immediately.
- Refresh token: random 48 bytes, stored as SHA-256, rotated on every use. Replaying an old token after a 60-second grace window (parallel tabs) revokes all of that user's sessions.
- Invite and reset tokens are hashed; invites expire after 7 days, resets after 30 minutes. Password reset and change revoke all sessions.
- Login and email endpoints are rate-limited; login errors don't reveal whether an email exists.

## Authorization

- `requireRole` per area (`/platform`, `/org`, `/me`).
- `tenantContext` loads the company and its entitlements: inactive company → 403; unusable subscription → read-only (402 on writes); public cards hidden.
- `requireFeature` / `assertFeature` enforce plan features (bulk upload, branding, employee login, advanced analytics, enquiry form, content sections, reminders, hide "powered by").
- Plan employee limits are enforced on manual create and on import (rows beyond the limit are reported, not silently dropped).
- Employees can update only fields in the company's `employeeEditableFields`; unknown fields are rejected.

## Public endpoints

- Card payloads are built from a **whitelist** (no ids, stats, login or reminder data).
- Cards are shown only when the company is active, the subscription is usable, and the card is active + published.
- Event beacons ignore bots, never reveal whether a card exists, and are rate-limited per IP.
- Unique visitors use a daily, salted hash of IP + user agent (not reversible and not trackable across days).
- Enquiries: rate-limited, honeypot field, phone/email validation.

## Uploads

- Images only (JPG/PNG/WEBP/GIF), detected from file bytes, max 5 MB. SVG is rejected (script risk).
- Import files: `.csv` / `.xlsx` only, 10 MB, 20,000 rows. Excel is parsed with ExcelJS (the `xlsx` package from the old project had known vulnerabilities and was dropped).
- CSV exports escape formula characters (`= + - @`) to prevent CSV injection.

## Bulk import pipeline

parse → normalise headers (many aliases accepted) → validate each row → detect duplicates inside the file → compare with existing employees of the same company → enforce seat limit → write in batches of 500 → keep row-level errors (downloadable CSV). Runs in the background in the API process with progress polling. For very large or frequent imports, move `runImport()` to a queue worker.

## Analytics: what is measured

| Metric | Meaning |
|---|---|
| View | Card page opened in a browser that runs JavaScript (bots excluded) |
| Unique visitor | First view of that card by a visitor on that day |
| QR visit | View whose link carried `?src=qr` (all generated QR codes add it) |
| Share | Share button tapped |
| Contact save | vCard downloaded |
| Call / WhatsApp / Email / Website / Social | Button **tapped** — not a completed call or chat |
| Enquiry | Form submitted |

## Reused from the Prospect project

Kept as patterns, rewritten cleanly: Express module layering, centralised error handling, invite and password-reset flows, Resend email service, streaming Excel parsing with batched inserts, the shadcn/Tailwind UI conventions and the Next.js `/api` rewrite proxy.

Not carried over: prospect/account/ICP/segment/campaign/enrichment/duplicate modules, the unauthenticated-tenant migration route, unscoped audit logs, tokens in localStorage, `typescript.ignoreBuildErrors`, and the vulnerable `xlsx` dependency.
