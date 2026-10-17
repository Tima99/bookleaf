# AI integration strategy

The AI helps BookLeaf's team in three places — **classification**, **priority scoring** and
**reply drafting** — while a human always decides what is sent to an author. The system
is designed to keep working when AI is slow, wrong, expensive or unavailable.

## 1. Provider and model choice

**Default provider: OpenAI** (`AI_PROVIDER=openai`). Anthropic remains a drop-in
alternative (`AI_PROVIDER=anthropic`) — the services only depend on the `LlmClient`
interface, so switching providers is configuration, not code.

| Task                                   | Default model | Price (in / out per 1M tokens) | Why                                                                                                                                                                                                                              |
| -------------------------------------- | ------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Triage (category + priority, one call) | `gpt-6-luna`  | $0.10 / $0.50                  | Runs on every new ticket and returns a short structured result → OpenAI's small model for high-volume tasks. Reasoning effort `low`.                                                                                             |
| Reply drafting                         | `gpt-6.1-sol` | $2 / $10                       | Author-facing prose that must follow policy precisely and avoid invented facts. "Near-flagship" quality at a fifth of `gpt-6-astra`'s price; drafts are admin-triggered and cached, so volume is low. Reasoning effort `medium`. |

- Both are overridable per strategy (admin UI) and globally via `AI_TRIAGE_MODEL` /
  `AI_DRAFT_MODEL`. A strategy that pins a model for a _different_ provider is ignored
  safely (the server default is used and a warning is logged), so switching providers never
  sends e.g. a Claude model id to OpenAI.
- **Why OpenAI**: one platform for both tiers with a clear small → mid → flagship ladder;
  the triage tier costs the same as the Claude Haiku tier while the drafting tier
  (`gpt-6.1-sol`, $2/$10) is half the price of Claude Opus 5.5 ($4/$20); strict
  JSON-schema structured outputs; and teams commonly already hold an OpenAI key.
- **Anthropic alternative** (`claude-haiku-5-5` / `claude-opus-5-5`): equally supported;
  a strong choice for policy-constrained writing. Pick per team preference/contract.
- **Why the Vercel AI SDK (v7)**: one provider-agnostic API (`generateText` +
  `Output.object(zodSchema)`), built-in retries/timeouts, typed errors
  (`APICallError`, `RetryError`, `NoObjectGeneratedError`) and schema-validated output.
  `@ai-sdk/openai` uses the Responses API with **strict** JSON-schema structured outputs;
  `@ai-sdk/anthropic` uses Anthropic's native `output_config.format`. Both drop sampling
  parameters for models that don't accept them.
- **Strict-mode-safe schemas**: strict structured-output modes accept only a subset of
  JSON Schema (e.g. no string length limits). The model therefore receives a _model-facing_
  schema (types, enums, numeric bounds, `maxItems`; limits stated in descriptions), and the
  service normalises the result (trim, clamp, cap lists) and validates it against the full
  application schema. Unusable output is treated as `INVALID_OUTPUT` → rules/template
  fallback.

## 2. Architecture

```
TriageService / ResponseDraftService / StrategyTestService
        │  (business logic, fallbacks, persistence, audit, events)
        ▼
LlmClient interface  ── generateStructured({ task, schema, system, prompt, model, … })
        ├── AiSdkLlmClient   (OpenAI / Anthropic via AI SDK, circuit breaker, error normalisation)
        ├── DisabledLlmClient (no key → NOT_CONFIGURED, instant)
        └── FakeLlm          (tests)
```

Model output never writes to the database directly: it is parsed by the SDK against a
Zod schema, re-validated in the client, normalised by the service (e.g. priority floors),
then persisted by the service.

## 3. Classification + priority (triage)

- **One call returns both** (`TriageOutputSchema`: category, self-reported confidence,
  priority, two short evidence-based rationales, escalate flag) — half the latency and
  cost of two calls.
- The system prompt = active **classification strategy** + a compact rubric assembled
  from the six active **priority strategies** (one per category). No knowledge base is
  sent — triage doesn't need it.
- **Deterministic floor rules** (keyword → minimum priority) run after the model and can
  only _raise_ priority. They encode hard policy, e.g. "ISBN errors are always ≥ HIGH"
  (KB), "≈6 months without royalty ≥ HIGH", "legal threat ≥ HIGH". The UI shows which
  rule fired.
- **Confidence** is shown as the model's self-assessment — explicitly _not_ a calibrated
  probability.
- Runs **asynchronously after the ticket is saved**; the author gets a 201 immediately.
- **Admin overrides win**: effective values carry a source (`AI`/`RULES`/`ADMIN`); triage
  uses conditional updates that skip `ADMIN` values, and the AI's own suggestion stays
  visible for comparison. "Re-run AI triage" never overwrites an override.

## 4. Reply drafting

Generated when an admin opens a ticket (once — then cached), or on "Regenerate".

Context sent (bounded):

| Section                  | Content                                                                                                             | Bound                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `<ticket>`               | subject, description, category, priority, open date                                                                 | description ≤ 4,000 chars                                   |
| `<author_facts>`         | name, first name, author-since                                                                                      | —                                                           |
| `<book_facts>`           | ISBN, status/stage, MRP, sold, earned/paid/pending, last payout, partner, platforms — or "not yet published"        | one book                                                    |
| `<royalty_calendar>`     | computed quarter, payout deadlines (quarter end + 45 days), threshold, account-wide pending, "bank linkage unknown" | royalty tickets only                                        |
| `<knowledge_base>`       | 1–3 relevant sections (pinned by strategy + category + keyword match)                                               | ≤ 2,400 chars                                               |
| `<calibration_examples>` | the best-matching sample query → expected approach for the category                                                 | 1 example                                                   |
| `<conversation>`         | latest public messages                                                                                              | strategy `maxHistoryMessages` (default 6), each ≤ 900 chars |

