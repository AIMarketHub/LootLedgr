# TFS matcher — test scenarios

Manual verification scenarios for the TFS match engine in `src/lib/tfs/matcher.js`. No jest/vitest is wired into this project; run these by hand against the dev SaaS until a test framework lands.

The function under test is `screenCustomer({name, dob, citizenship}, tfsList)` and its constituent helpers (`findCandidateMatches`, `matchesDob`, `matchesCitizenship`). Each scenario describes the customer input, the relevant DFAT entry shape, and the expected severity assignment.

## Severity reference

For quick recall while reading the scenarios:

| Name match | DOB match | Citizenship | Severity |
|---|---|---|---|
| ≤ 2 (Lev or substring) | match | match | **HIGH** |
| ≤ 2 | match | not_provided / inconclusive | **MEDIUM** |
| ≤ 2 | match | no_match (explicit different) | **MEDIUM** *(conservative — not in spec)* |
| ≤ 2 | inconclusive | * | **LOW** |
| ≤ 2 | no_match | * | **SKIP** *(dropped from results)* |
| > 2 / no substring | * | * | **SKIP** *(not even a candidate)* |

UI in Commit 3 raises a red banner for HIGH or MEDIUM. LOW is returned but only for `tfs_screen_log` audit — no banner.

## How to run

In the browser console after the cache has synced:

```js
const {getCachedTfsList} = await import('/src/lib/tfs/storage.js');
const {screenCustomer} = await import('/src/lib/tfs/matcher.js');
const list = await getCachedTfsList();

// Run a scenario
screenCustomer({name: 'John Smith', dob: '1980-01-01', citizenship: 'Australia'}, list);
```

## Scenarios

These use composite cases — pick a real entry from `tfs_list` to plug into each scenario rather than hard-coding sanctioned names in this doc. The DFAT list is updated regularly so any specific name here would go stale; the principle each scenario tests is what matters.

### Group A — Name + DOB exact match

| # | Setup | Expected |
|---|---|---|
| 1 | Customer name + DOB exactly match a Primary Name entry whose `dob_parsed.type === 'exact'` and the `dates[0]` === customer's ISO DOB. Citizenship matches the entry's citizenship. | `severity: "high"`, `dobMatch: "match"`, `citizenshipMatch: "match"`, `matchedVia: "primary"`, `nameDistance: 0` |
| 2 | Same as #1 but customer hasn't entered citizenship yet (passed as `""` or omitted). | `severity: "medium"`, `citizenshipMatch: "not_provided"` |
| 3 | Same as #1 but entry has no `citizenship` column populated (common for Entity / Vessel rows). | `severity: "medium"`, `citizenshipMatch: "inconclusive"` |
| 4 | Same as #1 but customer's stated citizenship is explicitly different from entry's citizenship. | `severity: "medium"`, `citizenshipMatch: "no_match"` *(conservative resolution; not in spec)* |

### Group B — Name match, DOB year-only

| # | Setup | Expected |
|---|---|---|
| 5 | Customer name matches a Primary Name entry exactly. Entry has `dob_parsed.type === 'multiple'` with `years: [1980]` (no specific date). Customer's DOB is 1980-04-15. Citizenship matches. | `severity: "high"`, `dobMatch: "match"` (year hit) |
| 6 | Same as #5 but customer's DOB is 1981-04-15 (different year). | **SKIP** — `dobMatch: "no_match"`, candidate dropped from `screenCustomer` result. |
| 7 | Customer name + DOB year fall within a `dob_parsed.type === 'range'` entry's `yearsRange: [1960, 1966]`. Customer DOB 1963-06-01. Citizenship matches. | `severity: "high"`, `dobMatch: "match"` |
| 8 | Same as #7 but customer year is 1959 (just outside the range). | **SKIP** — `dobMatch: "no_match"` |

### Group C — Alias match rolling up to primary

| # | Setup | Expected |
|---|---|---|
| 9 | Customer name matches an `Alias` row (Name Type = "Alias") for some primary reference. The corresponding Primary Name row's DOB matches the customer's DOB. Citizenship matches. | `severity: "high"`, `matchedVia: "alias"`, `primaryRecord` is the canonical Primary Name row, `aliases[]` includes the matched alias row. |
| 10 | Customer name matches an `Original Script` row (Name Type = "Original Script"). DOB matches via the primary's DOB. Citizenship not provided. | `severity: "medium"`, `matchedVia: "original_script"` |

