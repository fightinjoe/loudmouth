# POST /phrasebook-title

## Purpose and boundaries

Independently distills a situation/activity/topic seed into an English UI title. It does not feed
context or card generation, and creation does not wait for naming before advancing or saving.
The prompt chooses a concise descriptive name; code owns request bounds, the single-line title
contract, usage, and errors.

Naming failure is a failed endpoint operation even though creation can continue using the seed.
Detailed title freezing, cancellation, reuse, and save-retry behavior belongs to
[guided creation](../DESIGN.md#guided-creation). Local phrasebook storage belongs to
[the shared card schema](../CARD_SCHEMA.md). See the [API overview](../API_DESIGN.md) for shared
routing, trust, backend selection, and outcome conventions.

## Request and response

### Request

```json
{"seed":"Making small talk with other people at a dog park"}
```

The body must be a JSON object, not an array. `seed` is required, a nonblank string after trimming,
and at most 200 characters **before** trimming, matching [`/context`](context.md). Client-supplied
`llm` is rejected. The server selects the text backend: `LLM_BACKEND=gemini-3.5-flash-lite` by default,
or `g-flash`, `claude`, or `chatgpt` (`google` is not an alias).
Trusted instructions and JSON-serialized seed data are separate; request data remains untrusted user
content, and this separation does not eliminate extraction risk.

### Response

```ts
{
  title: string;
  usage: {
    model: string; inputTokens: number; outputTokens: number; totalTokens: number;
    costUsd: number | null; durationMs: number;
  };
}
```

For example, the title may be `Dog Park Chitchat 🐕`. Validation requires a nonempty, trimmed,
single-line title of at most 80 characters. Unrelated model fields are projected away. There is no
truncation or multiline repair. The validator does not certify English, relevance, or style.

The prompt asks for generally 2–6 words, descriptive first and playful when appropriate, with at
most one relevant emoji. Titles must be English even for non-English seeds; sensitive situations
get respectful, clear titles. These are prompt requirements, not semantic validator checks.

Usage reports the actual reply model and token metadata. Costs prefer finite nonnegative
provider-reported charges, then configured estimates; unknown cost is null, not invented zero.
Token defaults do not prove zero consumption. Duration is rounded milliseconds.

## Pipeline and step outcomes

These eight IDs are logical documentation/reporting checkpoints, not extra calls or emitted log
stages. Apply the shared [success/warning/failure method](../../evals/README.md#step-outcomes-and-criteria)
at the named step and scope. `title.quality` is evaluation-only usefulness/style review, not a runtime
stage or guarantee.

| Step | Responsibility / success | Warning or recovery | Failure |
|---|---|---|---|
| `title.request` | Parse bounded, nonblank seed and trim it. | No input repair beyond trimming. | Invalid required input or client `llm`: 400 before provider work. |
| `title.prompt` | Build separated trusted instructions/task data and server-selected 256-token naming request, independent of context/content generation. | No prompt/backend fallback. | Configuration/construction errors are not model-output failures; unexpected errors may be 500. |
| `title.call` | Obtain text/model/usage from one provider invocation. | No application retry. | Provider, no-text, or deadline error: 502. |
| `title.decode` | Directly parse response text as JSON. | No fence extraction or JSON repair. | Invalid JSON fails the output attempt and endpoint with 502. |
| `title.normalize` | Trim title and project away unrelated model fields. | Routine trim is success; no truncation or multiline repair. | Missing/malformed title cannot be normalized into required content; validation rejects it. |
| `title.validate` | Require a nonblank single line of at most 80 characters after trimming. | No semantic certification of English, relevance, or style. | Missing, malformed, overlong, or multiline title: 502. |
| `title.assemble` | Attach shared title usage envelope. | Unknown cost stays null, not content failure; no separate final-envelope validator. | Unexpected assembly errors may be 500; no invented metadata or extra model work. |
| `title.respond` | Return HTTP 200 with valid title/usage. | Seed fallback is warning/degradation at **creation** scope, not successful naming. | Endpoint naming failure: 400/502, or unexpected 500. |

## Execution limits and recovery

One independent, single-turn model call uses a dedicated prompt and a 256-token output ceiling.
The timeout is 15 seconds by default or the adapter's timeout (60 seconds for `g-flash`, `claude`,
and `chatgpt`). There is no application-level retry. Timeout aborts the helper's signal, but the
handler does not wire request-disconnect cancellation. Client abort and stale-result suppression
remain client operations, not proof that paid provider work has stopped.

## Implementation references

- [`api/src/phrasebook-title/index.js`](../../api/src/phrasebook-title/index.js):
  `parsePhrasebookTitleRequest`, `validatePhrasebookTitleResponse`, `performPhrasebookTitle`,
  `handlePhrasebookTitle`.
- [`api/src/phrasebook-title/prompt.js`](../../api/src/phrasebook-title/prompt.js): trusted builder.
- [`api/src/phrasebook-title/prompt.txt`](../../api/src/phrasebook-title/prompt.txt): canonical naming prompt.
- [`api/src/llms/timeout.js`](../../api/src/llms/timeout.js): single-call deadline and signal cleanup.
- [`api/src/pricing.js`](../../api/src/pricing.js): shared text usage accounting.
