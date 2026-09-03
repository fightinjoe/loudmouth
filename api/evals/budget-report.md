# /textbook budget probe

Generated 2026-09-03T21:24:00.420Z

Measures the candidate multi-conversation generate prompt against each backend's two hard gates:
output tokens vs. ceiling and wall latency vs. timeout. `baseline` = the current single-conversation prompt.
Probe only - see `docs/designs/conversation-first-pivot.md` (Open Questions: Generation budget). Not a contract.

Effective per-backend gates:

- **google**: ceiling 30000 output tokens, timeout 15000 ms
- **g-flash**: ceiling 30000 output tokens, timeout 60000 ms
- **claude**: ceiling 8192 output tokens, timeout 15000 ms
- **chatgpt**: ceiling 16384 output tokens, timeout 60000 ms

## salsa-dancing-in-austin-tx

Topic: `salsa dancing in austin, tx` - Language: `es`

| scenes   | backend  | model                      |     in |     out |  ceiling |  out% |      ms |  timeout |      cost |  json | verdict  |
|----------|----------|----------------------------|--------|---------|----------|-------|---------|----------|-----------|-------|----------|
| baseline | google   | gemini-3.5-flash-lite      |   2855 |    2167 |    30000 |    7% |    7261 |    15000 |   $0.0063 |    ok | PASS     |
| baseline | g-flash  | gemini-3.8-flash           |   2855 |    3950 |    30000 |   13% |   35048 |    60000 |   $0.0170 |    ok | PASS     |
| baseline | claude   | claude-haiku-4-5-20251001  |   3099 |    3270 |     8192 |   40% |   24852 |    15000 |   $0.0194 |   BAD | FAIL     |
| baseline | chatgpt  | gpt-5.6-luna               |   2772 |    4313 |    16384 |   26% |   32693 |    60000 |   $0.0057 |    ok | PASS     |
| 3        | google   | gemini-3.5-flash-lite      |   1402 |    1977 |    30000 |    7% |    5541 |    15000 |   $0.0054 |    ok | PASS     |
| 3        | g-flash  | gemini-3.8-flash           |   1402 |    3689 |    30000 |   12% |   33743 |    60000 |   $0.0149 |    ok | PASS     |
| 3        | claude   | claude-haiku-4-5-20251001  |   1528 |    2629 |     8192 |   32% |   20037 |    15000 |   $0.0147 |   BAD | FAIL     |
| 3        | chatgpt  | gpt-5.6-luna               |   1345 |    4541 |    16384 |   28% |   34099 |    60000 |   $0.0057 |    ok | PASS     |
| 5        | google   | gemini-3.5-flash-lite      |   1402 |    3152 |    30000 |   11% |    8373 |    15000 |   $0.0083 |    ok | PASS     |
| 5        | g-flash  | gemini-3.8-flash           |   1402 |    3899 |    30000 |   13% |   23200 |    60000 |   $0.0157 |    ok | PASS     |
| 5        | claude   | claude-haiku-4-5-20251001  |   1528 |    3089 |     8192 |   38% |   23199 |    15000 |   $0.0170 |   BAD | FAIL     |
| 5        | chatgpt  | gpt-5.6-luna               |   1345 |    5553 |    16384 |   34% |   49100 |    60000 |   $0.0069 |    ok | PASS     |
| 8        | google   | gemini-3.5-flash-lite      |   1402 |    3541 |    30000 |   12% |   10301 |    15000 |   $0.0093 |    ok | PASS     |
| 8        | g-flash  | gemini-3.8-flash           |   1402 |    7016 |    30000 |   23% |   34050 |    60000 |   $0.0274 |    ok | PASS     |
| 8        | claude   | claude-haiku-4-5-20251001  |   1528 |    3773 |     8192 |   46% |   28310 |    15000 |   $0.0204 |   BAD | FAIL     |
| 8        | chatgpt  | gpt-5.6-luna               |   1345 |    7134 |    16384 |   44% |   60321 |    60000 |   $0.0088 |    ok | FAIL     |

**Verdict (serial, this fixture):**

- **google**: serial fits up to 8 conversations (passed: 3, 5, 8).
- **g-flash**: serial fits up to 8 conversations (passed: 3, 5, 8).
- **claude**: no tested N fits serial (passed: none).
- **chatgpt**: serial fits up to 5 conversations (passed: 3, 5).

---

**Reading this report.** A backend PASSES a scene count only when it produced valid JSON under ~98% of its ceiling AND returned under its timeout. If your target conversation count fails serial on any backend you must support, the fan-out (planner + parallel per-conversation fillers, `docs/FANOUT_DESIGN.md`) becomes required, not optional. Compare each N row against the `baseline` row to see the multi-conversation cost delta.
