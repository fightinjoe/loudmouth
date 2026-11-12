---
kind: record
status: current
summary: Local integration smoke for the v4 four-section /phrasebook promotion: real-provider requests, browser save/star/backup and test suites.
verified: 2026-10-29
---

# v4 local promotion smoke (2026-10-29)

**Context.** The v4 promotion changed `/phrasebook` to four sections per topic (Things to say, Likely exchanges with explicit response options, titled Word families, linear Example conversation) and moved web to the fresh seven-table `loudmouth-topic-v4` library. This smoke checked that the API and web integrate end to end on a local machine with the checked-in default providers (`api/src/llm-config.js`). It is integration evidence, not a linguistic baseline, a reliability measurement or deployed behavior. Release state is tracked in [v4 release](../../todo/v4-release.md).

## Real-provider requests

| Request | Result | Server duration | Tokens (in / out) | Cost |
|---|---|---:|---|---:|
| Czech café ordering | HTTP 200, schema v4 | 13,136 ms | 4,160 / 1,691 | $0.003608 |
| Chinese shoe shopping | HTTP 200, schema v4 | 12,310 ms | 4,202 / 3,191 | $0.007044 |

- Czech output contained six Things to say, three exchanges, three families containing ten Words, and seven example turns.
- Chinese output included readings and one recoverable `vocab-source-missing` flag (`groupIndex: 0`, `wordIndex: 7`).

## Browser check

The real Czech response was committed and rendered in Chromium at desktop and 390-pixel mobile widths. All four sections, within-turn “or” separators and family headings were observed; starring persisted through reload. Backup/restore preserved all seven tables. No browser console errors were observed.

## Automated checks

Shared-schema compilation, web typecheck and production build, 130 API tests, 241 web tests (including reruns of corrected fixtures), 51 evaluation-adapter tests, the five-context mock A/B CLI, and gateway YAML/reference checks passed. Mock results are not provider evidence.

## Findings

- These runs verify integration, not translation quality: paraphrase-like exchange choices still occur.
- “这双鞋觉得太紧了。” (Chinese shoe shopping) is a candidate for linguistic review.
