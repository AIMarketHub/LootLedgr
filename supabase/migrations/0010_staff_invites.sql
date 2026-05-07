-- LootLedger — Phase 3 commit 3d-1: staff_invites table + RPCs
-- (2026-05-07).
-- ================================================================
--
-- Owner / manager creates an invite via create_staff_invite RPC.
-- The new staff member signs up via Supabase Auth as usual, then
-- calls claim_staff_invite(token) to attach their auth.users id
-- to the inviter's shop with the invited role.
--
-- App-side UI (3d-3) consumes both RPCs after 3d-2 ships the
-- auth identity layer.
--
-- ================================================================
-- INVESTIGATION RESULTS (3d-1 prep, 2026-05-07)
-- ================================================================
-- - pgcrypto enabled by 0001:19 + 0003:41 (gen_random_uuid /
--   gen_random_bytes available).
-- - users.email column present (0003:78).
-- - users.shop_id is uuid (0003:74; FK to shops.id which is uuid).
-- - Other shop-scoped tables use shop_id text per the divergence
--   convention (see 0006:25-33).
--
-- DEVIATION FROM SPEC — text-to-uuid cast in claim_staff_invite:
--   The spec declares staff_invites.shop_id as text (matching the
--   broader doc-table convention) but then writes that value
--   directly into users.shop_id (uuid). Without a cast the INSERT
--   fails at runtime ("column shop_id is of type uuid but
--   expression is of type text"). Fixed below by casting
--   v_invite.shop_id::uuid in the users INSERT VALUES clause. The
--   table-shape choice (text on staff_invites) is preserved so
--   the audit_log + RLS comparisons stay consistent with every
--   other doc table.
--
-- DEVIATIONS FROM SPEC — additive idempotency guards:
--   - CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS
--     match the convention used by 0001/0003/0006/0007/0008/0009.
--   - DROP POLICY IF EXISTS before CREATE POLICY for re-runs.
--   Neither changes the resulting object shape; both make the
--   migration safely re-applicable.
-- ================================================================
--
-- USER FOLLOW-UP STEPS (after running this migration in Studio):
--   1. Run the 8-query verification suite at the bottom of this
--      file. Headline: invite creation succeeds; duplicate-pending
--      blocked; invalid role rejected; bad token rejected at
--      claim time.
--   2. Clean up the test invite row at the end of step 7 of the
--      verification suite to keep Settings → Staff in 3d-3 clean:
--        DELETE FROM staff_invites
--        WHERE email='test_staff@example.com';
-- ================================================================

-- ──────────────────────────────────────────────────────────────────
-- 1. staff_invites — pending invitations awaiting claim.
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_invites (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id     text        NOT NULL,
  email       text        NOT NULL,
  role        text        NOT NULL
                CHECK (role IN ('owner','manager','staff')),
  token       text        NOT NULL UNIQUE,
  created_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  claimed_at  timestamptz,
  claimed_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Unique pending invite per (shop, email) — partial index excludes
-- already-claimed rows so the same address can be re-invited later.
CREATE UNIQUE INDEX IF NOT EXISTS staff_invites_unclaimed_unique_idx
  ON staff_invites (shop_id, lower(email))
  WHERE claimed_at IS NULL;

-- Token lookup for claim_staff_invite. Partial so only live invites
-- live in the index.
CREATE INDEX IF NOT EXISTS staff_invites_token_idx
  ON staff_invites (token)
  WHERE claimed_at IS NULL;

-- Per-shop history view (Settings → Staff "outstanding invites"
-- list, 3d-3). Newest first.
CREATE INDEX IF NOT EXISTS staff_invites_shop_id_idx
  ON staff_invites (shop_id, created_at DESC);

-- ──────────────────────────────────────────────────────────────────
-- 2. Row Level Security
-- ──────────────────────────────────────────────────────────────────
-- Read: shop-scope OR admin. No INSERT/UPDATE/DELETE policies —
-- those go through the SECURITY DEFINER RPCs below. The absence
-- of write policies makes any direct-write attempt fail closed.
ALTER TABLE staff_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_invites_read_own" ON staff_invites;

CREATE POLICY "staff_invites_read_own" ON staff_invites FOR SELECT
  USING (shop_id = current_shop_id() OR current_is_admin());

-- ──────────────────────────────────────────────────────────────────
-- 3. create_staff_invite RPC — owner / manager only.
-- ──────────────────────────────────────────────────────────────────
-- Generates a random token, returns the new invite row, writes a
-- 'staff_invited' audit_log row. Manager cannot promote anyone to
-- owner (business rule).
CREATE OR REPLACE FUNCTION create_staff_invite(
  p_email text,
  p_role  text
)
RETURNS staff_invites
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_shop_id text;
  v_role    text;
  v_token   text;
  v_invite  staff_invites;
BEGIN
  -- Caller must be authed.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Validate role argument.
  IF p_role NOT IN ('owner','manager','staff') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;

  -- Validate email (basic shape; full check is on the app side).
  IF p_email IS NULL OR p_email = '' OR position('@' in p_email) = 0 THEN
    RAISE EXCEPTION 'Invalid email';
  END IF;

  -- Caller's shop + role.
  SELECT shop_id::text, role
    INTO v_shop_id, v_role
    FROM users WHERE id = auth.uid();

  IF v_shop_id IS NULL THEN
    RAISE EXCEPTION 'No shop for caller';
  END IF;

  -- Only owner or manager can invite.
  IF v_role NOT IN ('owner','manager') THEN
    RAISE EXCEPTION 'Insufficient role: %', v_role;
  END IF;

  -- Manager cannot invite owners.
  IF v_role = 'manager' AND p_role = 'owner' THEN
    RAISE EXCEPTION 'Manager cannot invite owner';
  END IF;

  -- Generate a 32-char hex token (128 bits of entropy).
  v_token := encode(gen_random_bytes(16), 'hex');

  -- Insert the invite.
  INSERT INTO staff_invites
    (shop_id, email, role, token, created_by)
  VALUES
    (v_shop_id, lower(p_email), p_role, v_token, auth.uid())
  RETURNING * INTO v_invite;

  -- Audit row. SECURITY DEFINER bypasses the table-level INSERT
  -- policy, but we still supply actor=auth.uid() correctly so the
  -- 3c "actor must equal auth.uid()" RLS WITH CHECK passes if the
  -- function ever loses SECURITY DEFINER privileges.
  INSERT INTO audit_log
    (shop_id, actor, event_type, target_table, target_id, payload)
  VALUES
    (v_shop_id, auth.uid(), 'staff_invited',
     'staff_invites', v_invite.id::text,
     jsonb_build_object(
       'email', lower(p_email),
       'role', p_role
     ));

  RETURN v_invite;
END
$$;

REVOKE ALL ON FUNCTION create_staff_invite(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_staff_invite(text, text)
  TO authenticated;

-- ──────────────────────────────────────────────────────────────────
-- 4. claim_staff_invite RPC — any authed user with a valid token.
-- ──────────────────────────────────────────────────────────────────
-- Creates (or updates) the caller's users row pointing at the
-- invite's shop_id with the invite's role, marks invite claimed,
-- writes a 'staff_role_changed' audit_log row.
--
-- Refuses to reassign a user who already belongs to a different
-- shop. (User must contact owner of existing shop to remove
-- their staff membership first — UI handled in 3d-3.)
CREATE OR REPLACE FUNCTION claim_staff_invite(p_token text)
RETURNS users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invite        staff_invites;
  v_user          users;
  v_existing_shop text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Look up unclaimed, unexpired invite.
  SELECT * INTO v_invite
    FROM staff_invites
    WHERE token = p_token
      AND claimed_at IS NULL
      AND expires_at > now();

  IF v_invite IS NULL THEN
    RAISE EXCEPTION 'Invite not found or expired';
  END IF;

  -- Refuse if caller already belongs to a different shop. The
  -- existing shop comparison is text-vs-text (cast users.shop_id
  -- on read; staff_invites.shop_id is already text).
  SELECT shop_id::text INTO v_existing_shop
    FROM users WHERE id = auth.uid();
  IF v_existing_shop IS NOT NULL
     AND v_existing_shop <> v_invite.shop_id THEN
    RAISE EXCEPTION
      'User already belongs to a different shop';
  END IF;

  -- Upsert users row. v_invite.shop_id is text (per
  -- staff_invites.shop_id type) but users.shop_id is uuid (per
  -- 0003:74). Cast at insert time — the doc-table text/uuid
  -- divergence is documented in 0006:25-33.
  INSERT INTO users (id, shop_id, role, email)
  VALUES
    (auth.uid(),
     v_invite.shop_id::uuid,
     v_invite.role,
     (SELECT email FROM auth.users WHERE id = auth.uid()))
  ON CONFLICT (id) DO UPDATE
    SET shop_id = EXCLUDED.shop_id,
        role    = EXCLUDED.role
  RETURNING * INTO v_user;

  -- Mark invite claimed.
  UPDATE staff_invites
     SET claimed_at = now(),
         claimed_by = auth.uid()
   WHERE id = v_invite.id;

  -- Audit row. shop_id is text (matches audit_log.shop_id type).
  INSERT INTO audit_log
    (shop_id, actor, event_type, target_table, target_id, payload)
  VALUES
    (v_invite.shop_id, auth.uid(),
     'staff_role_changed', 'users', auth.uid()::text,
     jsonb_build_object(
       'role', v_invite.role,
       'via_invite_id', v_invite.id::text
     ));

  RETURN v_user;
END
$$;

REVOKE ALL ON FUNCTION claim_staff_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_staff_invite(text) TO authenticated;

-- ──────────────────────────────────────────────────────────────────
-- 5. Verification queries (manual — copy into Studio after run).
-- ──────────────────────────────────────────────────────────────────
-- 1) Empty table:
--      SELECT count(*) FROM staff_invites;
--    Expect: 0.
--
-- 2) Only the SELECT policy is registered:
--      SELECT count(*) FROM pg_policies
--      WHERE tablename='staff_invites';
--    Expect: 1.
--
-- 3) RPCs exist:
--      SELECT proname FROM pg_proc
--      WHERE proname IN ('create_staff_invite','claim_staff_invite')
--      ORDER BY proname;
--    Expect: 2 rows.
--
-- 4) Owner invites a staff member:
--      SELECT * FROM create_staff_invite(
--        'test_staff@example.com', 'staff');
--    Expect: a staff_invites row with a 32-char hex token.
--    Side effects: audit_log gains a 'staff_invited' row;
--                   staff_invites count is now 1.
--
-- 5) Same email, same shop, while unclaimed → unique-index fail:
--      SELECT * FROM create_staff_invite(
--        'test_staff@example.com', 'manager');
--    Expect: ERROR duplicate key value violates unique constraint
--    "staff_invites_unclaimed_unique_idx".
--
-- 6) Invalid role rejected:
--      SELECT * FROM create_staff_invite(
--        'other@example.com', 'admin');
--    Expect: ERROR Invalid role: admin.
--
-- 7) Bad token rejected at claim time:
--      SELECT * FROM claim_staff_invite('definitely_not_a_real_token');
--    Expect: ERROR Invite not found or expired.
--
-- 8) Cleanup the test invite to keep Settings → Staff (3d-3) clean:
--      DELETE FROM staff_invites
--      WHERE email='test_staff@example.com';
--    Expect: 1 row deleted (run via Studio postgres user; the
--    table has no DELETE policy for normal users).
