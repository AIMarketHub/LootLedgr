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
//   - 1 match    → confirmation card, "✓ Yes, this is them" or
//                  "✗ Not them — create new". No auto-load — staff
//                  must explicitly confirm or dismiss.
//   - N matches  → grid of cards, each with its own "✓ This one"
//                  and "✗" buttons. Any ✗ jumps straight to the
//                  create-new flow (the user is signalling none of
//                  these are right).
// Every popup carries an explicit Cancel button in addition to the
// Modal primitive's ✕ Close.
//
// Phase 2.7 follow-up (2026-04-30): the dismissal path on a name
// match exists because real-world same-name customers are common —
// auto-confirming on first match would silently merge two distinct
// people under one client record. The middleName field surfaced
// here when present helps staff disambiguate at a glance.
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
  // Pass the current trimmed query up so the create-new path can
  // pre-fill the customer's name in the form. Saves staff typing
  // it twice (once into the search bar, once into Full Name).
  // Caller decides what to do with it (empty / whitespace-only
  // queries arrive as ""; the receiver should treat that as
  // "no pre-fill").
  const create=()=>{onCreateNew&&onCreateNew(query.trim());close();};

  // One-line summary of identifying info: ID type/number then phone.
  const fmtLine=cl=>{
    const bits=[];
    if(cl.idNumber)bits.push(cl.idType?sS(cl.idType).toUpperCase()+" "+cl.idNumber:cl.idNumber);
    if(cl.phone)bits.push(cl.phone);
    return bits.join(" · ");
  };

  // Display name with middleName interleaved when present. Helps
  // staff distinguish two same-first-and-last-name customers in
  // the result list. Falls back to fullName-only for records
  // pre-dating the middleName field.
  const fmtClientName=cl=>{
    const fn=sS(cl&&cl.fullName).trim();
    const mn=sS(cl&&cl.middleName).trim();
    if(!fn)return "";
    if(!mn)return fn;
    // Inject middleName after the first whitespace-separated token.
    const i=fn.indexOf(" ");
    if(i<0)return fn+" "+mn;
    return fn.slice(0,i)+" "+mn+fn.slice(i);
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
        const displayName=fmtClientName(cl);
        return <div>
          <div style={{...c.card({padding:14}),marginBottom:14}}>
            <div style={{fontWeight:"bold",color:T.white,fontSize:14,marginBottom:4}}>
              {displayName||"(no name)"}
              {cl.blacklisted&&<span style={{...c.badge(T.red),marginLeft:8,fontSize:10}}>⛔ BLACKLISTED</span>}
            </div>
            {line&&<div style={{fontSize:12,color:T.muted,marginBottom:2}}>{line}</div>}
            {cl.address&&<div style={{fontSize:11,color:T.muted}}>{sS(cl.address)}</div>}
            {lv&&<div style={{fontSize:11,color:T.muted,marginTop:6}}>Last visit: {lv}</div>}
          </div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            <button style={c.btn(T.green,T.bg)} onClick={()=>pick(cl)}>✓ Yes, this is them</button>
            <button style={c.btn(T.border,T.text)} onClick={create}>✗ Not them — create new</button>
            <button style={c.bsm()} onClick={close}>Cancel</button>
          </div>
        </div>;
      })()}

      {results.length>1&&<div>
        <div style={{fontSize:11,color:T.muted,marginBottom:10}}>Multiple matches. Confirm one with ✓ — or ✗ on any to create a new client (same first / last name, different person).</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:10,marginBottom:14}}>
          {results.map(cl=>{
            const lv=formatLastVisit(cl);
            const line=fmtLine(cl);
            const displayName=fmtClientName(cl);
            return <div
              key={cl.id}
              style={{...c.card({padding:12}),border:"1px solid "+T.border,background:T.surface,color:T.text}}
            >
              <div style={{fontWeight:"bold",color:T.white,fontSize:13,marginBottom:3}}>
                {displayName||"(no name)"}
                {cl.blacklisted&&<span style={{...c.badge(T.red),marginLeft:6,fontSize:9}}>⛔</span>}
              </div>
              {line&&<div style={{fontSize:11,color:T.muted,marginBottom:2}}>{line}</div>}
              {cl.address&&<div style={{fontSize:10,color:T.muted}}>{sS(cl.address)}</div>}
              {lv&&<div style={{fontSize:10,color:T.muted,marginTop:4,marginBottom:8}}>Last visit: {lv}</div>}
              <div style={{display:"flex",gap:6,marginTop:8}}>
                <button style={c.bsm(T.green,T.bg,{flex:1,fontSize:11})} onClick={()=>pick(cl)}>✓ This one</button>
                <button style={c.bsm(T.border,T.text,{fontSize:11})} onClick={create} title="Not them — create new">✗</button>
              </div>
            </div>;
          })}
        </div>
        <button style={c.bsm()} onClick={close}>Cancel</button>
      </div>}
    </Modal>}
  </div>;
}
