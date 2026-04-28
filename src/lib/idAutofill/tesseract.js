// LootLedger — Tesseract.js (on-device OCR) ID autofill provider (STUB).
// Phase 2.7.3. Body intentionally not implemented.
//
// Provider config: none. Tesseract runs entirely in the browser via
// WebAssembly. The npm dependency (`tesseract.js`) gets added when
// the body is implemented; not yet a transitive dependency.
//
// Data-handling posture: on-device. The ID photo never leaves the
// device. This is the recommended provider for privacy-sensitive
// deployments. The Settings UI surfaces this as the green-tick
// option ("🔒 On-device — no data leaves your computer").

export default {
  id: "tesseract",
  name: "Tesseract.js (on-device)",
  dataHandlingPosture: "on-device",
  privacyNotice: "🔒 On-device — no data leaves your computer.",

  async extract(/* photo, settings */){
    throw new Error("Not implemented — connect provider via Settings → ID Autofill");
  },

  async probe(/* settings */){
    return {
      ok: false,
      msg: "Provider stub — not implemented yet",
      dataHandlingPosture: "on-device",
    };
  },
};
