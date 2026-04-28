// LootLedger — AWS Textract ID autofill provider (STUB).
// Phase 2.7.3. Body intentionally not implemented.
//
// Provider config (read from settings):
//   awsTextractAccessKey  (required)
//   awsTextractSecretKey  (required)
//   awsTextractRegion     (required, e.g. "ap-southeast-2")
//
// Data-handling posture: cloud. ID photos are sent to AWS Textract
// (AnalyzeID API). Confirm Privacy Act 1988 compliance with the
// customer before enabling.

export default {
  id: "awsTextract",
  name: "AWS Textract",
  dataHandlingPosture: "cloud",
  privacyNotice: "⚠ ID photos sent to AWS Textract. Confirm data handling complies with Privacy Act 1988.",

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