Output (`DraftOutputSchema`): `reply`, `verificationChecklist` (facts the agent must
confirm), `suggestedStatus`, `escalationRecommended`, `knowledgeSectionsUsed`.

Accuracy guardrails:

- Facts the model needs but we don't have are **stated as unknown** in the prompt
  (e.g. bank linkage), and the instructions require turning unknowns into a checklist
  item or a question to the author.
- Payout dates are **computed in code** (`@bookleaf/utils/royalty-calendar`) and passed in —
  the model quotes them instead of guessing.
- Prohibited claims: completed refunds/reprints/escalations, transaction ids, invented
  amounts or dates.
- The admin sees the checklist as checkboxes; sending with unchecked items triggers a
  warning in the confirmation dialog.
- Provenance of every sent reply is stored (`MANUAL`, `AI_DRAFT_UNEDITED`,
  `AI_DRAFT_EDITED`, `TEMPLATE`).

## 5. Configurable strategies

13 defaults are seeded: 1 classification, 6 priority, 6 response (one per category).
Admins can edit, duplicate, enable/disable, preview the composed prompt, test against a
sample ticket, save versions and roll back — see `AI_PROMPTS.md` for fields.

- Exactly one enabled strategy per (kind, category), enforced by a partial unique index.
- Versions are immutable; tickets record the strategy id + version used.
- Active strategies are cached in-process for 30 s and invalidated on every change.
- If every strategy for a scope is disabled, the built-in default (in code) is used, so AI
  behaviour is always defined.
- Admin-authored templates are trusted configuration (admin-only endpoints, validated
  lengths); ticket text can never alter them (see prompt-injection section).

## 6. Cost management

- **Triage**: one small-model call per ticket; no KB; description truncated to 2,500 chars;
  ~400 output tokens max; effort `low`.
- **Drafts**: generated on demand, **cached on the ticket** and reused until a new public
  message arrives → re-opening a ticket or switching tabs costs nothing. Concurrent
  requests for the same ticket share one in-flight call. `force` regenerates explicitly.
- **Context selection** instead of the whole KB / whole history (table above).
- **Rate limits** on AI endpoints (20/min per admin) and ticket creation.
- **Circuit breaker**: after a 429 (respecting `retry-after`) or 3 consecutive provider
  errors/timeouts, calls fail fast for a cool-down instead of piling up.
- **Usage tracking**: every call records model, latency and input/output tokens in
  `airuns`; the AI page shows 24h calls, failures and tokens; per-strategy stats.
- **Estimate (illustrative)**: a triage call ≈ 1.2k input + 150 output tokens; a draft ≈
  2–3k input + 400 output tokens. Check current per-token prices for the chosen models;
  the run log gives real numbers.
- Prompt caching was evaluated: system prompts here (~0.6–1.2k tokens) are below the
  minimum cacheable prefix for most models, so it would add complexity without savings
  at this size. If the KB grows, moving the static KB + instructions into a cached prefix
  is the next step.

## 7. Failure handling

| Situation                          | Behaviour                                                                                                                                                                                                                    |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No API key                         | `DisabledLlmClient`: triage status `SKIPPED`, keyword-rule category/priority (labelled "Rules"); drafts fall back to policy **templates** with `[bracketed]` gaps; UI shows "Manual mode". No calls are attempted or logged. |
| 429 / rate limit                   | `RATE_LIMITED`, circuit opens for `retry-after` (≤5 min); same fallbacks.                                                                                                                                                    |
| Timeout (20 s triage / 60 s draft) | `TIMEOUT`, retried once by the SDK, then fallback.                                                                                                                                                                           |
| 5xx / network                      | `PROVIDER_ERROR`, bounded retry, fallback; 3 in a row opens the circuit.                                                                                                                                                     |
| Invalid / empty structured output  | `INVALID_OUTPUT` (schema enforcement + re-validation), fallback.                                                                                                                                                             |
| Bad key (401/403)                  | `NOT_CONFIGURED` kind, fallback.                                                                                                                                                                                             |

In every case the ticket is created, the queue stays organised, and an admin can reply
manually. Failures are visible (triage panel alert, draft alert, run log) and logged with
the request id — without prompt contents.

## 8. Security considerations

- Keys only in API env vars; never sent to the browser; never logged (pino redaction);
  the AI status endpoint exposes provider/model names only.
- Author text is untrusted: wrapped in delimited sections with `<`/`>` neutralised so it
  cannot close a section or impersonate instructions; prompts state that ticket content is
  data, not instructions; outputs are schema-constrained and always human-reviewed.
- Prompts and outputs are not persisted in logs or the run log (they contain personal
  data); only the draft itself is stored on the ticket for the admin.

## 9. Limitations / next steps

- Keyword fallback is intentionally simple; a cheap embedding classifier could replace it.
- No offline evaluation set yet: next step is a labelled set of real tickets to measure
  classification accuracy and draft quality per strategy version (A/B via strategy versions).
- Drafts are not streamed; with a slow model the admin sees a skeleton for several seconds.
- The circuit breaker and in-flight dedupe are per-process.
- **No live model calls were made while building this submission** — the environment had
  no API key and the sample data was kept local. All AI paths are covered by tests with a
  fake provider; set a key to see real drafts.
