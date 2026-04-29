// LootLedger — passphrase crypto + Admin PIN recovery primitives.
// Phase 2.7 smoke-test follow-up batch 2 (2026-04-29).
//
// Pre-Phase-3 minimum viable subset of the recovery system. All
// crypto runs client-side via the WebCrypto API (window.crypto.
// subtle) — zero npm deps, zero network calls, zero secrets in
// transit. The dealer's recovery passphrase is the canonical
// recovery factor; the SMS branch lands in Phase 3 alongside full
// staff auth.
//
// THE FACTORS
//
//   - Admin PIN              — short, the daily-use unlock secret
//                               (4–12 digits). Lives in
//                               settings.staffPin.
//   - Recovery passphrase    — long, generated once at first PIN
//                               setup. The dealer writes it on
//                               paper and stores it offline.
//                               24-character grouped base32, e.g.
//                               "K3M9-X2P7-Q4R8-N1V5-T6W3-J9L0".
//   - Recovery salt          — per-installation, generated once,
//                               base64. settings.adminRecoverySalt.
//   - Encrypted passphrase   — AES-GCM ciphertext of the
//                               passphrase, key derived from PIN +
//                               salt via PBKDF2.
//                               settings.adminRecoveryPassphraseEncrypted
//                               = "<base64 iv>:<base64 ciphertext>"
//   - Passphrase hash        — SHA-256 of the canonicalised
//                               passphrase, hex. Used during
//                               recovery to verify the user knows
//                               the passphrase BEFORE we accept a
//                               new PIN.
//                               settings.adminRecoveryPassphraseHash
//
// THE THREE KEY OPERATIONS
//
//   1) First-time setup
//      generatePassphrase() → display to user.
//      hashPassphrase(passphrase) → store as the verification hash.
//      derivePinKey(pin, salt) → temp key.
//      encryptPassphrase(passphrase, pin, salt) → store the
//        ciphertext as adminRecoveryPassphraseEncrypted.
//      Store salt, hash, ciphertext, plus the PIN itself in
//        staffPin so daily unlocks still work without a derive.
//
//   2) Show passphrase (Settings → Security, gated on Admin PIN)
//      decryptPassphrase(ciphertext, pin, salt) → display.
//      The Admin gate already verified the PIN; decryption is the
//        proof of round-trip. A wrong PIN here means stored salt
//        is corrupt — surface clearly.
//
//   3) Change PIN (gated on current Admin PIN)
//      decryptPassphrase(ciphertext, OLD pin, salt) → passphrase.
//      encryptPassphrase(passphrase, NEW pin, salt) → new ciphertext.
//      Update staffPin and adminRecoveryPassphraseEncrypted.
//      The hash and salt do NOT change; the passphrase itself does
//        not change. Only the encryption layer is rotated.
//
//   4) Recovery via passphrase (lock-screen "Forgot PIN")
//      Verify input passphrase against adminRecoveryPassphraseHash.
//      If match: prompt new PIN.
//      encryptPassphrase(verifiedPassphrase, NEW pin, salt) → store.
//      Update staffPin. Hash and passphrase still don't change.
//
// CANONICALISATION
//
// The passphrase is displayed to the user with hyphen separators
// (groups of four) but verified/encrypted in the canonical form
// (uppercase, hyphens stripped). canonPassphrase normalises any
// reasonable input — the user can paste back with hyphens, spaces,
// or pure-alpha; we strip + uppercase + verify.
//
// BASE32 ALPHABET
//
// We use the Crockford base32 alphabet (no I, L, O, U) so users
// transcribing on paper don't confuse 1/I/L or 0/O. This is a
// non-standard choice — keep it consistent or recovery will fail.

const B32_ALPHABET="0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford
const PBKDF2_ITERATIONS=100000;

function getSubtle(){
  if(typeof window==="undefined"||!window.crypto||!window.crypto.subtle){
    throw new Error("WebCrypto unavailable in this environment.");
  }
  return window.crypto.subtle;
}

function getRandom(bytes){
  if(typeof window==="undefined"||!window.crypto||!window.crypto.getRandomValues){
    throw new Error("crypto.getRandomValues unavailable.");
  }
  const buf=new Uint8Array(bytes);
  window.crypto.getRandomValues(buf);
  return buf;
}

function bytesToBase64(bytes){
  let s="";
  for(let i=0;i<bytes.length;i++)s+=String.fromCharCode(bytes[i]);
  return btoa(s);
}

function base64ToBytes(b64){
  const s=atob(b64);
  const out=new Uint8Array(s.length);
  for(let i=0;i<s.length;i++)out[i]=s.charCodeAt(i);
  return out;
}

