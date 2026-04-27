// LootLedger — localStorage wrapper.
// Mechanically extracted from src/App.tsx during Phase 2 step 4.
// No semantic changes; signatures preserved exactly.
//
// All keys are namespaced with the "gf_" prefix (Goldenfrog —
// pre-rename project namespace, retained so existing user data in
// the browser keeps working). The wrapper is the single point of
// access to localStorage for the rest of the app, so any future
// concerns (quota handling, encryption, IndexedDB migration) land
// here without touching call sites.
//
// Errors are swallowed: localStorage can throw in private-mode
// browsers and on quota exceeded. The caller gets the default value
// (or undefined for `set`/`del`) and the app continues.

export const store={
  get:(k,d)=>{try{const v=localStorage.getItem("gf_"+k);return v!=null?JSON.parse(v):d;}catch(_){return d;}},
  set:(k,v)=>{try{localStorage.setItem("gf_"+k,JSON.stringify(v));}catch(_){}},
  del:(k)=>{try{localStorage.removeItem("gf_"+k);}catch(_){}},
};
