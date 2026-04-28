// LootLedger — ID-autofill dispatcher.
// Phase 2.7.3. Reads settings.idAutofillProvider, routes to the
// matching provider stub. Returns {} immediately when "none" or
// unset — no network call.
//
// Adding a new provider is drop-in: write a file beside this one
// that default-exports an IdAutofillProvider (see ./types.js),
// import it here, and add it to the PROVIDERS map. The Settings
// dropdown in 2.7.4 reads PROVIDERS to populate options.
//
// Cross-reference: memory project_ai_architecture.md — same
// pluggable-provider pattern as the AI integration spec. The
// data-handling posture lives in the provider object itself
// (declared in each ./<provider>.js file) so the dispatcher can
// gate PII transmission on the active deployment's policy when
// that gating lands.
//
// === PRIVACY POSTURE TODO ===================================
// extractIdFields() will (when providers are implemented) be sent
// a customer's ID photo — categorically PII. Before forwarding to
// any provider whose dataHandlingPosture is "cloud" or "byo", the
// dispatcher should:
//   - check settings.allowedDataHandlingPostures (default
//     ["on-device"] — strictest) and refuse to forward if the
//     active provider's posture isn't permitted;
//   - log the transmission to the same 7-year retention as the
//     transaction (per AI architecture memory: AI-mediated
//     conversations follow the same retention as transactions);
//   - surface the privacy notice in the UI on every capture, not
//     just in Settings — the user must consent each time.
// For 2.7.3 the only providers are stubs that throw, so the gate
// is a no-op. Land the policy gate when the first real provider
// extract() body is filled in.

import googleVision from "./googleVision.js";
import awsTextract from "./awsTextract.js";
import tesseract from "./tesseract.js";
import llmVision from "./llmVision.js";

export const PROVIDERS={
  googleVision,
  awsTextract,
  tesseract,
  llmVision,
};

// Resolve the active provider object from settings. Returns null
// when "none" / unset / unknown — caller should treat as "skip
// autofill, fall through to the manual KYC form".
export function getProvider(settings){
  const id=settings&&settings.idAutofillProvider;
  if(!id||id==="none")return null;
  return PROVIDERS[id]||null;
}

// Public API. Always resolves; never rejects on the no-provider
// case. The provider itself may throw if implemented incorrectly
// or if credentials are missing — those errors propagate so the
// UI can fall back to the manual KYC form.
export async function extractIdFields(photo,settings){
  const provider=getProvider(settings);
  if(!provider)return {};
  return await provider.extract(photo,settings);
}

// Test-connection probe for the Settings panel "Test" button.
// Returns the IdAutofillProbeResult shape regardless of provider
// state — unknown id reports cleanly rather than throwing.
export async function probeProvider(providerId,settings){
  const provider=PROVIDERS[providerId];
  if(!provider)return {ok:false,msg:"Unknown provider: "+providerId};
  return await provider.probe(settings);
}
