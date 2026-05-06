// LootLedger — DFAT TFS Consolidated List parser.
//
// =================================================================
// SECURITY BOUNDARY — read before changing the upload entry point.
// =================================================================
// This module uses the `xlsx` (SheetJS) npm package at version 0.18.5,
// which is the last published version on npm. SheetJS now distributes
// fixed releases via their CDN only. As a result, the npm version
// carries two known CVEs:
//   • GHSA-4r6h-8v6p-xvw6 — Prototype Pollution
//   • GHSA-5pgg-2g8v-p4x9 — ReDoS
//
// We accept this risk because the upload entry point
// (src/screens/admin/TfsListAdmin.jsx) is:
//   1. Admin-only (RequireAdmin route guard + RLS policy
//      tfs_list_write_admin gates the database side).
//   2. Sourced from a trusted upstream (DFAT publishes the .xlsx
//      directly; the dealer downloads it and uploads here).
//   3. Output is shape-validated against a fixed expected column
//      schema; we never accept arbitrary property names from the
//      parsed rows into the database insert.
//
// If this module is ever extended to parse user-supplied or
// untrusted input (e.g. customers uploading their own files), the
// xlsx dependency should be migrated to the CDN-distributed SheetJS
// release first, or replaced with a more conservative reader like
// read-excel-file.
// =================================================================

import * as XLSX from "xlsx";

// Expected DFAT column structure. The order of these labels matters
// for the validation step — we look them up by index after reading
// the header row to allow column reordering by DFAT in the future
// without breaking, but we'll fail loudly if any expected column is
// missing.
export const EXPECTED_COLUMNS=[
  "Reference",
  "Name of Individual or Entity",
  "Type",
  "Name Type",
  "Alias Strength",
  "Date of Birth",
  "Place of Birth",
  "Citizenship",
  "Address",
  "Additional Information",
  "Listing Information",
  "IMO Number",
  "Committees",
  "Control Date",
  "Instrument of Designation",
  "Targeted Financial Sanction",
  "Travel Ban",
  "Arms Embargo",
  "Maritime Restriction",
];

// Map an expected column label to the index it sits at in the
// header row. Throws if any expected column is absent. Returns a
// {label: index} map.
function buildColumnIndex(headerRow){
  const idx={};
  const lower=headerRow.map(h=>String(h||"").trim().toLowerCase());
  for(const col of EXPECTED_COLUMNS){
    const at=lower.indexOf(col.toLowerCase());
    if(at===-1)throw new Error("Expected column missing from upload: "+col);
    idx[col]=at;
  }
  return idx;
}

// Coerce DFAT's varied truthy values for the boolean flag columns
// (Targeted Financial Sanction / Travel Ban / Arms Embargo /
// Maritime Restriction) into a clean boolean. DFAT ships these as
// "Yes" / "No" / "TRUE" / "FALSE" / blank / sometimes 1 / 0.
function asBool(v){
  if(v==null)return null;
  const s=String(v).trim().toLowerCase();
  if(!s)return null;
  if(s==="yes"||s==="true"||s==="1")return true;
  if(s==="no"||s==="false"||s==="0")return false;
  return null; // unknown value — leave nullable
}

// "2a" → "2"; "10b" → "10"; "10" → "10"; bare letters → empty.
// Defensive: returns the trimmed input verbatim if no leading digit
// chunk is present, so the row still inserts (won't strand because
// of an exotic reference format).
export function normalizePrimaryReference(ref){
  const s=String(ref||"").trim();
  const m=s.match(/^(\d+)/);
  return m?m[1]:s;
}

// Conservative phonetic normalization. The spec calls for collapsing
// well-known transliteration variants (zh, ph, ck). Aggressive
// phonetic algorithms (Soundex, Metaphone) collapse genuinely
// different names and produce false positives on a list this large
// (~10k entries), so we keep the substitutions to the small set the
// spec listed plus `kh` which is extremely common in transliterated
// Arabic / Russian names. Levenshtein distance in the matcher
// (Commit 2) handles the rest.
function applyPhoneticFolds(s){
  return s
    .replace(/zh/g,"j")
    .replace(/kh/g,"h")
    .replace(/ph/g,"f")
    .replace(/ck/g,"k");
}

