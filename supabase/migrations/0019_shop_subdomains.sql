-- LootLedger — Phase 5.2-PRE: per-shop subdomain routing key
-- + subscription_plan data column + Ballarat shop seed.
-- (2026-05-11)
-- ================================================================
--
-- v3.2-final architecture §18 (per-shop subdomain routing model)
-- locks `subdomain` as the canonical routing key. Format is
-- lowercase alphanumeric, 1-32 chars (NO hyphens — distinct from
-- the existing kebab-case `slug`). Both columns coexist on shops:
-- slug stays as the human-readable identifier (admin panel
-- display, support tickets); subdomain is the URL routing key.
--
-- Numbering note: 0016 = hardware_log (5.2-A), 0017 / 0018 are
-- reserved for 5.2-F (provider_sync_log, internal_bills),
-- 0019 = this migration (5.2-PRE app code).
--
-- DNS + SSL portion of 5.2-PRE was completed earlier today via
-- VentraIP + Netlify dashboard work — cert covers apex + www +
-- daylesford + ballarat hostnames; browser-verified.
--
-- ================================================================
-- COMMITTED SHAPE (5.2-PRE app-code scope — locked)
-- ================================================================
-- - shops.subdomain text UNIQUE, NULL allowed for legacy rows
--   that haven't been migrated to a subdomain yet.
-- - CHECK constraint enforces /^[a-z0-9]{1,32}$/ when not NULL.
-- - shops.subscription_plan text DEFAULT 'trial'. Data-only;
--   Phase 5.5 builds enforcement on this. Existing
--   shops.subscription_active boolean stays unchanged
--   (different semantics — admin-flipped enable vs billing-state
--   marker).
-- - shops.trial_starts_at column already exists from 0003 — we
--   REUSE it (no duplicate trial_started_at column added). Doc
--   spec patch lands in this same commit.
-- - Reserved subdomain words enforced in src/lib/tenancy.js at
--   signup time, NOT at the DB level. List documented in
--   comment block below for cross-reference.
--
-- ================================================================
-- SEED ROWS (5.2-PRE first-tenants migration)
-- ================================================================
-- Daylesford (platform-owner's own shop) — subdomain locked
-- via Tier 4 owner-override per architecture §18.8. Existing
-- row keyed by UUID 35e51835-5c79-40cb-9139-203af0388adc.
--
-- Ballarat (platform-owner's boss's shop) — INSERTed fresh
-- because no row exists yet. created_by stamped with the
-- platform owner's auth.users UUID (db754093-830e-4c2a-b228-
-- d322e71490b2) for initial provisioning; the boss can be
-- reassigned via a separate users-table grant later.
--
-- ================================================================
-- USER FOLLOW-UP STEPS (after running this migration in Studio):
--   1. Verify schema:
--        SELECT column_name, data_type, is_nullable, column_default
--        FROM information_schema.columns
--        WHERE table_name = 'shops'
--          AND column_name IN ('subdomain', 'subscription_plan')
--        ORDER BY column_name;
--      Expect: subdomain text YES NULL,
--              subscription_plan text YES 'trial'.
--
--   2. Verify seed:
--        SELECT id, business_name, slug, subdomain,
--               subscription_plan, trial_starts_at, created_by
--        FROM shops
--        ORDER BY created_at ASC;
--      Expect:
--        - Daylesford row: subdomain='daylesford',
--          subscription_plan='platform_exempt'.
--        - Ballarat row (newly inserted): subdomain='ballarat',
--          subscription_plan='trial', trial_starts_at = ~now,
--          created_by = db754093-830e-4c2a-b228-d322e71490b2.
--
--   3. Verify CHECK constraint:
--        UPDATE shops SET subdomain='Bad-Slug-123'
--          WHERE id = '35e51835-5c79-40cb-9139-203af0388adc';
--      Expect: ERROR — constraint violation. Then revert with
--        UPDATE shops SET subdomain='daylesford' WHERE id = '...';
-- ================================================================

-- ──────────────────────────────────────────────────────────────────
-- 1. Schema additions on shops
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS subdomain         text,
  ADD COLUMN IF NOT EXISTS subscription_plan text DEFAULT 'trial';

-- UNIQUE constraint on subdomain (idempotent via DROP + ADD).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shops_subdomain_key'
      AND conrelid = 'shops'::regclass
  ) THEN
    EXECUTE 'ALTER TABLE shops DROP CONSTRAINT shops_subdomain_key';
  END IF;
  EXECUTE 'ALTER TABLE shops ADD CONSTRAINT shops_subdomain_key UNIQUE (subdomain)';
END $$;

-- Format constraint: lowercase alphanumeric, 1-32 chars, NULL ok.
-- Reserved words enforced at the app layer (src/lib/tenancy.js):
--   admin, api, www, auth, mail, smtp, ftp, blog, app,
--   help, support, status, dev, staging, test, demo,
--   docs, secure, login, signup, dashboard, root, mx,
--   cpanel, webmail, ns1, ns2
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subdomain_format'
      AND conrelid = 'shops'::regclass
  ) THEN
    EXECUTE 'ALTER TABLE shops DROP CONSTRAINT subdomain_format';
  END IF;
  EXECUTE $c$ALTER TABLE shops ADD CONSTRAINT subdomain_format
    CHECK (subdomain IS NULL OR subdomain ~* '^[a-z0-9]{1,32}$')$c$;
END $$;

-- ──────────────────────────────────────────────────────────────────
-- 2. Index for subdomain lookup at request boot
-- ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS shops_subdomain_idx
  ON shops (subdomain)
  WHERE subdomain IS NOT NULL;

-- ──────────────────────────────────────────────────────────────────
-- 3. Daylesford seed — UPDATE the existing row
-- ──────────────────────────────────────────────────────────────────
UPDATE shops
   SET subdomain         = 'daylesford',
       subscription_plan = 'platform_exempt'
 WHERE id = '35e51835-5c79-40cb-9139-203af0388adc';

-- ──────────────────────────────────────────────────────────────────
-- 4. Ballarat seed — INSERT new row (only if not already present)
-- ──────────────────────────────────────────────────────────────────
-- Idempotent: re-running the migration is a no-op once the row
-- exists (UNIQUE on slug + ON CONFLICT DO NOTHING).
INSERT INTO shops (
  business_name,
  slug,
  subdomain,
  subscription_plan,
  trial_starts_at,
  created_by
) VALUES (
  'Ballarat Gold',
  'ballarat-gold',
  'ballarat',
  'trial',
  now(),
  'db754093-830e-4c2a-b228-d322e71490b2'
)
ON CONFLICT (slug) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────
-- 5. Diagnostic queries — uncomment to verify after running.
-- ──────────────────────────────────────────────────────────────────
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'shops'
--   AND column_name IN ('subdomain', 'subscription_plan')
-- ORDER BY column_name;
--
-- SELECT id, business_name, slug, subdomain,
--        subscription_plan, trial_starts_at, created_by
-- FROM shops
-- ORDER BY created_at ASC;
--
-- SELECT conname FROM pg_constraint
-- WHERE conrelid = 'shops'::regclass
--   AND conname IN ('shops_subdomain_key', 'subdomain_format')
-- ORDER BY conname;
