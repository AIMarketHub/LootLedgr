-- LootLedger — Phase 3 commit 3e: legacy audit backfill
-- (2026-05-09).
-- ================================================================
--
-- One-shot data migration that closes the historical gap in
-- audit_log: events that predate the 3d-3 audit_log writers (or
-- predate Phase 3 entirely) are inserted with
-- event_type='legacy_import' so the audit trail reads
-- chronologically from the dealer's pre-Phase-3 records onward.
--
-- Sources:
--   1. clients.data->'blacklistOverrides' entries WITHOUT a
--      staffActor field (pre-3d-2; no live audit_log row).
--   2. settings.data->{termsOfService,privacyPolicy,amlProgram}
--      ->'versions' entries WITHOUT a savedByActor field.
--   3. tfs_screen_log rows EXCEPT those with
--      override_applied=true AND created_by IS NOT NULL (which
--      already have a 3d-3 tfs_override audit_log row).
--
-- Common payload pattern:
--   actor       = NULL  (permitted for legacy_import per the
--                        3a/3c audit_log_write_own RLS WITH
--                        CHECK clause).
--   actor_label = legacy string from source.
--   event_type  = 'legacy_import'.
--   created_at  = legacy event timestamp (overrides the
--                 default now()) so audit history reads
--                 chronologically.
--   payload     = { legacy_kind, ...source-specific fields }.
--
-- Idempotent: wraps in BEGIN/COMMIT and starts with DELETE
-- WHERE event_type='legacy_import'. Re-running the migration
-- produces the same set from current source state.
--
-- Sizing (confirmed in dev DB before authoring):
--   tfs_screen_log:                  6 rows
--   clients.blacklistOverrides:      0 entries
--   settings.{tos,privacy,aml}:      0 versions × 2 settings
-- Total expected backfill rows: ~6 (tfs_screen log only,
-- assuming none meet the 3d-3-already-audited filter).
--
-- ================================================================
-- USER FOLLOW-UP STEPS (after running this migration in Studio):
--   1. Run the 5-query verification suite at the bottom of this
--      file. Headline: total ~6 rows, all event_type=
--      'legacy_import', all actor IS NULL, created_at preserves
--      historical timestamps, re-running the migration keeps the
--      count stable.
--   2. No data cleanup required. Future live events continue to
--      land via the 3d-3 writers; this migration only fills the
--      historical gap once.
-- ================================================================

BEGIN;

-- Idempotency: wipe any prior legacy_import rows so re-runs
-- produce a clean state.
DELETE FROM audit_log WHERE event_type = 'legacy_import';

-- ──────────────────────────────────────────────────────────────────
-- SOURCE 1 — clients.blacklistOverrides[] (pre-3d-2 entries)
-- ──────────────────────────────────────────────────────────────────
INSERT INTO audit_log
  (shop_id, actor, actor_label, event_type, target_table,
   target_id, payload, reason, created_at)
SELECT
  c.shop_id,
  NULL,
  coalesce(entry->>'staffId', 'legacy'),
  'legacy_import',
  'clients',
  c.id::text,
  jsonb_build_object(
    'legacy_kind',      'blacklist_override',
    'client_id',        c.id::text,
    'client_name',      c.data->>'fullName',
    'legacy_timestamp', entry->>'timestamp',
    'legacy_staff_id',  entry->>'staffId'
  ),
  entry->>'reason',
  coalesce(
    (entry->>'timestamp')::timestamptz,
    now()
  )
FROM clients c,
     jsonb_array_elements(c.data->'blacklistOverrides') entry
WHERE jsonb_typeof(c.data->'blacklistOverrides') = 'array'
  AND entry->>'staffActor' IS NULL;

-- ──────────────────────────────────────────────────────────────────
-- SOURCE 2a — settings.termsOfService.versions[] (pre-3d-2)
-- ──────────────────────────────────────────────────────────────────
INSERT INTO audit_log
  (shop_id, actor, actor_label, event_type, target_table,
   target_id, payload, reason, created_at)
SELECT
  s.shop_id,
  NULL,
  coalesce(entry->>'savedBy', 'legacy'),
  'legacy_import',
  'settings',
  'tos',
  jsonb_build_object(
    'legacy_kind',      'legal_doc_approved',
    'doc_kind',         'tos',
    'version',          entry->>'version',
    'approver_name',    entry->>'approvedBy',
    'legacy_timestamp', entry->>'savedAt',
    'legacy_saved_by',  entry->>'savedBy'
  ),
  NULL,
  coalesce(
    (entry->>'savedAt')::timestamptz,
    now()
  )
FROM settings s,
     jsonb_array_elements(s.data->'termsOfService'->'versions') entry
WHERE jsonb_typeof(s.data->'termsOfService'->'versions') = 'array'
  AND entry->>'savedByActor' IS NULL;

