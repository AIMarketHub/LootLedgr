-- DEPRECATED 2026-04-30 — This migration was a no-op against the
-- actual schema, which already has composite (id, shop_id) PRIMARY
-- KEYs on transactions / catalog / stock (the correct multi-tenant
-- design). The IF NOT EXISTS guards correctly detected the existing
-- composite PRIMARY KEY and skipped, so the migration ran without
-- error but the underlying 400s persisted. The real fix was app-
-- side: src/lib/storage.js now sends ?on_conflict=id,shop_id
-- matching the composite key. This file stays for git history; do
-- not modify or delete.
--
-- Original (now-incorrect) intent below.
-- ──────────────────────────────────────────────────────────────────
--
-- LootLedger — Phase 2.7 follow-up migration (2026-04-30)
-- Adds PRIMARY KEY constraints to transactions / catalog / stock so
-- PostgREST's `?on_conflict=id&Prefer: resolution=merge-duplicates`
-- upsert path actually works. Without these, every sb.saveTx /
-- sb.saveStock / sb.saveCatalog returns 400 ("there is no unique or
-- exclusion constraint matching the ON CONFLICT specification") and
-- the durable echo is silently broken.
--
-- Local state writes (setTxList, gf_txList in localStorage) are
-- unaffected by this — they always worked. This migration only
-- restores the Supabase mirror so backups / multi-device sync /
-- production cutover have a working durable layer.
--
-- The clients table (created by 0001_clients.sql) already has the
-- constraint via `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`.
--
-- Idempotent. Safe to re-run. The DO blocks check for an existing
-- PRIMARY KEY before adding one, so re-applying after success is a
-- no-op.

-- ──────────────────────────────────────────────────────────────────
-- 1. transactions — id is the invoice number (text), set by the app
-- ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'transactions'
      AND constraint_type = 'PRIMARY KEY'
  ) THEN
    ALTER TABLE transactions ALTER COLUMN id SET NOT NULL;
    ALTER TABLE transactions ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────
-- 2. catalog — id is "catalog_<shop_id>" (text), one row per shop
-- ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'catalog'
      AND constraint_type = 'PRIMARY KEY'
  ) THEN
    ALTER TABLE catalog ALTER COLUMN id SET NOT NULL;
    ALTER TABLE catalog ADD CONSTRAINT catalog_pkey PRIMARY KEY (id);
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────
-- 3. stock — id is the per-item uid generated client-side
-- ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'stock'
      AND constraint_type = 'PRIMARY KEY'
  ) THEN
    ALTER TABLE stock ALTER COLUMN id SET NOT NULL;
    ALTER TABLE stock ADD CONSTRAINT stock_pkey PRIMARY KEY (id);
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────
-- 4. settings — uses shop_id as the conflict key (per src/lib/storage.js
--    upsSB special case). Add UNIQUE on shop_id if missing.
-- ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'settings'
      AND constraint_type IN ('PRIMARY KEY','UNIQUE')
      AND constraint_name LIKE '%shop_id%'
  ) THEN
    -- Try to add as UNIQUE; the table may or may not have its own id
    -- PK already, so we don't want to clobber it. UNIQUE on shop_id
    -- is what PostgREST needs for `?on_conflict=shop_id` to work.
    ALTER TABLE settings ALTER COLUMN shop_id SET NOT NULL;
    ALTER TABLE settings ADD CONSTRAINT settings_shop_id_key UNIQUE (shop_id);
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────
-- 5. Verification (manual — uncomment after running)
-- ──────────────────────────────────────────────────────────────────
-- SELECT
--   tc.table_name,
--   tc.constraint_type,
--   tc.constraint_name,
--   kcu.column_name
-- FROM information_schema.table_constraints tc
-- JOIN information_schema.key_column_usage kcu
--   ON tc.constraint_name = kcu.constraint_name
-- WHERE tc.table_name IN ('transactions','catalog','stock','settings')
--   AND tc.constraint_type IN ('PRIMARY KEY','UNIQUE')
-- ORDER BY tc.table_name, tc.constraint_type;
--
-- Expect: transactions/catalog/stock each show one PRIMARY KEY on (id);
-- settings shows a UNIQUE (or PRIMARY KEY) constraint involving shop_id.
