// LootLedger — BackupRestore modal.
// Mechanically extracted from src/App.tsx during Phase 2 step 10f
// (briefing §7.3). No semantic changes; markup preserved verbatim.
//
// Two actions:
//   1. Download a JSON backup of all live data (transactions,
//      stock, catalog, vendors, staff, blacklist, frozen snapshot).
//      Photos and the logo are deliberately excluded.
//   2. Restore from a previously-downloaded backup file.
//      Restoration overwrites current data — the warning banner
//      tells the user to back up before restoring.

import React from "react";
import {T,c} from "../theme.js";
import Modal from "../components/ui/Modal.jsx";

export default function BackupRestore({txList,stock,dlBackup,restoreBackup,setShowBackup}){
  return <Modal title="💾 Backup & Restore" onClose={()=>setShowBackup(false)}>
    <div style={{marginBottom:16}}>
      <div style={{fontSize:12,fontWeight:"bold",color:T.white,marginBottom:8}}>Download Backup</div>
      <div style={{fontSize:11,color:T.muted,marginBottom:10}}>Includes all transactions, stock, catalog, vendors, staff, blacklist, and frozen snapshot. Does not include photos or logo.</div>
      <button style={c.btn(T.gold,T.bg)} onClick={dlBackup}>⬇ Download Backup ({(txList||[]).length} tx, {(stock||[]).length} stock)</button>
    </div>
    <div style={{borderTop:"1px solid "+T.border,paddingTop:14}}>
      <div style={{fontSize:12,fontWeight:"bold",color:T.white,marginBottom:8}}>Restore from Backup</div>
      <div style={{...c.bnr("warn"),marginBottom:10}}>⚠ Restoring will overwrite your current data. Download a fresh backup first.</div>
      <label style={{...c.btn(T.border,T.text),display:"inline-block",cursor:"pointer"}}>📂 Choose Backup File<input type="file" accept=".json,application/json" style={{display:"none"}} onChange={e=>{const f=e.target.files&&e.target.files[0];if(!f)return;restoreBackup(f);setShowBackup(false);}}/></label>
    </div>
  </Modal>;
}
