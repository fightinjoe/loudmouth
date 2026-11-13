---
kind: record
status: current
summary: "API deployment of generation reliability on 2026-11-13: revision, rollback targets, live gateway checks, structured logs in Cloud Logging, and the web incompatibility accepted until the web ships."
verified: 2026-11-13
---

# Generation reliability: API deployment

The API from commit `2ccd2ef` (branch `feat/438-generation-reliability`) was deployed to project `fightinjoe-loudmouth` on 2026-11-13 with `api/deploy.sh` (selectors `LLM_BACKEND=gemini-3.5-flash-lite`, `PHRASEBOOK_GENERATION_BACKEND=deepseek-v4.1-flash`). The web was not deployed. Production state is owned by [API operations](../../api/operations.md#production). Raw responses were inspected and then deleted.

| Item | Result |
|---|---|
| Previous (rollback) | revision `translation-api-00017-6qp`, gateway config `translation-api-config-20261113-094027` |
| Deployed | revision `translation-api-00018-2js` (100% traffic), gateway config `translation-api-config-20261113-161004` (active) |
| Preflight | `OPTIONS /phrasebook` from the production web origin: 204 |
| `/context` | 200 in 6.9 s, `gemini-3.5-flash-lite` |
| `/phrasebook` (`directions-walking-es`, 6 topics) | 200 in 8.2 s, then 5.8 s after the gateway update; about $0.02 each. The v4 baseline for this request was 18.0 s ([v4 live release](2026-11-13-v4-live-release.md)) |
| English per topic (first request) | 6 topics, all on Together, p50 1.8 s, max 2.3 s |
| Flags | First request: 1 `count-overrun`, 3 `speaker-repeated`, 2 `vocab-source-missing`. Second: 1 `count-overrun` |

**Result: passed.** Total paid cost of the live checks was about $0.04.

## Findings

- **Structured logs work in production.** Events arrive as `jsonPayload` with `requestId`, and `scripts/generation-report.mjs --since 30m` read them.
- **Logs are delayed until the instance's next request.** A request's last events (the final `llm_call`, `phrasebook_ok` and `usage`) appeared in Cloud Logging only after the next request on that instance. Cloud Run limits CPU between requests, and the asynchronous stdout writes are not flushed before the response is sent. Reports over recent windows can undercount the latest request; an instance shut down while idle may never write them.
- **The live web is incompatible until it is redeployed.** Its shared schema rejects the new flag codes, and most responses carry `count-overrun`. Owner decision 2026-11-13: deploy the API now and the web later through the normal merge.
