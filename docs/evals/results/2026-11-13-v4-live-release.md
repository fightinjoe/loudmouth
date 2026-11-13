---
kind: record
status: current
summary: "v4 live release on 2026-11-13: Node 24 Cloud Run revision, gateway config, dependency audit, live API checks and English-prompt spot-check."
verified: 2026-11-13
---

# v4 live release verification

The v4 API and gateway were deployed to project `fightinjoe-loudmouth` on 2026-11-13 with `api/deploy.sh` (selectors `LLM_BACKEND=gemini-3.5-flash-lite`, `PHRASEBOOK_GENERATION_BACKEND=deepseek-v4.1-flash`), followed by the web. Release status is owned by [v4 release](../../todo/v4-release.md); deployment mechanics by [API operations](../../api/operations.md#deployment-reference). Raw responses were inspected and then deleted; they are not retained.

## API and prompt

| Item | Result |
|---|---|
| Previous (rollback) | revision `translation-api-00015-ttf`, gateway config `translation-api-config-20261002-084459` |
| Deployed | revision `translation-api-00017-6qp` (100% traffic), gateway config `translation-api-config-20261113-094027` |
| Node runtime | `run.googleapis.com/build-base-image: …/google-24/runtimes/nodejs24` on the service export |
| Dependency audit | `npm audit --omit=dev` in `api/src`: 0 critical, 0 high, 3 moderate (one `uuid`/`cloudevents`/functions-framework chain; reason in the [dependency record](../../todo/v4-release/api-dependency-vulnerabilities.md)) |
| Preflight | `OPTIONS` from the production web origin on `/context`, `/phrasebook`, `/phrasebook-title`, `/phrase-breakdown`, `/phrasebook-image`: all 204 |
| `/context` | 200 in 2.0 s, `gemini-3.5-flash-lite`, $0.0017 |

The first revision, `translation-api-00016-bg4`, failed every `/phrasebook` request with 502 in under 0.1 s (`OpenRouter request failed`): OpenRouter rejected the `openrouter-api-key` secret's version 1 (created 2026-10-02) with `401 User not found`. The owner added a valid version 2, and `gcloud run services update --update-secrets` rolled revision `00017-6qp`, which serves the results below. A secret's existence in Secret Manager does not prove the key is valid; only a live `/phrasebook` request does.

Prompt spot-check: two Spanish `basics` requests from `evals/fixtures/baseline-phrasebook-english.json`, run sequentially through the gateway.

| Request | HTTP | Time | Groups / checklist | Opener alternatives | English fallback | Generic Words | Counted generic Things to say | Tokens | Cost |
|---|---|---|---|---|---|---|---|---|---|
| `directions-walking-es` | 200 | 18.0 s | 6 / 6 | 0 | 0 | 0 | 0 | 36,318 | $0.0196 |
| `family-dinner-first-meeting-es` | 200 | 8.0 s | 5 / 5 | 0 | 0 | 0 | 2 | 28,652 | $0.0146 |

Both responses had `schemaVersion` 4. **Result: passed** (pass threshold: no opener alternatives, English fallbacks or generic Words, and at most 2 counted generic Things to say).

Findings:

- Counted generic: "Have a good evening." and "See you soon." (dinner, goodbye topic). Borderline and not counted because they are tied to meeting the partner's parents: "It's so nice to finally meet you both.", "It was wonderful to meet you both.".
- Thanks to hosts, the known [backlog gap](../../todo/backlog/host-thanks.md), not counted: five lines in the dinner response ("Thank you so much for inviting me to your home for dinner.", "The meal was wonderful, thank you.", "Thank you for having me over for dinner.", "Thanks again for your hospitality.", "I really appreciated the meal.").
- The walking topic "Thank the helper" contains no thanks; its Things to say repeat direction questions from other topics, and "Get someone's attention" contains no attention-getter. The no-generic-language rule empties topics whose purpose is a pleasantry.
- Repetition across walking topics: "Should I turn left or right at the next street?" appears in three topics.
- Invented learner facts are inconsistent within the dinner response: "I've heard wonderful things about you from your son." and "I met your daughter at work.".
- Generation-stage latency (`durationMs`) was 10.6 s and 7.8 s.

Total paid cost of the live API checks: about $0.036.