// Lowercase, ASCII-fold, drop punctuation, collapse whitespace,
// then apply the conservative phonetic folds. Result is what we
// store in tfs_list.name_normalized and what the matcher compares
// the customer's normalized name against.
//
// "Müller" → "muller"
// "Mohammad Al-Sharif" → "mohammad alsharif" (then phonetic: "mohammad alsharif")
// "Zhang" → "zhang" → phonetic: "jang"
export function normalizeName(name){
  if(!name)return "";
  let s=String(name).toLowerCase();
  // NFD-decompose and strip combining marks. Handles diacritics
  // across European, Vietnamese, etc. without mangling the base
  // characters.
  try{s=s.normalize("NFD").replace(/[̀-ͯ]/g,"");}catch(_){}
  // Replace any non-alphanumeric with a space, then collapse and
  // trim. Keeps multi-word names readable but loses punctuation
  // (apostrophes, hyphens, periods) that vary across spellings.
  s=s.replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
  s=applyPhoneticFolds(s);
  return s;
}

// Parse a DFAT DOB string into a structured object. DFAT's DOB
// column is genuinely messy — exact dates, bare years, lists of
// years, year ranges, "Approximately" / "Circa" qualifiers, mixed
// formats. The parser is deliberately tolerant: when in doubt, lean
// toward "this might match" by widening the candidate set rather
// than skipping. Examples:
//
//   "30/01/1972"
//     → {type:"exact", dates:["1972-01-30"], years:[1972]}
//
//   "1945, 1946, 1947"
//     → {type:"multiple", dates:[], years:[1945,1946,1947]}
//
//   "Approximately 1963, 30/01/1972"
//     → {type:"multiple", dates:["1972-01-30"], years:[1963,1972]}
//
//   "1960 to 1966"
//     → {type:"range", yearsRange:[1960,1966]}
//
//   "Between 1955 and 1957"
//     → {type:"range", yearsRange:[1955,1957]}
//
//   "" / null / "Not known"
//     → {type:"unknown"}
//
// The matcher uses dates / years / yearsRange to decide whether the
// customer's DOB is a possible match. A non-match on any of these
// signals likely false-positive on the name.
export function parseDobString(raw){
  const s=String(raw||"").trim();
  if(!s||/^not\s+known$/i.test(s)||s==="-")return{type:"unknown"};

  // Range first — keyword anchors avoid swallowing unrelated dates.
  // Patterns covered:
  //   "1960 to 1966"
  //   "1960-1966" or "1960–1966" (en-dash)
  //   "1960 through 1966"
  //   "Between 1960 and 1966"
  const between=s.match(/between\s+(\d{4})\s+and\s+(\d{4})/i);
  const range=s.match(/\b(\d{4})\s*(?:to|through|[-–—])\s*(\d{4})\b/i);
  if(between){
    const a=parseInt(between[1],10),b=parseInt(between[2],10);
    return{type:"range",yearsRange:[Math.min(a,b),Math.max(a,b)]};
  }
  if(range){
    const a=parseInt(range[1],10),b=parseInt(range[2],10);
    // Only treat as range if the years are plausible birth years.
    if(a>=1900&&b>=1900&&a<=2100&&b<=2100&&Math.abs(b-a)<=80){
      return{type:"range",yearsRange:[Math.min(a,b),Math.max(a,b)]};
    }
  }

  // DD/MM/YYYY dates. DFAT uses Australian-format (day first); we
  // produce ISO YYYY-MM-DD.
  const dates=[];
  const dateRe=/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;
  let m;
  while((m=dateRe.exec(s))!==null){
    const dd=parseInt(m[1],10),mm=parseInt(m[2],10),yy=parseInt(m[3],10);
    if(dd>=1&&dd<=31&&mm>=1&&mm<=12&&yy>=1900&&yy<=2100){
      dates.push(yy+"-"+String(mm).padStart(2,"0")+"-"+String(dd).padStart(2,"0"));
    }
  }

  // Strip the dates we already captured before scanning for bare
  // years, so a "30/01/1972" doesn't double-count 1972 as a year.
  let bareYearSrc=s.replace(dateRe,"");
  const years=[];
  const yearRe=/\b(19|20)\d{2}\b/g;
  while((m=yearRe.exec(bareYearSrc))!==null){
    const yy=parseInt(m[0],10);
    if(yy>=1900&&yy<=2100&&!years.includes(yy))years.push(yy);
  }

  if(dates.length===0&&years.length===0)return{type:"unknown"};
  if(dates.length===1&&years.length===0)return{type:"exact",dates,years:[parseInt(dates[0].slice(0,4),10)]};
  // Multiple covers everything else — multiple dates, multiple
  // years, or a mix. The matcher checks customer DOB against each.
  const allYears=[...years,...dates.map(d=>parseInt(d.slice(0,4),10))]
    .filter((y,i,arr)=>arr.indexOf(y)===i);
  return{type:"multiple",dates,years:allYears};
}

