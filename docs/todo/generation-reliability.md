---
kind: ledger
status: current
summary: "Generation-reliability milestone: valid JSON, overrun tolerance, latency and DeepSeek capacity for English generation, verified in production."
verified: 2026-11-12
statuses: [open, in-progress, blocked, done]
---

# Generation reliability

Non-prompt API work that makes `/phrasebook` English generation (DeepSeek v4.1 Flash through OpenRouter, `api/src/llms/openrouter.js`) valid, tolerant and fast enough for production. The endpoint behavior these items change is specified in [POST /phrasebook](../api/phrasebook.md).

| Date | Status | Description | Details |
|---|---|---|---|
| 2026-11-12 | blocked | Verify the latency and JSON fixes in production (waits on those fixes shipping) | [details](generation-reliability/production-verification.md) |
| 2026-11-12 | open | Operationalize reliable DeepSeek capacity | [details](generation-reliability/deepseek-capacity.md) |
| 2026-11-12 | open | Make English-generation latency meet the target | [details](generation-reliability/english-latency.md) |
| 2026-11-12 | open | Treat small count overruns as warnings in the English parser | [details](generation-reliability/count-overruns.md) |
| 2026-11-12 | open | Enforce valid JSON for English generation | [details](generation-reliability/valid-json.md) |