function bytesToHex(bytes){
  let h="";
  for(let i=0;i<bytes.length;i++)h+=bytes[i].toString(16).padStart(2,"0");
  return h;
}

function strToBytes(s){
  return new TextEncoder().encode(s);
}

// Strip hyphens / spaces, uppercase, map common visual confusables
// to the Crockford alphabet (I→1, L→1, O→0, U→V — see Crockford
// spec). Result has no separators, all caps, alphabet-clean.
export function canonPassphrase(input){
  const s=String(input==null?"":input).toUpperCase().replace(/[\s-]+/g,"");
  return s.replace(/I/g,"1").replace(/L/g,"1").replace(/O/g,"0").replace(/U/g,"V");
}

// 24 alphabet chars, presented in 6 groups of 4 separated by
// hyphens. ~120 bits of entropy — well above the threshold where
// brute-force is meaningful.
export function generatePassphrase(){
  const bytes=getRandom(24);
  let raw="";
  for(let i=0;i<24;i++)raw+=B32_ALPHABET[bytes[i]&0x1f];
  // Group of 4
  const groups=[];
  for(let i=0;i<24;i+=4)groups.push(raw.slice(i,i+4));
  return groups.join("-");
}

// SHA-256 hex of canonicalised passphrase. Used for fast, salt-free
// equality checks during recovery (we don't need the salt-bound
// strength here because the input space is enormous and the hash
// only confirms knowledge — not derivation).
export async function hashPassphrase(passphrase){
  const subtle=getSubtle();
  const buf=await subtle.digest("SHA-256",strToBytes(canonPassphrase(passphrase)));
  return bytesToHex(new Uint8Array(buf));
}

export async function verifyPassphrase(input,storedHash){
  if(!storedHash)return false;
  const h=await hashPassphrase(input);
  return h===String(storedHash).toLowerCase();
}

// Per-installation random salt for the PBKDF2 derivation. Generated
// once at first-time setup; never rotates. 16 bytes is comfortable
// for PBKDF2/PBKDF2-HMAC-SHA-256.
export function generateSalt(){
  return bytesToBase64(getRandom(16));
}

async function derivePinKey(pin,saltB64,extractable){
  const subtle=getSubtle();
  const baseKey=await subtle.importKey("raw",strToBytes(String(pin||"")),{name:"PBKDF2"},false,["deriveKey"]);
  return subtle.deriveKey(
    {name:"PBKDF2",salt:base64ToBytes(saltB64),iterations:PBKDF2_ITERATIONS,hash:"SHA-256"},
    baseKey,
    {name:"AES-GCM",length:256},
    !!extractable,
    ["encrypt","decrypt"],
  );
}

// Encrypts the canonicalised passphrase under a key derived from
// (pin, salt). Returns "<base64 iv>:<base64 ciphertext>". A fresh
// 12-byte IV every call (AES-GCM standard).
export async function encryptPassphrase(passphrase,pin,saltB64){
  const subtle=getSubtle();
  const key=await derivePinKey(pin,saltB64);
  const iv=getRandom(12);
  const ct=await subtle.encrypt({name:"AES-GCM",iv},key,strToBytes(canonPassphrase(passphrase)));
  return bytesToBase64(iv)+":"+bytesToBase64(new Uint8Array(ct));
}

// Returns the canonical passphrase string on success, or null on
// any decrypt failure (wrong PIN, corrupt ciphertext, missing
// salt). Callers MUST treat null as "wrong PIN" — there's no
// signal-vs-noise distinction at this layer.
export async function decryptPassphrase(ciphertextField,pin,saltB64){
  if(!ciphertextField||!saltB64)return null;
  const sep=String(ciphertextField).indexOf(":");
  if(sep<=0)return null;
  const ivB64=ciphertextField.slice(0,sep);
  const ctB64=ciphertextField.slice(sep+1);
  try{
    const subtle=getSubtle();
    const key=await derivePinKey(pin,saltB64);
    const pt=await subtle.decrypt({name:"AES-GCM",iv:base64ToBytes(ivB64)},key,base64ToBytes(ctB64));
    return new TextDecoder().decode(pt);
  }catch(_){return null;}
}

// Convenience for the first-time setup flow. Wraps the four-step
// dance into one call so the modal layer reads cleanly.
export async function buildRecoveryBundle(passphrase,pin){
  const salt=generateSalt();
  const hash=await hashPassphrase(passphrase);
  const ciphertext=await encryptPassphrase(passphrase,pin,salt);
  return{
    adminRecoverySalt:salt,
    adminRecoveryPassphraseHash:hash,
    adminRecoveryPassphraseEncrypted:ciphertext,
  };
}
