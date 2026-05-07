# Section 9 Compliance Verification Report

| Field | Value |
| --- | --- |
| Date | 2026-05-07 |
| Audited by | Claude Code (Opus 4.7, 1M context) |
| Scope | LootLedger briefing §9 — nine compliance gaps |
| Commit | C1 of 3 (audit pass + tipping-off re-verification + critical fixes only) |
| Branch | `dev` |

This audit is the input to the next two compliance commits:
- **C2** — real-time gates: Gap 1 (rolling 30-day structuring), Gap 2 (linked-tx same-client same-day), Gap 3 (already done — see below).
- **C3** — time-based alerts + storage polish: Gap 4 (per-item storage granularity at capture), Gap 7 (TTR day-7 / day-9 escalation), Gap 8 (police-notice 21-day countdown).

The audit was performed against the dev branch at the C1 commit point. References to file paths and line numbers below were live at audit time; subsequent commits will move them. Re-verify before relying on the line numbers.

---

## Summary table

| Gap | Topic | State | Action |
| --- | --- | --- | --- |
| 1 | Rolling 30-day structuring detection per vendor | **Missing** | Defer to **C2** |
| 2 | Linked-transaction detection (same client, same day) | **Missing** | Defer to **C2** |
| 3 | Enhanced CDD at $10k cash | **Present and correct** | No action |
| 4 | Per-item storage location (SHD Act §21A Vic) | **Present and correct** | Optional polish in C3 |
| 5 | Tipping-off audit (SMR confidentiality) | **Present and correct** | Re-audited 2026-05-07; clean |
| 6 | Override audit trail | **Partially present** (TFS overrides + blacklist overrides logged; admin-PIN modal still unlogged) | Defer to Phase 3 (per-user identity) |
| 7 | TTR day-7 / day-9 reminder alerts | **Partially present** (static count banner, no escalation) | Defer to **C3** |
| 8 | Police notice 21-day countdown | **Missing** (binary toggle only) | Defer to **C3** |
| 9 | Retention semantics (7-year, not 3-month) | **Present and correct** | No action |

**No critical bugs found.** No 3-month / 90-day deletion logic exists in the data-retention path. No tipping-off leaks introduced by recent TFS work. C1 commits the audit doc + a refreshed dated tipping-off audit comment in `src/lib/compliance/au.js`.

---

## Gap-by-gap detail

### Gap 1 — Rolling 30-day structuring detection per vendor

**State:** Missing.

**What was checked:**
- `src/lib/compliance/au.js` — the existing in-file audit comment block (lines 13-18) already documented this gap on 2026-04-28. The TODO at line 110 names the work: add a `txHistory` second arg to `checkCompliance`, filter to same vendor (name+phone pre-Phase 2.7, `client_id` post-Phase 2.7) over the last 30 days, sum cash totals, flag at 80 % of `THRESH.CASH_TTR` (warn) and 100 % (block).
- `src/App.tsx:531` — `priorCashIn24h = await sb.loadCashTotal24h(clientId)` is the **24-hour** rolling aggregation added in Stage 1.C. Distinct from the 30-day structuring requirement: the 24-hour rule is the AUSTRAC TTR aggregation rule (Cth AML/CTF Act); the 30-day structuring detection is broader (s5.structuringDetection in `src/lib/amlProgram/defaults.js:119`).
- `src/lib/storage.js:173` — `loadCashTotal24h` is the only same-client cross-tx aggregation that exists today; no 30-day variant.

**Notes:**
- The Phase 2.7 client persistence layer (`tx.clientId`) makes the 30-day query trivial: `transactions WHERE clientId = X AND date >= now() - 30 days AND payment = 'cash'`, sum `buyTotal`. The infrastructure is there; the detection isn't wired.
- AML/CTF Program s5.structuringDetection text claims this is implemented; that text is aspirational and should be reconciled with the actual capability when C2 lands.

**Recommended action:** Defer to **C2**. Add `sb.loadCashTotal30d(clientId)` (parallel to the 24-hour helper); thread into `checkCompliance` as `priorCashIn30d`; flag at 80 %/100 % of `THRESH.CASH_TTR`. Banner surfaces in the Compliance step (now step 3 after the 2026-05-06 swap).

---

### Gap 2 — Linked-transaction detection (same client, same day)

**State:** Missing.

**What was checked:**
- `src/lib/compliance/au.js` — existing audit block (lines 20-23) and TODO at line 114-117 already document the gap.
- `src/screens/NewTx.jsx` (Client step, txStep===2 after the swap) — the Client step has search + form + TFS screening, but no same-day-prior-tx lookup or banner.
- `src/lib/storage.js` — `loadCashTotal24h` aggregates cash within 24 hours; doesn't surface the prior tx records themselves, just the sum.

