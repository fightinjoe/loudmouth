# Prompt-development methodology

How the `/context` prompt was developed, captured so the `/phrasebook` prompt follows the
same process. The prompt is the primary artifact; service code comes only after the prompt
is accepted.

> **Status (2026-09-13):** the `/phrasebook` prompts are ACCEPTED and this directory is
> flattened (`prompt.txt` + `NOTES.md` + `responses/`, plus `translate/` with the same
> shape). See `NEXT_STEPS.md` for the endpoint build handoff, and the
> "/phrasebook additions" section at the bottom of this file for practices this
> endpoint added to the methodology.

## The loop

1. **Settle the design forks first.** Before drafting, resolve with the user the decisions
   that change the prompt's shape: inputs (is it language-aware?), output schema, size
   bounds, carryover of old rules (default: start minimal, re-add a rule only when a test
   seed shows the failure it guarded against).
2. **Draft trusted instructions** as plain text, with request data supplied separately
   as JSON user content. Only server-owned language-rule blocks may use template slots.
   Keep instructions short and concrete with one compact shape example. Include the
   untrusted-data boundary without rejecting legitimate imperative learning content.
3. **Run the standard eval seeds** (all 5, every iteration — reruns are ~1.5s each and
   full coverage catches regressions that spot-checks miss).
4. **Print every result in full for the user.** Never summarize away the outputs — the
   user reviews them personally (formatting below).
5. **Critique with a scorecard** against the current version's explicit targets: one line
   per target, ✅ fixed / ⚠️ partial, then a separate list of **new regressions**. Classify
   each finding as *hard fail* vs. *nit* (nits get folded into the next real revision, not
   their own version).
6. **User verdict.** The user accepts or redirects; their caveats become the next
   version's targets, recorded in NOTES.md before drafting the revision.
7. **One change-set per version.** Watch for overcorrection: a rule added to fix one seed
   routinely breaks another (e.g. a terseness rule for options bleeding into labels; an
   anti-padding rule deleting a genuinely needed question). The scorecard's "new
   regressions" section exists to catch this.
8. **Capture, then iterate.** Superseded versions are deleted once their lessons are in
   NOTES.md. When accepted, the endpoint's dir is flattened to `prompt.txt` + `NOTES.md` +
   `responses/`, and the deployed copy (`api/src/<endpoint>-prompt.txt`) must stay
   byte-identical (verify with `diff`).

## Naming and capture

During iteration, each version lives in `prompts/<endpoint>/vNN/`:

```
prompts/<endpoint>/
  methodology.md          (this file)
  vNN/
    prompt.txt            the template, verbatim
    NOTES.md              see below
    responses/
      response_<tag>.json full raw API response (incl. usageMetadata), one per seed
```

Tags are one-word seed handles used everywhere (filenames, tables, chat): `salsa`, `surf`,
`vegan`, `directions`, `sick`.

`NOTES.md` per version records: model + date + config; **changes from the previous
version**; a runs table (tag, seed, language, latency, tokens in/out, question count);
scorecard vs. the version's targets; regressions; verdict (`ACCEPTED` / targets for the
next version). The accepted version's NOTES also transcribes the full parsed outputs so
the baseline survives without re-parsing the raw JSON.

## Runner

The production-path baseline/adversarial runner is `api/evals/scripts/eval-adversarial.js`.
It uses the actual builders, provider adapters, validators, and five standard fixtures.
Run with `--mode=baseline` for quality/latency and `--mode=adversarial` for synthetic-canary
attacks; `--mode=all` does both. Full raw model text and per-stage metadata are saved.
Extraction scoring is observational, not a confidentiality guarantee.

Historical direct-provider Python runners remain useful for candidate templates and
frozen-source comparisons. Their native system/user boundaries mirror the service:

```python
import json, subprocess, time, os

tmpl = open("prompts/<endpoint>/vNN/prompt.txt").read()
seeds = [("salsa dancing in Austin, TX", "es", "salsa"), ...]
key = os.environ["GEMINI_API_KEY"]
url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent"

for seed, lang, tag in seeds:
    task = json.dumps({"seed": seed, "language": lang})
    payload = json.dumps({
        "systemInstruction": {"parts": [{"text": tmpl}]},
        "contents": [{"role": "user", "parts": [{"text": task}]}],
    })
    t0 = time.time()
    r = subprocess.run(["curl", "-sS", "-H", f"x-goog-api-key: {key}",
                        "-H", "Content-Type: application/json", "-d", payload, url],
                       capture_output=True, text=True)
    dt = time.time() - t0
    open(f"responses/response_{tag}.json", "w").write(r.stdout)
    resp = json.loads(r.stdout)
    text = resp["candidates"][0]["content"]["parts"][0]["text"]
    u = resp["usageMetadata"]
    print(f"=== {tag} ({lang}) — {dt:.2f}s, in {u['promptTokenCount']} out {u['candidatesTokenCount']} ===")
    print(text)
```