### Group D — Fuzzy / transliteration

| # | Setup | Expected |
|---|---|---|
| 11 | Customer name "Mohammed Khan", entry primary is "Mohammad Khan". DOB matches. Citizenship matches. | `severity: "high"`, `nameDistance: 1` (Levenshtein 1: e/a substitution), `matchedVia: "primary"` |
| 12 | Customer name "Zhang Wei", entry primary is "Jang Wei". (After phonetic fold zh→j, both normalise to "jang wei".) DOB matches. | `severity: "high"`, `nameDistance: 0` (post-fold equality) |
| 13 | Customer name "John Smith", entry primary is "John Q Smith" (longer name). Substring path: customer's normalized name is a substring of entry's normalized name. DOB matches. | `severity: "high"`, `nameDistance: 2` (substring tier) |
| 14 | Customer name "Müller", entry primary is "Muller". NFD ASCII fold makes them equal. DOB matches. | `severity: "high"`, `nameDistance: 0` |

### Group E — DOB inconclusive (LOW)

| # | Setup | Expected |
|---|---|---|
| 15 | Customer name matches an entry whose DOB column is empty / "Not known". `dob_parsed.type === "unknown"`. Customer DOB provided. | `severity: "low"`, `dobMatch: "inconclusive"`. Returned for `tfs_screen_log` audit; UI does NOT flag. |
| 16 | Customer has no DOB on file (e.g. captured via paper-only ID workflow), entry has a real DOB. | `severity: "low"`, `dobMatch: "inconclusive"` |
| 17 | Both customer DOB and entry DOB are unknown. | `severity: "low"`, `dobMatch: "inconclusive"` |

### Group F — False positive avoidance (SKIP)

| # | Setup | Expected |
|---|---|---|
| 18 | Customer "John Smith" born 1985-03-12, entry "John Smith" with `dob_parsed.type === 'exact'` and `dates: ['1962-04-22']`. Different specific date with the same name. | **SKIP** — `dobMatch: "no_match"`. Candidate dropped; not surfaced in UI, not logged at any level. |
| 19 | Customer "Bob" (3 chars) vs an entry "Bob Jones". Substring path requires both sides ≥ 4 chars; Levenshtein distance is 6. | **SKIP** — not even a candidate (`findCandidateMatches` returns empty). |
| 20 | Customer "Ali", an entry "Mohamed Bin Ali Al Qaeda" (alias). Same 4-char substring floor blocks the substring path. Levenshtein distance is well above 2. | **SKIP** — not a candidate. *(Without the floor, every customer with "Ali" anywhere in their name would light up. The floor is essential at 10k+ entries.)* |

### Group G — Empty / defensive

| # | Setup | Expected |
|---|---|---|
| 21 | `screenCustomer({}, list)` (no name). | `[]` — empty result. |
| 22 | `screenCustomer({name: "Some name"}, [])` (empty list). | `[]` — empty result. |
| 23 | `screenCustomer({name: "Some name"}, null)` (null list). | `[]` — graceful fallback. |
| 24 | Customer name with only whitespace and punctuation (e.g. `"... ---"`). After normalisation, empty string. | `[]` — empty result; `findCandidateMatches` short-circuits on empty normalised name. |

## Display verification (after Commit 3 lands)

Once the NewTx integration is in place, confirm:

- HIGH severity matches surface a red `⚠️ POSSIBLE SANCTIONS MATCH` banner above the transaction body.
- MEDIUM severity matches surface the same banner with copy that prompts staff to ask for citizenship.
- LOW severity matches do NOT surface a banner but DO write a row to `tfs_screen_log` with `matched: true`.
- SKIP cases (DOB no_match) write nothing — they're treated identically to a clean screen.
- The TfsMatchModal renders all primary fields (name, DOB raw + parsed, citizenship, place of birth, address, additional info, listing instrument, sanctions flags) plus all matching aliases for the primary.

## Performance notes

- The matcher iterates the full cache (~10k entries) on every screen call. With Levenshtein early-exit at threshold 2 and the substring length floor, worst case is ~9M operations on 30-char strings — runs <100 ms in modern JS.
- Re-screening on every keystroke is feasible in principle, but Commit 3 will wait for blur (or a debounced 200ms idle) so we don't burn CPU mid-typing.
- The cache is kept in-memory by the App after first load; the IDB read happens once at app boot.