**Notes:**
- Same shape of work as Gap 1: history-aware lookup at the Client step. With `tx.clientId` populated, the query is straightforward: `transactions WHERE clientId = X AND date >= today_start ORDER BY date DESC`.
- Surface in the Client step as a yellow banner with a "review previous transaction" link when at least one prior tx exists for the same client today.

**Recommended action:** Defer to **C2**. Lands alongside Gap 1 (shared infrastructure: same-client history loader).

---

### Gap 3 — Enhanced CDD at $10k cash

**State:** Present and correct.

**What was checked:**
- `src/lib/compliance/au.js` audit block (lines 25-27) records the fix in Phase 2 step 3c.
- `src/lib/compliance/index.js` — `getRequiredFields()` returns `pepCheck`, `tfsCheck`, `riskRating`, `sourceOfFunds`, `sourceOfWealth` based on threshold + dealer-side overrides.
- `src/screens/NewTx.jsx` Compliance step (txStep===3 after the swap) — renders only the fields `getRequiredFields` returns; honours dealer-side tightening from `settings.cashKycThreshold`, `settings.bullionCddThreshold`, `settings.sourceOfFundsCashThreshold`, `settings.sourceOfWealthCashThreshold`.

**Notes:** No action. C2 prompt lists Gap 3 alongside Gaps 1 and 2 — that's a labelling artifact in the briefing. The work is already done.

---

### Gap 4 — Per-item storage location (Vic SHD Act §21A)

**State:** Present and correct.

**What was checked:**
- `src/screens/NewTx.jsx:817` — Staff step has `<F label="Storage Location (bay / safe / tray)" required value={staff.storageLocation} ... placeholder="e.g. Safe A, Tray 3"/>`. Required at finalize.
- `src/App.tsx:541` — `tx.staff` carries `storageLocation` on the persisted transaction (inside `tx.staff` object).
- `src/App.tsx:568` — buy items become stock records that copy `storageLocation: sS(staff.storageLocation)` per item from the tx-level capture.
- `src/components/StockCard.jsx:23` — displays `📍 [storageLocation]` prominently in the stock row.
- `src/components/StockCard.jsx:29` — Edit button opens an editor that allows per-item storage-location override (so a 3-item buy initially split as one location can be re-distributed to three locations post-buy).
- `src/App.tsx:1061` — the per-item edit modal includes the Storage Location field.
- `src/lib/compliance/au.js:361` — `makeTxt` includes "Storage:" line in the COMPLIANCE block of the .txt artifact.
- `src/lib/compliance/au.js:379` — `genPoliceReport` row schema includes a "Storage" column (added Phase 2 step 3c per existing audit comment).

**Notes:**
- At the buy step, the storage location is captured once for the whole transaction. All items in that buy initially share the same storage location. Police-locate-on-demand requirement is satisfied: every item's stock record carries a location, and the police report CSV exports it.
- The per-item Stock editor lets staff split locations after the fact (e.g. half of a buy goes into Safe A, the other half into Tray 3).
- A polish change for **C3** could expose per-item storage at the buy step itself (current behaviour is "default same as tx, edit later"). Strictly optional — the regulatory requirement is met today.

**Recommended action:** No required action. C3 may add per-item granularity at buy-time as a polish item if the user wants it.

---

### Gap 5 — Tipping-off audit (SMR confidentiality)

**State:** Present and correct (re-verified 2026-05-07).

**What was checked (this re-audit):**
- `src/components/Receipt.jsx` (1-121) — NO references to `smrFlagged`, `suspicious`, `blacklisted`, `tfsConfirmedMatch`, `tfsOverrideApplied`, or any compliance flag. The "TTR REQUIRED — filed with AUSTRAC" banner at line 100 is statutorily *disclosable* — the AML/CTF Act s.123 tipping-off offence covers SMRs only, not TTRs. The hobby-prospector banner at line 101 is a tax-treatment marker, not compliance. Confirmed clean.
- `src/lib/integrations.js` (42-91) — re-walked every payload:
  - `sendSquareSell` (line 45): line items only.
  - `sendSquareBuy` (lines 48-58): metadata is `transaction_type` / `invoice` / `supplier`. No flags.
  - `sendShopifySell` (lines 61-63): tags `loot-ledgr-sale`, note `Loot #INV | clientName`. No flags.
  - `sendShopifyBuy` (lines 66-68): tags `vendor-purchase,loot-ledgr`, note_attributes `transaction_type` / `invoice` / `supplier`. No flags.
  - `sendEftpos` (lines 71-75): amount + device_id (Square) or TxnType + AmtPurchase + TxnRef (Linkly). No flags.
  - `sendDuressSMS` (lines 78-84): duress payload only — `type=DURESS_ALERT`, message, address, business. Not transaction-related; no compliance leak.
  - `pushIntegrations` generic webhook (line 91): payload `{event, invoice, date, buy, sell, payment, net}`. No flags.
