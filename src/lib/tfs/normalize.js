// LootLedger — TFS list normalisers (no xlsx dependency).
//
// Split out of parser.js so the dealer-facing matcher (which only
// needs normalizeName) doesn't pull the xlsx library into the App
// chunk via the static-import graph. parser.js's parseDfatExcel
// stays xlsx-bound; the admin-only upload screen is the sole
// importer of that.
//
// Functions live here verbatim from the parser.js originals.
// parser.js re-exports them for callers that prefer the
// historical entry point.

// "2a" → "2"; "10b" → "10"; "10" → "10"; bare letters → empty.
// Defensive: returns the trimmed input verbatim if no leading digit
// chunk is present, so the row still inserts (won't strand because
// of an exotic reference format).
export function normalizePrimaryReference(ref){
  const s=String(ref||"").trim();
  const m=s.match(/^(\d+)/);
  return m?m[1]:s;
}

// Conservative phonetic substitutions. The aggressive Soundex /
// Metaphone families collapse genuinely different names and produce
// false positives on a list this large (~10k entries). Kept to a
// small set of common transliterations: Russian / Chinese zh→j,
// Arabic / Russian kh→h, Greek/English ph→f, English ck→k.
function applyPhoneticFolds(s){
  return s
    .replace(/zh/g,"j")
    .replace(/kh/g,"h")
    .replace(/ph/g,"f")
    .replace(/ck/g,"k");
}

// Lowercase, ASCII-fold, drop punctuation, collapse whitespace,
// then apply the conservative phonetic folds. Result is what we
// store in tfs_list.name_normalized and what the matcher compares
// the customer's normalized name against.
//
// "Müller" → "muller"
// "Mohammad Al-Sharif" → "mohammad alsharif"
// "Zhang" → "zhang" → phonetic: "jang"
export function normalizeName(name){
  if(!name)return "";
  let s=String(name).toLowerCase();
  // NFD-decompose and strip combining marks. Handles diacritics
  // across European, Vietnamese, etc. without mangling the base
  // characters.
  try{s=s.normalize("NFD").replace(/[̀-ͯ]/g,"");}catch(_){}
  s=s.replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
  s=applyPhoneticFolds(s);
  return s;
}

// Parse a DFAT DOB string into a structured object. See parser.js
// header for the shape contract; behaviour preserved verbatim.
export function parseDobString(raw){
  const s=String(raw||"").trim();
  if(!s||/^not\s+known$/i.test(s)||s==="-")return{type:"unknown"};

  const between=s.match(/between\s+(\d{4})\s+and\s+(\d{4})/i);
  const range=s.match(/\b(\d{4})\s*(?:to|through|[-–—])\s*(\d{4})\b/i);
  if(between){
    const a=parseInt(between[1],10),b=parseInt(between[2],10);
    return{type:"range",yearsRange:[Math.min(a,b),Math.max(a,b)]};
  }
  if(range){
    const a=parseInt(range[1],10),b=parseInt(range[2],10);
    if(a>=1900&&b>=1900&&a<=2100&&b<=2100&&Math.abs(b-a)<=80){
      return{type:"range",yearsRange:[Math.min(a,b),Math.max(a,b)]};
    }
  }

  const dates=[];
  const dateRe=/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;
  let m;
  while((m=dateRe.exec(s))!==null){
    const dd=parseInt(m[1],10),mm=parseInt(m[2],10),yy=parseInt(m[3],10);
    if(dd>=1&&dd<=31&&mm>=1&&mm<=12&&yy>=1900&&yy<=2100){
      dates.push(yy+"-"+String(mm).padStart(2,"0")+"-"+String(dd).padStart(2,"0"));
    }
  }

  let bareYearSrc=s.replace(dateRe,"");
  const years=[];
  const yearRe=/\b(19|20)\d{2}\b/g;
  while((m=yearRe.exec(bareYearSrc))!==null){
    const yy=parseInt(m[0],10);
    if(yy>=1900&&yy<=2100&&!years.includes(yy))years.push(yy);
  }

  if(dates.length===0&&years.length===0)return{type:"unknown"};
  if(dates.length===1&&years.length===0)return{type:"exact",dates,years:[parseInt(dates[0].slice(0,4),10)]};
  const allYears=[...years,...dates.map(d=>parseInt(d.slice(0,4),10))]
    .filter((y,i,arr)=>arr.indexOf(y)===i);
  return{type:"multiple",dates,years:allYears};
}
