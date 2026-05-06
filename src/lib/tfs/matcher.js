// LootLedger — TFS match engine.
//
// Pure module — no React, no Supabase, no IndexedDB. Takes a
// customer (name, dob, citizenship) plus an in-memory snapshot of
// tfs_list (loaded by the caller from the IndexedDB cache) and
// returns a structured array of candidate matches with severity
// assignments.
//
// The match pipeline:
//
//   1. Normalize the customer's name (same normalizeName the
//      parser used to populate tfs_list.name_normalized — must
//      stay in lockstep so the comparison is apples-to-apples).
//   2. Find candidate entries: Levenshtein distance ≤ 2 OR a
//      substring match in either direction. The substring path
//      catches cases Levenshtein doesn't, like a customer "John
//      Smith" matching an entry "John Quincy Smith".
//   3. Group hits by primary_reference. An alias hit surfaces the
//      primary record so the staff sees the canonical entry, not
//      an alias spelling.
//   4. For each candidate, evaluate DOB and citizenship against
//      the primary record. Compute a severity.
//
// Severity decision (per the resume-Commit-2 spec table)
// ======================================================
//
//   HIGH    name match (distance ≤ 2 or substring) AND DOB match
//           AND citizenship explicitly matches → block transaction.
//   MEDIUM  name + DOB match, citizenship not_provided OR
//           inconclusive → prompt staff to ask the customer.
//   MEDIUM  name + DOB match, citizenship explicitly different
//           → not specified by the spec; resolved conservatively
//           as MEDIUM (sanctions evaders sometimes claim
//           different citizenships, and the cost of a false
//           negative is criminal liability). Staff can override
//           via the "Different person" PIN path in Commit 3 if
//           they're confident.
//   LOW     name match, DOB inconclusive (entry has no DOB on
//           file, or customer's DOB unknown) — entry is surfaced
//           for audit but does NOT raise a UI flag.
//   SKIP    name match BUT DOB explicitly different → likely a
//           false positive (different person with the same name).
//           Not returned by screenCustomer at all.
//   SKIP    no name match (Levenshtein > 2 and no substring) →
//           not even reached by findCandidateMatches.
//
// The UI in Commit 3 raises a red banner for HIGH or MEDIUM. LOW
// results are returned by screenCustomer (so the caller can log
// them to tfs_screen_log for audit) but the UI treats them as
// non-blocking.

// Imports from ./normalize.js (NOT ./parser.js) on purpose —
// matcher is loaded into the dealer-facing App chunk; parser.js
// statically imports xlsx (~115 kB gzipped) which we don't want
// in that chunk. parser.js re-exports these helpers for callers
// that prefer the historical entry point.
import {normalizeName} from "./normalize.js";

// Levenshtein distance with early-exit on threshold. Returns the
// distance if ≤ maxDistance, otherwise returns maxDistance + 1
// (signal for "too far"). The early exit lets us bail out of
// long-running comparisons when we already know the candidate
// won't qualify.
//
// Standard iterative two-row implementation; O(min(m,n)) memory.
function levenshtein(a,b,maxDistance){
  if(a===b)return 0;
  const m=a.length,n=b.length;
  if(Math.abs(m-n)>maxDistance)return maxDistance+1;
  if(!m)return n;
  if(!n)return m;
  // Ensure a is the shorter string for memory efficiency.
  if(m>n){const t=a;a=b;b=t;}
  const la=a.length,lb=b.length;
  let prev=new Array(la+1);
  let curr=new Array(la+1);
  for(let i=0;i<=la;i++)prev[i]=i;
  for(let j=1;j<=lb;j++){
    curr[0]=j;
    let rowMin=curr[0];
    const bj=b.charCodeAt(j-1);
    for(let i=1;i<=la;i++){
      const cost=a.charCodeAt(i-1)===bj?0:1;
      const del=prev[i]+1;
      const ins=curr[i-1]+1;
      const sub=prev[i-1]+cost;
      curr[i]=del<ins?(del<sub?del:sub):(ins<sub?ins:sub);
      if(curr[i]<rowMin)rowMin=curr[i];
    }
    if(rowMin>maxDistance)return maxDistance+1;
    const t=prev;prev=curr;curr=t;
  }
  return prev[la];
}

