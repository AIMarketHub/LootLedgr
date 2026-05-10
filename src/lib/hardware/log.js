// LootLedger — hardware command audit log writer.
// Phase 5.2-A. Every driver call (Live or Mock) writes one row
// to the hardware_log table via sbFetch (POST). Fire-and-forget
// — the driver returns its result without waiting for the log
// write to complete; failures only console.warn.
//
// Schema: see supabase/migrations/0016_hardware_log.sql.
//
// shop_id and user_id come from the auth-cached values in
// storage.js (set by AuthProvider). Calls before sign-in
// console.warn and skip the write — RLS would reject them
// anyway.

import {sbFetch,getCurrentShopId,getCurrentUserId} from "../storage.js";

/**
 * Log one hardware command attempt to hardware_log.
 *
 * @param {Object} entry
 * @param {string} entry.deviceType  - 'printer'|'scale'|'scanner'|'signature'|'cashDrawer'
 * @param {string} entry.command     - Command name (e.g. "print", "read", "kick")
 * @param {Object} [entry.params]    - Command parameters (will be JSON-stringified)
 * @param {Object|null} [entry.result] - Provider response (will be JSON-stringified)
 * @param {string} entry.mode        - 'live' | 'mock'
 * @param {boolean} entry.succeeded
 * @param {number} [entry.latencyMs]
 * @param {string} [entry.error]
 */
export async function logCommand(entry){
  const shop_id=getCurrentShopId();
  const user_id=getCurrentUserId();
  if(!shop_id||!user_id||shop_id==="__no_shop__"){
    console.warn("[hardware/log] missing shop_id or user_id; skipping write");
    return;
  }
  const row={
    shop_id:shop_id,
    user_id:user_id,
    device_type:String(entry.deviceType||""),
    command:String(entry.command||""),
    params:entry.params||{},
    result:entry.result==null?null:entry.result,
    mode:entry.mode==="live"?"live":"mock",
    succeeded:!!entry.succeeded,
    latency_ms:entry.latencyMs==null?null:Math.max(0,Math.round(entry.latencyMs)),
    error:entry.error||null,
  };
  try{
    await sbFetch("hardware_log",{method:"POST",body:JSON.stringify(row)});
  }catch(e){
    console.warn("[hardware/log] write failed",e&&e.message||e);
  }
}

/**
 * Read recent hardware_log rows for the current shop, optionally
 * filtered by device_type. Returns newest first. Used by the
 * /admin/diagnostics page to surface "last run" state per driver.
 *
 * @param {string|null} [deviceType] - if set, filter to this device only
 * @param {number} [limit=50]
 * @returns {Promise<Array<Object>>}
 */
export async function getRecentLogs(deviceType,limit){
  const shop_id=getCurrentShopId();
  if(!shop_id||shop_id==="__no_shop__")return[];
  const lim=Math.max(1,Math.min(500,Number(limit)||50));
  let path="hardware_log?shop_id=eq."+encodeURIComponent(shop_id);
  if(deviceType)path+="&device_type=eq."+encodeURIComponent(deviceType);
  path+="&order=created_at.desc&limit="+encodeURIComponent(lim);
  const r=await sbFetch(path);
  return Array.isArray(r)?r:[];
}
