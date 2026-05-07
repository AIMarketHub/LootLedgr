// LootLedger — Admin PIN gate for destructive actions.
// Phase 2.7 smoke-test follow-up batch 2 (2026-04-29).
//
// Mirrors src/lib/blacklistGate.js. Single helper invoked from every
// destructive code path. Reuses the existing setPinModal pattern in
// App.tsx — no separate UI component, just sets the modal reason +
// a callback. The shared submitPin helper at App.tsx:272 validates
// against settings.staffPin (the Admin PIN) and fires modal.cb on
// match.
//
// USAGE
//
//   import {requireAdminPin} from "../lib/adminGate.js";
//   requireAdminPin({
//     reason: "Clear all data — this cannot be undone.",
//     callbacks: {settings, pop, setPinModal, setPinVal},
//     onApproved: () => doTheActualThing(),
//   });
//
// BYPASS
//
// When settings.requirePin is false the gate fires onApproved
// synchronously without any modal. This is intentional for the
// single-operator dev-mode posture: in production with multiple
// staff and PIN gating turned on, every destructive action prompts;
// when the dealer is operating solo with the gate off, nothing
// blocks.
//
// CANCEL
//
// Closing the modal (clicking the backdrop or the Cancel button in
// App.tsx's modal markup) silently aborts. onApproved never fires.
// No state cleanup is needed in the caller — the caller's branches
// either ran inside onApproved or didn't run at all.
//
// CALLBACKS SHAPE
//
//   settings        — read .requirePin and .staffPin
//   pop(msg, kind)  — toast helper for "no PIN set" warning
//   setPinModal(o)  — open the modal with {reason, cb}
//   setPinVal(s)    — clear the PIN input on open
//
// All four come from App.tsx scope. The caller passes through
// whatever it already has — most destructive sites already receive
// these as props because they're shared with blacklistGate.

import {sS} from "./utils.js";
import {sb} from "./storage.js";

// Phase 3 commit 3d-3 — closes Section 9 Gap 6 admin-PIN audit.
// Optional `target` parameter ({table, id}) lets call sites that
// know what they're acting on supply the audit row's target_table
// / target_id. Existing call sites continue to work — target stays
// undefined and the audit row gets nulls; the reason text already
// carries the action context (e.g. "Edit catalog product: X").
export function requireAdminPin({reason,callbacks,onApproved,target}){
  const{settings,pop,setPinModal,setPinVal}=callbacks||{};
  // Bypass: gate is off entirely.
  if(!settings||!settings.requirePin){
    onApproved&&onApproved();
    return;
  }
  // Caller bug — fail closed.
  if(typeof setPinModal!=="function"){
    pop&&pop("Action cannot proceed: PIN modal not wired.","err");
    return;
  }
  // Edge case — gate is on but no Admin PIN has been set. Tell the
  // operator clearly and refuse the action; they can either set a
  // PIN or turn the gate off.
  if(!sS(settings.staffPin).trim()){
    pop&&pop("No Admin PIN set. Set one in Settings → Security, or turn off Require-PIN.","warn");
    return;
  }
  setPinModal({
    reason:"🔒 Admin PIN required\n\n"+sS(reason||"Confirm to proceed."),
    cb:()=>{
      // 3d-3 — pass audit, fired before onApproved so the audit
      // row exists even if onApproved itself throws. Failure of
      // the audit write is non-fatal (try/catch swallows; the
      // gate event already passed).
      try{
        sb.logAudit({
          event_type:"admin_pin_gate_passed",
          reason:sS(reason||""),
          target_table:target&&target.table||null,
          target_id:target&&target.id||null,
        });
      }catch(_){/* non-fatal */}
      onApproved&&onApproved();
    },
  });
  setPinVal&&setPinVal("");
}