-- ──────────────────────────────────────────────────────────────────
-- SOURCE 2b — settings.privacyPolicy.versions[] (pre-3d-2)
-- ──────────────────────────────────────────────────────────────────
INSERT INTO audit_log
  (shop_id, actor, actor_label, event_type, target_table,
   target_id, payload, reason, created_at)
SELECT
  s.shop_id,
  NULL,
  coalesce(entry->>'savedBy', 'legacy'),
  'legacy_import',
  'settings',
  'privacy',
  jsonb_build_object(
    'legacy_kind',      'legal_doc_approved',
    'doc_kind',         'privacy',
    'version',          entry->>'version',
    'approver_name',    entry->>'approvedBy',
    'legacy_timestamp', entry->>'savedAt',
    'legacy_saved_by',  entry->>'savedBy'
  ),
  NULL,
  coalesce(
    (entry->>'savedAt')::timestamptz,
    now()
  )
FROM settings s,
     jsonb_array_elements(s.data->'privacyPolicy'->'versions') entry
WHERE jsonb_typeof(s.data->'privacyPolicy'->'versions') = 'array'
  AND entry->>'savedByActor' IS NULL;

-- ──────────────────────────────────────────────────────────────────
-- SOURCE 2c — settings.amlProgram.versions[] (pre-3d-2)
-- ──────────────────────────────────────────────────────────────────
INSERT INTO audit_log
  (shop_id, actor, actor_label, event_type, target_table,
   target_id, payload, reason, created_at)
SELECT
  s.shop_id,
  NULL,
  coalesce(entry->>'savedBy', 'legacy'),
  'legacy_import',
  'settings',
  'aml',
  jsonb_build_object(
    'legacy_kind',      'legal_doc_approved',
    'doc_kind',         'aml',
    'version',          entry->>'version',
    'approver_name',    entry->>'approvedBy',
    'legacy_timestamp', entry->>'savedAt',
    'legacy_saved_by',  entry->>'savedBy'
  ),
  NULL,
  coalesce(
    (entry->>'savedAt')::timestamptz,
    now()
  )
FROM settings s,
     jsonb_array_elements(s.data->'amlProgram'->'versions') entry
WHERE jsonb_typeof(s.data->'amlProgram'->'versions') = 'array'
  AND entry->>'savedByActor' IS NULL;

-- ──────────────────────────────────────────────────────────────────
-- SOURCE 3 — tfs_screen_log (every row except those with a 3d-3
-- tfs_override audit row already)
-- ──────────────────────────────────────────────────────────────────
INSERT INTO audit_log
  (shop_id, actor, actor_label, event_type, target_table,
   target_id, payload, reason, created_at)
SELECT
  t.shop_id,
  NULL,
  coalesce(t.staff, 'legacy'),
  'legacy_import',
  'tfs_screen_log',
  t.id::text,
  jsonb_build_object(
    'legacy_kind',      'tfs_screen',
    'source_id',        t.id::text,
    'matched',          t.matched,
    'match_reference',  t.match_reference,
    'customer_name',    t.customer_name,
    'override_applied', t.override_applied,
    'legacy_staff',     t.staff
  ),
  t.override_reason,
  t.created_at
FROM tfs_screen_log t
WHERE NOT (
  t.override_applied = true
  AND t.created_by IS NOT NULL
);

COMMIT;

-- ──────────────────────────────────────────────────────────────────
-- Verification queries (manual — copy into Studio after run).
-- ──────────────────────────────────────────────────────────────────
-- 1) Total backfilled rows.
--      SELECT count(*) FROM audit_log
--        WHERE event_type = 'legacy_import';
--    Expected: ~6 (tfs_screen_log row count; blacklist + legal-
--    doc sources are 0 in the dev DB per the recon sizing).
--
-- 2) Per-legacy_kind breakdown.
--      SELECT payload->>'legacy_kind' AS kind, count(*)
--      FROM audit_log
--      WHERE event_type='legacy_import'
--      GROUP BY 1;
--    Expected: tfs_screen → 6 (or fewer if some tfs_screen_log
--    rows had override_applied=true AND created_by NOT NULL).
--
-- 3) created_at preserves legacy timestamps.
--      SELECT created_at, payload->>'legacy_kind'
--      FROM audit_log
--      WHERE event_type='legacy_import'
--      ORDER BY created_at;
--    Expected: rows span historical TFS screening dates, not all
--    clustered at "today" (the migration apply time).
--
-- 4) actor IS NULL for every backfill row (RLS sanity).
--      SELECT count(*) FROM audit_log
--      WHERE event_type='legacy_import' AND actor IS NOT NULL;
--    Expected: 0.
--
-- 5) Re-runnability — apply the migration a second time and
--    re-run query 1. Expected: same row count (the leading
--    DELETE wipes the prior set; the INSERTs re-produce it).