Latency, input tokens, and output tokens are reported for every run; latency is the
primary product metric (`/context` <10s target; measured 1.1–1.6s).

## Presentation format

Each seed's result is presented to the user like this (chat/terminal, GitHub markdown):

```
### 1. salsa dancing in Austin, TX — Spanish (1.2s)

**Questions:**
1. **What is your dancing ability?** — Complete beginner / Intermediate dancer / Advanced lead/follow
2. **Who are you going with?** — Going solo / With a date or partner / With a group of friends

**Checklist:**
- ✅ Ask someone to dance
- ✅ Accept or decline a dance
- ⬜ Say goodbye and swap contacts
```

Rules: numbered `###` heading per seed with seed text, language name, and latency; bold
question labels with options slash-separated on one line, first option = default; checklist
as ✅ (checked) / ⬜ (unchecked) bullets; the scorecard and regression list follow all five
results, never replace them.

## Eval inputs for /phrasebook

`inputs/input_<tag>.json` — one per seed, hand-selected from the accepted `/context`
baseline (`prompts/context/responses/`). Each fixture is the client-side state a real
learner would produce: the seed, the language code, one chosen option per question, and
exactly 3 selected checklist items:

```json
{
  "seed": "salsa dancing in Austin, TX",
  "language": "es",
  "answers": { "<question label>": "<chosen option>" },
  "checklist": ["<label>", "<label>", "<label>"]
}
```

Selections deliberately mix defaults (first options) and non-defaults so the eval covers
both paths.

Fixtures may omit `ability`; runners default it to `basics`. `runners/run_ability.py`
sweeps one fixture across all ability levels — used when a rule might behave differently
per level.

## /phrasebook additions to the methodology

Practices added while developing `/phrasebook` (Steps A–C, v00–v09 + translate v00–v05):

- **Stage the output schema.** Phrases first (Step A), vocab second (B), translations +
  readings last (C). Each stage got its own accepted baseline before the next started;
  translation iterated against *frozen* accepted generation responses so regressions
  were unambiguously attributable.
- **Multi-prompt endpoints.** A sub-prompt lives in its own subdir with the same
  `prompt.txt` + `NOTES.md` + `responses/` shape (here: `translate/`). Per-language
  conditional instruction blocks are separate injection files
  (`reading_rules_<lang>.txt`) substituted into a `{{READING_RULES}}` placeholder —
  empty for languages that don't need them. The service performs the same injection.
- **Runners live in `runners/`** (post-flattening: pass `.` as the version arg).
  `run_generate.py` (generation, all seeds), `run_translate.py` (per-conversation
  chunks in parallel via ThreadPoolExecutor + service-style vocab pool/dedup + ruby
  orphan check), `run_ability.py` (ability sweep), `run_luna.py` (cross-model
  comparison harness).
- **Retry policy is part of historical pipeline evals** because it affects latency and
  resource use: 429 backoff and one invalid-chunk retry were observed live. The adversarial
  runner records each direct model result without application-level repair retries so an
  invalid or leaking first response stays visible. Provider SDK retries still apply.
- **Security boundaries have separate evidence.** Adversarial evals use test-only canaries,
  extraction/encoding attempts, output-format overrides, and a benign imperative control.
  Keep infrastructure failures and invalid output distinct from detected leakage. Review
  raw outputs for false positives and attacks the automated scorer cannot recognize.
  Deterministic API/provider and DOM/browser tests protect serialization, validation,
  literal rendering, persistence, and ruby behavior; model evaluations cannot prove those.
- **Rerun before legislating.** Output varies ±25% (line counts, branch frequency) at a
  fixed prompt. A defect seen once is variance until a rerun confirms it; two prompt
  rules were nearly added against noise.
- **Model rules that actually bite:** never quote a bad phrase as a negative example
  (it gets echoed); soft/example-based style guidance fails where an explicit clause or
  hard per-word ban succeeds; scope subtractive rules ("cut words, not phrases") or
  output shrinks.
- **Cross-model comparisons** live in `comparisons/<model>/` — same prompts, same
  inputs (translation fed the same frozen sources), raw responses + a NOTES.md with
  latency/token/cost tables and quality deltas.
- **Presentation format for dialogues** (supersedes the questions/checklist format for
  this endpoint): `### N. <seed> — <Language> (<latency>)`, then per topic a bold title
  and `speaker: English → translation` lines with `(or)` marking branch lines; vocab as
  `word→translation` runs; scorecard and regressions after all seeds, never instead.