// Score a candidate's normalized name against the customer's
// normalized name. Returns:
//   0   — exact match
//   1   — Levenshtein distance 1
//   2   — Levenshtein distance 2 OR substring match (treated as
//          "fuzzy" tier)
//   -1  — no match (caller should skip)
//
// The 4-character minimum on the substring path skips footguns
// like a tfs entry "Ali" matching every customer with "Ali"
// anywhere in their normalized name. With 10k+ entries on the
// list, that path lights up too many false positives to be
// useful unless gated.
function nameMatchScore(customerNorm,entryNorm){
  if(!customerNorm||!entryNorm)return -1;
  if(customerNorm===entryNorm)return 0;
  // Substring path — only for non-trivial lengths on both sides.
  if(customerNorm.length>=4&&entryNorm.length>=4){
    if(customerNorm.includes(entryNorm)||entryNorm.includes(customerNorm))return 2;
  }
  const d=levenshtein(customerNorm,entryNorm,2);
  if(d<=2)return d;
  return -1;
}

// Turn an entry's name_type into the matchedVia tag the UI uses.
function viaFromNameType(nt){
  const s=String(nt||"").toLowerCase();
  if(s.includes("primary"))return "primary";
  if(s.includes("alias"))return "alias";
  if(s.includes("original"))return "original_script";
  return "primary";
}

// Step 1+2+3 of the pipeline. Iterate the list, score each entry,
// group by primary_reference. Returns an array of candidate
// objects:
//   { primaryRecord, aliases, matchedVia, nameDistance }
// One candidate per primary_reference, even if multiple aliases
// for the same primary all hit (they roll up to one card in the
// UI).
export function findCandidateMatches(customerName,tfsList){
  const customerNorm=normalizeName(customerName);
  if(!customerNorm||!Array.isArray(tfsList)||!tfsList.length)return [];

  const groups=new Map();
  for(const entry of tfsList){
    if(!entry||!entry.name_normalized)continue;
    const score=nameMatchScore(customerNorm,entry.name_normalized);
    if(score<0)continue;

    const primaryRef=entry.primary_reference||entry.reference;
    if(!primaryRef)continue;
    let g=groups.get(primaryRef);
    if(!g){g={hits:[],bestScore:Infinity,bestVia:null};groups.set(primaryRef,g);}
    g.hits.push(entry);
    if(score<g.bestScore){
      g.bestScore=score;
      g.bestVia=viaFromNameType(entry.name_type);
    }
  }

  const candidates=[];
  for(const[primaryRef,g]of groups){
    // Surface the canonical primary record. Order of preference:
    //   1. A "Primary Name" row in the matched hits with reference
    //      === primaryRef (the canonical name with ID metadata).
    //   2. Any "Primary Name" row in the full list with that ref
    //      (e.g. only an alias hit but the primary is in the list).
    //   3. Fall back to the first hit (graceful degrade — the row
    //      still carries the metadata, just not the canonical name).
    let primary=g.hits.find(e=>/primary/i.test(String(e.name_type||""))&&e.reference===primaryRef);
    if(!primary)primary=tfsList.find(e=>/primary/i.test(String(e.name_type||""))&&e.reference===primaryRef);
    if(!primary)primary=g.hits[0];
    const aliases=g.hits.filter(e=>e!==primary);
    candidates.push({
      primaryRecord:primary,
      aliases,
      matchedVia:g.bestVia,
      nameDistance:g.bestScore,
    });
  }
  return candidates;
}

// Compare a customer DOB (YYYY-MM-DD) against the structured
// dob_parsed object the parser produced for the entry. Returns
// 'match', 'no_match', or 'inconclusive'.
//
// For 'exact' entries: the customer's full date must appear in
// the entry's dates array. A year-only match is NOT treated as a
// match here — the entry already committed to a specific date,
// so a different day on the same year is a real mismatch.
//
// For 'range' entries: the customer's year falls inside the
// inclusive yearsRange.
//
// For 'multiple' entries: customer's full date is in dates OR
// customer's year is in years.
//
// For 'unknown' entries (DFAT didn't supply a parseable DOB):
// returns 'inconclusive' — caller should escalate based on
// other signals.
export function matchesDob(customerDob,dobParsed){
  if(!customerDob)return "inconclusive";
  if(!dobParsed||typeof dobParsed!=="object"||dobParsed.type==="unknown")return "inconclusive";

  const m=String(customerDob).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(!m)return "inconclusive";
  const customerYear=parseInt(m[1],10);

  if(dobParsed.type==="exact"){
    if(Array.isArray(dobParsed.dates)&&dobParsed.dates.includes(customerDob))return "match";
    if(!Array.isArray(dobParsed.dates)||!dobParsed.dates.length)return "inconclusive";
    return "no_match";
  }

  if(dobParsed.type==="range"){
    if(Array.isArray(dobParsed.yearsRange)&&dobParsed.yearsRange.length===2){
      const start=dobParsed.yearsRange[0],end=dobParsed.yearsRange[1];
      if(customerYear>=start&&customerYear<=end)return "match";
    }
    return "no_match";
  }

  if(dobParsed.type==="multiple"){
    if(Array.isArray(dobParsed.dates)&&dobParsed.dates.includes(customerDob))return "match";
    if(Array.isArray(dobParsed.years)&&dobParsed.years.includes(customerYear))return "match";
    if((!Array.isArray(dobParsed.dates)||!dobParsed.dates.length)&&(!Array.isArray(dobParsed.years)||!dobParsed.years.length))return "inconclusive";
    return "no_match";
  }

  return "inconclusive";
}

