// LootLedger — Client model layer.
// Phase 2.7.2 — CRUD + multi-field search + dedupe-by-idNumber +
// mandatory-field warning gate.
//
// The `clients` table on lootledger-dev mirrors the existing JSONB
// document pattern: (id uuid PK, shop_id text, data jsonb,
// updated_at timestamptz). All Phase 2.7 client fields live inside
// `data`. This module wraps the JSONB-on-the-wire syntax so the
// rest of the app sees ergonomic methods.
//
// Architectural decisions (memory: project_phase_2_7_decisions.md):
//   - JSONB-document table shape; future field additions are new
//     JSONB keys, no migrations needed for fields.
//   - Orphan clientIds are acceptable. Transactions retain the
//     client's name + ID inside tx.data.client.* so historical
//     lookup, police reports, and audit trails still work even if
//     a client record is later deleted. No FK enforcement.
//
// Mandatory-field gate (warning, not schema-enforced): on save,
// if any of fullName / dob / address / idType / idNumber are
// missing, the UI fires the
//   "Some information is missing. It is your duty to collect the
//    mandatory information. Proceed anyway?"
// modal. Cancel returns to the form; Proceed saves the partial.
// This module supplies the predicate; the modal lives in the UI.

import {sbFetch,SHOP_ID} from "./storage.js";
import {fmtDate} from "./utils.js";

const ts=()=>new Date().toISOString();

// === Display helpers ========================================================
//
// 30-day display rule for lastTxAt (Phase 2.7 spec, "DISPLAY RULES"):
// the underlying value is always stored (used for retention, sorting,
// analytics) but we only SHOW the date when it's within the last 30
// days. Older or missing → return empty string so the caller can omit
// the row entirely or render a placeholder. Sorting still uses the
// raw lastTxAt regardless of what's displayed.

const THIRTY_DAYS_MS=30*86400000;

export function formatLastVisit(client){
  const lastTxAt=client&&client.lastTxAt;
  if(!lastTxAt)return "";
  const dt=new Date(lastTxAt);
  if(isNaN(dt.getTime()))return "";
  if(Date.now()-dt.getTime()>THIRTY_DAYS_MS)return "";
  return fmtDate(lastTxAt);
}

// Unwrap a row from {id, shop_id, data, updated_at} into a flat
// client object. The id and updated_at come along for the ride;
// _updatedAt is prefixed with `_` so it doesn't collide with any
// future client-domain field called `updatedAt`.
const unwrap=row=>row&&row.data?{...row.data,id:row.id,_updatedAt:row.updated_at}:null;

// === Mandatory-field gate ===================================================

export const MANDATORY_CLIENT_FIELDS=["fullName","dob","address","idType","idNumber"];

export function getMissingMandatoryFields(client){
  return MANDATORY_CLIENT_FIELDS.filter(k=>{
    const v=client&&client[k];
    return v==null||(typeof v==="string"&&v.trim()==="");
  });
}

export const isClientMandatoryComplete=c=>getMissingMandatoryFields(c).length===0;

// === Client-record field whitelist ==========================================
//
// Used by NewTx finalize to strip per-transaction-only keys
// (selling, signature, signatureDate, itemNotes, idState, idExpiry,
// etc.) from the form state before persisting to the clients table.
// The transaction's tx.client snapshot still carries everything;
// the persistent client record only stores the canonical schema.
//
// Spec note: idState and idExpiry were explicitly dropped from the
// Phase 2.7 client schema. They're rendered in the NewTx step 4
// form for backward compatibility with existing tx.client data
// shape but are NOT persisted in the clients table.

export const CLIENT_RECORD_FIELDS=[
  "fullName","dob","address","phone","email",
  "idType","idNumber","idPhoto",
  "pepCheck","tfsCheck","riskRating",
  "sourceOfFunds","sourceOfWealth",
  "internalNotes","blacklisted",
  "createdAt","lastTxAt","txCount","isTest","deleteAfter",
];

export function pickClientRecordFields(form){
  if(!form)return{};
  const out={};
  for(const k of CLIENT_RECORD_FIELDS){
    if(form[k]!==undefined)out[k]=form[k];
  }
  return out;
}

// === Search =================================================================

// Five-field search per Phase 2.7 spec: substring match,
// case-insensitive, on any of these JSONB keys.
export const SEARCH_FIELDS=["fullName","idNumber","phone","address","email"];

