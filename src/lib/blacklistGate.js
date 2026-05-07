// LootLedger — blacklist soft-block gate.
// Phase 2.7.11. Single helper invoked from every code path that
// hands a blacklisted client through to staff (ClientSearch
// onSelect inside NewTx step 4 and the Clients screen, plus the
// Clients-mode-2 "→ Client" link button on a tx row that points at
// a blacklisted client). Reuses the existing setPinModal pattern
// from App.tsx — no separate UI component, just sets the modal
// reason text and a callback that records the override.
//
// USAGE
//
//   import {requireBlacklistOverride} from "../lib/blacklistGate.js";
//   requireBlacklistOverride({
//     client,
//     callbacks: {pop, setPinModal, setPinVal, activeStaff},
//     onApproved: () => doTheActualThing(client),
//   });
//
// Non-blacklisted clients fire onApproved synchronously. Blacklisted
// ones open the PIN modal; on correct PIN, the existing submitPin
// helper fires the modal's `cb`, which writes the audit entry then
// fires onApproved. On wrong PIN, submitPin pops "Incorrect PIN"
// and the modal stays open until the user cancels or enters the
// right PIN.
//
// AUDIT ENTRY SHAPE
//
//   { timestamp, staffId, reason }
//
// Stored as an entry in client.blacklistOverrides (JSONB array).
// staffId comes from settings.activeStaff today (pre-Phase-3, this
// is the till's currently-selected staff string; post-Phase-3,
// it'll be the auth user id). reason is a fixed string for now —
// briefing §9 Gap 6 has stricter min-length requirements for the
// general compliance-override audit, but the blacklist case is
// narrower and the spec didn't ask for free-text capture.

import {sS} from "./utils.js";
import {recordBlacklistOverride} from "./clients.js";
import {getCurrentUserId,getCurrentUserLabel,sb} from "./storage.js";

export function requireBlacklistOverride({client,callbacks,onApproved}){
  if(!client||!client.blacklisted){
    onApproved&&onApproved();
    return;
  }
  const{pop,setPinModal,setPinVal,activeStaff}=callbacks||{};
  if(typeof setPinModal!=="function"){
    // Caller bug — surface clearly. Fail closed (don't approve).
    pop&&pop("Blacklist override cannot be applied: PIN modal not wired.","err");
    return;
  }
  setPinModal({
    reason:"⛔ BLACKLISTED CLIENT — Admin PIN required to proceed.\n\nClient: "+sS(client.fullName||"(no name)"),
    cb:async()=>{
      try{
        // Phase 3 commit 3d-2 — staffId is the freetext display
        // label (kept for ClientDetail history-render backward
        // compat); staffActor is the auth.uid() for the new
        // audit_log layer wired up in 3d-3. activeStaff is the
        // pre-Phase-3 selector value, retained as a fallback for
        // sessions that haven't completed the auth identity swap.
        const lbl=getCurrentUserLabel();
        await recordBlacklistOverride(client.id,{
          timestamp:new Date().toISOString(),
          staffId:lbl!=="Unknown"?lbl:sS(activeStaff||""),
          staffActor:getCurrentUserId(),
          reason:"Override approved via PIN",
        });
      }catch(e){
        pop&&pop("Audit log write failed (proceeding): "+sS(e&&e.message),"warn");
      }
      // Phase 3 commit 3d-3 — blacklist_override audit_log row
      // alongside the legacy JSONB array on the client record. The
      // JSONB stays as the per-client history surface (read by
      // ClientDetail); audit_log carries the cross-client unified
      // record with actor=auth.uid() for the audit query layer.
      try{
        sb.logAudit({
          event_type:"blacklist_override",
          target_table:"clients",
          target_id:client.id,
          reason:"Override approved via PIN",
          payload:{
            client_name:sS(client.fullName||""),
          },
        });
      }catch(_){/* non-fatal */}
      onApproved&&onApproved();
    },
  });
  setPinVal&&setPinVal("");
}
