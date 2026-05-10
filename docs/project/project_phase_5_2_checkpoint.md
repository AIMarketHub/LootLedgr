# Phase 5.2 Architecture Checkpoint (v3.2 locked)

**Date locked:** 2026-05-09 (v3) + 2026-05-10 (v3.1 recon-driven
adjustments) + 2026-05-10 (v3.2 — domain migration + per-shop
subdomain routing + cross-platform browser support + R10)
**Last updated:** 2026-05-10
**Supersedes:** Phase 5.2 Checkpoint v1 + v2 + v3 + v3.1.
**Status:** Architecture locked. R1-R8 recon complete; R9 (MYOB
authenticated portal lookup) pending USER task — blocks 5.2-G
only. R10 (Netlify wildcard SSL availability) pending — blocks
5.2-PRE start only. All other sub-phases unblocked.
**Principle:** ONLY ADD, NEVER REMOVE.

This document is the single source of truth for Phase 5.2: hardware
abstraction + Square integration + Xero integration + MYOB
integration + QuickBooks Online integration + SMTP + ABA + data
residency. All earlier in-session checkpoints are superseded by this
file.

Scope expansion in v3:
- MYOB integration elevated from Phase 5.3 to Phase 5.2.
- QuickBooks Online integration elevated from Phase 5.3 to Phase 5.2.
- All three accounting providers ship in 5.2 with full
  implementations (none stubbed).
- "None" mode (internal ledger) preserved as default for dealers
  without external accounting software.

---

## Section 1 — Deployment Topology

Confirmed shop hardware setup at Daylesford:
- Square Register S6 (single device).
- Zebra ZD411 receipt printer plugged into the Register as Square's
  auxiliary printer.
- Windows laptop running LootLedger in browser.
- No iPad/Android device.
- No Xero, MYOB, or QuickBooks account at Daylesford today.

How systems communicate:
- LootLedger ↔ Square: via Square's cloud REST API (HTTPS from
  Windows browser to Square cloud servers).
- Square Register ↔ Square cloud: Register reads/writes Square's
  cloud (where the data lives).
- LootLedger NEVER talks to the Register hardware directly.
- Both LootLedger and the Register are clients of Square's cloud —
  the cloud is the single source of truth.

Square's apps NOT running on Windows is irrelevant to API
integration. Square's REST API works from any HTTPS client including
a Windows browser.

---

## Section 2 — Architectural Roles

LootLedger:
- Compliance, AML/CTF, audit, KYC (existing scope).
- Inventory orchestrator (pushes to Square cloud).
- Expense recorder via AccountingProvider abstraction (pluggable:
  None / Xero / MYOB / QuickBooks).
