// LootLedger — Clients screen.
// Phase 2.7.10 — pivots from transaction-centric to client-centric.
// Two modes via the toggle in the header:
//
//   "Clients" (default) — list of persistent client records,
//                          sortable by lastTxAt asc/desc, search
//                          across all five fields, click row to
//                          open ClientDetail.
//   "Transactions"      — flat tx view (the previous behaviour),
//                          sortable by tx date asc/desc. Tx rows
//                          that carry tx.data.clientId get a
//                          "→ Client" link button to open the
//                          linked client.
//
// One search bar drives both modes (input is `cliSearch` in
// App.tsx state). The Clients list pulls from the persistent
// clients table via clients.list() on mount + on Refresh; the
// Transactions list reads from txList (already in App.tsx).
//
// Both lists honour the 30-day display rule for last-visit /
// last-tx via formatLastVisit() — older dates hide; sorting still
// uses the raw timestamp regardless of what's shown.

import React,{useState,useEffect,useMemo} from "react";
import {T,c} from "../theme.js";
import {sN,sS,fmtAUD,fmtDate,todayStr,nowISO} from "../lib/utils.js";
import {F} from "../components/ui";
import {clients,formatLastVisit,SEARCH_FIELDS} from "../lib/clients.js";
import {requireBlacklistOverride} from "../lib/blacklistGate.js";
import ClientDetail from "../modals/ClientDetail.jsx";