- Internal staff-facing surfaces that DO show SMR / TFS-OVERRIDE state (intentional, not tipping-off): History row badges, Clients (Transactions sub-mode) row badges, ClientDetail linked-tx row badges, Settings → TFS Screening Log (admin-gated). These are never customer-visible; they are the internal record the dealer relies on to remember the override decision.

**Notes:**
- The TFS Commit 4 work (commit 23c8a5f) added the TFS-OVERRIDE badge on three staff-facing surfaces. I confirmed that none of these are reachable by a customer: History / Clients / ClientDetail are operator screens, and Settings → TFS Screening Log is admin-gated.
- TFS Commit 3 added the `recordTfsBlock` and `recordTfsOverride` handlers that write to `tfs_screen_log`. Neither calls any external service — both are local Supabase writes.

**Recommended action:** No code change. Refresh the dated audit comment in `src/lib/compliance/au.js` (this commit). Re-run this audit any time a new external integration is added.

---

### Gap 6 — Override audit trail

**State:** Partially present.

**What was checked:**
- `src/lib/clients.js:199` — `recordBlacklistOverride(clientId, entry)` appends `{timestamp, staffId, reason}` to a JSONB array on the client record. Called from `src/lib/blacklistGate.js`.
- `src/App.tsx:649-670` — `recordTfsOverride(matchRef, reason)` writes a row to `tfs_screen_log` with `override_applied=true` and the reason. Surfaces in the Settings → TFS Screening Log audit panel (TFS Commit 4).
- `src/App.tsx:367` — the generic admin-PIN modal (`pinModal`) still proceeds on PIN approval without writing an audit row. Used by: Admin PIN gates throughout the app (catalog edits, settings tightening, etc.).

**Notes:**
- Two of the three override surfaces are now logged (blacklist + TFS).
- The third — the generic admin-PIN gate — still has no audit row. The original audit comment in `au.js:38-43` notes this requires Phase 3 (per-user identity); without staff identity, the audit row would just record `staffId: activeStaff` which is already a free-text label, not a real identity.

**Recommended action:** Defer the third surface to **Phase 3** (Stage 2.4 in the locked roadmap). The TFS and blacklist override logs are sufficient for the current compliance posture. Document the residual gap in the AML/CTF Program when Phase 3 lands.

---

### Gap 7 — TTR day-7 / day-9 reminder alerts

**State:** Partially present.

**What was checked:**
- `src/screens/Dashboard.jsx:85` (post-2026-05-06 commit) — `{(txList||[]).some(t=>t.ttrStatus==="PENDING") && <div style={c.bnr("block")}>🔴 AUSTRAC TTR PENDING — N transaction(s) require filing at austrac.gov.au/online</div>}`. Static count, no day-based escalation.
- `src/screens/Dashboard.jsx:78-84` — TODO comment from Phase 2 dashboard extraction explicitly calls out the day-7 / day-9 / day-10 escalation work.
- The TTR filing deadline is 10 business days from the transaction date.

**Notes:**
- The `tx.ttrStatus` field is already `"PENDING"` from finalize (App.tsx:541) and flips to `"FILED"` when staff records a filing. The day calculation just needs `(today - tx.date) / business_days_calc` per pending entry.

**Recommended action:** Defer to **C3**. Compute days-since-tx per pending entry, surface the worst-case in the banner (warn at 7 days, urgent at 9 days), and add a click-through to the History view filtered to TTR PENDING.

---

### Gap 8 — Police notice 21-day countdown

**State:** Missing (binary toggle only).

**What was checked:**
- `src/App.tsx` — `togglePoliceHold = (id, val) => setStock(p => p.map(s => s.id===id ? {...s, policeHold: val} : s))`. Pure boolean flip.
- `src/components/StockCard.jsx` — renders the police-hold state as a binary indicator. No date, no countdown.
- The TODO comment (existing in App.tsx near `togglePoliceHold`) describes the full requirement: replace toggle with a modal capturing date received, expiry (auto +21d), and notice reference number; stock card displays days remaining; dashboard surfaces a banner at day-18, day-21 (expiring), day-42 (reissue gone — sale unlocked unless court order recorded).

**Notes:**
- Schema impact: stock records gain `policeNoticeReceivedAt`, `policeNoticeExpiryAt`, `policeNoticeReference`, `policeNoticeReissueAt` (optional). All optional / nullable so existing records aren't broken.
- The 21-day default + single 21-day reissue (total 42 days) is the per-state hold cadence. Some states differ (see `STATE_INFO` in `src/lib/compliance/au.js:94-103`); the countdown should default to 21 + 21 unless `STATE_INFO[stateCode].hold` overrides.
- Day-18 alert + day-21 expiry + day-42 reissue-gone are dashboard banners.

