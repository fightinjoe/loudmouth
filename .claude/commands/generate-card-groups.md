---
name: generate-card-groups
description: Generates clustered language flashcard groups for the Capture & Curate journey — one cluster per interpretation of an ambiguous prompt, always split by words vs. phrases. Use when stress-testing the tabbed-interpretations curation UI, or producing realistic multi-cluster test data.
---

# Generate Card Groups

Generate clustered flashcard candidates in the Loudmouth card batch schema, split into labeled groups instead of one flat list. This supports the **Capture & Curate** journey (`docs/journeys.html#capture-in-moment`): the app presents results as tabs, one tab per interpretation, and the learner adds cards individually or in bulk per tab. This command produces the data behind those tabs so the tabbed UI can be stress-tested with realistic content.

See [`docs/CARD_SCHEMA.md`](../../../docs/CARD_SCHEMA.md) for the full card schema reference.

## Step 1: Gather parameters

Ask the user for the following if not already provided:

1. **Language** — `zh` (Mandarin Chinese) or `ja` (Japanese)
2. **Prompt** — a word/phrase (translate-style) or a situational context (generate-style). Examples:
   - "live" (word-sense ambiguity)
   - "dinner phrases" (scene ambiguity: with host / with friends / ordering food)
   - "asking for directions"
3. **Count per cluster** — how many cards per cluster (suggest 4–6 if unspecified; keep clusters small enough to scan in a tab, not another bulk dump)

If the user provides all in their message, proceed directly to clustering.

## Step 2: Determine clusters

Every result has **at least two clusters**: one for **words**, one for **phrases** — the app cannot assume which the learner wants, so both are always offered.

On top of that words/phrases split, decompose further if the prompt itself is ambiguous:

- **Word-sense ambiguity** (translate-style prompt): if the input word has multiple distinct senses (e.g. "live" → reside vs. broadcast-live), each sense gets its own cluster, itself split into words/phrases if both make sense for that sense.
- **Scene/context ambiguity** (generate-style prompt): if the situational prompt spans distinguishable scenes (e.g. "dinner phrases" → with-host / with-friends / ordering-food), each scene gets its own cluster, each split into words/phrases.
- **No ambiguity**: if the prompt has one clear interpretation, there is exactly one interpretation-level grouping, still split into words/phrases (minimum two clusters total).

Do not force ambiguity that isn't there — a clear prompt like "numbers 1-10" should not be padded with invented alternate readings just to have more tabs. The floor is words/phrases; anything beyond that must be a genuine distinct interpretation.

Name each cluster with a short, human-scannable label suitable for a tab (e.g. `words`, `phrases`, `with the host — words`, `with the host — phrases`, `ordering food — words`, `ordering food — phrases`).

## Step 3: Generate cards per cluster

Apply the same card-quality bar as `/generate-cards` **within each cluster independently**:

### Card selection

- **Favor high-frequency vocabulary.** For Japanese, target JLPT N5–N3 range unless the topic demands otherwise. For Chinese, target HSK 1–4.
- **Match the cluster's interpretation closely.** A card in the "with the host" cluster should not be equally at home in "ordering food" — clusters should feel distinct when scanned side by side, not like an arbitrary split of the same list.
- **`type` must match the cluster** — the `words` cluster contains only `type: "word"` cards; the `phrases` cluster contains only `type: "phrase"` (or `"sentence"`) cards.
- **Avoid redundancy within a cluster**, and avoid near-duplicate cards across sibling clusters of the same interpretation (e.g. don't repeat the same word in both "words" and "phrases" just reworded).
- **Avoid function words** (particles, conjunctions, pronouns) unless the topic demands them.

### Card content

Same field rules as `/generate-cards`:

- `text` — standard simplified characters for `zh`; kanji+kana for `ja`.
- `reading` — structured `[base, annotation|null]` token array; required for non-roman scripts.
- `translation` — clear, natural English (1–2 senses).
- `romanization` — optional, romaji for `ja`.
- `notes` — optional, brief; useful for disambiguating why a card belongs to this specific cluster over a sibling one.
- `example` — optional but encouraged for phrase/sentence cards.

## Step 4: Preview and approval

Present clusters as labeled sections, each a numbered preview (`text` + `translation` only):

```
── words ──────────────────────
1. 菜单 — menu
2. 服务员 — waiter

── phrases ─────────────────────
1. 我想点菜 — I'd like to order
2. 可以加点吗？ — can I get more?
```

If there are interpretation-level groups above words/phrases, nest the heading:

```
═══ with the host ═══

── words ──────────────────────
1. ...

── phrases ─────────────────────
1. ...

═══ ordering food ═══

── words ──────────────────────
1. ...
```

Ask the user: **"Any changes? (or type 'ok' to generate)"**

The user may:
- Approve all clusters ("ok", "looks good", "generate", etc.) → proceed to Step 5
- Request changes to specific cards or clusters → apply, re-display the full updated preview, and ask again
- Ask to add/remove/rename a cluster → apply and re-preview

Repeat until the user approves.

## Step 5: Output

Produce one JSON object with a top-level `groups` array. Each group is `{ "label": string, "cards": [...card objects] }`, where each card object follows the same shape as the standard card batch schema (no `id`/`importedAt` — assigned at import time).

```json
{
  "groups": [
    {
      "label": "words",
      "cards": [ ...card objects... ]
    },
    {
      "label": "phrases",
      "cards": [ ...card objects... ]
    }
  ]
}
```

For prompts with interpretation-level clustering, flatten the label into the string rather than nesting objects (keeps this a drop-in stand-in for the tabbed UI's flat tab list):

```json
{
  "groups": [
    { "label": "with the host — words", "cards": [...] },
    { "label": "with the host — phrases", "cards": [...] },
    { "label": "ordering food — words", "cards": [...] },
    { "label": "ordering food — phrases", "cards": [...] }
  ]
}
```

After the JSON, display it in a fenced code block for troubleshooting. This output is for stress-testing the curation UI directly (e.g. seeding a mock API response) — it does not go through the URI-import link flow, since a group set is not a single importable batch until the learner has chosen which cards to keep.
