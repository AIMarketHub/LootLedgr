// LootLedger — small RFC-4180 CSV parser.
// Phase 5.2 staff-workspace Commit 2 (2026-05-16).
//
// Hand-rolled instead of pulling in PapaParse (per USER decision)
// because the only call site is the Contacts import flow, and
// Google / Apple contacts exports are well-formed RFC 4180 with
// quoted fields, embedded commas, and CRLF line endings — all
// of which this parser handles. If the call sites grow or we
// start ingesting messier data, swap in PapaParse.
//
// API:
//   parseCsv(text) -> { headers: string[], rows: object[] }
//
// Behaviour:
//   - First non-empty line is the header row.
//   - Subsequent non-empty lines become objects keyed by header.
//   - Quoted fields handle ", \r, \n, and the doubled-quote
//     escape ("" → ").
//   - Trailing newlines / BOM are tolerated.
//   - Mismatched column counts are tolerated: missing trailing
//     fields become "", extra fields are dropped.

const BOM = /^﻿/;

export function parseCsv(text){
  if(typeof text !== "string" || text.length === 0){
    return {headers: [], rows: []};
  }
  const src = text.replace(BOM, "");
  const records = [];
  let field = "";
  let row = [];
  let i = 0;
  let inQuotes = false;
  const n = src.length;

  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => {
    // Skip lines that are entirely empty (one blank field).
    if(!(row.length === 1 && row[0] === "")){
      records.push(row);
    }
    row = [];
  };

  while(i < n){
    const ch = src[i];
    if(inQuotes){
      if(ch === '"'){
        if(src[i + 1] === '"'){ field += '"'; i += 2; continue; }
        inQuotes = false; i += 1; continue;
      }
      field += ch; i += 1; continue;
    }
    if(ch === '"'){ inQuotes = true; i += 1; continue; }
    if(ch === ','){ pushField(); i += 1; continue; }
    if(ch === '\r'){
      pushField();
      pushRow();
      if(src[i + 1] === '\n') i += 2; else i += 1;
      continue;
    }
    if(ch === '\n'){
      pushField();
      pushRow();
      i += 1; continue;
    }
    field += ch; i += 1;
  }
  // Flush the last field / row if the file didn't end with a newline.
  if(field !== "" || row.length > 0){
    pushField();
    pushRow();
  }

  if(records.length === 0) return {headers: [], rows: []};
  const headers = records[0].map(h => String(h || "").trim());
  const rows = records.slice(1).map(rec => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = rec[idx] != null ? String(rec[idx]) : "";
    });
    return obj;
  });
  return {headers, rows};
}

// Convenience: given a row object and an array of candidate header
// names, return the first non-empty value found. Used for fuzzy
// header matching across CSV exports (Google uses "E-mail 1 -
// Value", Apple uses "Email", etc).
export function pickField(row, candidates){
  for(const key of candidates){
    if(row && Object.prototype.hasOwnProperty.call(row, key)){
      const v = String(row[key] || "").trim();
      if(v) return v;
    }
  }
  return "";
}
