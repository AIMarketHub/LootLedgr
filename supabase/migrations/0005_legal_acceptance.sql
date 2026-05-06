-- LootLedger — legal acceptance tracking on users (2026-05-06).
-- ================================================================
--
-- Stage 1.A SaaS foundation (migration 0003) created the users
-- table without any legal-acceptance columns because the in-app
-- ToS / Privacy Policy infrastructure didn't exist yet. This
-- migration adds three nullable, additive columns so we can record
-- consent at signup and re-acceptance on version changes.
--
-- Per-user grain (not per-shop) because:
--   • In Phase 3, multiple staff per shop will sign in independently
--     and each will need to acknowledge ToS / Privacy on their own
--     account.
--   • Even in Stage 1.A (single-user-per-shop), the consent record
--     is about the natural person, not the business entity.
--
-- The columns are nullable so:
--   • Existing rows (the dev shop already created during Stage 1.A)
--     don't break — they read as null until next session refresh
--     fires the in-app re-acceptance gate, at which point they get
--     stamped.
--   • Future signups stamp on the way in via the signUp() helper.
--
-- Idempotent — ADD COLUMN IF NOT EXISTS skips when already present.
-- Safe to re-run.
--
-- ================================================================
-- USER FOLLOW-UP STEPS (after running this migration in Studio):
--   1. None mandatory. The columns default to NULL.
--   2. Optional sanity check:
--        SELECT column_name, data_type, is_nullable
--        FROM information_schema.columns
--        WHERE table_schema='public' AND table_name='users'
--          AND column_name IN (
--            'terms_accepted_at',
--            'terms_version_accepted',
--            'privacy_policy_version_accepted'
--          );
--      Expect 3 rows; data_type for the timestamp is
--      'timestamp with time zone'; is_nullable='YES' for all three.
-- ================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS terms_accepted_at                timestamptz,
  ADD COLUMN IF NOT EXISTS terms_version_accepted           text,
  ADD COLUMN IF NOT EXISTS privacy_policy_version_accepted  text;

-- The existing users_update RLS policy from migration 0003
--   USING (id = auth.uid()) WITH CHECK (id = auth.uid())
-- already permits a signed-in user to write to these new columns
-- on their own row. No policy changes required.
