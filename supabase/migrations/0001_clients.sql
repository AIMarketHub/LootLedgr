-- LootLedger — Phase 2.7.1 migration
-- Creates the `clients` table on lootledger-dev (qxxbumjfocxslaaivzfo).
-- Mirrors the existing JSONB pattern used by transactions / stock /
-- settings / catalog: (id, shop_id, data jsonb, updated_at) with all
-- domain fields living inside `data`. The dev_allow_all_* RLS pattern
-- matches the four existing tables.
--
-- The clientId link from transactions to clients lives INSIDE
-- transactions.data.clientId (Q2 answered 2026-04-28 — JSONB field, no
-- DDL on transactions). PostgREST query for a client's transactions:
--   GET transactions?data->>clientId=eq.<uuid>
--
-- Idempotent. Safe to re-run.

-- ──────────────────────────────────────────────────────────────────
-- 1. Extensions (pgcrypto provides gen_random_uuid; Supabase enables
--    by default but the IF NOT EXISTS makes this safe to re-run)
-- ──────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ──────────────────────────────────────────────────────────────────
-- 2. clients table — JSONB document store
-- ──────────────────────────────────────────────────────────────────
-- Domain fields living in `data` (see Phase 2.7 spec):
--   fullName, dob, address, phone, email,
--   idType, idNumber, idPhoto (canonical, base64),
--   pepCheck, tfsCheck, riskRating,
--   sourceOfFunds, sourceOfWealth, internalNotes,
--   blacklisted, createdAt, lastTxAt, txCount,
--   isTest (for the 2.7.12 migration tag), deleteAfter
-- All optional at the schema level. Mandatory-field gate for
-- (fullName, dob, address, idType, idNumber) is enforced in
-- src/lib/clients.js, not in the schema.

CREATE TABLE IF NOT EXISTS clients (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id     text        NOT NULL DEFAULT 'default',
  data        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────────────────────────
-- 3. Indexes
-- ──────────────────────────────────────────────────────────────────
-- shop_id filter on every query (matches existing tables).
CREATE INDEX IF NOT EXISTS clients_shop_id_idx
  ON clients (shop_id);

-- updated_at DESC for the default sort on the Clients screen.
CREATE INDEX IF NOT EXISTS clients_updated_at_idx
  ON clients (updated_at DESC);

-- idNumber lookup for the 2.7.2 dedupe path and the multi-field
-- search. Non-unique — idNumber CAN be null on partial records, and
-- the dedupe logic in src/lib/clients.js does its own existence check
-- before insert. Postgres allows multiple NULLs in a non-unique index.
CREATE INDEX IF NOT EXISTS clients_id_number_idx
  ON clients ((data->>'idNumber'));

-- ──────────────────────────────────────────────────────────────────
-- 4. Row Level Security — dev_allow_all_* pattern
-- ──────────────────────────────────────────────────────────────────
-- Drop-then-create so the migration is re-runnable. Once we ship
-- multi-tenant auth (Phase 3), these permissive policies get
-- replaced with shop-scoped ones.
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dev_allow_all_clients_select" ON clients;
CREATE POLICY "dev_allow_all_clients_select"
  ON clients FOR SELECT USING (true);

DROP POLICY IF EXISTS "dev_allow_all_clients_insert" ON clients;
CREATE POLICY "dev_allow_all_clients_insert"
  ON clients FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "dev_allow_all_clients_update" ON clients;
CREATE POLICY "dev_allow_all_clients_update"
  ON clients FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "dev_allow_all_clients_delete" ON clients;
CREATE POLICY "dev_allow_all_clients_delete"
  ON clients FOR DELETE USING (true);

-- ──────────────────────────────────────────────────────────────────
-- 5. Verification (manual — uncomment after running)
-- ──────────────────────────────────────────────────────────────────
-- SELECT
--   t.relname                                  AS table_name,
--   pg_catalog.obj_description(t.oid, 'pg_class') AS comment,
--   p.policyname,
--   p.cmd                                       AS policy_cmd
-- FROM pg_class t
-- LEFT JOIN pg_policy p ON p.polrelid = t.oid
-- WHERE t.relname = 'clients';
--
-- Expect: one row per policy (select / insert / update / delete) plus
-- one no-policy row. Then SELECT count(*) FROM clients; should return 0.
