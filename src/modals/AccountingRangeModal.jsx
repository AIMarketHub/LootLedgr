// LootLedger — Accounting export range picker.
//
// Phase 3.5-A-4 (2026-05-09). Shown when the user clicks any
// "📊 Accounting" button (Stock screen, EOD modal, API
// Diagnostics). The picker collects a {fromDate, toDate} range
// and hands it to dlAccounting via the onExport callback.
//
// Defaults to "Last 14 days" — the most common pay cycle is
// fortnightly. Inclusive ranges throughout: "Last 7 days"
// means today plus the prior 6 calendar days (7 days total).
// Same convention as the Staff modal "My Hours" 14-day grid.
//
// Custom mode shows two YYYY-MM-DD date inputs. Validation:
// from <= to. The Export button stays disabled until the
// custom range is non-degenerate.

import React,{useState,useMemo} from "react";
import {T,c} from "../theme.js";
import {todayStr,daysAgoISO,formatDateAU} from "../lib/utils.js";
import Modal from "../components/ui/Modal.jsx";
import {F} from "../components/ui";

const PRESETS=[
  {key:"7",  label:"Last 7 days",  daysBack:6},
  {key:"14", label:"Last 14 days", daysBack:13},
  {key:"30", label:"Last 30 days", daysBack:29},
  {key:"90", label:"Last 90 days", daysBack:89},
];

function presetRange(key){
  const p=PRESETS.find(x=>x.key===key);
  if(!p)return null;
  return{fromDate:daysAgoISO(p.daysBack),toDate:todayStr()};
}

export default function AccountingRangeModal({onClose,onExport}){
  const[mode,setMode]=useState("14");
  // Custom from/to default to whatever the last-selected preset
  // resolved to, so flipping into Custom doesn't show empty
  // fields. Recomputed when the user switches presets.
  const presetDefault=useMemo(()=>presetRange(mode==="custom"?"14":mode),[mode]);
  const[customFrom,setCustomFrom]=useState(presetDefault?presetDefault.fromDate:"");
  const[customTo,setCustomTo]=useState(presetDefault?presetDefault.toDate:todayStr());

  const onPresetClick=key=>{
    setMode(key);
    if(key!=="custom"){
      const r=presetRange(key);
      if(r){setCustomFrom(r.fromDate);setCustomTo(r.toDate);}
    }
  };

  const resolved=mode==="custom"
    ?{fromDate:customFrom,toDate:customTo}
    :presetRange(mode);

  // Disable Export when the custom range is empty or inverted.
  // Preset paths always produce a valid range so the button
  // stays enabled there.
  const customInvalid=mode==="custom"&&(!customFrom||!customTo||customFrom>customTo);
  const exportDisabled=!resolved||!resolved.fromDate||!resolved.toDate||customInvalid;

  const onExportClick=()=>{
    if(exportDisabled)return;
    onExport({fromDate:resolved.fromDate,toDate:resolved.toDate});
  };

  return <Modal title="📊 Export accounting" onClose={onClose}>
    <div style={{fontSize:12,color:T.muted,marginBottom:12}}>Choose the date range for this export. Stock Valuation always shows the current snapshot regardless of range.</div>

    <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12}}>
      {PRESETS.map(p=>{
        const selected=mode===p.key;
        return <button
          key={p.key}
          type="button"
          style={c.btn(selected?T.gold:T.border,selected?T.bg:T.text,{fontSize:12,padding:"10px 14px",justifyContent:"flex-start",textAlign:"left"})}
          onClick={()=>onPresetClick(p.key)}
        >{selected?"● ":"○ "}{p.label}</button>;
      })}
      <button
        type="button"
        style={c.btn(mode==="custom"?T.gold:T.border,mode==="custom"?T.bg:T.text,{fontSize:12,padding:"10px 14px",justifyContent:"flex-start",textAlign:"left"})}
        onClick={()=>onPresetClick("custom")}
      >{mode==="custom"?"● ":"○ "}Custom…</button>
    </div>

    {mode==="custom"&&<div style={{...c.card({padding:12}),marginBottom:12}}>
      <div style={c.g2(8)}>
        <F label="From" type="date" value={customFrom} onChange={setCustomFrom}/>
        <F label="To" type="date" value={customTo} onChange={setCustomTo}/>
      </div>
      {customInvalid&&<div style={{fontSize:11,color:T.red||T.gold,marginTop:4}}>From date must be on or before To date.</div>}
    </div>}

    {!customInvalid&&resolved&&resolved.fromDate&&resolved.toDate&&<div style={{fontSize:11,color:T.muted,marginBottom:12}}>Range: <strong style={{color:T.text}}>{formatDateAU(resolved.fromDate)}</strong> to <strong style={{color:T.text}}>{formatDateAU(resolved.toDate)}</strong>.</div>}

    <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
      <button style={c.bsm()} onClick={onClose}>Cancel</button>
      <button style={c.btn(T.gold,T.bg,{fontSize:12,padding:"8px 16px"})} onClick={onExportClick} disabled={exportDisabled}>Export</button>
    </div>
  </Modal>;
}
