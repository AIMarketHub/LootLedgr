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
import {normalizeName,parseDobString,normalizePrimaryReference} from "./normalize.js";

// Re-export the pure-JS normalisers for historical callers. New
// callers (especially anything that's pulled into the dealer-facing
// App chunk via static imports) should prefer the direct import
// from ./normalize.js to avoid statically pulling xlsx into their
// chunk.
export {normalizeName,parseDobString,normalizePrimaryReference};

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
