-- LootLedger — Phase 5.2-PRE-2: platform admin role
-- (2026-05-11)
-- ================================================================
--
-- Architecture spec: Section 20 of
-- docs/project/project_phase_5_2_checkpoint.md.
--
-- Two-level role model. Platform Admin sits ABOVE the existing
-- shop-level roles (owner / manager / staff from Phase 3) and
-- powers the admin.lootledger.au subdomain. UUID-based (not
-- email-based like the legacy `admins` table from 0003 — that
-- one stays for SaaS-wide subscription management; this is a
-- separate concept).
--
-- Numbering: 0020 because PRE-2 ships before 5.2-F per the
-- locked sub-phase order PRE → PRE-2 → A → E → B → D → F → C
-- → H → G. The 5.2-F migration reservations from Adjustment 17
-- (0017_provider_sync_log / 0018_internal_bills) shift to
-- 0021 / 0022 when 5.2-F actually ships. See Adjustment 20.
--
-- ================================================================
-- COMMITTED SHAPE (5.2-PRE-2 scope — locked)
-- ================================================================
-- - platform_admins table: one row per platform admin user.
--   user_id UNIQUE (one platform admin role per user; granting
--   twice is a no-op).
-- - granted_at timestamp + granted_by uuid + notes text for
--   audit. No revoke flow yet — manual DB delete for now.
-- - current_is_platform_admin() helper — SECURITY DEFINER so
--   any user can query their own platform-admin status (the
--   function reads platform_admins under elevated privs).
-- - RLS on platform_admins: only platform admins can read or
--   grant. No UPDATE / DELETE policies (intentionally manual).
-- - Additive shops_platform_admin_read policy: platform admins
--   can SELECT all shop rows (powers the shops dashboard MVP).
--   Existing shops_select policy from 0003 unchanged; Postgres
--   RLS combines permissive policies with OR.
--
-- ================================================================
-- USER FOLLOW-UP STEPS (after running this migration in Studio):
--   1. Verify schema:
--        SELECT column_name, data_type, is_nullable
--        FROM information_schema.columns
--        WHERE table_name = 'platform_admins'
--        ORDER BY ordinal_position;
--      Expect: id uuid NO, user_id uuid NO, granted_at
--      timestamptz NO, granted_by uuid YES, notes text YES.
--
--   2. Verify seed (signed in as the platform owner, or via
--      service-role key):
--        SELECT * FROM platform_admins;
--      Expect 1 row: user_id = db754093-830e-4c2a-b228-d322e71490b2
--      (Guillaume Weber).
--
--   3. Verify helper function:
--        SELECT current_is_platform_admin();
--      Expect: true (when called as the seeded user) or false
--      (any other authed user).
--
--   4. Verify shops dashboard query works for platform admin:
--        SELECT id, business_name, subdomain, subscription_plan,
--               trial_starts_at, created_at
--        FROM shops ORDER BY created_at ASC;
--      Expect: 2 rows (Daylesford + Ballarat) when called as
--      platform admin.
-- ================================================================

-- ──────────────────────────────────────────────────────────────────
-- 1. platform_admins table
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_admins (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL UNIQUE
                            REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  granted_by  uuid        REFERENCES auth.users(id),
  notes       text
);

CREATE INDEX IF NOT EXISTS platform_admins_user_idx
  ON platform_admins (user_id);

-- ──────────────────────────────────────────────────────────────────
-- 2. Seed: platform owner (Guillaume Weber)
-- ──────────────────────────────────────────────────────────────────
-- Idempotent via UNIQUE on user_id + ON CONFLICT DO NOTHING.
INSERT INTO platform_admins (user_id, notes)
VALUES (
  'db754093-830e-4c2a-b228-d322e71490b2',
  'Platform owner; seeded at 5.2-PRE-2 migration 2026-05-11.'
)
ON CONFLICT (user_id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────
-- 3. Helper function: current_is_platform_admin()
-- ──────────────────────────────────────────────────────────────────
-- SECURITY DEFINER so the function reads platform_admins under
-- elevated privileges; STABLE so the planner can cache the result
-- per query.
CREATE OR REPLACE FUNCTION current_is_platform_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM platform_admins
    WHERE user_id = auth.uid()
  );
$$;

-- ──────────────────────────────────────────────────────────────────
-- 4. RLS on platform_admins
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_admins_read"  ON platform_admins;
DROP POLICY IF EXISTS "platform_admins_write" ON platform_admins;

CREATE POLICY "platform_admins_read" ON platform_admins
  FOR SELECT
  TO authenticated
  USING (current_is_platform_admin());

CREATE POLICY "platform_admins_write" ON platform_admins
  FOR INSERT
  TO authenticated
  WITH CHECK (current_is_platform_admin());

-- No UPDATE / DELETE policies — revoking platform admin is
-- intentionally manual via DB direct access for now.

-- ──────────────────────────────────────────────────────────────────
-- 5. Additive RLS on shops: platform admins can SELECT all shops
-- ──────────────────────────────────────────────────────────────────
-- Postgres RLS combines PERMISSIVE policies for the same operation
-- with OR. Existing shops_select policy from 0003 stays; this new
-- policy adds platform-admin read access without breaking it.
DROP POLICY IF EXISTS "shops_platform_admin_read" ON shops;

CREATE POLICY "shops_platform_admin_read" ON shops
  FOR SELECT
  TO authenticated
  USING (current_is_platform_admin());

-- ──────────────────────────────────────────────────────────────────
-- 6. Diagnostic query — uncomment to verify after running.
-- ──────────────────────────────────────────────────────────────────
-- SELECT
--   schemaname,
--   tablename,
--   policyname,
--   cmd,
--   permissive
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN ('platform_admins', 'shops')
-- ORDER BY tablename, cmd, policyname;
--
-- Expect on platform_admins: platform_admins_read (SELECT) +
-- platform_admins_write (INSERT). On shops: existing
-- shops_select / shops_insert / shops_update / shops_delete +
-- new shops_platform_admin_read.
