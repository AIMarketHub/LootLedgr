// LootLedger — Modal UI primitive.
// Mechanically extracted from src/App.tsx during Phase 2 step 7a
// (briefing §7.3). No semantic changes.
//
// Click on the dim overlay closes the modal; clicks inside the
// inner card do not propagate (stopPropagation prevents an
// accidental close when interacting with form controls).

import React from "react";
import {T,c} from "../../theme.js";

export default function Modal({title,onClose,wide,children}){
  return <div style={{position:"fixed",inset:0,background:"#000000d0",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:12}} onClick={onClose}>
    <div style={{...c.card({padding:24,maxWidth:wide?980:580,width:"100%",maxHeight:"93vh",overflowY:"auto"})}} onClick={e=>e.stopPropagation()}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:20,alignItems:"center"}}><span style={{fontSize:15,fontWeight:"bold",color:T.white}}>{title}</span><button style={c.bsm()} onClick={onClose}>✕ Close</button></div>
      {children}
    </div>
  </div>;
}
