# POST /phrasebook-image

## Purpose and boundaries

Independent cover generation from an English watercolor instruction, normally the seed-based
`imagePrompt` returned by [`/context`](context.md). This endpoint makes one image-provider call,
not a separate language-model prompt call. Image failure remains failed image generation even when
creation can continue without the optional cover. Detailed client binding, cancellation, and late
cover behavior belongs to [guided creation](../DESIGN.md#guided-creation); shared persistence belongs
to [the card schema](../CARD_SCHEMA.md). See the [API overview](../API_DESIGN.md) for routing and
outcome conventions.

The server owns the image model, provider, format, aspect ratio, and count. Only server-side
`OPENROUTER_API_KEY` is required. OpenRouter calls use `black-forest-labs/flux.2-klein-4b`, pinned to
Black Forest Labs with fallbacks disabled, requesting one 16:9 PNG. The
[provider endpoint capabilities](https://openrouter.ai/api/v1/images/models/black-forest-labs/flux.2-klein-4b/endpoints)
advertise PNG and 16:9 support; actual response cost is authoritative.

## Request and response

### Request

```json
{"prompt":"English watercolor instruction","output_format":"png"}
```

The request must be a JSON object containing **exactly** these two fields. `prompt` is a string,
trimmed to 1–2,000 characters; `output_format` must be `png`. Extra model/provider/URL/options fields
are rejected. User prompt content cannot change the server-owned routing controls or authorize
remote fetching.

Seed-based watercolor and composition guidance belongs to
[`/context`'s prompt requirements](context.md#prompt-guidance-not-semantic-validation).
This endpoint neither requests nor requires transparency and performs no background removal.
PNG validation does not certify style, seed relevance, or composition.

### Response and acceptance bounds

```ts
{
  image: {dataUrl: string; mediaType: 'image/png'; width: number; height: number};
  usage: {
    model: string; costUsd: number | null; durationMs: number;
    stages: {provider: string; model: string; costUsd: number | null; durationMs: number}[];
  };
}
```

The provider response must be JSON with exactly one `data` entry containing inline `b64_json` PNG
bytes. Remote image URLs and redirects are rejected; no remote fetch or alternate-image selection
occurs. The bounded HTTP response body is at most 8 MiB + 64 KiB. The base64 string must be nonempty,
at most 8 MiB of characters, have length divisible by four, and use valid base64 characters with
at most two trailing padding characters. Decoded file bytes must have the PNG signature and be
at most 6 MiB.

Sharp fully decodes the image, rather than trusting header dimensions alone. It must be a
single-page PNG with nonzero dimensions, at most 4,000,000 pixels, and an aspect ratio whose absolute
difference from 16/9 is at most 0.03. Corrupt compressed data and entirely invisible output are
rejected; opaque RGB/RGBA is valid. Decoder `failOn: 'warning'` settings reject decoder warnings;
they are not recoverable endpoint warnings. No resize, crop, or style repair is performed.

The returned data URL starts with `data:image/png;base64,`. Usage has exactly one stage with
`provider: 'openrouter'` and the fixed model. A finite nonnegative reported charge is used for both
stage and aggregate cost; unavailable or invalid cost is null in both, never invented zero.
Durations are integer milliseconds. Successful image usage currently logs failure level 0 even
when reported cost is unavailable; cost absence is not content failure.

## Pipeline and step outcomes

These eight IDs are logical documentation/reporting checkpoints, not extra calls or emitted log
stages. Apply the shared [success/warning/failure method](../../evals/README.md#step-outcomes-and-criteria)
at the named step and scope. `image.quality` is evaluation-only visual review of relevance, style,
and composition, not a runtime stage or proof supplied by PNG validation.

| Step | Responsibility / success | Warning or recovery | Failure |
|---|---|---|---|
| `image.request` | Parse exact request object into trimmed bounded prompt and PNG format. | No acceptance of extra controls or URLs. | Invalid required data, extra fields, or wrong format: 400 before provider work. |
| `image.prompt` | Build fixed image-model/provider request with PNG/16:9/single-image settings. | No separate language-model call, model/provider fallback, or background removal. | Configuration/credential/construction problems cannot produce a valid image; controlled generation failure is 502. |
| `image.call` | Perform bounded provider fetch/read. | No retry, redirect, or fallback. | HTTP, missing/oversized body, deadline, or transport failure fails the operation; cannot be ignored. |
| `image.envelope.decode` | Decode bounded JSON envelope and extract exactly one inline base64 PNG candidate. | No remote fetch, alternate selection, envelope repair, or invented bytes. | Invalid JSON/shape, wrong image count, or missing inline candidate: 502. |
| `image.png.decode` | Decode bounded base64 and verify byte size/PNG signature. | Not optional enrichment; no encoding repair. | Invalid encoding, excessive bytes, or non-PNG signature: 502. |
| `image.validate` | Fully decode and accept visible single-page PNG within the pixel/aspect bounds above. | Opaque RGB/RGBA is valid. No automatic resize/crop/style repair; decoder warnings are not recovery. | Corrupt, invisible, wrong-format, or out-of-bounds output: 502. |
| `image.assemble` | Build data URL, accepted dimensions, and one-stage usage. | Unknown/invalid cost stays null; current runtime logs level-0 success. No separate final-envelope validator. | No fabricated bytes, dimensions, or cost; controlled operation errors are 502. |
| `image.respond` | Return complete HTTP 200 image/usage. | Loss of optional cover can be nonblocking only at client-creation scope. | Invalid input: 400; controlled provider/decode/operation failure: 502. No response to a disconnected client. |

## Execution limits and recovery

One provider invocation has a 120-second deadline covering the whole operation, including body
reading, JSON/base64 decoding, and PNG inspection. Disconnect aborts work. There is no automatic
retry, redirect, provider/model fallback, or background-removal stage. Client retry/binding and
stale-response behavior remains separate from this operation's outcome.

Historical authenticated smoke, background-instruction comparisons, and tight-framing measurements
are retained in [image prompt evaluation history](../../evals/history/image-prompt-evaluations.md).
They are recorded observations migrated from API design, not new executions, performance guarantees,
or a broad visual-quality acceptance seal.

## Implementation references

- [`api/src/phrasebook-image/index.js`](../../api/src/phrasebook-image/index.js):
  `parsePhrasebookImageRequest`, `performPhrasebookImage`, `decodePng`, `inspectPng`,
  `handlePhrasebookImage`; bounded provider read, deadline, and disconnect handling.
- [`api/src/context/prompt.txt`](../../api/src/context/prompt.txt): seed-based image instruction guidance.
