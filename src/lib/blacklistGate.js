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
    reason:"⛔ BLACKLISTED CLIENT — manager PIN required to proceed.\n\nClient: "+sS(client.fullName||"(no name)"),
    cb:async()=>{
      try{
        await recordBlacklistOverride(client.id,{
          timestamp:new Date().toISOString(),
          staffId:sS(activeStaff||""),
          reason:"Override approved via PIN",
        });
      }catch(e){
        pop&&pop("Audit log write failed (proceeding): "+sS(e&&e.message),"warn");
      }
      onApproved&&onApproved();
    },
  });
  setPinVal&&setPinVal("");
}