export default function Clients({
  txList,
  cliFrom,setCliFrom,cliTo,setCliTo,cliSearch,setCliSearch,
  dlBatch,dlTx,dlFile,
  isBlacklistedName,setBlacklist,
  setCliNoteId,setCliNoteVal,
  pop,
  // Phase 2.7.11 — blacklist soft-block gate plumbing
  setPinModal,setPinVal,activeStaff,
  // Phase 2.7 follow-up batch 2 — Admin-PIN gate for destructive
  // ClientDetail actions (Edit toggle, Save, Erase photo).
  withAdminGate,
  // Phase 2.7 follow-up — opens a tx in the App-level tx-detail
  // modal when staff clicks a row inside ClientDetail's history
  // section. Same setSelTx the History screen uses.
  setSelTx,
}){
  const[mode,setMode]=useState("clients");
  const[sortDir,setSortDir]=useState("desc");
  const[clientsData,setClientsData]=useState([]);
  const[loading,setLoading]=useState(false);
  const[selectedClient,setSelectedClient]=useState(null);
  // 2026-05-07 — archived clients are excluded by default from
  // both the rendered list and the row count in the header.
  // Staff toggle this on to revisit / restore an archived
  // record. ClientSearch (used during new tx) filters
  // archived independently — see src/components/ClientSearch.jsx.
  const[showArchived,setShowArchived]=useState(false);

  const loadClients=async()=>{
    setLoading(true);
    try{
      const list=await clients.list();
      setClientsData(list||[]);
    }finally{setLoading(false);}
  };

  useEffect(()=>{loadClients();},[]);

  // Open a tx's linked client (mode 2 → ClientDetail). Fetches
  // fresh from clients.getById since the in-memory clientsData
  // list may be empty if the user never opened mode 1.
  //
  // Phase 2.7 follow-up (2026-04-30): no Admin-PIN gate on open.
  // Reading the record is read-only; the blacklist state is
  // surfaced inside the modal via the red header banner + the
  // RISK / STATUS section + ClientSearch result badges. The
  // override gate stays correctly wired at NewTx Client step's
  // ClientSearch onSelect — that is the genuine override moment.
  const openClientFromTx=async(tx)=>{
    if(!tx||!tx.clientId)return;
    setLoading(true);
    try{
      const cl=await clients.getById(tx.clientId);
      if(cl)setSelectedClient(cl);
      else pop&&pop("Client record not found (orphan link).","warn");
    }finally{setLoading(false);}
  };

  const openClient=cl=>{setSelectedClient(cl);};

  const filteredClients=useMemo(()=>{
    let list=[...(clientsData||[])];
    // Archive filter — applied BEFORE search so the row count
    // shown in the header reflects the same set the user sees.
    if(!showArchived)list=list.filter(cl=>!cl.archived);
    if(cliSearch){
      const q=cliSearch.toLowerCase();
      list=list.filter(cl=>SEARCH_FIELDS.some(f=>sS(cl[f]).toLowerCase().includes(q)));
    }
    list.sort((a,b)=>{
      const ad=a.lastTxAt?new Date(a.lastTxAt).getTime():0;
      const bd=b.lastTxAt?new Date(b.lastTxAt).getTime():0;
      return sortDir==="desc"?bd-ad:ad-bd;
    });
    return list;
  },[clientsData,cliSearch,sortDir,showArchived]);
  const archivedCount=useMemo(()=>(clientsData||[]).filter(cl=>cl.archived).length,[clientsData]);

  const filteredTxs=useMemo(()=>{
    let list=[...(txList||[])];
    if(cliSearch){
      const q=cliSearch.toLowerCase();
      list=list.filter(tx=>(sS(tx.client&&tx.client.fullName)+sS(tx.client&&tx.client.idNumber)+sS(tx.client&&tx.client.phone)+sS(tx.client&&tx.client.address)+sS(tx.client&&tx.client.email)).toLowerCase().includes(q));
    }
    list.sort((a,b)=>{
      const ad=a.date?new Date(a.date).getTime():0;
      const bd=b.date?new Date(b.date).getTime():0;
      return sortDir==="desc"?bd-ad:ad-bd;
    });
    return list;
  },[txList,cliSearch,sortDir]);

  const txInRangeCount=(txList||[]).filter(t=>{if(!cliFrom&&!cliTo)return true;const d=new Date(t.date),fr=cliFrom?new Date(cliFrom):new Date(0),to=cliTo?new Date(cliTo):new Date();to.setHours(23,59,59);return d>=fr&&d<=to;}).length;

  return <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:10}}>
      <div style={{fontSize:17,fontWeight:"bold",color:T.white}}>Client Files</div>
      <div style={{display:"flex",gap:6}}>
        <button style={c.bsm(mode==="clients"?T.gold:T.border,mode==="clients"?T.bg:T.text)} onClick={()=>setMode("clients")}>Clients</button>
        <button style={c.bsm(mode==="transactions"?T.gold:T.border,mode==="transactions"?T.bg:T.text)} onClick={()=>setMode("transactions")}>Transactions</button>
      </div>
    </div>

    <div style={{display:"flex",gap:8,marginBottom:14}}>
      <input style={{...c.inp(),flex:1}} type="text" placeholder="Search by name, ID, phone, address, email…" value={cliSearch} onChange={e=>setCliSearch(e.target.value)}/>
      <button style={c.bsm()} onClick={()=>setSortDir(sortDir==="desc"?"asc":"desc")} title="Toggle sort direction">
        {sortDir==="desc"?"↓ Newest first":"↑ Oldest first"}
      </button>
    </div>

    {mode==="clients"&&<div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8}}>
        <div style={{fontSize:11,color:T.muted}}>{filteredClients.length}{cliSearch&&" of "+clientsData.length} client{filteredClients.length===1?"":"s"}{!showArchived&&archivedCount>0?" · "+archivedCount+" archived hidden":""}</div>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          {/* 2026-05-07 — archived-clients toggle. Off by default
              so the active list stays uncluttered. Disabled when
              the shop has zero archived records to avoid an
              empty-state confusion. */}
          <label style={{display:"flex",gap:6,alignItems:"center",fontSize:11,color:archivedCount>0?T.muted:T.border,cursor:archivedCount>0?"pointer":"default"}}>
            <input type="checkbox" checked={showArchived} onChange={e=>setShowArchived(e.target.checked)} disabled={archivedCount===0}/>
            Show archived ({archivedCount})
          </label>
          <button style={c.bsm()} onClick={loadClients} disabled={loading}>{loading?"Loading…":"↺ Refresh"}</button>
        </div>
      </div>
      {filteredClients.length===0&&<div style={{...c.card({padding:24}),textAlign:"center",color:T.muted}}>{loading?"Loading…":clientsData.length===0?"No clients yet. They'll appear here as transactions are completed.":"No clients match this search."}</div>}
      {filteredClients.map(cl=>{
        const lv=formatLastVisit(cl);
        return <div key={cl.id} role="button" tabIndex={0} style={{...c.card({padding:12}),marginBottom:8,cursor:"pointer",display:"flex",alignItems:"center",gap:12}} onClick={()=>openClient(cl)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" ")openClient(cl);}}>
          {cl.idPhoto?<img src={cl.idPhoto} alt="" style={{width:48,height:48,borderRadius:"50%",objectFit:"cover",border:"1px solid "+T.border,flexShrink:0}}/>:<div style={{width:48,height:48,borderRadius:"50%",background:T.surface,border:"1px solid "+T.border,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",color:T.muted,fontSize:18}}>👤</div>}
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:2}}>
              <span style={{fontWeight:"bold",color:T.gold,fontSize:13}}>{sS(cl.fullName)||"(no name)"}</span>
              {cl.blacklisted&&<span style={c.badge(T.red)}>⛔ BLACKLISTED</span>}
              {cl.archived&&<span style={c.badge(T.muted)}>📦 ARCHIVED</span>}
              {cl.isTest&&<span style={c.badge(T.muted)}>TEST</span>}
            </div>
            <div style={{fontSize:11,color:T.muted}}>
              {sS(cl.idNumber)&&<span>{cl.idType?sS(cl.idType).toUpperCase()+" "+cl.idNumber:cl.idNumber} · </span>}
              <span>txCount: {cl.txCount||0}</span>
              {lv&&<span> · Last visit: {lv}</span>}
            </div>
          </div>
        </div>;
      })}
    </div>}

    {mode==="transactions"&&<div>
      <div style={c.card({padding:16,marginBottom:14})}>
        <div style={{fontSize:12,fontWeight:"bold",color:T.white,marginBottom:10}}>Batch Download</div>
        <div style={c.g2(10)}><F label="From" type="date" value={cliFrom} onChange={setCliFrom}/><F label="To" type="date" value={cliTo} onChange={setCliTo}/></div>
        <div style={{display:"flex",gap:10}}><button style={c.btn(T.gold,T.bg)} onClick={dlBatch}>⬇ Download Range</button><span style={{fontSize:11,color:T.muted}}>{txInRangeCount} tx in range</span></div>
      </div>
      <div style={{fontSize:11,color:T.muted,marginBottom:8}}>{filteredTxs.length}{cliSearch&&" of "+(txList||[]).length} transaction{filteredTxs.length===1?"":"s"}</div>
      {filteredTxs.map(tx=>(
        <div key={tx.id} style={{...c.card({padding:14}),marginBottom:8,borderLeft:"3px solid "+(tx.smrFlagged?T.orange:tx.ttrRequired?T.red:T.border)}}>
          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between"}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                <span style={{fontWeight:"bold",color:T.gold,fontSize:13}}>{sS(tx.client&&tx.client.fullName||"—")}</span>
                {tx.hasPhotos&&<span style={c.badge(T.green,T.greenBg)}>📷</span>}
                {isBlacklistedName(tx.client&&tx.client.fullName)&&<span style={c.badge(T.red)}>⛔ BLACKLISTED</span>}
                {tx.smrFlagged&&<span style={c.badge(T.orange)}>SMR</span>}
                {tx.tfsOverrideApplied&&<span style={c.badge(T.orange)}>TFS-OVERRIDE</span>}
                {tx.ttrRequired&&<span style={c.badge(T.red)}>TTR</span>}
                {tx.isHobbyProspector&&<span style={c.badge(T.muted)}>HOBBY</span>}
                {tx.clientId&&<span style={c.badge(T.gold,T.goldBg)}>🔗 LINKED</span>}
                {tx.legacyNoId&&<span style={c.badge(T.muted)}>⚠ LEGACY UN-IDED</span>}
              </div>
              <div style={{fontSize:12,color:T.white}}>{fmtAUD(tx.buyTotal)} buy · {fmtAUD(tx.sellTotal)} sell</div>
              <div style={{fontSize:11,color:T.muted,marginTop:2}}>{fmtDate(tx.date)} · {sS(tx.payment).toUpperCase()}</div>
              {tx.clientNote&&<div style={{fontSize:11,color:T.gold,marginTop:4,fontStyle:"italic"}}>{tx.clientNote}</div>}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:5}}>
              <button style={c.bsm(T.goldBg,T.gold)} onClick={()=>dlTx(tx)} title="Download txt + photos">⬇</button>
              <button style={c.bsm(T.border,T.muted)} onClick={()=>{setCliNoteId(tx.id);setCliNoteVal(sS(tx.clientNote));}} title="Edit internal note">📝</button>
              <button style={c.bsm(isBlacklistedName(sS(tx.client&&tx.client.fullName))?T.redBg:T.border,isBlacklistedName(sS(tx.client&&tx.client.fullName))?T.red:T.muted)} onClick={()=>{const nm=sS(tx.client&&tx.client.fullName);if(!nm)return;if(isBlacklistedName(nm))setBlacklist(p=>p.filter(b=>b.name.toLowerCase()!==nm.toLowerCase()));else{setBlacklist(p=>[...p,{name:nm,addedAt:nowISO()}]);pop(nm+" added to blacklist.","warn");}}} title="Toggle blacklist (legacy name-based)">⛔</button>
              {tx.clientId&&<button style={c.bsm(T.goldBg,T.gold)} onClick={()=>openClientFromTx(tx)} title="Open linked client">→</button>}
            </div>
          </div>
        </div>
      ))}
      <button style={{...c.bsm(T.border,T.muted),marginTop:10,fontSize:11,width:"100%"}} onClick={()=>{const rows=[["Invoice","Date","Client","DOB","Buy","Sell","Net","Payment","KYC","TTR","SMR","Hobby","Vic Miner's Right"]];(txList||[]).forEach(t=>rows.push([sS(t.id),sS(t.date&&t.date.slice(0,10)),sS(t.client&&t.client.fullName),sS(t.client&&t.client.dob),sS(t.buyTotal),sS(t.sellTotal),sS(t.net),sS(t.payment),t.kycDone?"YES":"",t.ttrRequired?"YES":"",t.smrFlagged?"YES":"",t.isHobbyProspector?"YES":"",sS(t.vicMinersRightNumber||"")]));const Q='"';const esc=v=>Q+sS(v).replace(/"/g,Q+Q)+Q;dlFile(rows.map(r=>r.map(esc).join(",")).join("\n"),"lootledgr-export-"+todayStr()+".csv","text/csv");pop("CSV exported.","ok");}}>⬇ Export All as CSV</button>
    </div>}

    {selectedClient&&<ClientDetail
      client={selectedClient}
      txList={txList}
      pop={pop}
      onSave={updated=>setSelectedClient(updated)}
      onClose={()=>{setSelectedClient(null);loadClients();}}
      withAdminGate={withAdminGate}
      setSelTx={setSelTx}
      activeStaff={activeStaff}
    />}
  </div>;
}
