# FreeLancerHQ

All-in-one workspace for freelancers: manage clients, projects, invoices, payments and expenses in one place. Built with React, TypeScript, Vite and Tailwind CSS on the front end, and Node.js, Express and PostgreSQL on the back end.

## Features

- **Dashboard**: revenue this month vs last month, outstanding invoices, expenses, active projects and an "Upcoming" list of deadlines, due tasks, meetings and invoice due dates.
- **Clients**: contact details, notes, archive, and each client's projects, invoices and documents.
- **Projects and tasks**: status, budget, start date, deadline, and tasks with optional due dates. Cross-project Tasks page.
- **Proposals**: write proposals (optionally with an AI assistant), send them, and convert accepted ones into projects.
- **Invoices**: line items, tax, server-calculated totals, multi-currency with exchange rates frozen when sent, print / PDF.
- **Email invoices and client links**: email a client a link to a public invoice page. No client login needed; the unguessable link is the permission.
- **Online payments with Paystack**: each freelancer connects their own Paystack account, and clients pay by card, bank transfer or USSD. Payments are confirmed server-to-server and by signed webhooks, and recorded exactly once.
- **Payments and expenses**: manual or online payments, expense categories, outstanding balances.
- **Calendar**: month view of meetings, task due dates, project start dates and deadlines, and invoice due dates.
- **Documents**: upload contracts, briefs and receipts, filed by client and project.
- **Reports**: revenue, expenses, profit and outstanding payments.
- **Accounts**: sign-up verified by a one-time code (email or SMS), login, forgot password, profile and settings.

## Tech stack

| Layer | Tools |
| --- | --- |
| Front end | React 19, TypeScript, Vite, Tailwind CSS 4, React Router |
| Back end | Node.js, Express 5, Zod (validation), JWT (auth), Multer (uploads) |
| Database | PostgreSQL (`pg`, plain SQL) |
| Integrations | Paystack (payments), SMTP via Nodemailer (email), Twilio (SMS), Anthropic Claude (AI proposals), ExchangeRate-API (currency rates) |

## How it fits together

```text
React app (src/)  ──fetch /api/*──▶  Express API (server/src/)  ──SQL──▶  PostgreSQL
      │                                   │
      │                                   ├──▶ Paystack API      (start / verify payments)
      │                                   ◀── Paystack webhooks  (signed, verified)
      │                                   ├──▶ SMTP / Twilio     (emails, one-time codes)
      │                                   └──▶ File storage      (documents; local disk in dev)
      └── public pages (/i/:token) need no login
```

- All business rules (totals, invoice status, ownership checks) live on the server. The browser is never trusted.
- Every query is scoped to the logged-in user (`user_id`), and every input is validated with Zod.
- Invoice status is derived, not stored, so it can't go out of date.

## Getting started

### Prerequisites

- Node.js 22 or newer
- Yarn 1 (`npm install -g yarn`)
- PostgreSQL 14 or newer, running locally

### 1. Install

```bash
yarn install
yarn --cwd server install
```

### 2. Configure the API

```bash
cp server/.env.example server/.env
```

Then edit `server/.env`. At minimum, set:

- `DATABASE_URL`: e.g. `postgresql://localhost:5432/freelancehq` (create the database first: `createdb freelancehq`)
- `JWT_SECRET`: a long random string
- `ENCRYPTION_KEY`: 32 random bytes in base64:
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`

Everything else is optional. Without SMTP/Twilio, one-time codes and emails are printed in the API terminal (development only). Without an Anthropic key, only the AI proposal button is unavailable.

### 3. Create the database tables

```bash
yarn --cwd server db:migrate
```

The schema (`server/db/schema.sql`) is safe to run repeatedly.

### 4. Run

In two terminals:

```bash
yarn dev:server   # API on http://localhost:4000
yarn dev          # app on http://localhost:5180 (proxies /api to the API)
```

### Trying online payments

1. Create a Paystack account. Test mode needs no paperwork.
2. In the app, go to **Settings → Online payments** and paste your `sk_test_…` key.
3. Send an invoice in NGN, open its client link in a private window, and pay with a Paystack test card.

## Scripts

| Command | What it does |
| --- | --- |
| `yarn dev` | Front end dev server |
| `yarn dev:server` | API with auto-reload |
| `yarn build` | Type-check and build the front end |
| `yarn lint` | ESLint |
| `yarn --cwd server db:migrate` | Apply `server/db/schema.sql` |

## Project structure

```text
src/                 React app
  pages/             one file per screen
  components/        shared UI (forms, tables, panels)
  services/          the only code that calls the API
  lib/api.ts         fetch wrapper: base URL, auth header, errors
  types/             TypeScript types mirroring the API
server/
  db/schema.sql      every table, with comments explaining the relationships
  src/routes/        one router per area (clients, invoices, public, paystack...)
  src/paystack.ts    Paystack calls and idempotent payment recording
  src/crypto.ts      AES-256-GCM encryption for stored API keys
  src/storage.ts     file storage interface (local disk driver)
```

## Security notes

- Passwords are hashed with bcrypt; one-time codes are stored only as keyed hashes.
- Payment-provider secret keys are encrypted at rest (AES-256-GCM) and never sent back to the browser.
- Paystack webhooks are verified with HMAC-SHA512 signatures; payment amounts are checked against what the server requested.
- Uploads: allow-listed file types, a size limit, random storage keys, always served as downloads.
- Public invoice links use 256-bit random tokens and reveal nothing about other data.

## Roadmap

- Notifications: invoice paid, overdue reminders, weekly summary
- Deployment (Vercel), cloud file storage, production database
- Automated tests

## License

Not yet licensed. All rights reserved by the author.
