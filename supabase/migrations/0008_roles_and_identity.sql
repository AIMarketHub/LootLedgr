-- LootLedger — Phase 3 commit 3b: roles enum upgrade + per-user
-- identity columns (2026-05-07).
-- ================================================================
--
-- Schema scaffold for the rest of Phase 3:
--   - users.role expands from ('owner','staff') to
--     ('owner','manager','staff'). 'manager' becomes the
--     permission tier between owner and staff that 3c uses for
--     role-aware RLS.
--   - Nullable created_by uuid columns added to the five
--     shop-scoped data tables, FK to auth.users(id).
--   - Helper function current_user_role() mirroring the shape of
--     current_shop_id() so 3c policies can read the signed-in
--     user's role from inside RLS.
--
-- No app-side reads or writes of these new columns yet. 3d wires
-- them. This migration is additive only — existing rows continue
-- to work; the new columns default to NULL on legacy data.
--
-- ================================================================
-- INVESTIGATION RESULTS (Phase 3 commit 3b prep, 2026-05-07)
-- ================================================================
-- - users.role CHECK in 0003:75 was defined inline with no
--   explicit name; Postgres auto-names it users_role_check. The
--   DROP CONSTRAINT IF EXISTS users_role_check below matches.
-- - Only one SQL site hardcodes a role value:
--     0003:273 — users_delete policy: AND me.role = 'owner'.
--   'owner' stays valid under the new CHECK; no breakage.
-- - App-side code: zero hardcoded role comparisons (grepped
--   src/ at 3b-prep time).
-- - signup_shop RPC (0004:100,110) still inserts 'owner' for the
--   first user; that contract stands.
-- - staff.role on the legacy localStorage staffList is a
--   separate concept from users.role; it is freetext UI
--   metadata, NOT this enum. 3d reconciles it.
-- ================================================================
--
-- USER FOLLOW-UP STEPS (after running this migration in Studio):
--   IMPORTANT — apply 0007_audit_log.sql FIRST if you haven't
--   already. 0008 doesn't reference audit_log, but the migration
--   order in the DB must match the order in the repo for future
--   migrations to land cleanly.
--
--   1. Run the verification queries listed at the bottom of this
--      file (they're commented out — copy + paste into Studio).
--   2. Optional: temporarily flip your own role to 'manager' to
--      confirm the new CHECK accepts it, then flip back to
--      'owner'. Query in section 4 of the verification block.
-- ================================================================

-- ──────────────────────────────────────────────────────────────────
-- 1. Expand role CHECK on users from 2-value to 3-value.
-- ──────────────────────────────────────────────────────────────────
-- Idempotent: DROP IF EXISTS handles re-runs cleanly.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('owner','manager','staff'));

-- ──────────────────────────────────────────────────────────────────
-- 2. Helper function: current_user_role()
-- ──────────────────────────────────────────────────────────────────
-- Mirrors current_shop_id() shape from 0003:158-165. SECURITY
-- DEFINER + STABLE so it can be referenced inside RLS policies
-- without permission errors when the policy runs as the calling
-- user. STABLE lets Postgres cache the result per-statement so
-- the subquery doesn't re-fire on every row.
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM users WHERE id = auth.uid();
$$;

-- ──────────────────────────────────────────────────────────────────
-- 3. Nullable created_by / last_updated_by uuid columns.
-- ──────────────────────────────────────────────────────────────────
-- Nullable so legacy rows (every row that exists today) aren't
-- broken. ON DELETE SET NULL so deleting a user doesn't cascade-
-- delete their authored rows — audit history must outlive the
-- author's user record.
--
-- Column-name choice:
--   - transactions / stock / clients / tfs_screen_log get
--     created_by — append-oriented tables where "who created
--     this row" is the meaningful actor.
--   - settings gets last_updated_by — settings is one row per
--     shop, mutated repeatedly. The current actor overwrites the
--     column on each save. Per-version author granularity lives
--     in audit_log entries (3d).
--
-- Idempotent guards via ADD COLUMN IF NOT EXISTS so re-running is
-- a no-op once the columns are in place.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS created_by uuid
    REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE stock
  ADD COLUMN IF NOT EXISTS created_by uuid
    REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS created_by uuid
    REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS last_updated_by uuid
    REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE tfs_screen_log
  ADD COLUMN IF NOT EXISTS created_by uuid
    REFERENCES auth.users(id) ON DELETE SET NULL;

-- ──────────────────────────────────────────────────────────────────
-- 4. Partial indexes for actor-scoped reads.
-- ──────────────────────────────────────────────────────────────────
-- Scope: per-shop, per-actor activity reports ("show me every
-- transaction Sarah authored this month"). Partial index keeps
-- the index small while legacy NULL rows exist; a regular
-- (shop_id, created_by) index would force every NULL row into
-- the b-tree which is wasted space pre-3e backfill.
--
-- stock and settings are deliberately skipped:
--   - stock: per-actor lookups aren't a planned report surface.
--   - settings: one row per shop, last_updated_by is informational.
CREATE INDEX IF NOT EXISTS transactions_shop_actor_idx
  ON transactions (shop_id, created_by)
  WHERE created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS clients_shop_actor_idx
  ON clients (shop_id, created_by)
  WHERE created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS tfs_screen_log_shop_actor_idx
  ON tfs_screen_log (shop_id, created_by)
  WHERE created_by IS NOT NULL;

-- ──────────────────────────────────────────────────────────────────
-- 5. Verification queries (manual — copy into Studio after run).
-- ──────────────────────────────────────────────────────────────────
-- 1) Confirm the new CHECK constraint definition:
--      SELECT pg_get_constraintdef(oid) FROM pg_constraint
--      WHERE conname='users_role_check';
--    Expect: CHECK ((role = ANY (ARRAY['owner'::text,
--                                       'manager'::text,
--                                       'staff'::text])))
--    or an equivalent canonical form.
--
-- 2) Confirm the helper function returns the signed-in user's role:
--      SELECT current_user_role();
--    Expect 'owner' for the shop owner; NULL for an unauthed session.
--
-- 3) Confirm the new columns exist and are nullable:
--      SELECT table_name, column_name, is_nullable, data_type
--      FROM information_schema.columns
--      WHERE table_name IN ('transactions','stock','clients',
--                           'settings','tfs_screen_log')
--        AND column_name IN ('created_by','last_updated_by')
--      ORDER BY table_name, column_name;
--    Expect 5 rows, all uuid, all is_nullable='YES'.
--
-- 4) Confirm the new role value is accepted (run as your own user):
--      UPDATE users SET role='manager' WHERE id=auth.uid();
--      -- expect: UPDATE 1
--      UPDATE users SET role='owner' WHERE id=auth.uid();
--      -- revert. expect: UPDATE 1
--
-- 5) Confirm the partial indexes exist:
--      SELECT indexname FROM pg_indexes
--      WHERE indexname IN
--        ('transactions_shop_actor_idx',
--         'clients_shop_actor_idx',
--         'tfs_screen_log_shop_actor_idx');
--    Expect 3 rows.