- Receipt printer driver (LootLedger's own buy receipts).
- ABA batch generator (vendor payment files).
- Email orchestrator (sends accountant deliverables).
- Internal expense ledger (when no AccountingProvider connected —
  Path C "None" mode support).

Square (sales-side only):
- Sales transactions on Register hardware.
- Inventory tracking (LootLedger pushes adjustments).
- Cash drawer hardware control (Square's job, not LootLedger).
- Auxiliary printer for Square's own sale receipts.

AccountingProvider (Phase 5.2 ships ALL THREE + None):
- Accepts Bills from LootLedger (vendor expenses).
- Receives Square sales via the provider's own Square connector:
  - Xero: Amaka integration (free).
  - MYOB: MYOB's own Square connector OR Synder/HexaSync.
  - QuickBooks: Intuit's own Square connector.
- When provider = "None": LootLedger maintains its own expense
  ledger in Supabase, surfaces in accounting XLSX.

SMTP2GO (email):
- Sends LootLedger system emails (auth, reset password, invites).
- Sends accountant deliverables.
- Sender: "Loot Ledger <noreply@lootledger.com.au>" with reply-to =
  dealer's email.
- Replaces Supabase default sender across all auth flows.

---

## Section 3 — Accounting Modes (Path C — Hybrid Optional)

LootLedger ships with FOUR modes for accounting:

### 3.1 — None (default for dealers without external accounting)

LootLedger's internal expense ledger captures every Bill. Surfaces
in:
- Accounting XLSX export (existing 3.5-A-3 commit + new Bills
  section).
- EOD reports.
- GST summary calculations.

Accountant receives the XLSX via email. Manual data entry on
accountant's side. Daylesford ships with this mode.

### 3.2 — Xero (Phase 5.2-C)

LootLedger connects via OAuth 2.0. Bills push to Xero in real-time.
Square's Amaka Xero connector handles sales side automatically.

### 3.3 — MYOB (Phase 5.2-G)

LootLedger connects via OAuth 2.0 (MYOB Business AccountRight API
uses OAuth 2.0 via my.MYOB account). Bills (Spend Money / Purchase)
push to MYOB in real-time. Square sales side handled via MYOB's
Square connector OR Synder/HexaSync (configurable per dealer).

### 3.4 — QuickBooks Online (Phase 5.2-H)

LootLedger connects via OAuth 2.0 (Intuit Developer portal). Bills
(Bill / Expense entity) push to QuickBooks in real-time. Square
sales side handled via Intuit's Square connector.

The dealer toggles the mode in Settings → Accounting. LootLedger
never blocks a buy because of accounting mode — buys ALWAYS proceed;
provider sync happens after capture. If a provider sync fails, the
bill stays in a pending sync queue with retry capability. The buy is
never blocked.

---

## Section 4 — Transaction Flows

### 4.1 — Vendor buy (cash, < $1,999)

LootLedger captures buy:
- CDD / KYC / ID verification.
- Weighing, valuation, payout amount.
- Compliance gates (TFS, structuring, blacklist).
- Signature capture (graphics tablet).

On submit:
- Inventory adjustment to Square via API (BatchChangeInventory
  ADJUSTMENT, NONE → IN_STOCK).
- Bill via AccountingProvider:
  - `provider="xero"`        → Xero Bills API
  - `provider="myob"`        → MYOB Spend Money / Purchase API
  - `provider="quickbooks"`  → QuickBooks Bill API
  - `provider="none"`        → LootLedger internal ledger
- Buy receipt prints locally to LootLedger's printer driver.

Staff manually opens cash drawer (physical key, or Square POS's "no
sale" button), hands $X cash to vendor.

Cash flow is minimised per chat decision.

### 4.2 — Vendor buy (bank transfer, any amount — primary flow)

LootLedger captures buy (same compliance + capture flow).

On submit:
- Inventory adjustment to Square (gold IN_STOCK).
- Bill via AccountingProvider, marked PAID, payment_method =
  "bank_transfer", payment account = the configured bank account ID
  for the active provider.
- Adds payment to "Pending ABA batch" queue.
- Buy receipt prints locally.

No cash drawer involvement.

ABA workflow (must be FAST per chat):
- Single-click "Generate ABA" button on Dashboard or EOD.
- Default behaviour: gather all pending bank-transfer buys since
  last batch. Pre-generation review screen with grand total.
- Confirm. ABA file generates + downloads + auto-emails to
  accountant in parallel. Owner uploads to bank portal manually.

Next day (no LootLedger involvement):
- Bank feed syncs to active provider (if Xero/MYOB/QB).
- Provider auto-matches bank transactions to already-paid Bills.
- If `provider="none"`: dealer's accountant manually reconciles via
  XLSX export.

### 4.3 — Retail sale (sell-side, no LootLedger involvement)

Staff uses Square POS on Register hardware for retail sales. Square
pulls sales into accounting provider via the provider's own Square
connector. LootLedger doesn't touch sell-side transactions. In
"None" mode: dealer reconciles manually.

Connector availability per provider (R8 confirmed; Adjustment 6
from v3.1):
- **Xero** — Amaka connector. Free + AU. Officially co-marketed
  with Xero and Square.
- **QuickBooks** — Intuit's official Square Connector. Free
  (bundled with QBO subscription, no separate fee) + AU.
- **MYOB** — **NO clearly-free option.** Synder lists Square but
  not MYOB as accounting destination. HexaSync has no public AU
  pricing. Amaka offers Square ↔ MYOB but it's NOT in their free
  tier. Implication: MYOB-direct API integration in LootLedger is
  essential for MYOB-using dealers.

---

## Section 5 — Defensive Layer

Build mode: as-if hardware available. Test mode: deferred to Ballarat
shop visit.

Failover orchestration is USER-PROMPTED:
- Each integration runs primary path. On failure → popup asks user
  "did it work / try alternative method / cancel".

Retry policy:
- Network transient errors: 3 silent retries with exponential
  backoff before prompting user.
- Auth/credential failures: prompt user immediately.
- Service errors (e.g. Square API 500, Xero 503): 3 retries then
  prompt.
- Per-provider quirks: MYOB's API is slower; allow longer timeout
  per call.

Mock mode (TWO ORTHOGONAL TOGGLES preserved per Adjustment 4):
- Every integration has a "MOCK" implementation that returns
  success without touching external services.
- Settings has "Hardware mode": [Live / Mock].
- Settings has "Accounting mode": [None / Xero / MYOB /
  QuickBooks / Mock-Xero / Mock-MYOB / Mock-QuickBooks].
- "Mock all" convenience button in Settings flips both toggles
  simultaneously.
- Mock writes to local logs so the rest of the app can be fully
  exercised. Switches at runtime, no rebuild.

Comprehensive logging:
- Every API call logged: timestamp, endpoint, payload, response,
  latency, provider name.
- Every hardware command logged.
- Logs exportable for debugging at Ballarat.

Diagnostics page:
- "Run diagnostics" admin button.
- Sends test inventory adjustment to Square.
- Sends test Bill to active AccountingProvider (zero-value, marked
  test).
- Tests all three providers if dealer has multiple connected (rare
  but supported).
- Prints test receipt.
- Generates test ABA file.
- Sends test email.
- Reports each ✓/✗ with full error info.

---

## Section 6 — Hardware Abstraction

### 6.0 — Cross-platform browser support (Adjustment 13 from v3.2)

LootLedger runs in modern browsers on:
- Windows (Chrome, Edge, Firefox)
- macOS (Chrome, Safari, Firefox)
- iOS / iPadOS (Safari — with caveats below)
- Android (Chrome, Samsung Internet)

Approach A confirmed (browser-only every platform; no PWA wrapper,
no native wrapper). PWA and native deferred to Stage 8 + Stage 9
respectively.

Hardware peripheral support varies by platform:
- Pointer Events API: all platforms ✓
- Web Bluetooth API: Chrome/Edge on Windows/macOS/Android ✓;
  Safari iOS/iPadOS ✗
- Web USB API: Chrome/Edge desktop ✓; Safari iOS/iPadOS ✗;
  Android Chrome ✓
- Network IP printing: all platforms ✓
- Cloud API access: all platforms ✓

The hardware abstraction layer detects the platform and falls back
to the most-compatible driver. If a peripheral is unavailable on
the current platform (e.g. Bluetooth scale on iPad Safari), the UI
prompts manual entry.

Square Reader / Terminal card-reader hardware integration is NOT
in Phase 5.2 scope. Card payments are handled by Square's own POS
apps on the merchant's iOS/Android device or Register hardware.

### 6.1 — Receipt printer

Primary target: Zebra ZD411 (per Daylesford). Plus generic ESC/POS
support for any compatible thermal printer.

CONFIRMED: Daylesford ZD411 is plugged into the Square Register as
auxiliary printer. Therefore LootLedger needs ITS OWN printer for
buy receipts.

Implementation guideline: LootLedger ALWAYS prints its own receipts
via its own printer driver, never relying on Square's hardware.
Square's printer prints sale receipts triggered by Square sales.

Connection paths supported:
- USB (Windows print queue).
- Network IP (most common for ZD411 in shops).
- Bluetooth (less common but supported).

### 6.2 — Barcode / ID scanner

Generic HID keyboard-emulation scanners (most cheap scanners). No
special driver — the scanner "types" into focused input. LootLedger
has focusable input fields ready for this.

### 6.3 — Bluetooth scale

Most precision scales for jewelry advertise as Bluetooth HID or
Bluetooth Serial. LootLedger reads via Web Bluetooth API
(browser-supported on Chrome desktop on Windows). Generic protocol
support: any scale that streams weight as ASCII over BT serial.

### 6.4 — Signature graphics tablet

Approach: Pointer Events API + canvas (works for any HID-compliant
tablet — Wacom, Huion, XP-Pen, Gaomon, generic). No vendor SDK
needed.

UI flow:
- Signature box rendered as `<canvas>`.
- Captures pointer events (pen, finger, mouse fallback).
- "Clear" + "Confirm" buttons.
- On Confirm: image processing auto-fits + centers the stroke data
  within the box.
- If no signature drawn: fallback to "Type your full name" text
  input.
- Both stored in transaction record (signature blob in JSONB,
  fallback name string).

### 6.5 — Cash drawer

Physical key + manual operation primary. Square Register's cash
drawer is Square's job. If shop has standalone cash drawer + receipt
printer (rare): kicker via printer's "drawer kick" command. ESC/POS
standard.

---

## Section 7 — Square Integration

API: Square Connect API v2.
Auth: OAuth per dealer.

Scopes (CONFIRMED via R1):
- `INVENTORY_READ` + `INVENTORY_WRITE`
- `ITEMS_READ` + `ITEMS_WRITE`
- `MERCHANT_PROFILE_READ`
- `CASH_DRAWER_READ` (read-only access to Cash Drawer Shifts API,
  for verification flows)
- Scopes are space-separated in the `/oauth2/authorize` call.
- No 2025/2026-new scope additions material to LootLedger
  identified in primary docs.

Operations:
- BatchChangeInventory ADJUSTMENT on each buy.
- Catalog upsert via UpsertCatalogObject (see two-call pattern below).
- Multi-location: location_id captured at Settings level.

Catalog management — purity-keyed items (Adjustment 8 from v3.1):
- Catalog items are PURITY-KEYED, not dynamically-named per-buy.
  Weight is the inventory QUANTITY, not part of the SKU name.
- ~10-15 catalog items total per dealer, created once during the
  5.2-B setup wizard:
  - 9ct gold scrap
  - 18ct gold scrap
  - 22ct gold scrap
  - 24ct gold scrap
  - Silver 925 scrap
  - Silver 999 scrap
  - Platinum scrap
  - Palladium scrap
  - (etc., configurable per dealer)
- Per-buy steady state: 1 API call (BatchChangeInventory only),
  because the catalog item already exists. Catalog upsert only
  happens for net-new items the dealer adds during onboarding or
  category expansion.
- Avoids catalog blow-up that a dynamically-named-per-weight
  scheme would cause.

Two-call sequence per net-new SKU (R5 confirmed catalog must
exist; Adjustment 3 from v3.1):
- **Call 1: UpsertCatalogObject** — create or update the SKU.
  On success, the SKU is live in Square's catalog.
- **Call 2: BatchChangeInventory** — push the +N (grams)
  quantity adjustment.
  On success, Register hardware sees the new stock within ~60s
  via Square's internal cloud→device sync.
- BOTH calls must succeed before the LootLedger transaction is
  marked "synced to Square."
- Partial-failure recovery: if Call 1 succeeds but Call 2 fails,
  retry Call 2 up to 3 times with exponential backoff. If still
  failing, log to `provider_sync_log.last_error` and prompt user.
- Idempotency: `provider_sync_log` tracks each call separately
  (one row per attempt; the call identifier — `catalog_upsert`
  or `inventory_adjust` — distinguishes them in the `payload_hash`
  so retries dedupe correctly per call).
- Steady-state per buy: 1 call (inventory adjust only).
  Net-new SKU per buy: 2 calls.

Sync latency to Register hardware (R2 — drop "real-time" claims;
Adjustment 4 from v3.1):
- Near real-time, sub-60s typical via Square's internal
  cloud→device webhook sync.
- NO published SLA. Square's only public guarantee is from the
  Webhooks docs: inventory webhook events arrive "in most cases
  ... well under 60 seconds." Register UI propagation is inferred
  to be similar.
- Treat as "near real-time, sub-60s typical, no SLA" in any
  dealer-facing UX copy. Do NOT promise instant Register
  reflection.

Token storage security — pgcrypto only (Adjustment 2 from v3.1;
R4 confirmed Supabase Vault is still beta and not on the pricing
page; pgsodium is officially deprecated):
- pgcrypto column-level symmetric encryption.
- Schema for token storage:
  ```sql
  encrypted_token   bytea NOT NULL
  encrypted_refresh bytea NOT NULL
  key_version       int   NOT NULL DEFAULT 1
  encrypted_at      timestamptz NOT NULL DEFAULT now()
  ```
- **Master key location**: stored in Edge Function secret (NOT a
  Netlify env var; Edge Function secrets are encrypted at rest
  and not exposed to the client).
- **`key_version` column**: forward-compat for master key
  rotation. A future background migration can re-encrypt v1 rows
  with v2 key without downtime.
- **Decryption pathway**: tokens NEVER decrypted client-side.
  Decryption only happens inside an Edge Function or
  SECURITY DEFINER RPC. The client receives a short-lived signed
  payload from the Edge Function for each provider API call.
- Per-dealer encryption key derived from the master secret +
  shop_id (HKDF or equivalent).
- Forward path: when Supabase Vault is unambiguously GA + free-
  tier in a future Supabase release, migration is a column-
  rename + key-version bump, not a re-architecture.

Idempotency (REQUIRED):
- Square API calls register attempts in the shared
  `provider_sync_log` table at the abstraction layer (see
  Section 12).
- Dedupe on `(provider_name='square', ll_tx_id, payload_hash)`
  unique constraint.
- Retries on transient failures don't double-write.

OAuth refresh (REQUIRED):
- On 401 response, automatically refresh the OAuth token and
  retry the failed call once.
- Refresh tokens stored encrypted alongside access tokens.

### 7.1 — Multi-Tenant Architecture (TWO separate Square merchant accounts at launch)

Confirmed: Daylesford and Ballarat are TWO separate Square
merchant accounts (not one merchant with two Locations).

Implications:
- Each shop has its own Square Developer app credentials.
- Each shop has its own OAuth connection in LootLedger.
- Each shop's `shops.square_oauth_token` is encrypted
  independently.
- Each shop's `location_id` is local to its own merchant
  account (NO cross-merchant references).
- Settings UI shows ONE "Connect Square" button per shop
  (rendered in that shop's subdomain context).

This was the architecturally correct assumption already. No
code-path changes needed; this section just makes the multi-
tenant boundary explicit.

Catalog API works fine from Windows. The "Square not compatible
with Windows" issue was about apps, not API.

---

## Section 8 — Xero Integration (FIRST ACCOUNTINGPROVIDER)

API: Xero API v2.
Auth: OAuth 2.0 per dealer.
Scopes:
- accounting.transactions
- accounting.contacts
- accounting.settings

Operations:
- Create Vendor (Contact) on first buy from new vendor.
- Create Bill on every buy.
- Mark Bill PAID immediately, payment account ID = configured
  cash/bank account per Settings.

Bill format:
- Reference: LootLedger invoice number (e.g. "LL-0705261").
- Date: transaction date.
- Due Date: transaction date (already paid).
- Line item description: e.g. "9ct gold scrap, 25.0g, hobby
  prospector exempt under personal-use".
- Account code: 315 (COGS) for commercial purchases. Different code
  for hobby-prospector exempt purchases.
- GST treatment: per AU compliance module mapped to Xero tax code IDs.

Settings per dealer:
- Xero account connected (yes/no).
- Cash payment account ID.
- Bank payment account ID.
- Margin scheme account code.
- Hobby prospector exempt account code.
- Tax code mappings (GST standard / GST-free / margin scheme /
  hobby exempt → Xero tax code ID).

Tax code mapping (REQUIRED):
- Existing AU compliance module determines tax treatment.
- Settings field per dealer maps each compliance outcome to a Xero
  tax code ID (each Xero org has its own IDs).
- At Bill creation time, lookup the tax code ID.
- Bill creation fails gracefully if mapping is missing (popup:
  "Configure Xero tax code for [state] in Settings").

Two-call sequence with pending_payment state machine (R3 confirmed
Xero is two-call only; Adjustment 1 from v3.1):

**Step 1 — Create the Bill:**
- `POST /Invoices` with `Type=ACCPAY`, `Status=AUTHORISED`,
  Contact, LineItems, Reference, Date, DueDate.
- On success: write a `provider_sync_log` row with
  `provider_name='xero'`, `ll_tx_id`, `external_id` = Bill ID,
  `succeeded_at` NULL (set on Step 2), `payload_hash` for the bill
  payload.

**Step 2 — Attach the Payment:**
- `POST /Payments` with `Invoice.InvoiceID`, `Account.Code`,
  `Date`, `Amount`.
- On success: `UPDATE provider_sync_log SET succeeded_at = now()
  WHERE external_id = <Bill ID>`.
- On Step 2 failure (after retries):
  - Void the Bill via `POST /Invoices` with the same InvoiceID
    and `Status=VOIDED` (Xero allows reverting an authorised
    invoice to voided when no other transactions are linked).
  - Log the failure to `provider_sync_log.last_error`.
  - Row stays with `succeeded_at` NULL.

**Retry policy:**
- 3 silent retries on Step 2 with exponential backoff before
  prompting the user.

**User-facing failure:**
- Popup: "Bill created but payment not attached. Verify in Xero
  or retry."
- The Bill remains as a valid AP record either way, so the worst
  case is operator-visible reconciliation work, not data loss.

**Why not aggressive rollback to draft:** voiding the Bill on
Step 2 failure risks orphaning a legitimate AP record that Xero
already accepted. The pending_payment state machine + retry is
safer than aggressive rollback.

Token storage security: pgcrypto column-level (see Section 7 for
the canonical schema + master key pathway).
Idempotency: shared `provider_sync_log` (see Section 12).
OAuth refresh: same as Square.

---

## Section 9 — MYOB Integration (SECOND ACCOUNTINGPROVIDER)

API: MYOB Business AccountRight API.
Auth: OAuth 2.0 via my.MYOB account.

CRITICAL DIFFERENCES from Xero:
- MYOB's API requires both an OAuth token AND a Company File
  credential (basic auth username:password sent in a header) for
  AccountRight desktop-based files. MYOB Cloud (newer) uses OAuth
  only.
- Slower API: typical 2-5 second response times vs Xero's
  sub-second.
- Pagination is opaque (uses skip+take vs Xero's page-based).
- SOAP-style envelope on some endpoints.

LootLedger uses MYOB Cloud only (skip AccountRight desktop support).
Reasons:
- MYOB AccountRight desktop is being phased out.
- Cloud API is the modern path.
- Dealers signing up new MYOB accounts in 2026 get Cloud.

Scopes:
- CompanyFile (read/write)
- SaleAndPurchase (Spend Money + Purchase entities)
- Contact (Vendors)

Operations:
- Create Vendor (Card with Card Type = Supplier).
- Create Spend Money entry (or Purchase if dealer prefers).
- Mark as paid via Pay From account selection.

Settings per dealer:
- MYOB Company File ID.
- Cash payment account ID.
- Bank payment account ID.
- Tax code mappings (GST treatment → MYOB tax code).
- Account number for COGS / Hobby Exempt.

Tax code mapping: same pattern as Xero (AU GST treatment → MYOB tax
code).

Token storage security: pgcrypto column-level (see Section 7 for
the canonical schema + master key pathway).
Idempotency: shared `provider_sync_log` (see Section 12).
OAuth refresh: same as Square.

Bill + Payment pattern (R6 partial — confirmed Bill is the AP
entity; Spend Money is for non-AP cash spends):
- For LootLedger's "vendor was paid offline, just record the AP
  bill + the payment" use case: use **Bill** under
  `/Purchase/Bill`, then a separate **PaymentToContact** entry
  to mutate `BalanceDueAmount` / `AppliedToDate`. Same two-call
  + state-machine pattern as Xero (see Section 8 for the
  reference implementation).
- Spend Money (`SpendMoneyTxn`) is the right entity ONLY for
  cash spends that bypass AP entirely. Not the LootLedger flow.

### Research-blocked items (Adjustment 5 from v3.1)

The R6 recon could not confirm the following from primary docs.
**5.2-G implementation cannot start until these are obtained
from authenticated my.MYOB Developer Portal access** (user task,
~30 min — see R9 in Section 17):

- **Rate limits per realm.** Community posts cite "8 calls/sec,
  1M/day" historically but this is secondary and possibly stale.
- **AccountRight Classic EOL date.** No published hard end-of-life
  date in primary docs; only the March 2025 auth-scope
  deprecation is confirmed.
- **TaxCode endpoint URL.** Docs only mention `$orderby` on
  `TaxCodeType` / `Rate`; no concrete endpoint URL was visible
  on the API-overview page.
- **Exact OAuth URLs.** Authorize / token / refresh endpoint
  URLs not quoted in the public R6-accessed pages.

Until R9 lands with these answers in writing, 5.2-G is on hold.
Code work for 5.2-G must NOT begin without these data points.

### Ecosystem connector status (Adjustment 6 from v3.1; R8)

There is **no clearly-free MYOB Square connector**:
- Synder integrates Square but its supported accounting
  destinations are QuickBooks / Xero / Sage Intacct — MYOB not
  confirmed.
- HexaSync exists but has no public AU pricing.
- Amaka offers Square ↔ MYOB but it is NOT in Amaka's free tier
  (free tier covers Square+Xero, Square+Sage, Square+Holded
  only).

Implication: MYOB-direct API integration in LootLedger is
**essential** for MYOB-using dealers — there is no fallback to a
free third-party connector. This raises the priority of 5.2-G
relative to Xero (which has the free Amaka connector as a fallback)
but does NOT change the v3.1 sequencing — see Section 16 for the
re-sequenced order (5.2-H before 5.2-G per Adjustment 7).

---

## Section 10 — QuickBooks Online Integration (THIRD ACCOUNTINGPROVIDER)

API: QuickBooks Online v3 API.
Auth: OAuth 2.0 via Intuit Developer.

CRITICAL DIFFERENCES from Xero and MYOB:
- Sync token versioning: every entity has a SyncToken that
  increments on each update. Updates require the current SyncToken
  or fail with a stale-data error.
- Entity references use IDs (Ref objects), not codes/names.
- SparseUpdate vs FullUpdate semantics for entity changes.
- Intuit's API has stricter rate limits than Xero or MYOB (500
  requests per minute per realm).

Scopes:
- com.intuit.quickbooks.accounting

Operations:
- Create Vendor entity.
- Create Bill entity (or Expense entity for cash purchases).
- For paid bills: create BillPayment entity referencing the Bill
  and the source Account.

Bill format:
- DocNumber: LootLedger invoice number.
- VendorRef: Vendor ID.
- TxnDate: transaction date.
- DueDate: transaction date (already paid).
- Line items with ItemRef + Description + Amount + TaxLineDetail.
- Currency: AUD (assumed; configurable).

Settings per dealer:
- QuickBooks Realm ID.
- Cash payment Account ID.
- Bank payment Account ID.
- Tax code mappings (GST treatment → QB TaxCode ID).
- Vendor expense Account ID (COGS).
- Hobby Exempt expense Account ID.

Tax code mapping: same pattern (AU GST treatment → QB TaxCode ID).
QuickBooks AU has prebuilt tax codes (GST, FRE, etc.) but each realm
can have custom ones.

Token storage security: pgcrypto column-level (see Section 7 for
the canonical schema + master key pathway).
Idempotency: shared `provider_sync_log`, using DocNumber as natural
key.
OAuth refresh: same as Square (QB tokens are short-lived, ~1 hour,
so refresh logic is more frequently exercised).

Bill + BillPayment two-call (R7 confirmed):
- POST Bill (requires VendorRef + Line[]).
- POST BillPayment that links to the Bill via LinkedTxn.
- Same two-call + state-machine pattern as Xero (see Section 8
  for the reference implementation).
- SyncToken handling: returned in the create response, starts at
  "0" for newly created entities, increments per modification.
  LootLedger persists SyncToken alongside entity ID immediately
  after create.
- Rate limit: 500 requests/minute per realm + 10 concurrent
  requests per realm in production. Sandbox is lower.

---

## Section 11 — Internal Expense Ledger (Path C "None" mode)

When `AccountingProvider = "none"`:
- LootLedger writes Bill records to a Supabase table
  `internal_bills` (Adjustment 3 — migration `0017_internal_bills.
  sql`).
- Schema mirrors what external providers would store: vendor, line
  items, GST treatment, payment method, paid status, paid date,
  reference (LootLedger transaction ID).
- Accounting XLSX export adds a "BILLS / EXPENSES" section that
  reads from internal_bills.
- Same date-range filter as the rest of the export.
- Daylesford ships with this mode. When/if Daylesford later adopts
  an external provider, a migration script can backfill into that
  provider.

---

## Section 12 — AccountingProvider Abstraction

The interface every provider implements:

```
async function connect()
async function getAccountList()
async function getTaxCodeList()
async function findOrCreateVendor({name, abn, contact})
async function createBill({
  vendorId, date, lineItems, taxCode, paymentAccount,
  referenceNumber, paid: true
})
async function diagnose()
async function disconnect()
```

LootLedger code calls `accountingProvider.createBill(...)` — the
provider underneath is whichever the dealer picked in Settings.

### File structure (Adjustment 1 — under `integrations/`)

```
src/lib/integrations/accounting/
  provider.js         (interface definition + active dispatch)
  none/
    index.js          (internal ledger implementation)
  xero/
    index.js
    auth.js
    bills.js
    contacts.js
    accounts.js
    taxCodes.js
  myob/
    index.js
    auth.js
    spendMoney.js
    contacts.js
    companyFile.js
    taxCodes.js
  quickbooks/
    index.js
    auth.js
    bills.js
    vendors.js
    accounts.js
    taxCodes.js
```

### Shared `provider_sync_log` table (Adjustment 2)

Single shared table at the abstraction layer. NOT per-provider
dedupe tables. Lives in migration `0016_provider_sync_log.sql` (5.2-F).

Schema:

```sql
TABLE provider_sync_log
  id            bigserial PRIMARY KEY
  provider_name text NOT NULL  -- 'square'/'xero'/'myob'/'quickbooks'
  ll_tx_id      text NOT NULL
  external_id   text NULL      -- ID returned by provider on success
  attempted_at  timestamptz NOT NULL DEFAULT now()
  succeeded_at  timestamptz NULL
  payload_hash  text NOT NULL
  last_error    text NULL
  created_at    timestamptz NOT NULL DEFAULT now()

  UNIQUE (provider_name, ll_tx_id, payload_hash)
```

`payload_hash` content:
`sha256(ll_tx_id || provider_name || total_amount_cents)`

Semantics:
- Write-on-attempt: row created when sync starts.
- Update-on-success: `succeeded_at` set when provider confirms.
- Dedupe query: `WHERE provider_name=? AND ll_tx_id=? AND
  succeeded_at IS NOT NULL`.
- Retry-after-correction: a corrected payload (different amount)
  produces a different `payload_hash` → new row, retry succeeds.

---

## Section 13 — ABA File Generation

Format: Australian Banking Association batch payment file. Plain
text, fixed-width records.

Triggered by: bank transfer buys queue accumulation. Promoted to
PRIMARY PAYMENT FLOW per chat decision.

Workflow:
- Each bank transfer buy adds to "Pending ABA batch" queue.
- Owner clicks "Generate ABA" anytime (one-click on Dashboard).
- LootLedger pulls all queued payments since last batch.
- Generates ABA file with:
  - Type 0 descriptor record (file header).
  - Type 1 detail records (one per payment with BSB + account +
    amount + reference).
  - Type 7 file total record (sums for verification).
- File downloads to local disk + emails to accountant automatically
  (per Settings).
- "Mark batch as generated" — payments removed from pending queue.

Vendor data captured at buy:
- BSB (6 digits with format validation).
- Account number (string, varies by bank).
- Account holder name (matches CDD ID name).

Settings per dealer:
- Dealer's BSB + account (the SOURCE of payments).
- Dealer's name (account holder).
- Direct entry user ID (assigned by bank).
- Description prefix.
- Self-balance flag (some banks require, some don't).

Bank-specific quirks (need testing at Ballarat): CBA, NAB, ANZ,
Westpac, Bendigo, Bank Australia, Macquarie, Members Equity all use
the standard format.

Risk mitigations:
- Admin PIN required to generate ABA.
- One-click "Generate ABA" button on Dashboard top-bar.
- Pre-generation review screen: list all line items + grand total +
  count + ETA, owner confirms.
- ABA files retained in LootLedger storage (audit trail) for 7 years
  per Privacy Act.
- Email-to-accountant auto-attaches each generated ABA.
- Per-buy "Add to next ABA batch" optional toggle if dealer wants
  to defer specific entries.

---

## Section 14 — Email (SMTP2GO)

Provider: SMTP2GO with AU dedicated servers (Sydney). Reasons:
Australian data residency, AU-based support, 100% delivery SLA,
modern API, reasonable pricing.

> **Note (v3.2):** sender domain references below currently read
> `noreply@lootledger.com.au`. **5.2-PRE** (Adjustment 11 from
> v3.2 — see Section 16) migrates the sender to
> `noreply@lootledger.au` (no `.com`), with new SPF/DKIM/DMARC
> records on `lootledger.au`. The change applies to BOTH 14.1
> (Supabase auth emails) and 14.2 (accountant deliverables). The
> existing wording in 14.1/14.2 is preserved for historical
> reference; treat 5.2-PRE as the authoritative source for the
> new sender once it lands.

### 14.1 — Auth emails (Supabase custom SMTP)

- Signup confirmation, password reset, magic link / OTP, staff
  invite emails.
- Configured in Supabase Studio: Auth → SMTP Settings.
- Sender: "Loot Ledger <noreply@lootledger.com.au>".

### 14.2 — Accountant deliverables (LootLedger direct send)

- "📧 Send to accountant" button on every deliverable artifact (ABA,
  accounting XLSX, EOD report).
- Settings: accountantEmail, accountantName per shop.
- Sender: same as auth, reply-to = dealer's email.

Architecture:
- SMTP2GO API key stored in env vars (NOT per-dealer).
- Email-sending wrapper utility in `src/lib/email/send.js`.
- Used by both auth flows and "send to accountant" buttons.

---

## Section 15 — Data Residency

Status:
- Dev Supabase project: SYDNEY ✓
- Production Supabase project: REGION UNKNOWN per chat decision
  (leave as-is for now; revisit at end-of-project if migration
  needed).
- SMTP2GO: AU servers when account created from AU.

---

## Section 16 — Commit Boundary (5.2-PRE through 5.2-H)

Sub-phases (v3.2 — 5.2-PRE prepended per Adjustment 11; rest
re-sequenced per Adjustment 7 from v3.1 — H before G):

| Order | Phase | Title |
|---|---|---|
| 1 | 5.2-PRE | Domain migration to lootledger.au + per-shop subdomains + wildcard SSL — **blocked on R10** |
| 2 | 5.2-A | Hardware abstraction layer + diagnostics page foundation |
| 3 | 5.2-E | SMTP2GO + email send infrastructure |
| 4 | 5.2-B | Square integration + token security + idempotency |
| 5 | 5.2-D | ABA batch generation |
| 6 | 5.2-F | AccountingProvider abstraction + None mode |
| 7 | 5.2-C | Xero integration (FIRST EXTERNAL PROVIDER) |
| 8 | 5.2-H | QuickBooks Online integration (SECOND EXTERNAL PROVIDER) |
| 9 | 5.2-G | MYOB integration (THIRD EXTERNAL PROVIDER) — **blocked on R9** |

Rationale:
- **PRE first**: domain + per-shop subdomain routing + wildcard
  SSL must land before any OAuth-bearing sub-phase (5.2-B / C / G
  / H), because the apex callback URL pattern (see Section 18) is
  the OAuth pivot. Doing PRE first lets every provider's OAuth app
  be configured ONCE with a stable apex callback. R10 (Netlify
  wildcard SSL plan-tier verification) gates PRE.
- A next: foundation.
- E next: emails work for everything else.
- B next: Square is the simplest integration with the most
  documentation, plus it's required for ALL flows.
- D next: ABA is the primary payment flow.
- F next: AccountingProvider abstraction must exist before any
  provider implementation.
- C / H / G: re-sequenced from v3 (was C / G / H). New order:
  - **C (Xero) first** — cleanest API, free Amaka connector
    available as fallback for sales-side.
  - **H (QuickBooks) second** — better-documented than MYOB; Bill
    + BillPayment two-call pattern + SyncToken returned on create
    are well-specified. Building H second validates the
    AccountingProvider abstraction against a clean API before
    tackling MYOB's quirks.
  - **G (MYOB) last** — research-blocked items (rate limits,
    AccountRight EOL, TaxCode endpoint URL, exact OAuth URLs)
    must NOT gate the rest of the phase. See R9 in Section 17.

Hard prerequisites outside LootLedger's control:
- **5.2-PRE blocked on R10** (Netlify wildcard SSL availability —
  Pro-tier or above required for Let's Encrypt DNS-01 wildcard).
  Do not begin 5.2-PRE code/config work until R10 lands.
- **5.2-G blocked on R9** (MYOB authenticated dev portal lookup).
  Do not begin 5.2-G code work until R9 lands.

5.2-H and 5.2-G may parallelize after 5.2-F + 5.2-C land — but
G's start is gated on R9 regardless.

### 5.2-PRE specification (Adjustment 11 from v3.2)

5.2-PRE — Domain migration to lootledger.au (with per-shop
          subdomains)

Tasks:
- Configure Netlify custom domain on production site:
  apex `lootledger.au` + wildcard `*.lootledger.au`.
- DNS records at AU registrar:
    A apex → Netlify load balancer.
    CNAME *.lootledger.au → Netlify (wildcard).
- Wildcard TLS cert via Let's Encrypt DNS-01 challenge
  (Netlify handles automatically on Pro tier and above;
  verify current plan tier — see R10 in Section 17).
- 301 redirects from secondary domains to lootledger.au:
    lootledger.com.au → lootledger.au
    lootledger.net    → lootledger.au
    lootledgr.au      → lootledger.au
    lootledgr.com.au  → lootledger.au
- Supabase auth allowed-redirect URLs updated to:
    https://lootledger.au
    https://*.lootledger.au (or comma-separated list of known
                             subdomains, depending on Supabase
                             wildcard support).
- Supabase auth cookie domain configured to `.lootledger.au`
  (with leading dot) for cross-subdomain session.
- SMTP2GO sender domain configured to lootledger.au:
    DNS records: SPF, DKIM, DMARC for lootledger.au.
    Sender: noreply@lootledger.au.
    Reply-to: dealer's email (per existing 14.2 spec).
- 301 redirect from lootledgr.netlify.app to lootledger.au.

The per-shop subdomain routing model (assignment policy,
reserved words, OAuth callback pattern, auth flow) is fully
specified in Section 18.

Schema migration bundled into 5.2-PRE: `0018_shop_subdomains.sql`
— see Section 18 for the full schema additions and reserved
words list.

---

## Section 17 — Recon Items

Recon batch R1-R8 ran 2026-05-10 — see save block in session
history for full findings + citations. Status:

| ID | Topic | Gates | Status |
|---|---|---|---|
| R1 | Square OAuth scope names | 5.2-B | ✓ done 2026-05-10 |
| R2 | Square inventory sync to Register hardware | 5.2-B | ✓ done 2026-05-10 (sub-60s typical, no SLA) |
| R3 | Xero Bill API atomic create-with-payment | 5.2-C | ✓ done 2026-05-10 (two-call confirmed) |
| R4 | Supabase token encryption-at-rest options | 5.2-B / 5.2-C / 5.2-G / 5.2-H | ✓ done 2026-05-10 (pgcrypto chosen) |
| R5 | Square inventory adjustment requires existing catalog item | 5.2-B | ✓ done 2026-05-10 (catalog must exist; two-call) |
| R6 | MYOB API current state | 5.2-G | ◐ partial — see R9 |
| R7 | QuickBooks Online API current state | 5.2-H | ✓ done 2026-05-10 |
| R8 | Square + provider ecosystem connectors | informational | ✓ done 2026-05-10 (no free MYOB) |
| **R9** | **MYOB authenticated dev portal lookup** | **5.2-G — BLOCKING** | **pending — USER TASK** |
| **R10** | **Netlify wildcard SSL availability** | **5.2-PRE — BLOCKING** | **pending — USER TASK** |

### R9 — MYOB authenticated developer portal lookup
(Adjustment 9 from v3.1)

**This is a USER task, not an agent task** (~30 min). The R6
recon could not retrieve four data points from public MYOB docs.
User to obtain my.MYOB Developer Portal credentials and pull:

1. **Rate limits per realm** (requests/minute, requests/hour,
   concurrent connections).
2. **AccountRight Classic EOL date** in writing from MYOB
   DevRel — public docs only confirm March 2025 auth-scope
   deprecation.
3. **TaxCode endpoint URL** — full path under
   `/Contact/Customer/...` or wherever it lives, plus a sample
   response shape for AU GST/FRE.
4. **Exact OAuth URLs** — authorize endpoint, token endpoint,
   refresh endpoint.

**Status: BLOCKING 5.2-G start.** Code work for 5.2-G must NOT
begin until R9 lands.

### R10 — Netlify wildcard SSL availability
(Adjustment 14 from v3.2)

**This is a USER task, not an agent task** (~5 min). Verify that
the LootLedger Netlify site's current plan tier supports wildcard
SSL via Let's Encrypt DNS-01 challenge. Findings to record:

1. **Current Netlify plan tier** for the production site (Starter
   / Pro / Business / Enterprise).
2. **Wildcard SSL availability on that tier:**
   - Pro tier and above: wildcard via Let's Encrypt DNS-01
     included.
   - Starter tier: may not support wildcards; verify and upgrade
     plan if needed.
3. **If Starter:** decide whether to upgrade to Pro (or above)
   before starting 5.2-PRE, OR to enumerate every shop subdomain
   as an individual cert (workable short term but doesn't scale
   past a handful of shops).

**Status: BLOCKING 5.2-PRE start.** Domain + subdomain
configuration work for 5.2-PRE must NOT begin until R10 lands.

### Pre-5.2-B Prerequisites

- Create Daylesford Square Developer account (developer.squareup.com,
  free, no charge).
- Acquire sandbox + production credentials.
- Store in env vars before 5.2-B starts.

---

## Section 18 — Per-Shop Subdomain Routing Model
(Adjustment 12 from v3.2)

Rationale: each shop gets a unique subdomain on lootledger.au.
Login portal lives at apex; user is redirected to their shop's
subdomain after login.

Examples:
- `lootledger.au` → marketing + login portal
- `ballarat.lootledger.au` → Daylesford-Ballarat instance
- `{shop-slug}.lootledger.au` → any shop's instance
- `admin.lootledger.au` → super-admin panel

### 18.1 — Schema additions

Migration `0018_shop_subdomains.sql`, bundled into 5.2-PRE:

```sql
ALTER TABLE shops ADD COLUMN subdomain text UNIQUE;
ALTER TABLE shops ADD CONSTRAINT subdomain_format
  CHECK (subdomain ~* '^[a-z0-9]{1,32}$');
```

Format constraint: lowercase alphanumeric ONLY. No hyphens. No
underscores. No periods. 1-32 chars. Justification: aligns with
the auto-generation rule in §18.4 below, which produces only
[a-z0-9].

### 18.2 — Reserved subdomain words

Rejected at signup; case-insensitive comparison after sanitization:

```
admin, api, www, auth, mail, smtp, ftp, blog, app,
help, support, status, dev, staging, test, demo,
docs, secure, login, signup, dashboard, root, mx,
cpanel, webmail, ns1, ns2
```

### 18.3 — Routing logic (LootLedger app)

On every page load:
1. Read `window.location.hostname`.
2. If hostname === `lootledger.au`: render login or marketing.
3. If hostname is `*.lootledger.au`:
   a. Extract subdomain.
   b. If subdomain is in reserved list: route to corresponding
      handler (admin, api, etc.) NOT shop lookup.
   c. Look up `shops` where `subdomain = extracted`.
   d. If found: render shop instance with `shop_id` from lookup.
   e. If not found: redirect to `lootledger.au` with error
      parameter `?subdomain_not_found=<name>`.

Auth flow:
- Login at apex (`lootledger.au/login`).
- On successful login, app determines user's `shop_id` from
  `auth.uid()` → `users` table → `shops.subdomain`.
- 302 redirect to `https://{subdomain}.lootledger.au/`.
- Session cookie domain `.lootledger.au` carries auth.
- Logout from any subdomain → clear session → redirect to
  `lootledger.au`.

### 18.4 — OAuth callback URLs (CRITICAL for 5.2-B/C/G/H)

Pattern: ALL OAuth callbacks land at apex.

```
https://lootledger.au/oauth/square/callback
https://lootledger.au/oauth/xero/callback
https://lootledger.au/oauth/myob/callback
https://lootledger.au/oauth/quickbooks/callback
```

Implementation:
- Outbound OAuth request includes a `state` parameter carrying
  the originating subdomain (e.g. `state=base64({subdomain:'ballarat',nonce:'...'})`).
- Provider redirects back to apex callback with `state` intact.
- Apex callback handler decodes state, exchanges code for tokens,
  stores tokens encrypted (per Section 7 schema), then 302
  redirects to `{subdomain}.lootledger.au` with success flag.

This way each provider's OAuth app has ONE callback URL configured,
working for all shops.

### 18.5 — Subdomain Assignment Policy

Sanitization rule (applied to any candidate before uniqueness
check):
- Convert to lowercase.
- Remove all accents (NFD decompose, strip combining marks).
  E.g. "Café d'Or" → "Cafe d'Or".
- Remove all characters EXCEPT [a-z0-9].
- Truncate to 32 characters maximum.
- Reject if result is empty or in reserved list.

Auto-generation precedence at signup:

**Tier 1 — Location.**
If shop has a city/location captured (e.g. "Ballarat"), sanitize
it: "Ballarat" → "ballarat". Try this as the subdomain.
If unique AND not reserved → assign and done.

**Tier 2 — Business name.**
If location is taken OR no location available: sanitize the
business name. Examples:
- "Second Hand Trove" → "secondhandtrove"
- "Daylesford Gold Trades" → "daylesfordgoldtrades"
- "Bob's 24/7 Gold" → "bobs247gold"
- "Café d'Or" → "cafedor"

Try this as the subdomain. If unique AND not reserved → assign
and done.

**Tier 3 — Numeric suffix.**
If both Tier 1 and Tier 2 candidates are taken OR reserved,
append a numeric suffix to the Tier 2 candidate:
`secondhandtrove2`, `secondhandtrove3`, etc. Try in increasing
order until a unique slot is found.

If sanitized name + suffix exceeds 32 chars, truncate the name
component to fit (e.g. "areallylongbusinessnamethat" + "2" = 28
chars, OK; "areallylongbusinessnamethatgoesover32" + "2" truncates
the name to 30 chars first).

**Tier 4 — Owner override (optional, not auto).**
Owner can manually pick a custom subdomain at signup if they
don't like the auto-generated one, subject to the same
uniqueness/reserved/format validation. Only allowed within first
7 days of shop creation; after that, admin assistance required.

Examples:
- Shop 1: "Daylesford Gold Trades" in Daylesford
  (platform-owner's own shop)
  → Tier 1: "daylesford" → unique → assigned.
- Shop 2: shop in Ballarat
  (platform-owner's boss's shop)
  → Tier 1: "ballarat" → unique → assigned.
- Shop 3: "Second Hand Trove" in Ballarat (hypothetical)
  → Tier 1: "ballarat" → TAKEN.
  → Tier 2: "secondhandtrove" → unique → assigned.
- Shop 4: another "Second Hand Trove" elsewhere (hypothetical)
  → Tier 1: their location → assume taken.
  → Tier 2: "secondhandtrove" → TAKEN.
  → Tier 3: "secondhandtrove2" → unique → assigned.
- Shop 5: "Admin Gold" anywhere (hypothetical)
  → Tier 1: their location → assume available.
  → "admin" RESERVED → skip.
  → Tier 2: sanitized "admingold" → if unique → assigned.

### 18.6 — Conflict detection

All checks are case-insensitive (subdomains stored lowercase
only). Race condition handled at DB level via UNIQUE constraint
on `shops.subdomain` — two simultaneous signups can't grab the
same slot.

### 18.7 — Subdomain change policy

Owner can edit subdomain ONCE within 7 days of shop creation
(changes break old bookmarks but new URL gets a 302 redirect
from old subdomain for 30 days). After 7 days: admin must
approve change. All changes logged to `audit_log`.

### 18.8 — Existing data migration (TWO SHOPS at launch)

The platform launches with TWO existing shops to migrate from
lootledger.netlify.app to their respective subdomains. Both
subdomains are LOCKED via Tier 4 owner-override at migration
time, bypassing Tier 1 auto-generation (even though Tier 1
would have produced the same result — explicit override is for
migration audit trail).

**Shop 1 — Daylesford (platform-owner's own shop):**
- `shops.subdomain = 'daylesford'`
- URL: `daylesford.lootledger.au`

**Shop 2 — Ballarat (platform-owner's boss's shop):**
- `shops.subdomain = 'ballarat'`
- URL: `ballarat.lootledger.au`

**Migration execution:**
- 5.2-PRE migration script applies subdomain values directly
  via INSERT/UPDATE on `shops` table; no Tier 1–3 cascade is
  invoked for these two rows.
- Each shop's owner (platform-owner for Daylesford; platform-
  owner's boss for Ballarat) must re-login on the new domain
  (one-time disruption per owner).
- Document this in handover doc + migration runbook.

**Subscription state at migration (data-only; no enforcement
logic in Phase 5.2):**

- Daylesford (platform-owner's own shop):
  `shops.subscription_plan = 'platform_exempt'`
  `shops.trial_started_at = NULL`

- Ballarat (platform-owner's boss's shop):
  `shops.subscription_plan = 'trial'`
  `shops.trial_started_at = <migration date>`

No banners, no countdown UI, no payment integration in Phase
5.2. These two columns exist purely to record state that Phase
5.5 (subscription billing system) will build enforcement on
top of.

Schema additions for migration `0018_shop_subdomains.sql`
(subscription columns added alongside subdomain column):

```sql
ALTER TABLE shops ADD COLUMN subscription_plan text DEFAULT 'trial';
ALTER TABLE shops ADD COLUMN trial_started_at timestamptz;
```

---

## Section 19 — Remaining Open Questions

NONE BLOCKING IMPLEMENTATION.

All previous Q1-Q6 resolved:
- Q1: ZD411 plugged into Square. LootLedger needs own printer.
- Q2: Bank transfer primary. ABA must be fast.
- Q3: Production Supabase region — defer to end-of-project.
- Q4: Order: A → E → B → D → F → C → G → H.
- Q5: Daylesford has no Xero/MYOB/QB. Path C — internal ledger
  default, all three providers optional.
- Q6: Square Developer account — addressed in Pre-5.2-B
  Prerequisites above.

---

## Section 20 — Deferred / Out of Scope

Out of Phase 5.2:
- $2k cash hard-block toggle (Phase 4 deferred).
- Carat-sell bug (Phase 3 deferred).
- peekInv/makeInv migration cleanup (Phase 5 cleanup).
- Default-range Settings field for accounting export.
- formatDateTimeLong helper.
- Sophiie integration with Phase 5.2 features (post-launch).
- Multi-dealer admin tools (Stage 8).
- Xero Bill Pay (Crezco) when AU support arrives.
- MYOB Bill Pay equivalent (when/if available).
- QuickBooks bill payment automation (when/if available).
- Reconciliation rule creation in any provider.

Removed from "deferred" in v3:
- MYOB integration (now in 5.2 as 5.2-G).
- QuickBooks Online integration (now in 5.2 as 5.2-H).

---

## v3 Locked Adjustments Summary

For quick reference — the five adjustments that locked v3 over the
draft:

1. **File tree:** `src/lib/integrations/accounting/` (matches existing
   `integrations/` convention).
2. **Idempotency:** Single shared `provider_sync_log` table at
   abstraction layer (5.2-F). Schema in Section 12.
3. **Migration numbering:** `0016_provider_sync_log.sql`,
   `0017_internal_bills.sql`.
4. **Mock toggles:** Two orthogonal toggles preserved + "Mock all"
   convenience button in Settings.
5. **Pre-5.2-B prerequisites:** Daylesford Square Developer account
   created and credentials in env vars before 5.2-B starts.

## v3.1 Locked Adjustments Summary (2026-05-10)

Nine recon-driven adjustments applied after the R1-R8 recon batch:

1. **Xero two-call** (Section 8): replace "atomic Bill+Payment" with
   "two-call sequence + pending_payment state machine + retry +
   user-prompted failure." Step 1 POST /Invoices, Step 2 POST
   /Payments. On Step 2 failure: void Bill via Status=VOIDED.
2. **pgcrypto only** (Sections 7/8/9/10): replace all "Vault if
   available" wording with pgcrypto column-level. Schema includes
   `encrypted_token`, `encrypted_refresh`, `key_version`,
   `encrypted_at`. Master key in Edge Function secret. Decryption
   only inside Edge Function or SECURITY DEFINER RPC.
3. **Square two-call pattern** (Section 7): explicit Catalog upsert
   → BatchChangeInventory sequence per net-new SKU, with
   partial-failure recovery via `provider_sync_log`.
4. **Drop "real-time"** (Section 7): replaced with "near real-time,
   sub-60s typical via webhooks, no published SLA."
5. **MYOB research-blocked** (Section 9): four data points
   (rate limits, AccountRight EOL, TaxCode endpoint URL, OAuth URLs)
   require authenticated my.MYOB portal access. 5.2-G on hold
   until R9 lands.
6. **MYOB priority** (Sections 9 + 4.3 + 16): no clearly-free MYOB
   Square connector exists; MYOB-direct API integration is
   essential for MYOB-using dealers.
7. **Re-sequence H before G** (Section 16): order is now A → E → B
   → D → F → C → H → G. QBO better-documented than MYOB; building
   H second validates the AccountingProvider abstraction against a
   clean API before tackling MYOB's quirks.
8. **Weight-bucket SKU strategy** (Section 7): catalog items are
   PURITY-KEYED (~10-15 items per dealer), weight stored as
   inventory quantity. Steady-state per buy is 1 API call, not 2.
   Avoids catalog blow-up.
9. **R9 added** (Section 17): MYOB authenticated dev portal lookup
   is a USER task (~30 min), BLOCKING 5.2-G start.

## v3.2 Locked Adjustments Summary (2026-05-10)

Five adjustments locked over v3.1 — domain migration scope plus
audit pass:

11. **Domain migration with per-shop subdomains** (Section 16,
    new sub-phase **5.2-PRE** prepended). New sub-phase order:
    PRE → A → E → B → D → F → C → H → G. Tasks: Netlify apex +
    wildcard `*.lootledger.au`, AU-registrar DNS records,
    Let's Encrypt DNS-01 wildcard cert (Pro tier+), 301
    redirects from lootledger.com.au / lootledger.net /
    lootledgr.au / lootledgr.com.au / lootledgr.netlify.app,
    Supabase auth allowed-redirect URLs + cookie-domain
    `.lootledger.au`, SMTP2GO sender → `noreply@lootledger.au`.
12. **Per-shop subdomain routing model** (new **Section 18**;
    existing §18 → §19 and §19 → §20). Schema migration
    `0018_shop_subdomains.sql` adds `shops.subdomain` UNIQUE
    column with CHECK `[a-z0-9]{1,32}`. Reserved-words list
    (admin/api/www/etc.) rejected at signup. Routing logic
    extracts subdomain from hostname, looks up `shop_id`, falls
    back to apex on miss. OAuth callbacks land at apex with
    `state` parameter carrying originating subdomain — one
    callback URL per provider, works for all shops.
    Subdomain-assignment policy: Tier 1 location → Tier 2
    business name → Tier 3 numeric suffix → Tier 4 owner
    override (within first 7 days). Subdomain change policy:
    once within 7 days self-serve, admin-approved after. All
    changes audit-logged.
    Two-shop migration topology locked: Daylesford (platform-
    owner's own shop) and Ballarat (platform-owner's boss's
    shop) both onboard at 5.2-PRE with explicit Tier 4
    owner-override subdomains. Auto-generation Tier 1 would
    have produced the same values; explicit override exists
    for migration audit trail.
13. **Cross-platform browser support** (new **Section 6.0**,
    inserted before 6.1). Approach A confirmed: browser-only
    every platform; PWA (Stage 8) and native (Stage 9)
    deferred. Hardware peripheral support varies by platform —
    abstraction layer detects platform and falls back to most-
    compatible driver. Square Reader / Terminal card-reader
    integration explicitly OUT of Phase 5.2 scope.
14. **R10 — Netlify wildcard SSL availability** (Section 17,
    new recon row). USER task (~5 min). Verify production
    site's Netlify plan tier supports Let's Encrypt DNS-01
    wildcard. Pro tier+ included; Starter may require upgrade.
    BLOCKING 5.2-PRE start.
15. **Deferred items audit** (memory/project_deferred_items.md).
    All v3.1 items confirmed still scheduled. Items added /
    re-confirmed: default-range Settings field, formatDateTimeLong
    helper, Sophiie ↔ 5.2 integration, multi-dealer admin tools
    (Stage 8), Xero / MYOB / QuickBooks Bill Pay equivalents,
    reconciliation rule creation in any provider, production
    Supabase region migration (end-of-project), R10 (NEW), PWA
    wrapper (Stage 8), native iOS/Android wrappers (Stage 9),
    Square Reader / Terminal card-reader (post-launch, Stage
    8+), subdomain change-after-7-days admin approval flow
    (post-5.2-PRE if not implemented inline). No items removed.
16. **Two-merchant Square architecture confirmed.** Daylesford
    and Ballarat are separate Square merchant accounts at
    launch. Architecture already supported this; §7.1 added to
    make the boundary explicit.

    **Subscription state at migration locked (data-only).**
    Daylesford = `platform_exempt`. Ballarat = `trial`. Schema
    adds `subscription_plan` + `trial_started_at` columns to
    `shops` table. NO enforcement logic, banners, billing, or
    payment integration in Phase 5.2 — these columns are
    purely state markers for Phase 5.5 (subscription billing
    system) to build on.