**Recommended action:** Defer to **C3**. This is a self-contained feature: schema additions (no migration — fields live in stock JSONB blob), new modal, countdown UI in StockCard, banners on Dashboard.

---

### Gap 9 — Retention semantics (7-year, not 3-month)

**State:** Present and correct.

**What was checked:**
- `src/lib/utils.js:30-31` — `sevenYrsFrom = iso => addHours(iso, 7*365.25*24)`. Single source of truth for the 7-year boundary.
- `src/App.tsx:541` — `tx.deleteAfter = sevenYrsFrom(now)` on every tx finalize.
- `src/App.tsx:568` — `stock.deleteAfter = sevenYrsFrom(now)` on every new stock record born from a buy.
- `src/App.tsx:757` — `purge` filters by `isExpired7yr(t.deleteAfter)` and `isExpired7yr(s.deleteAfter)`. Photos (`tx.photo`, `tx.itemPhotos[*]`) are inline data URIs in the tx record, so they're purged with the tx record itself. Photos linked through `photoKey` (localStorage) are also deleted: `ex.forEach(t => {if (t.photoKey) store.del(t.photoKey);})`.
- `src/lib/storage.js:204-214` — `logTfsScreen` sets `delete_after = now + 7*365.25*24*3600*1000ms` on every `tfs_screen_log` row.
- `supabase/migrations/0006_tfs_list.sql:147` — `delete_after timestamptz NOT NULL` on `tfs_screen_log`.
- `src/lib/amlProgram/defaults.js:123` — s6.retentionPeriod text says "7 years from the date of transaction or last customer interaction".

**3-month / 90-day searches:**
- `docs/handover/saas-setup.md:106,118,129` — SaaS subscription **trial period**, not record retention.
- `src/screens/auth/Signup.jsx:115` — Signup subtitle "3-month free trial" — SaaS trial period.
- `supabase/migrations/0003_saas_foundation.sql:55` — `shops.trial_ends_at = now() + INTERVAL '3 months'` — SaaS trial expiry.
- `src/lib/auth/saas.js:28` — comment about trial expiry.
- `src/lib/legal/termsOfServiceDefaults.js:95` — SaaS termination clause: "retain Your data for at least 30 days to allow data export, then will permanently delete Your data **unless retention is required by law (including AML/CTF Act 7-year retention, where applicable)**". Carve-out is explicit.
- `src/modals/TfsScreenLogPanel.jsx:31` — UI default "From" date is 30 days ago in the screening-log filter. Just a UI default for the date range filter; not a deletion threshold.
- `src/lib/legal/privacyPolicyDefaults.js:103,123` — APP 12 access response window (30 days) and complaint response window — both are *response* deadlines, not retention.

**Notes:** No 3-month / 90-day record-retention logic exists anywhere. The 3-month references are all SaaS trial periods (a separate, unrelated concept). Photos are explicitly deleted alongside the parent transaction. The 7-year boundary is consistently applied across `transactions`, `stock`, and `tfs_screen_log`.

**Recommended action:** No fix needed. Audit comment in `src/lib/compliance/au.js:58-63` already accurate; refreshed in this commit's tipping-off comment update.

---

## What's already done in TFS work (reference for C2/C3 planning)

- **Gap 5 (tipping-off audit)** — re-verified clean as of 2026-05-07. New TFS surfaces (badges, audit log panel) added without leaks. Refresh comment now in `src/lib/compliance/au.js`.
- **Gap 6 (override audit trail)** — TFS overrides logged in `tfs_screen_log` (TFS Commit 3); blacklist overrides logged in `client.blacklistOverrides` JSONB array (Phase 2.7.11). Generic admin-PIN gate still unlogged — defers to Phase 3.

## C2 / C3 dependency notes

- **C2 (Gaps 1, 2, 3):** Gap 3 already done. Gaps 1 and 2 share infrastructure: a same-client history loader. Suggest adding `sb.loadCashTotal30d(clientId)` and `sb.loadTodaysTxsByClient(clientId)` together, then threading both into the Compliance step (1) and Client step (2) respectively.
- **C3 (Gaps 4, 7, 8):** Gap 4 is already done; C3 may add per-item storage at buy-time as a polish. Gap 7 is a small Dashboard tweak (count days-since-tx). Gap 8 is the meatiest piece of C3 — modal, countdown UI, dashboard banners, schema additions. Order: 7 first (small, isolated), then 4 polish (small), then 8 (the big one).

## Re-audit cadence

- Re-run the tipping-off audit any time a new external integration ships (Stripe Payouts, Xero per-tx push, eBay listing, customer portal — all on the roadmap).
- Re-run the retention audit any time a new persisted entity is added (e.g. SMR queue table, Phase 3 audit log table, ai_chat_log).
- Re-run the full Section 9 audit if the briefing's Gap list is updated, or annually as part of the s8 independent review cycle.
