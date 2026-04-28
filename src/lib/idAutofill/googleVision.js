// LootLedger — Google Vision API ID autofill provider (STUB).
// Phase 2.7.3. Body intentionally not implemented — the dispatcher,
// Settings UI, and policy gating are all wired up so the only thing
// that lights this provider up is filling in the extract() body and
// the probe() success path. No UI changes needed at that point.
//
// Provider config (read from settings):
//   googleVisionApiKey      (required)
//   googleVisionProjectId   (optional)
//
// Data-handling posture: cloud. ID photos are sent to Google
// Vision's DOCUMENT_TEXT_DETECTION endpoint. Confirm Privacy Act
// 1988 compliance with the customer before enabling.

export default {
  id: "googleVision",
  name: "Google Vision API",
  dataHandlingPosture: "cloud",
  privacyNotice: "⚠ ID photos sent to Google Vision API. Confirm data handling complies with Privacy Act 1988.",

  async extract(/* photo, settings */){
    throw new Error("Not implemented — connect provider via Settings → ID Autofill");
  },

  async probe(/* settings */){
    return {
      ok: false,
      msg: "Provider stub — not implemented yet",
      dataHandlingPosture: "cloud",
    };
  },
};