// Compare customer-stated citizenship against the entry's
// Citizenship column. Substring match either direction (handles
// DFAT phrasings like "Afghanistan, citizen of" containing
// "Afghanistan"). Returns 'match', 'no_match', 'not_provided',
// or 'inconclusive'.
//
//   not_provided  customer hasn't supplied citizenship yet (the
//                  Compliance step runs the screen on name entry,
//                  before staff has asked for citizenship). The
//                  severity logic uses this to decide MEDIUM →
//                  prompt staff to ask.
//   inconclusive  entry has no citizenship column (often the case
//                  for Entity / Vessel rows).
export function matchesCitizenship(customerCit,entryCit){
  const c=String(customerCit||"").trim().toLowerCase();
  const e=String(entryCit||"").trim().toLowerCase();
  if(!c)return "not_provided";
  if(!e)return "inconclusive";
  if(c===e)return "match";
  if(c.includes(e)||e.includes(c))return "match";
  return "no_match";
}

// Decide severity from the two component matches. See module
// header for the full spec table. Returns null to signal "drop
// this candidate from the result list" (the dobMatch=no_match
// false-positive case).
function decideSeverity(dobMatch,citMatch){
  // SKIP — drop the candidate. Different person with the same
  // name; not worth surfacing.
  if(dobMatch==="no_match")return null;
  // LOW — name matched but the entry has no DOB on file (or the
  // customer's DOB is unknown). Surface for audit; UI doesn't
  // flag.
  if(dobMatch==="inconclusive")return "low";
  // dobMatch === "match" beyond this point.
  if(citMatch==="match")return "high";
  // not_provided / inconclusive / no_match all route to MEDIUM
  // → staff prompted to gather more info or override.
  return "medium";
}

// Main entry point. Run the full screen against an in-memory
// snapshot of the TFS list. Returns an array of match results.
//
// Caller (Commit 3 NewTx integration):
//   1. Loads the snapshot once at app boot via getCachedTfsList().
//   2. Calls screenCustomer() on customer-name blur and on ID
//      scan completion.
//   3. Filters the result for severity in {high, medium} to
//      decide whether to raise the red banner. Results with
//      severity 'low' are returned by screenCustomer and should
//      be logged to tfs_screen_log for audit, but the UI does
//      not flag them.
//   4. Renders TfsMatchModal with the high+medium subset so
//      staff sees every blocking-or-investigation candidate.
//
// Result shape per spec:
//   {
//     primaryRecord:    { ... full DFAT record ... },
//     aliases:          [ ... matching alias rows for this primary ... ],
//     matchedVia:       'primary' | 'alias' | 'original_script',
//     nameDistance:     0 | 1 | 2,
//     dobMatch:         'match' | 'no_match' | 'inconclusive',
//     citizenshipMatch: 'match' | 'no_match' | 'inconclusive' | 'not_provided',
//     severity:         'high' | 'medium' | 'low'
//   }
export function screenCustomer({name,dob,citizenship}={},tfsList){
  if(!name||!Array.isArray(tfsList))return [];
  const candidates=findCandidateMatches(name,tfsList);
  const results=[];
  for(const cand of candidates){
    const primaryDob=cand.primaryRecord&&cand.primaryRecord.dob_parsed;
    const primaryCit=cand.primaryRecord&&cand.primaryRecord.citizenship;
    const dobMatch=matchesDob(dob,primaryDob);
    const citMatch=matchesCitizenship(citizenship,primaryCit);
    const severity=decideSeverity(dobMatch,citMatch);
    // SKIP — decideSeverity returns null when the DOB explicitly
    // mismatches. Drop the candidate entirely so callers don't
    // surface or log it.
    if(severity==null)continue;
    results.push({
      primaryRecord:cand.primaryRecord,
      aliases:cand.aliases,
      matchedVia:cand.matchedVia,
      nameDistance:cand.nameDistance,
      dobMatch,
      citizenshipMatch:citMatch,
      severity,
    });
  }
  return results;
}

// Re-export normalizeName so callers don't need to import from
// normalize.js separately. The matcher and parser must use the
// SAME normalizer — keeping them in lockstep is essential.
export {normalizeName} from "./normalize.js";
