// LootLedger — ClientSearch.
// Phase 2.7.5. Multi-field search input + results popup with the
// staff-must-click-to-confirm rule applied to all three result
// shapes (zero / single / multi). Used by the Clients screen
// (2.7.10) and the NewTx step 4 client step (2.7.9).
//
// Search hits any of fullName / idNumber / phone / address / email
// (defined by SEARCH_FIELDS in src/lib/clients.js) — substring
// match, case-insensitive. PostgREST does the heavy lifting in the
// `or=(data->>field.ilike.*pat*,…)` filter.
//
// Result handling per spec:
//   - 0 matches  → "No client found. Create new?" + Cancel
//   - 1 match    → confirmation card, "Use This Client" button.
//                  No auto-load — staff must click to confirm.
//   - N matches  → grid of cards, click the right one.
// Every popup carries an explicit Cancel button in addition to the
// Modal primitive's ✕ Close.
//
// Blacklisted matches still appear in results (the soft-block PIN
// flow lives at 2.7.11 and gates onSelect downstream). The badge
// flags them visually so staff know what they're picking.

import React,{useState} from "react";
import {T,c} from "../theme.js";
import {Modal} from "./ui";
import {sS} from "../lib/utils.js";
import {clients,formatLastVisit} from "../lib/clients.js";

export default function ClientSearch({onSelect,onCreateNew,autoFocus=false}){
  const[query,setQuery]=useState("");
  const[results,setResults]=useState(null);  // null = haven't searched yet
  const[searching,setSearching]=useState(false);

  const runSearch=async()=>{
    const q=query.trim();
    if(!q)return;
    setSearching(true);
    try{
      const r=await clients.search(q);
      setResults(r||[]);
    }finally{
      setSearching(false);
    }
  };

  const close=()=>setResults(null);
  const pick=cl=>{onSelect&&onSelect(cl);close();};
  const create=()=>{onCreateNew&&onCreateNew();close();};

  // One-line summary of identifying info: ID type/number then phone.
  const fmtLine=cl=>{
    const bits=[];
    if(cl.idNumber)bits.push(cl.idType?sS(cl.idType).toUpperCase()+" "+cl.idNumber:cl.idNumber);
    if(cl.phone)bits.push(cl.phone);
    return bits.join(" · ");
  };

  return <div>
    <div style={{display:"flex",gap:8,marginBottom:8}}>
      <input
        autoFocus={autoFocus}
        style={{...c.inp(),flex:1}}
        type="text"
        placeholder="Search by name, ID, phone, address, email…"
        value={query}
        onChange={e=>setQuery(e.target.value)}
        onKeyDown={e=>{if(e.key==="Enter")runSearch();}}
      />
      <button style={c.btn(T.gold,T.bg,{padding:"10px 18px"})} onClick={runSearch} disabled={searching||!query.trim()}>{searching?"Searching…":"Search"}</button>
    </div>

    {results!==null&&<Modal
      title={results.length===0?"No client found":results.length===1?"Confirm client":results.length+" clients matched"}
      onClose={close}
      wide={results.length>1}
    >
      {results.length===0&&<div>
        <div style={{fontSize:13,color:T.muted,marginBottom:14}}>No client matches "{sS(query)}". Create a new client?</div>
        <div style={{display:"flex",gap:10}}>
          <button style={c.btn(T.gold,T.bg)} onClick={create}>Create New Client</button>
          <button style={c.bsm()} onClick={close}>Cancel</button>
        </div>
      </div>}

      {results.length===1&&(()=>{
        const cl=results[0];
        const lv=formatLastVisit(cl);
        const line=fmtLine(cl);
        return <div>
          <div style={{...c.card({padding:14}),marginBottom:14}}>
            <div style={{fontWeight:"bold",color:T.white,fontSize:14,marginBottom:4}}>
              {sS(cl.fullName)||"(no name)"}
              {cl.blacklisted&&<span style={{...c.badge(T.red),marginLeft:8,fontSize:10}}>⛔ BLACKLISTED</span>}
            </div>
            {line&&<div style={{fontSize:12,color:T.muted,marginBottom:2}}>{line}</div>}
            {cl.address&&<div style={{fontSize:11,color:T.muted}}>{sS(cl.address)}</div>}
            {lv&&<div style={{fontSize:11,color:T.muted,marginTop:6}}>Last visit: {lv}</div>}
          </div>
          <div style={{display:"flex",gap:10}}>
            <button style={c.btn(T.green,T.bg)} onClick={()=>pick(cl)}>Use This Client</button>
            <button style={c.bsm()} onClick={close}>Cancel</button>
          </div>
        </div>;
      })()}

      {results.length>1&&<div>
        <div style={{fontSize:11,color:T.muted,marginBottom:10}}>Multiple matches. Click the right client to use them.</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:10,marginBottom:14}}>
          {results.map(cl=>{
            const lv=formatLastVisit(cl);
            const line=fmtLine(cl);
            return <button
              key={cl.id}
              style={{...c.card({padding:12}),textAlign:"left",border:"1px solid "+T.border,cursor:"pointer",background:T.surface,fontFamily:"inherit",color:T.text}}
              onClick={()=>pick(cl)}
            >
              <div style={{fontWeight:"bold",color:T.white,fontSize:13,marginBottom:3}}>
                {sS(cl.fullName)||"(no name)"}
                {cl.blacklisted&&<span style={{...c.badge(T.red),marginLeft:6,fontSize:9}}>⛔</span>}
              </div>
              {line&&<div style={{fontSize:11,color:T.muted,marginBottom:2}}>{line}</div>}
              {cl.address&&<div style={{fontSize:10,color:T.muted}}>{sS(cl.address)}</div>}
              {lv&&<div style={{fontSize:10,color:T.muted,marginTop:4}}>Last visit: {lv}</div>}
            </button>;
          })}
        </div>
        <button style={c.bsm()} onClick={close}>Cancel</button>
      </div>}
    </Modal>}
  </div>;
}
