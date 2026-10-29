# Historical image prompt evaluations

This is recorded evidence migrated from `docs/API_DESIGN.md` during documentation reorganization,
not new execution. Only the authenticated smoke below was explicitly dated 2026-10-01 in the source.
The source did not record dates for the background-instruction and tight-framing comparisons; their
dates are unavailable and must not be inferred from the smoke date. Current endpoint behavior lives
in [`POST /phrasebook-image`](../../docs/api/phrasebook-image.md), not in these historical results.

## Authenticated local smoke — 2026-10-01

Only server-side `OPENROUTER_API_KEY` is required. An authenticated local `/phrasebook-image`
smoke on 2026-10-01, using the revised `/context` image prompt for Japanese vegan dining, returned
HTTP 200 and passed the shared response validator: opaque 1824×1024 PNG, 1,132,565 bytes,
4.4 seconds wall time, reported cost $0.015. The watercolor was visually inspected on white.
This single observation is not a latency or broad visual-quality guarantee.

## Background-instruction comparison — date unavailable

With explicit user approval, the two background instructions in `context/prompt.txt` changed from
transparent to plain white; other style instructions stayed unchanged. Live before/after evaluations
used `gemini-3.5-flash-lite` with identical seeds, languages, and `basics` ability:

| Input | Context latency before → after | Input tokens before → after | Output tokens before → after |
|---|---|---|---|
| Vegan dining / Japanese | 6,439 → 5,810 ms | 1,510 → 1,511 | 463 → 526 |
| Salsa / Spanish | 1,856 → 1,737 ms | 1,510 → 1,511 | 468 → 457 |
| Pharmacy / Czech | 1,926 → 1,808 ms | 1,513 → 1,514 | 469 → 503 |

All six responses passed context validation. All three original image prompts requested a
transparent background; all three revised prompts requested plain white and no transparency.
Seed-specific objects and watercolor style were retained. Questions/checklist wording varied;
one call per input/version does not establish a causal latency or output-token change.

## Tight-framing prompt evaluation — date unavailable

With explicit user approval, the two composition instructions in `context/prompt.txt` replaced
the wide vignette/lots-of-empty-space wording with close-up, nearly edge-to-edge subjects.
FLUX.2 Klein 4B, 16:9 output, the white background, and watercolor style remain unchanged.
The evaluation used the real context and image pipelines with `basics` ability, one observation
per input/version, and visual inspection of the generated images. All context and image outputs
passed their existing validators; all images were 1824×1024.

| Input | Average blank side margin before → final | Context latency before → final | Image latency before → final |
|---|---|---|---|
| Vegan dining / Japanese | 20.3% → 7.5% | 5,561 → 5,623 ms | 3,671 → 4,363 ms |
| Salsa / Spanish | 26.2% → 6.4% | 2,048 → 2,000 ms | 3,247 → 4,081 ms |
| Surfboard rental / Spanish | 25.5% → 3.8% | 2,135 → 1,772 ms | 3,852 → 4,392 ms |

Margins above average the left/right distance to the bounding box of pixels with any RGB channel
below 235. This includes painted washes, not just main objects; pale watercolor boundaries are
approximate. Visual inspection confirmed larger subjects without clipped main objects. Final
individual margins ranged from 2.7% to 10.6%, so the 3–5% target is not a guarantee.

| Input | Context input tokens before → final | Context output tokens before → final | Image prompt tokens before → final |
|---|---|---|---|
| Vegan dining | 1,511 → 1,617 | 463 → 500 | 229 → 273 |
| Salsa | 1,511 → 1,617 | 461 → 482 | 214 → 262 |
| Surfboard rental | 1,515 → 1,621 | 526 → 485 | 226 → 264 |

Image output usage stayed at 7,291 tokens and $0.015 per image. The initial intermediate draft
left 12–19% side margins and was strengthened before acceptance; its salsa and surfing calls
took about 33 seconds each. Across baseline, intermediate, and final evaluations, nine images
cost $0.135 and context calls reported $0.0151382. The small non-deterministic sample does not
establish a causal latency change or production reliability. Only new creation flows after an API
restart use the revised prompt; saved images are unchanged.