// === CRUD ===================================================================

export const clients={
  // List all clients for this shop, newest first. Default 500-row
  // limit matches the loadTxList convention in storage.js.
  async list({limit=500}={}){
    const r=await sbFetch(`clients?shop_id=eq.${SHOP_ID}&order=updated_at.desc&limit=${limit}`);
    return r?r.map(unwrap):[];
  },

  async getById(id){
    if(!id)return null;
    const r=await sbFetch(`clients?id=eq.${encodeURIComponent(id)}&limit=1`);
    return r&&r[0]?unwrap(r[0]):null;
  },

  // Used by the 2.7.12 migration and the NewTx auto-create path
  // (2.7.9). Idempotent dedupe key.
  async getByIdNumber(idNumber){
    if(!idNumber)return null;
    const r=await sbFetch(`clients?shop_id=eq.${SHOP_ID}&data->>idNumber=eq.${encodeURIComponent(idNumber)}&limit=1`);
    return r&&r[0]?unwrap(r[0]):null;
  },

  // Substring match across SEARCH_FIELDS, case-insensitive.
  // Empty query returns []. PostgREST handles ilike with `*` as the
  // wildcard. encodeURIComponent on the user input handles spaces /
  // commas / parens. SQL `%` and `_` in the input are NOT escaped —
  // unlikely in client names, ID numbers, etc.; can tighten later if
  // it becomes a real-world issue.
  async search(query,{limit=200}={}){
    const q=String(query||"").trim();
    if(!q)return[];
    const enc=encodeURIComponent(q);
    const pattern=`*${enc}*`;
    const orParts=SEARCH_FIELDS.map(f=>`data->>${f}.ilike.${pattern}`).join(",");
    const r=await sbFetch(`clients?shop_id=eq.${SHOP_ID}&or=(${orParts})&order=updated_at.desc&limit=${limit}`);
    return r?r.map(unwrap):[];
  },

  // Create a new client. createdAt and txCount default if missing;
  // anything else passes through unchanged.
  async create(record){
    const data={createdAt:ts(),txCount:0,...(record||{})};
    const r=await sbFetch(`clients`,{
      method:"POST",
      prefer:"return=representation",
      body:JSON.stringify({shop_id:SHOP_ID,data,updated_at:ts()}),
    });
    return r&&r[0]?unwrap(r[0]):null;
  },

  // Partial update with fetch-merge-write so unrelated JSONB keys
  // survive. PATCH on `data` would otherwise replace the whole blob.
  // Two round-trips; acceptable at this scale.
  async update(id,partial){
    if(!id)return null;
    const existing=await this.getById(id);
    if(!existing)return null;
    // Strip the helper keys we added in `unwrap` before re-writing.
    const {id:_id,_updatedAt,...currentData}=existing;
    const merged={...currentData,...(partial||{})};
    const r=await sbFetch(`clients?id=eq.${encodeURIComponent(id)}`,{
      method:"PATCH",
      prefer:"return=representation",
      body:JSON.stringify({data:merged,updated_at:ts()}),
    });
    return r&&r[0]?unwrap(r[0]):null;
  },

  // Permanent delete. Per project_phase_2_7_decisions.md, no
  // referential-integrity guard — orphan clientIds in tx.data are
  // acceptable because tx.data.client.* still has the snapshot.
  async remove(id){
    if(!id)return false;
    await sbFetch(`clients?id=eq.${encodeURIComponent(id)}`,{method:"DELETE"});
    return true;
  },
};

// === Dedupe by idNumber =====================================================
//
// Used by:
//   - 2.7.12 migration: walking the 8 synthetic test transactions,
//     creating a client per unique idNumber, marking them
//     isTest=true.
//   - 2.7.9 NewTx auto-create path: on transaction completion, if no
//     client record was selected, create one keyed on the idNumber
//     captured during KYC.
//
// Returns { client, created } or { client: null, created: false,
// reason } when dedupe isn't possible.

export async function findOrCreateByIdNumber(record){
  if(!record||!record.idNumber){
    return {client:null,created:false,reason:"no idNumber — cannot dedupe"};
  }
  const existing=await clients.getByIdNumber(record.idNumber);
  if(existing)return {client:existing,created:false};
  const fresh=await clients.create(record);
  return {client:fresh,created:!!fresh};
}
