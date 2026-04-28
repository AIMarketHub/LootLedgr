// LootLedger — LLM-with-vision ID autofill provider (STUB).
// Phase 2.7.3. Body intentionally not implemented.
//
// This is a meta-provider — it routes to an LLM with vision support
// (Anthropic Claude, OpenAI GPT-4V, or "other" self-hosted /
// alternative). The sub-routing is settings-driven so swapping
// LLMs is a config change, not a code change. Mirrors the pattern
// captured in memory project_ai_architecture.md (provider
// abstraction is critical; better models will exist by the time
// this ships).
//
// Provider config (read from settings):
//   llmVisionSubProvider  ("anthropic" | "openai" | "other")
//   llmVisionApiKey       (required)
//   llmVisionModel        (e.g. "claude-opus-4-7", "gpt-4-vision-preview")
//   llmVisionEndpoint     (only when sub-provider === "other")
//
// Data-handling posture: cloud (or "byo" when sub-provider is
// "other" with a self-hosted endpoint — the body, when implemented,
// should report the appropriate posture in probe() based on config).

export default {
  id: "llmVision",
  name: "LLM with vision",
  dataHandlingPosture: "cloud",
  privacyNotice: "⚠ ID photos sent to your configured LLM provider. Confirm data handling complies with Privacy Act 1988.",

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
