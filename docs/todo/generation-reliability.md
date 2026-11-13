---
kind: ledger
status: current
summary: "Generation-reliability milestone: valid JSON, English reply repair, tolerated and flagged count overruns, performance-based provider routing for English generation, verified in production."
verified: 2026-11-13
statuses: [open, in-progress, blocked, done]
---

# Generation reliability

Non-prompt API work that makes `/phrasebook` English generation (DeepSeek v4.1 Flash through OpenRouter, `api/src/llms/openrouter.js`) valid, tolerant and fast enough for production. The endpoint behavior these items change is specified in [POST /phrasebook](../api/phrasebook.md).

| Date | Status | Description | Details |
|---|---|---|---|
| 2026-11-13 | done | Repair partially invalid English replies: drop, merge or flag broken items, retry only for unusable sections | [details](generation-reliability/reply-repair.md) |
| 2026-11-13 | open | Verify the latency and JSON fixes in production (fixes deployed 2026-11-13) | [details](generation-reliability/production-verification.md) |
| 2026-11-13 | done | Route English generation by provider performance through OpenRouter | [details](generation-reliability/provider-routing.md) |
| 2026-11-13 | done | Tolerate and flag count overruns in English generation | [details](generation-reliability/count-overruns.md) |
| 2026-11-13 | done | Enforce valid JSON for English generation | [details](generation-reliability/valid-json.md) |
