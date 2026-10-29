-- FreelanceHQ database schema (PostgreSQL).
-- Safe to run more than once: every statement uses IF NOT EXISTS.

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gives us gen_random_uuid()

-- users: one row per account
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  email         TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,           -- never store the real password
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- clients: belong to one user.
-- user_id is a FOREIGN KEY: it must match an existing users.id, and
-- ON DELETE CASCADE removes a user's clients if the user is deleted.
CREATE TABLE IF NOT EXISTS clients (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  email      TEXT        NOT NULL,
  phone      TEXT        NOT NULL DEFAULT '',
  company    TEXT        NOT NULL DEFAULT '',
  address    TEXT        NOT NULL DEFAULT '',
  notes      TEXT        NOT NULL DEFAULT '',
  archived   BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- An index makes "all clients for this user" fast as the table grows.
CREATE INDEX IF NOT EXISTS clients_user_id_idx ON clients(user_id);

-- projects: belong to one user AND one client.
-- client_id is a FOREIGN KEY to clients(id). ON DELETE RESTRICT means Postgres refuses to
-- delete a client that still has projects (that's why clients are archived, not deleted).
-- CHECK limits status to the four values the app understands.
CREATE TABLE IF NOT EXISTS projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id   UUID          NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  name        TEXT          NOT NULL,
  description TEXT          NOT NULL DEFAULT '',
  status      TEXT          NOT NULL DEFAULT 'not_started'
              CHECK (status IN ('not_started', 'in_progress', 'review', 'completed')),
  budget      NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (budget >= 0),
  start_date  DATE,
  deadline    DATE,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS projects_user_id_idx ON projects(user_id);
CREATE INDEX IF NOT EXISTS projects_client_id_idx ON projects(client_id);

-- tasks: belong to a project. Deleting a project deletes its tasks (CASCADE).
CREATE TABLE IF NOT EXISTS tasks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title      TEXT        NOT NULL,
  done       BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tasks_project_id_idx ON tasks(project_id);

-- invoices: one per bill sent to a client, optionally tied to a project.
-- project_id uses ON DELETE SET NULL: if a project is removed the invoice survives.
-- "number" is a per-user counter (1, 2, 3...); the app shows it as INV-001.
-- There is NO status column: status is worked out from sent_at, payments and due_date.
CREATE TABLE IF NOT EXISTS invoices (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id  UUID          NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  project_id UUID          REFERENCES projects(id) ON DELETE SET NULL,
  number     INTEGER       NOT NULL,
  issue_date DATE          NOT NULL DEFAULT CURRENT_DATE,
  due_date   DATE          NOT NULL,
  tax_rate   NUMERIC(5,2)  NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  subtotal   NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax        NUMERIC(14,2) NOT NULL DEFAULT 0,
  total      NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes      TEXT          NOT NULL DEFAULT '',
  sent_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (user_id, number)
);
CREATE INDEX IF NOT EXISTS invoices_user_id_idx ON invoices(user_id);
CREATE INDEX IF NOT EXISTS invoices_client_id_idx ON invoices(client_id);
CREATE INDEX IF NOT EXISTS invoices_project_id_idx ON invoices(project_id);

-- invoice_items: the lines on an invoice (one-to-many). Deleted with their invoice.
CREATE TABLE IF NOT EXISTS invoice_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  UUID          NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT          NOT NULL,
  quantity    NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
  unit_price  NUMERIC(14,2) NOT NULL CHECK (unit_price >= 0),
  position    INTEGER       NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS invoice_items_invoice_id_idx ON invoice_items(invoice_id);

-- payments: money received against an invoice. RESTRICT: an invoice with payments can't be deleted.
CREATE TABLE IF NOT EXISTS payments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invoice_id UUID          NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  amount     NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  paid_on    DATE          NOT NULL DEFAULT CURRENT_DATE,
  method     TEXT          NOT NULL DEFAULT '',
  note       TEXT          NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_user_id_idx ON payments(user_id);
CREATE INDEX IF NOT EXISTS payments_invoice_id_idx ON payments(invoice_id);

-- expenses: business costs, not tied to a client.
CREATE TABLE IF NOT EXISTS expenses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  description TEXT          NOT NULL,
  category    TEXT          NOT NULL DEFAULT 'Other',
  amount      NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  spent_on    DATE          NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS expenses_user_id_idx ON expenses(user_id);

-- ---------------------------------------------------------------------------
-- Phase 5: profile, settings, invoice prefix
-- ---------------------------------------------------------------------------

-- Extra profile fields on the existing users table.
ALTER TABLE users ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio   TEXT NOT NULL DEFAULT '';

-- user_settings: exactly one row per user (user_id is the PRIMARY KEY *and* a foreign key,
-- which is how you model a one-to-one relationship). The row is created the first time
-- the user saves their settings; until then the app uses these same defaults.
CREATE TABLE IF NOT EXISTS user_settings (
  user_id             UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  business_name       TEXT    NOT NULL DEFAULT '',
  business_email      TEXT    NOT NULL DEFAULT '',
  business_phone      TEXT    NOT NULL DEFAULT '',
  business_address    TEXT    NOT NULL DEFAULT '',
  currency            TEXT    NOT NULL DEFAULT 'NGN',
  invoice_prefix      TEXT    NOT NULL DEFAULT 'INV-',
  payment_terms_days  INTEGER NOT NULL DEFAULT 14 CHECK (payment_terms_days BETWEEN 0 AND 365),
  invoice_note        TEXT    NOT NULL DEFAULT 'Thank you for your business.',
  notify_invoice_paid BOOLEAN NOT NULL DEFAULT true,
  notify_overdue      BOOLEAN NOT NULL DEFAULT true,
  notify_weekly       BOOLEAN NOT NULL DEFAULT true,
  notify_product      BOOLEAN NOT NULL DEFAULT false,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Each invoice remembers the prefix it was issued with, so changing the prefix in Settings
-- only affects NEW invoices (an invoice number should never change after it is issued).
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS prefix TEXT NOT NULL DEFAULT 'INV-';

-- ---------------------------------------------------------------------------
-- Sign-up with OTP verification (the account is only created AFTER the code is verified)
-- ---------------------------------------------------------------------------

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT false;

-- signup_verifications: a sign-up in progress. One row per email; it is deleted when the
-- account is created. We store only a HASH of the one-time code, never the code itself.
CREATE TABLE IF NOT EXISTS signup_verifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  email        TEXT        NOT NULL UNIQUE,
  phone        TEXT        NOT NULL DEFAULT '',
  channel      TEXT        NOT NULL CHECK (channel IN ('email', 'phone')),  -- where the code was sent
  code_hash    TEXT        NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  attempts     INTEGER     NOT NULL DEFAULT 0,   -- wrong guesses for the current code
  resend_count INTEGER     NOT NULL DEFAULT 0,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Universal app: no country is assumed. New accounts start on USD and choose their own
-- currency in Settings.
-- ---------------------------------------------------------------------------
ALTER TABLE user_settings ALTER COLUMN currency SET DEFAULT 'USD';

-- ---------------------------------------------------------------------------
-- Multi-currency.
--   * Every account has ONE home currency (user_settings.currency). Dashboard, reports,
--     expenses and project budgets are all in it. It is chosen at sign-up and locked once
--     the account has any money data.
--   * Every invoice has its OWN currency; items, totals and payments are in that currency.
--   * Each invoice remembers base_rate (1 invoice-currency = base_rate home-currency), so
--     "outstanding" and "billed" totals can be shown in the home currency consistently.
--   * Each payment remembers what it was worth in the home currency (base_amount) at the
--     time it was received, so revenue is never re-valued later.
-- ---------------------------------------------------------------------------

ALTER TABLE signup_verifications ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD';

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS currency  TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS base_rate NUMERIC(20,10) NOT NULL DEFAULT 1 CHECK (base_rate > 0);
-- Invoices made before multi-currency existed are in their owner's home currency.
UPDATE invoices i SET currency = COALESCE((SELECT s.currency FROM user_settings s WHERE s.user_id = i.user_id), 'USD')
  WHERE i.currency IS NULL;
ALTER TABLE invoices ALTER COLUMN currency SET NOT NULL;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(20,10) NOT NULL DEFAULT 1 CHECK (exchange_rate > 0);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS base_amount   NUMERIC(14,2);
UPDATE payments SET base_amount = amount WHERE base_amount IS NULL;
ALTER TABLE payments ALTER COLUMN base_amount SET NOT NULL;

-- A single-row cache of the latest exchange rates (all rates are "per 1 USD").
CREATE TABLE IF NOT EXISTS exchange_rates (
  id         SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  rates      JSONB       NOT NULL,
  source     TEXT        NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Proposals (Phase 6). A proposal is sent to a client BEFORE work starts; once accepted it can
-- be converted into a project (project_id then points at it).
-- The structured parts (deliverables, timeline, pricing, questions) are JSONB arrays: they are
-- always read and written together with the proposal and never queried on their own.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS proposals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id    UUID          NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  project_id   UUID          REFERENCES projects(id) ON DELETE SET NULL,
  title        TEXT          NOT NULL,
  status       TEXT          NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'declined')),
  currency     TEXT          NOT NULL,
  budget       NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (budget >= 0),
  brief        TEXT          NOT NULL DEFAULT '',   -- the client's job description the proposal answers
  summary      TEXT          NOT NULL DEFAULT '',
  scope        TEXT          NOT NULL DEFAULT '',
  deliverables JSONB         NOT NULL DEFAULT '[]',
  timeline     JSONB         NOT NULL DEFAULT '[]',
  pricing      JSONB         NOT NULL DEFAULT '[]',
  questions    JSONB         NOT NULL DEFAULT '[]',
  terms        TEXT          NOT NULL DEFAULT '',
  ai_generated BOOLEAN       NOT NULL DEFAULT false,
  sent_at      TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS proposals_user_id_idx ON proposals(user_id);
CREATE INDEX IF NOT EXISTS proposals_client_id_idx ON proposals(client_id);

-- ---------------------------------------------------------------------------
-- Forgot password. Same idea as signup_verifications: a 6-digit code is emailed, we store only
-- its hash, and the row is deleted once the new password is saved (so each code works once).
-- user_id is the PRIMARY KEY: at most one reset in progress per account.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS password_resets (
  user_id      UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code_hash    TEXT        NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  attempts     INTEGER     NOT NULL DEFAULT 0,   -- wrong guesses for the current code
  send_count   INTEGER     NOT NULL DEFAULT 1,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Calendar (Phase 6).
-- ---------------------------------------------------------------------------

-- Tasks can now have an optional due date. ADD COLUMN on an existing table is a migration:
-- existing rows simply get NULL ("no due date"), so nothing breaks.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date DATE;
CREATE INDEX IF NOT EXISTS tasks_user_due_idx ON tasks(user_id, due_date);

-- events: things only the freelancer knows about (meetings, calls, reminders).
-- client_id / project_id are OPTIONAL foreign keys. ON DELETE SET NULL: if the client is
-- deleted the meeting stays on the calendar, it just stops pointing at them.
CREATE TABLE IF NOT EXISTS events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id  UUID        REFERENCES clients(id) ON DELETE SET NULL,
  project_id UUID        REFERENCES projects(id) ON DELETE SET NULL,
  title      TEXT        NOT NULL,
  date       DATE        NOT NULL,
  start_time TIME,                               -- NULL = all-day
  notes      TEXT        NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- (user_id, date) because every calendar query is "this user's events between two dates".
CREATE INDEX IF NOT EXISTS events_user_date_idx ON events(user_id, date);

-- ---------------------------------------------------------------------------
-- Documents (Phase 6). The database stores ABOUT each file (name, type, size, who owns it,
-- what it belongs to). The file's bytes live in file storage (local disk in development, a
-- cloud bucket in production), found by storage_key. Databases are bad at holding big files.
-- client_id / project_id are optional: ON DELETE SET NULL keeps the file if either is removed.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id   UUID        REFERENCES clients(id) ON DELETE SET NULL,
  project_id  UUID        REFERENCES projects(id) ON DELETE SET NULL,
  name        TEXT        NOT NULL,              -- the original file name, shown to the user
  storage_key TEXT        NOT NULL UNIQUE,       -- where the bytes are; never built from the file name
  mime_type   TEXT        NOT NULL,
  size_bytes  INTEGER     NOT NULL CHECK (size_bytes >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS documents_user_id_idx ON documents(user_id);
CREATE INDEX IF NOT EXISTS documents_client_id_idx ON documents(client_id);
CREATE INDEX IF NOT EXISTS documents_project_id_idx ON documents(project_id);

-- ---------------------------------------------------------------------------
-- Sharing invoices (Phase 6a). public_token is a long random string that works as a
-- "capability URL": whoever has /i/<token> can view THAT invoice, without logging in.
-- It is created when the invoice is first sent (drafts are never public).
-- ---------------------------------------------------------------------------
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS public_token    TEXT UNIQUE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS last_emailed_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS viewed_at       TIMESTAMPTZ;  -- first time the client opened the link

-- ---------------------------------------------------------------------------
-- Online payments with Paystack (Phase 6b).
-- Each freelancer connects THEIR OWN Paystack account, so clients pay them directly.
-- ---------------------------------------------------------------------------

-- One connection per user (user_id is the primary key: one-to-one, like user_settings).
-- The secret key is ENCRYPTED (see src/crypto.ts), never stored as plain text. key_last4 lets
-- the Settings page show "sk_test_…a1b2" without decrypting anything.
CREATE TABLE IF NOT EXISTS payment_connections (
  user_id        UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider       TEXT        NOT NULL DEFAULT 'paystack' CHECK (provider IN ('paystack')),
  secret_key_enc TEXT        NOT NULL,
  key_last4      TEXT        NOT NULL,
  mode           TEXT        NOT NULL CHECK (mode IN ('test', 'live')),
  connected_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- checkout_sessions: every time a client clicks "Pay", BEFORE sending them to Paystack we write
-- down the reference we gave Paystack and how much we asked for. When Paystack later says
-- "reference X succeeded" we look it up here, so we know which invoice it was for and can
-- check the amount matches. Nothing from the browser is trusted.
CREATE TABLE IF NOT EXISTS checkout_sessions (
  reference   TEXT PRIMARY KEY,
  user_id     UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invoice_id  UUID          NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount      NUMERIC(14,2) NOT NULL CHECK (amount > 0),   -- in the invoice currency
  currency    TEXT          NOT NULL,
  status      TEXT          NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  paid_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS checkout_sessions_invoice_idx ON checkout_sessions(invoice_id);

-- Payments made online remember Paystack's reference. UNIQUE makes recording the same payment
-- twice impossible, even if the redirect and the webhook arrive at the same moment.
-- (NULLs don't clash with each other, so manually recorded payments are unaffected.)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_reference TEXT UNIQUE;
