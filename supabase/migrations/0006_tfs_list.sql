-- LootLedger — Targeted Financial Sanctions (TFS) screening (2026-05-06).
-- ================================================================
--
-- Australia operates a TFS regime under the Charter of the United
-- Nations Act 1945 plus autonomous-sanctions law. DFAT publishes
-- the Consolidated List (~10,983 entries: ~7,155 Individual,
-- ~3,566 Entity, ~262 Vessel; ~3,816 Primary Names + ~6,714
-- Aliases + ~453 Original Script).
--
-- Reporting entities (precious-metals dealers from 1 July 2026)
-- must screen customers against this list and refuse to deal with
-- anyone confirmed as a match. Penalties for breach: up to 10
-- years imprisonment + AUD $825,000 fine for individuals.
--
-- This migration creates three tables:
--   • tfs_list           — the master list, shared across all
--                          shops (read by everyone, written only
--                          by SaaS admins).
--   • tfs_list_metadata  — singleton row tracking when the list
--                          was last refreshed.
--   • tfs_screen_log     — per-shop audit log of every screen
--                          event, retained 7 years.
--
-- ================================================================
-- shop_id type — DIVERGES FROM SPEC
-- ================================================================
-- The spec block in the briefing said shop_id uuid NOT NULL on
-- tfs_screen_log. Changed to text NOT NULL to match the system-wide
-- pattern from migration 0003: current_shop_id() returns text;
-- transactions / catalog / stock / clients / settings all use
-- shop_id text; the app-side getCurrentShopId() returns a text
-- string. Using uuid here would cause "operator does not exist:
-- uuid = text" errors in the tenant-isolation RLS policy.
-- ================================================================
--
-- USER FOLLOW-UP STEPS (after running this migration in Studio):
--   1. None mandatory for the schema. The list starts empty.
--   2. Sign in as your admin email and visit /admin/tfs to upload
--      the latest DFAT Consolidated List (.xlsx) from
--      https://www.dfat.gov.au/international-relations/security/
--        sanctions/consolidated-list
--   3. Sanity check after upload:
--        SELECT count(*) AS total, type, count(*) AS n
--        FROM tfs_list GROUP BY type;
--      Expect roughly: 7000+ Individual, 3500+ Entity, 250+ Vessel.
--      Ratios will vary as DFAT updates the list.
-- ================================================================

-- ──────────────────────────────────────────────────────────────────
-- 1. tfs_list — the master list
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tfs_list (
  id                    bigserial   PRIMARY KEY,
  reference             text        NOT NULL,         -- raw DFAT ref, e.g. "2", "2a"
  primary_reference     text        NOT NULL,         -- "2" for both "2" and "2a"
  name                  text        NOT NULL,         -- name as listed
  name_normalized       text        NOT NULL,         -- lowercase, ASCII-folded for fuzzy lookup
  type                  text        NOT NULL,         -- 'Individual' | 'Entity' | 'Vessel'
  name_type             text        NOT NULL,         -- 'Primary Name' | 'Alias' | 'Original Script'
  alias_strength        text,
  dob_raw               text,
  dob_parsed            jsonb,                        -- {type:'exact'|'range'|'multiple'|'unknown', dates:[], years:[], yearsRange:[start,end]}
  place_of_birth        text,
  citizenship           text,
  address               text,
  additional_info       text,
  listing_info          text,
  imo_number            text,
  committees            text,
  control_date          date,
  instrument            text,
  tfs                   boolean,
  travel_ban            boolean,
  arms_embargo          boolean,
  maritime_restriction  boolean,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tfs_list_name_normalized   ON tfs_list (name_normalized);
CREATE INDEX IF NOT EXISTS idx_tfs_list_primary_reference ON tfs_list (primary_reference);
CREATE INDEX IF NOT EXISTS idx_tfs_list_type              ON tfs_list (type);

ALTER TABLE tfs_list ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tfs_list_read"        ON tfs_list;
DROP POLICY IF EXISTS "tfs_list_write_admin" ON tfs_list;

-- Any authenticated user can read the list (every shop screens
-- against the same shared list).
CREATE POLICY "tfs_list_read" ON tfs_list FOR SELECT
  TO authenticated USING (true);

-- Only SaaS-wide admins (per migration 0003's admins table) can
-- modify the list. The /admin/tfs upload UI is admin-gated client-
-- side via RequireAdmin; this is the server-side enforcement.
CREATE POLICY "tfs_list_write_admin" ON tfs_list FOR ALL
  TO authenticated
  USING (current_is_admin())
  WITH CHECK (current_is_admin());

-- ──────────────────────────────────────────────────────────────────
-- 2. tfs_list_metadata — singleton freshness tracker
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tfs_list_metadata (
  id                integer     PRIMARY KEY DEFAULT 1,
  last_updated_at   timestamptz NOT NULL DEFAULT now(),
  last_updated_by   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  record_count      integer     NOT NULL DEFAULT 0,
  source_filename   text,
  CONSTRAINT singleton CHECK (id = 1)
);

ALTER TABLE tfs_list_metadata ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tfs_metadata_read"        ON tfs_list_metadata;
DROP POLICY IF EXISTS "tfs_metadata_write_admin" ON tfs_list_metadata;

CREATE POLICY "tfs_metadata_read" ON tfs_list_metadata FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "tfs_metadata_write_admin" ON tfs_list_metadata FOR ALL
  TO authenticated
  USING (current_is_admin())
  WITH CHECK (current_is_admin());

-- ──────────────────────────────────────────────────────────────────
-- 3. tfs_screen_log — per-shop audit log of screening events
-- ──────────────────────────────────────────────────────────────────
-- shop_id is text (not uuid) per the divergence note at top of
-- this file — the existing tenant-isolation pattern compares
-- against current_shop_id() which returns text.
CREATE TABLE IF NOT EXISTS tfs_screen_log (
  id                    bigserial   PRIMARY KEY,
  shop_id               text        NOT NULL,
  tx_id                 text,
  client_id             uuid,
  customer_name         text,
  customer_dob          text,
  customer_citizenship  text,
  matched               boolean     NOT NULL,
  match_reference       text,
  confirmed_match       boolean,
  override_applied      boolean,
  override_reason       text,
  staff                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  delete_after          timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tfs_screen_log_shop_tx ON tfs_screen_log (shop_id, tx_id);
CREATE INDEX IF NOT EXISTS idx_tfs_screen_log_created ON tfs_screen_log (shop_id, created_at DESC);

ALTER TABLE tfs_screen_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tfs_screen_log_read_own"  ON tfs_screen_log;
DROP POLICY IF EXISTS "tfs_screen_log_write_own" ON tfs_screen_log;

-- Each shop reads only its own log entries; admins read everyone's
-- (consistent with current_is_admin() bypass on other shop-scoped
-- tables).
CREATE POLICY "tfs_screen_log_read_own" ON tfs_screen_log FOR SELECT
  TO authenticated
  USING (shop_id = current_shop_id() OR current_is_admin());

CREATE POLICY "tfs_screen_log_write_own" ON tfs_screen_log FOR INSERT
  TO authenticated
  WITH CHECK (shop_id = current_shop_id() OR current_is_admin());

-- No UPDATE/DELETE policies — log entries are immutable. A 7-year
-- retention sweep will be a separate scheduled job (deferred).
