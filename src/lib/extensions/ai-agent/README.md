# `ai-agent` — reserved namespace (Stage 8.8 / 8.9)

**Status:** RESERVED. No code yet. README only.
**Lands at:** Stages 8.8 (Level 1) and 8.9 (Level 2) per `memory/project_roadmap.md`.
**Why this stub exists now:** the Settings → AI Agent section is already shipped as a placeholder in Phase 2; the namespace is reserved here so the future extension has a known import path and the rest of the codebase doesn't accidentally collide on it. Same pattern as the other reserved namespaces under `src/lib/extensions/`.

## Why AI is an extension, not a core feature

AI capabilities (chat trainer, autonomous operation, biometric KYC) are valuable but not load-bearing for the dealer's day-one operation of LootLedger. Buy gold, fill compliance fields, print receipt, file paperwork — none of that needs an AI agent to function. The basic app must be selling to real customers and proving core value before AI is layered on top. Hence: extension, not launch dependency.

## Stage 8.8 — AI Agent Level 1 (chat / trainer)

Scope when this ships:

- Chat UI surfaced as a sidebar / drawer in the staff-facing app.
- Deep app knowledge sourced from `docs/sophiie-training/` (corpus already grows during normal feature development per the locked roadmap).
- **Induction-test transaction generator.** When a new staff member is added, the agent walks them through synthetic transactions (no real records touched) so they learn the flow before doing live ones. Test data is clearly flagged and never exits the dev-style sandbox.
- Optional client-facing channel via the customer portal (Stage 8.1) — different system prompt, narrower scope, never sees compliance internals.
- Optional voice input (Web Speech API on the browser side; provider TBD on server side).
- **Provider abstraction.** OpenAI / Anthropic / Sophiie / local LLM / custom endpoint — same abstraction pattern as `src/lib/idAutofill/` (Phase 2.7) and `src/lib/integrations/stripe.js` (Phase 2.7 follow-up). Sophiie is one option among many, not THE provider.

## Stage 8.9 — AI Agent Level 2 (autonomous operator + biometric KYC)

Scope when this ships:

- **Function-calling agent** that can take actions inside the app — open transactions, search clients, draft compliance fields, run hallmark lookups, suggest follow-up checks. Trust boundary set by the existing Admin-PIN gate model (batch-2 follow-up, 2026-04-29).
- **Live camera + face recognition** — provider-abstracted. Likely AWS Rekognition or Azure Face for the recognition primitive; provider chosen per dealer based on data-residency posture. **Privacy in architecture, not prompt** (per `project_ai_architecture.md`).
- **Liveness detection** — required for any biometric-driven KYC.
- **Confidence-based human fallback.** Low-confidence agent decisions escalate to staff before any compliance-relevant action is taken.
- **AUSTRAC compliance review** is a prerequisite, not a follow-up. The SMR / tipping-off flow under agent control is the highest-stakes surface in the system; do not ship without an audit.

Long-term implication: 8.9 is the building block for the autonomous gold-buying vending machine the dealer has flagged as a future vision.

## What lives here today

Just this README. The `src/lib/extensions/` parent doesn't have any code either — it's a reserved namespace. When 8.8 or 8.9 starts, this folder gains:

- An `index.js` barrel for the chosen exports.
- A `provider/` sub-tree mirroring `src/lib/idAutofill/` shape.
- Provider implementations (one file each).
- A `types.js` for the agreed contract.

## Cross-references

- `memory/project_roadmap.md` — Stage 8.8 / 8.9 entries are the canonical scope.
- `memory/project_ai_architecture.md` — provider-agnostic plumbing, Privacy-Act / AUSTRAC posture, Level 2 legal gating.
- `memory/feedback_folder_components.md` — folder-style extensions scale without item limits.
- `docs/sophiie-training/` — the training corpus this extension consumes.
- `src/components/ui/AIGhost.jsx` — the indicator dot that becomes meaningful once a provider is wired.
