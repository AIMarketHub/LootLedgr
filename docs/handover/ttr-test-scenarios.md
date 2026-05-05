# TTR test scenarios

Manual verification scenarios for the Stage 1.C TTR audit fix in `src/lib/compliance/au.js`. No jest/vitest is wired into this project; run these by hand against the dev SaaS until a test framework lands.

The function under test is `isTtrRequired({currentCashAmount, priorCashIn24h, ttrEnabled})` plus the `loadCashTotal24h(clientId)` loader in `src/lib/storage.js`. Each scenario describes the user-visible setup and the expected outcome.

## Single-transaction scenarios (no aggregation needed)

These probe Rules 1 and 2 (cash-only + mixed-payment). No prior-tx data required; create the tx and check the History row's TTR badge after finalize.

| # | Setup | Expected |
|---|---|---|
| 1 | Pure cash buy, $10,000 | TTR ✓ |
| 2 | Pure cash buy, $9,999 | no TTR |
| 3 | Pure EFTPOS buy, $10,000 | no TTR (rule 1 — cash only) |
| 4 | Pure card-online buy, $20,000 | no TTR |
| 5 | Pure bank-EFT buy, $50,000 | no TTR |
| 6 | Pure crypto buy, $15,000 | no TTR |
| 7 | Pure Stripe buy, $12,000 | no TTR |
| 8 | Sell-side $10,000 cash (we pay client) | no TTR — TTR is a buy concept; sells are reported via different mechanisms |

The data model carries a single `tx.payment` string per transaction, so true mixed-payment splits aren't supported by the in-app finalize today. `cashAmountFromTx()` honours `tx.payments[]` (an array of `{method, amount}`) when it lands; until then, mixed-payment scenarios are tracked via the prose-only acknowledgement in the AML/CTF Program Section 5.

| # | Setup (future, when payments[] lands) | Expected |
|---|---|---|
| 9 | $15k tx with `payments=[{method:"cash",amount:5000},{method:"eftpos",amount:10000}]` | no TTR (cash portion $5k) |
| 10 | $11k tx with `payments=[{method:"cash",amount:11000}]` | TTR ✓ |
| 11 | $12k tx with `payments=[{method:"cash",amount:9000},{method:"eftpos",amount:3000}]` | no TTR (cash portion $9k) |

## 24-hour aggregation scenarios (rule 3)

Requires creating multiple transactions for the same client. Use a single test client (the ClientSearch dedupe will pick them up automatically once they have an idNumber).

Setup notes:
- Aggregation is computed at finalize. The live step-2 banner doesn't show prior-cash bonus; the History row's TTR badge is the authoritative read.
- Each scenario assumes `settings.ttrEnabled` is true (default).
- The loader filters on `data->>'payment' = 'cash'`, so a non-cash prior tx won't aggregate.

| # | Today | Yesterday (within 24h) | 25+ hours ago | Expected for *today* |
|---|---|---|---|---|
| 12 | $6,000 cash | $5,000 cash | — | TTR ✓ — current $6k + prior $5k = $11k ≥ $10k |
| 13 | $6,000 cash | $5,000 EFTPOS | — | no TTR — prior wasn't cash, doesn't aggregate |
| 14 | $6,000 cash | — | $5,000 cash | no TTR — prior cash is outside the 24h window |
| 15 | $9,999 cash | $1 cash | — | TTR ✓ — sum is exactly $10,000 |
| 16 | $9,000 cash | $500 cash + $500 cash | — | TTR ✓ — both prior txs aggregate |
| 17 | $10,000 cash | — | — | TTR ✓ (single-tx, rule 1 trips first) |
| 18 | $4,000 cash | $5,999 cash | — | no TTR — sum $9,999 |
| 19 | $4,000 cash | $5,999 cash today, then $4,000 cash today, then a NEW $4,000 cash | — | TTR ✓ on the LAST one — at finalize prior aggregates to $9,999 + the in-progress $4,000 = $13,999 |
| 20 | $5,000 EFTPOS | $5,000 cash | — | no TTR on today's tx — current cash is 0; rule 3 only aggregates against cash transactions where the current tx is also cash |

Note 20: `isTtrRequired` returns `required: false` whenever `currentCashAmount === 0`. That's intentional — TTR is a *cash transaction* obligation. A prior cash bolus should not retroactively impose a TTR on a fresh non-cash transaction.

## Aggregation under shop / client edge cases

| # | Setup | Expected |
|---|---|---|
| 21 | $6k cash today, $5k cash yesterday from a DIFFERENT client | no TTR — aggregation is per-clientId |
| 22 | $6k cash today from anonymous customer (no clientId), $5k cash yesterday from a real client | no TTR — `loadCashTotal24h(undefined)` returns 0 |
| 23 | $6k cash today, $5k cash yesterday from the same client BUT recorded under a previous shop_id (shouldn't happen post-Stage-1.A) | no TTR from this shop's POV — RLS / shop_id scope filters the prior cash out |

## Failure modes (loader returns 0)

The loader is defensive: any failure path returns 0, so the synchronous TTR check (rule 1 + rule 2 on the in-progress tx alone) is the floor. These scenarios should not produce a TTR for a sub-threshold current cash amount even under failure.

| # | Failure | Expected |
|---|---|---|
| 24 | Supabase unreachable at finalize | no TTR (assuming current tx is sub-threshold) — loader returns 0; rule 1+2 still checked |
| 25 | RLS blocks the loader query | no TTR (sub-threshold) — same path |
| 26 | `getCurrentShopId()` returns the `__no_shop__` sentinel | loader returns 0 (the WHERE shop_id = '__no_shop__' matches nothing) |

## Display verification

After running each scenario, confirm:
- History row shows the TTR PENDING badge when expected.
- ClientDetail Transaction History list shows the TTR badge.
- Receipt preview includes the TTR REQUIRED block.
- The Settings → AML/CTF Program "trial expiring" / metric counts (if relevant) remain consistent.

If the AdminPanel or any other surface displays TTR-related stats, add the count to the verification list when those screens evolve.
