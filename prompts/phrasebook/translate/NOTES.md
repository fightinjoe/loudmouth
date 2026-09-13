# /phrasebook translation prompt — ACCEPTED baseline (was translate/v05)

- **Model:** `gemini-3.5-flash-lite`, `responseMimeType: application/json`
- **Accepted:** 2026-09-12, after v00–v05 (superseded versions deleted; lessons below)
- **Inputs during development:** frozen accepted generation responses (`../responses/`)
  — translation always iterates against byte-identical English.

## What the prompt does

One call per conversation chunk (service `Promise.all`s 3 in parallel). Inputs:
`{{SEED}}`, `{{LANGUAGE}}`, `{{TITLE}}`, `{{LINES}}` (numbered, speaker-tagged),
`{{WORDS}}` (that conversation's vocab), `{{READING_RULES}}` (injected from
`reading_rules_ja.txt` / `reading_rules_zh.txt`; empty for es/cs). Output:
`{ "lines": [...], "vocab": [...] }` — translations **by index**, no English echo
(halves output tokens; service validates counts and assembles by index, never by text).

## Key design decisions

- **Intent, not wording**: each English line is translated as a native speaker would
  express that intent in this situation. Register chosen by situation, consistent
  across lines (observed: correct speaker asymmetry — learner plain-polite, staff keigo).
- **Dialect rule**: match regional variety to the situation's place (delivered Costa
  Rican voseo: necesitás/querés/probá; fallback = most widely spoken variety).
- **Vocab**: translate the sense the conversation uses; keep the line's word choice but
  dictionary form wins (singular noun, base verb, bare adjective) even when the line is
  plural/conjugated.
- **Ruby readings inline, not token arrays** (user question: YAML/bespoke instead of
  JSON? Answer: keep JSON envelope, move readings inside strings): Anki-style
  漢字[かんじ] per kanji run (okurigana outside brackets), 字[zì] per hanzi. The
  fragile `ReadingToken` nesting never enters model output; the service regex-parses
  `base[reading]` → tokens and a bad annotation degrades to no-ruby-on-that-word.
  YAML rejected: loses JSON-mode enforcement and fails silently (bad indent parses).
  `responseSchema` remains available as envelope hardening.
- **Romanization is NOT prompt work**: inline readings yield the full kana sequence;
  service applies a mechanical kana→rōmaji table at card assembly.

## Lessons (from deleted v00–v04)

1. Context-anchored translation beats isolation: "break"→descanso, lead→guiar,
   step→paso (dance senses) with zero polysemy errors across all runs — the user's
   English-homonym worry did not materialize when vocab travels with its conversation.
2. Cross-chunk drift is the fan-out's real cost: ヴィーガン vs ビーガン (fixed by
   putting a word and its line in the same chunk), voseo/tuteo split across chunks
   (open; candidate fix = shared one-line style hint in every chunk).
3. Malformed output happens even with JSON mode when reading density rises (observed:
   dropped opening quote; separately a count-drift chunk with a Hindi token). Count
   validation catches both; an immediate single retry was clean both times (~1s).
4. Boundary rules mostly hold (ja okurigana fixed; zh punctuation 2/3 clean); residue
   is one deterministic pattern — bracket not preceded by kanji/hanzi — which the
   service strips. Don't chase stochastic residue with more prompt rules.
5. Free tier = 15 req/min; a 5-seed eval bursts past it. Runner and service both need
   429 backoff.

## Runs at acceptance

es/cs chunks: `responses/response_{salsa,surf,directions}_convN.json` (prompt for
these languages is unchanged since the es/cs rules never included reading rules).
ja/zh: `responses/response_{vegan,sick}_convN.json`. Walls 0.87–1.46s per seed;
zh output ≈ 2× ja (per-character annotation).

## Verdict

ACCEPTED with generation baseline; see `../NOTES.md` for the service-owed work list
and the Luna model comparison (`../comparisons/luna/`).
