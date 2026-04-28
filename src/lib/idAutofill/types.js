/**
 * @file ID-photo autofill provider contract.
 *
 * Phase 2.7.3. Each provider in this folder exports a default object
 * conforming to IdAutofillProvider. The dispatcher (./index.js) loads
 * the active provider from settings.idAutofillProvider and routes the
 * extract / probe calls.
 *
 * Briefing reference: Phase 2.7 spec — "ID AUTOFILL — PROVIDER-
 * ABSTRACTED, FULLY PLUMBED, DORMANT".
 *
 * Cross-reference: memory project_ai_architecture.md — same provider-
 * agnostic pattern as the AI integration spec. The data-handling
 * posture lives in the provider object itself, not in a prompt or
 * a comment, so the dispatcher can refuse PII transmission to
 * non-compliant providers when policy gating lands.
 *
 * This file is JSDoc-only. No runtime exports.
 */

/**
 * @typedef {Object} IdAutofillExtractedFields
 * Subset of the Phase 2.7 client schema the provider could read off
 * the ID photo. All keys optional — partial autofill is the norm.
 *
 * @property {string} [fullName]
 * @property {string} [dob]              ISO yyyy-mm-dd
 * @property {string} [address]
 * @property {string} [idType]           e.g. "dl", "pp"
 * @property {string} [idNumber]
 * @property {string} [phone]
 * @property {string} [email]
 */

/**
 * @typedef {Object} IdAutofillProbeResult
 * @property {boolean} ok                Did the connection / credentials probe succeed?
 * @property {string} msg                Human-readable status for the toast.
 * @property {("cloud"|"on-device"|"byo")} [dataHandlingPosture]
 *   Optional — repeated from the provider object so the toast can
 *   surface the right privacy reminder alongside the status.
 */

/**
 * @typedef {Object} IdAutofillProvider
 * @property {string} id
 *   Internal identifier matching settings.idAutofillProvider value
 *   (e.g. "googleVision", "awsTextract", "tesseract", "llmVision").
 * @property {string} name
 *   Human-readable name for the Settings dropdown.
 * @property {("cloud"|"on-device"|"byo")} dataHandlingPosture
 *   "cloud"     — photo travels to a third-party server (Google,
 *                 AWS, OpenAI, Anthropic, etc.).
 *   "on-device" — photo never leaves the device (Tesseract.js).
 *   "byo"       — bring-your-own server / self-hosted endpoint;
 *                 user accepts the risk via configuration.
 * @property {string} privacyNotice
 *   Privacy-Act-1988-compliant warning string surfaced in the
 *   Settings panel under the provider's credentials.
 * @property {function(string, Object): Promise<IdAutofillExtractedFields>} extract
 *   (photoBase64, settings) => extracted fields. Throws if the
 *   provider isn't implemented or credentials are missing.
 * @property {function(Object): Promise<IdAutofillProbeResult>} probe
 *   (settings) => connection / credentials check for the Settings
 *   "Test Connection" button.
 */

// (no runtime exports)