// Parse a DFAT-format Excel file into normalized records suitable
// for direct insert into tfs_list. Returns:
//   {records: [...], stats: {total, individual, entity, vessel,
//                            primaryName, alias, originalScript}}
//
// Throws on schema validation failure. Caller (TfsListAdmin) is
// expected to wrap in try/catch and surface the error.
export function parseDfatExcel(arrayBuffer){
  const wb=XLSX.read(arrayBuffer,{type:"array",cellDates:true});
  if(!wb.SheetNames||!wb.SheetNames.length)throw new Error("Empty workbook (no sheets).");
  // DFAT's file consistently uses one sheet named "Consolidated List".
  // Take the first sheet regardless of name to be tolerant of
  // future renames.
  const ws=wb.Sheets[wb.SheetNames[0]];
  const grid=XLSX.utils.sheet_to_json(ws,{header:1,defval:"",raw:false});
  if(!grid.length)throw new Error("Sheet is empty.");
  const header=grid[0];
  const idx=buildColumnIndex(header);

  const records=[];
  const stats={total:0,individual:0,entity:0,vessel:0,primaryName:0,alias:0,originalScript:0};

  for(let r=1;r<grid.length;r++){
    const row=grid[r];
    if(!row||!row.length)continue;
    // Skip completely blank rows.
    if(!String(row[idx["Reference"]]||"").trim()&&!String(row[idx["Name of Individual or Entity"]]||"").trim())continue;

    const reference=String(row[idx["Reference"]]||"").trim();
    const primaryReference=normalizePrimaryReference(reference);
    const name=String(row[idx["Name of Individual or Entity"]]||"").trim();
    if(!name||!reference)continue;

    const type=String(row[idx["Type"]]||"").trim();
    const nameType=String(row[idx["Name Type"]]||"").trim();
    const dobRaw=String(row[idx["Date of Birth"]]||"").trim();

    const rec={
      reference,
      primary_reference:primaryReference,
      name,
      name_normalized:normalizeName(name),
      type,
      name_type:nameType,
      alias_strength:String(row[idx["Alias Strength"]]||"").trim()||null,
      dob_raw:dobRaw||null,
      dob_parsed:parseDobString(dobRaw),
      place_of_birth:String(row[idx["Place of Birth"]]||"").trim()||null,
      citizenship:String(row[idx["Citizenship"]]||"").trim()||null,
      address:String(row[idx["Address"]]||"").trim()||null,
      additional_info:String(row[idx["Additional Information"]]||"").trim()||null,
      listing_info:String(row[idx["Listing Information"]]||"").trim()||null,
      imo_number:String(row[idx["IMO Number"]]||"").trim()||null,
      committees:String(row[idx["Committees"]]||"").trim()||null,
      control_date:parseControlDate(row[idx["Control Date"]]),
      instrument:String(row[idx["Instrument of Designation"]]||"").trim()||null,
      tfs:asBool(row[idx["Targeted Financial Sanction"]]),
      travel_ban:asBool(row[idx["Travel Ban"]]),
      arms_embargo:asBool(row[idx["Arms Embargo"]]),
      maritime_restriction:asBool(row[idx["Maritime Restriction"]]),
    };
    records.push(rec);

    stats.total++;
    if(/individual/i.test(type))stats.individual++;
    else if(/entity/i.test(type))stats.entity++;
    else if(/vessel/i.test(type))stats.vessel++;
    if(/primary/i.test(nameType))stats.primaryName++;
    else if(/alias/i.test(nameType))stats.alias++;
    else if(/original/i.test(nameType))stats.originalScript++;
  }

  if(!records.length)throw new Error("No usable rows after validation.");
  return{records,stats};
}

// Coerce a DFAT control-date cell to ISO YYYY-MM-DD or null. With
// cellDates:true XLSX returns a JS Date for date cells; some rows
// have the date as a string. Handles both.
function parseControlDate(v){
  if(v==null||v==="")return null;
  if(v instanceof Date){
    if(isNaN(v.getTime()))return null;
    return v.toISOString().slice(0,10);
  }
  const s=String(v).trim();
  if(!s)return null;
  // Try DD/MM/YYYY first (DFAT's format).
  const m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(m){
    const dd=parseInt(m[1],10),mm=parseInt(m[2],10),yy=parseInt(m[3],10);
    return yy+"-"+String(mm).padStart(2,"0")+"-"+String(dd).padStart(2,"0");
  }
  // Fallback: pass through any ISO-looking date.
  const iso=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(iso)return iso[0];
  return null;
}
