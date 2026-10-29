# POST /context

## Purpose and boundaries

Sets up situation preparation: one model call turns a situation, activity, or topic seed and target
language into clarifying questions, a conversation checklist, and an English seed-based
`imagePrompt`. The API is stateless and retains no setup session. The model decides which unknown
facts and conversations matter; code owns request limits, ability sanitization, structure,
normalization, and usage. Latency is the primary operational metric; under 10 seconds end to end is
a target, not a provider-independent guarantee.

The client collects answers, independently requests a title and cover, and later calls
[`/phrasebook`](phrasebook.md). Detailed interaction and cancellation behavior belongs to
[guided creation](../DESIGN.md#guided-creation); persistence belongs to
[the shared card schema](../CARD_SCHEMA.md#atomic-lifecycle). See the
[API overview](../API_DESIGN.md) for shared routing, trust, backend selection, and outcome conventions.

## Request and response

### Request

```json
{"seed":"salsa dancing in Austin, TX","language":"zh"}
```

| Field | Required | Rules |
|---|---|---|
| `seed` | yes | String, nonblank after trimming; at most 200 characters **before** trimming. |
| `language` | yes | One of `zh`, `ja`, `es`, `cs`, `uk`. |
| `ability` | no | `none`, `basics`, or `conversational`; invalid values are omitted. |

The body must be a JSON object, not an array. Client-supplied `llm` is rejected; the server selects
the text backend. Trusted instructions are separate from JSON-serialized user task data, including
the language and optional ability; this separation does not eliminate prompt extraction risk.
The default `LLM_BACKEND` is `gemini-3.5-flash-lite`; supported alternatives are `g-flash`, `claude`,
and `chatgpt` (`google` is not an alias).

### Response

```ts
{
  questions: {label: string; options: string[]}[];
  checklist: {label: string; checked: boolean}[];
  imagePrompt: string;
  usage: {
    model: string; inputTokens: number; outputTokens: number; totalTokens: number;
    costUsd: number | null; durationMs: number;
  };
}
```

Runtime validation accepts one or more questions and one or more checklist items. Each question
requires a nonblank string label and at least two nonblank string options; each checklist item
requires a nonblank string label and boolean `checked`. Strings are trimmed and objects projected
to these fields. Every entry is validated before overflow is discarded, including malformed entries
in excess tails. Valid overflow is clamped to five questions, five options per question, and eight
checklist items. A question has no `default` field. `imagePrompt` is required and must contain
1–2,000 characters after trimming.

Usage reports the actual reply model and token metadata. Costs prefer finite nonnegative
provider-reported charges, then configured estimates; unknown cost is `null`. Token defaults do not
prove zero consumption. Duration is rounded milliseconds. Warnings are logged, not extra wire fields.

### Prompt guidance, not semantic validation

The prompt asks for 2–5 questions with 2–5 options each and 5–8 checklist items; the runtime minima
above are deliberately less strict. Questions gather unknown **facts** about the learner or situation
(role, conversation partner, preferences, or constraints) that change which phrases should be prepared:

- Labels are short natural questions, not fragments; each question covers one axis.
- Options are terse, mutually exclusive answers, not lists of topics. Topic-shaped choices become
  separate yes/no questions. Options are ordered most-likely-first, but the web client preselects none.
- Ask only what the seed needs: do not ask for facts already stated, pad questions, or ask proficiency
  questions (the client owns ability).
- The supplied target language may justify a register or cultural axis, such as hidden-ingredient
  strictness for vegan food in Japanese; no cultural axis is mandatory and most seeds get none.

The checklist owns **conversations to prepare**: recognizable 2–5 word titles, one communicative goal
each, ordered along the encounter's arc. `checked` is the model's suggested default. Questions must
not poach that axis.

The image prompt is based on the seed before answers are collected. It chooses a situation-specific
subject in the approved airy wet-on-wet watercolor, 16:9 style, with no people, hands, lettering,
logos, or outlines. Only the restaurant example uses the bowl/plate/water/wine still life; other seeds
need their own subject. Current composition guidance requests close-up subjects on plain white paper,
90–94% frame occupancy and a narrow 3–5% target safety margin, with long objects horizontal or diagonal.
These are generation instructions, not validated framing, visual quality, cropping, or alpha
transparency guarantees. See [`/phrasebook-image`](phrasebook-image.md) for image acceptance bounds.

## Pipeline and step outcomes

These eight IDs are logical documentation/reporting checkpoints, not extra calls or emitted log
stages; validation and normalization may interleave in one function. Apply the shared
[success/warning/failure method](../../evals/README.md#step-outcomes-and-criteria) at the named step
and scope. `context.quality` is evaluation-only review of relevance, checklist usefulness, and image
prompt usefulness, not a runtime stage or guarantee.

| Step | Responsibility / success | Warning or recovery | Failure |
|---|---|---|---|
| `context.request` | Parse object into trimmed seed, supported language, sanitized optional ability. | Invalid optional ability is omitted; no dedicated warning event. | Invalid required input or client `llm`: 400 before provider work. |
| `context.prompt` | Build trusted instructions separate from JSON task data and server-selected 2,000-token request. | No alternate prompt/backend recovery. | Configuration/construction errors are not model-output failures; unexpected errors may be 500. |
| `context.call` | Obtain text, reported model, and usage from one provider invocation. | No application retry. | Provider, no-text, or deadline error: 502. |
| `context.decode` | Directly parse model text as JSON. | No fence stripping or JSON repair. | Invalid JSON: failed output attempt and endpoint, 502; wrong decoded shape proceeds to required validation. |
| `context.validate` | Validate all questions/options/checklist entries and required image prompt against the bounds above. | No semantic question/style validator or separate final-envelope pass. | Malformed required entries, even beyond retained caps: 502. |
| `context.normalize` | Trim/project valid fields and bound lists. | Valid overflow logs `context_clamped` and retains success at failure level 1. Routine trimming/projection is not a logged warning. | Required defects are not repaired by discarding excess tails; validation fails them. |
| `context.assemble` | Attach provider metadata and shared pricing usage to shaped content. | Missing cost stays null; token defaults are not evidence of zero consumption. | No further model call, inferred quality grade, or independent envelope-validation recovery. Unexpected assembly errors may be 500. |
| `context.respond` | Return complete HTTP 200 result. | Clamping succeeds with log warnings, not warning response fields. | Required input: 400; provider/output: 502; unexpected configuration/programming errors may be 500. |

## Execution limits and recovery

One single-turn model call runs per request, with a 2,000-token output ceiling and JSON output
(`responseMimeType: application/json` on Google backends). The timeout is 15 seconds on the default
backend, or the adapter's timeout: 60 seconds on `g-flash`, `claude`, and `chatgpt`.
There is no application-level retry. Timeout aborts the helper's signal, but this handler does not
wire request-disconnect cancellation. Client cancellation/stale-response suppression is a separate
boundary, described in [guided creation](../DESIGN.md#guided-creation).

## Implementation references

- [`api/src/context/index.js`](../../api/src/context/index.js): `parseContextRequest`,
  `validateContextResponse`, `performContext`, `handleContext`.
- [`api/src/context/prompt.js`](../../api/src/context/prompt.js): `buildContextPrompt`.
- [`api/src/context/prompt.txt`](../../api/src/context/prompt.txt): canonical semantic instructions.
- [`api/src/llms/timeout.js`](../../api/src/llms/timeout.js): single-call deadline and signal cleanup.
- [`api/src/pricing.js`](../../api/src/pricing.js): shared text usage accounting.
