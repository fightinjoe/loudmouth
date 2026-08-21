/**
 * Builds the single-call /lookup prompt (docs/API_DESIGN.md "2. Generate [model]"
 * + "Model behavior").
 *
 * One prompt turns { term, context, language, ability, formality, audience }
 * into the blocks-and-groups JSON in a single LLM call: disambiguate the term
 * into meanings, translate each to its intent, and cluster related cards into
 * themed groups. The prompt is shared verbatim across all three `llm` backends
 * via LLM_REGISTRY — it must not special-case any backend.
 */

// Caps from docs/API_DESIGN.md "Outputs" (kept here so the prompt and the
// validator/finish layer — lookup-validate.js — agree).
const MAX_BLOCKS = 4;
const MAX_GROUPS_TOTAL = 8;
const MAX_CARDS_PER_GROUP = 10;

const LANG_NAMES = { zh: 'Mandarin Chinese', ja: 'Japanese', es: 'Spanish', cs: 'Czech' };
const LANG_LEVELS = { zh: 'HSK 1–4', ja: 'JLPT N5–N3' };

/**
 * Per-language ReadingToken instructions (docs/CARD_SCHEMA.md "Reading tokens").
 * zh/ja get explicit annotation rules; other scripts get a single unannotated
 * token per CARD_SCHEMA's "Other scripts" rule.
 */
function readingInstructions(lang) {
  if (lang === 'zh') {
    return `an array of ReadingToken pairs, one per character. Each token is [base, annotation] where base is the character and annotation is its tone-marked pinyin. Example for 晚餐: [["晚","wǎn"],["餐","cān"]]`;
  }
  if (lang === 'ja') {
    return `an array of ReadingToken pairs. Each token is [base, annotation|null]. Kanji get a hiragana annotation; hiragana and katakana NEVER get an annotation (always null). Keep each contiguous kana/katakana run as one token; do not split it into individual characters. Examples: 注文 → [["注","ちゅう"],["文","もん"]]; サーフィンをする → [["サーフィンをする",null]]; おすすめ → [["おすすめ",null]]`;
  }
  return `a single-element array containing the whole word or phrase as one unannotated token: [base, null]. Example for "café": [["café",null]]`;
}

function cardReadingExample(lang) {
  if (lang === 'zh') return `[["晚","wǎn"],["餐","cān"]]`;
  if (lang === 'ja') return `[["注","ちゅう"],["文","もん"],["してもいいですか",null]]`;
  return `[["café",null]]`;
}

/**
 * `ability` → a natural-language difficulty ceiling. Anchored at `none`
 * (docs/API_DESIGN.md "ability"): zero prior ability, so favor the single
 * most common word/phrase, minimal/no compound structure, no abbreviations.
 */
function describeAbility(ability) {
  switch (ability) {
    case 'none':
      return 'Learner ability: none — the learner has ZERO prior ability in this language. This is a floor: favor the single most common word/phrase for the intent, minimal or no compound structure, and no abbreviations.';
    case 'intermediate':
      return 'Learner ability: intermediate — compound sentences and less common vocabulary are fine.';
    case 'advanced':
      return 'Learner ability: advanced — idiomatic phrasing, complex constructions, and lower-frequency words are fine.';
    case 'beginner':
    default:
      return 'Learner ability: beginner — common words, short sentences, and simple grammar.';
  }
}

/**
 * Options block: ability caps difficulty (never intent); formality is a soft
 * register anchor that may spill toward MORE formal (never toward slang);
 * slang is only ever an option when the requested formality is casual.
 */
function describeOptions({ ability, formality, audience }) {
  const lines = [
    `${describeAbility(ability)} \`ability\` affects word/phrase choice and sentence complexity on every card — block and group alike — never the translated intent.`,
    `Formality: ${formality} — anchor the register here. It is a strong suggestion, not a filter: include a neighboring register when \`audience: ${audience}\` makes it useful (e.g. casual + staff still surfaces the polite form a shop sign would use). Any spillover moves only toward MORE FORMAL — never toward slang.`,
    `Audience: ${audience} — who the learner is speaking to; this is what makes a neighboring register useful.`,
    'Audience and formality shape how cards are phrased; they do not eliminate useful topic branches. For example, staff-oriented settings may make rental and safety phrases polite, but should not exclude related vocabulary or small-talk groups when they are useful.',
  ];
  if (formality === 'casual') {
    lines.push('Because the requested formality is casual, slang is a valid optional register at your discretion — tag such cards `formality: "slang"`. Slang is only ever available when the input formality is casual.');
  } else {
    lines.push('Do not produce slang or tag anything `formality: "slang"` — the requested formality does not permit it.');
  }
  return lines.map((l) => `- ${l}`).join('\n');
}

/**
 * @param {{ term: string, context?: string, language: string, ability: string, formality: string, audience: string }} args
 * @returns {string} the prompt string
 */
function buildLookupPrompt({ term, context, language, ability, formality, audience }) {
  const langName = LANG_NAMES[language] || language;
  const level = LANG_LEVELS[language] || 'common, high-frequency';
  const readingExample = cardReadingExample(language);

  const contextLine = context
    ? `\nContext (disambiguation / bias — NEVER translate this, use it only to pin the intended sense): ${context}`
    : '';

  return `You are a language look-up engine for a travel phrasebook app. Translate the INTENT of the term below — the implied meaning or situation that emerges from reading the term, context, audience, and formality together — not necessarily the literal dictionary word. Example: "bathroom" for audience: staff leads with トイレ ("toilet"), not the literal loanword バスルーム.

Term to translate into ${langName}: ${term}${contextLine}

## Options (bias every choice by these)

${describeOptions({ ability, formality, audience })}

## Step 1 — disambiguate into blocks

Split the term into its distinct meanings, one block per meaning, in order (most look-ups are a single block). Only split on meanings that give GENUINELY DIFFERENT translations (e.g. "surf" → ride a wave / ocean foam / browse the web) — do not split on trivial nuances. If Context is given, use it to pin the intended sense. **Hard cap: ${MAX_BLOCKS} blocks.**

Each block's \`card\` is the phrase a person would actually use for that meaning — the direct translation. When you produce MORE THAN ONE block, set that block's \`card.definition\` to a short English gloss distinguishing its meaning (e.g. "the toilet / restroom" vs. "bath / shower room"), so the senses stay distinguishable once saved. An unambiguous term yields exactly ONE block with NO \`definition\`.

## Step 2 — build diverse related groups

For each block, first identify the major situations and conversational goals naturally associated with the seed, then cluster related cards into themed groups.
- **Broad topics:** generate 3–5 distinct groups per block when the topic naturally supports them. **Narrow everyday words:** generate 1–3 groups. Do not stop after two groups for a broad topic such as surf, dinner, travel, shopping, or transportation.
- **Total groups across ALL blocks: hard cap ${MAX_GROUPS_TOTAL}** (blocks SHARE this budget — they do not each get ${MAX_GROUPS_TOTAL}). **Cards per group: hard cap ${MAX_CARDS_PER_GROUP}.** Aim for 4–6 distinct cards per group when the topic supports it.
- A group is organized primarily by SITUATION or CONVERSATIONAL GOAL, not a grammatical category: it may freely mix words and phrases. NEVER split them apart merely because they are different grammatical forms.
- Separate groups when the learner would use them in different situations, even if they share the same broad topic. Do not combine groups merely because their cards are related.
- Ensure the full response includes both useful vocabulary and usable phrases when the topic supports both. Avoid near-duplicate cards across sibling groups.
- Give each group a short, content-scannable, **ENGLISH** \`title\` (e.g. "Ordering at a restaurant") — always English regardless of ${langName}, since it's a UI heading, not translated content.
- Keep every card distinct from the others in its group and across the whole look-up — no near-duplicates (e.g. do not emit "Check, please!", "check (the bill)", and "May I have the check?" as three cards; pick the single best phrasing).

For a broad seed such as "surf", one translation block may include groups such as "Surf basics", "Beach and wave conditions", "Equipment and rentals", "Beach safety", and "Small talk about surfing". These are groups, not separate translation blocks. Do not interpret them as separate meanings unless the seed has genuinely different translations, such as "surf" meaning ride waves versus browse the internet.

## Coverage check

Before returning the JSON, check that broad seeds have 3–5 distinct groups, that the groups represent different situations or conversational goals rather than synonyms, and that cards are distributed across the groups instead of concentrated in one bucket. Do not invent a second translation block just to create variety.

## Content quality bar (non-negotiable)

- Favor common, conversational language a person would actually SAY to someone they're trying to connect with, in the ${level} range unless the term demands otherwise.
- Reject stiff, textbook, or exam-flavored content.

## Card schema (every block \`card\` AND every group card)

{
  "lang": "${language}",
  "text": "the word or phrase in ${langName}",
  "translation": "clear, natural English (1–2 most common senses only)",
  "reading": ${readingExample},
  "definition": "optional — pinned-sense gloss; set on a disambiguated block card, usually omit on group cards",
  "formality": "optional — this card's own register (\\"casual\\" | \\"polite\\" | \\"formal\\" | \\"slang\\"), only when the word has a register worth marking; omit for words with no register variant (e.g. 水 \\"water\\")",
  "notes": "optional — grammar, collocations, or usage tips; never register (that's \`formality\`)"
}

- \`reading\` — ALWAYS include. Must be a ReadingToken array: ${readingInstructions(language)}
- Omit every optional field entirely when not applicable — never emit empty strings, empty arrays, or null.
- Do NOT include \`context\`, \`id\`, \`importedAt\`, or a card \`type\` — the service fills \`context\` in afterward; the rest are assigned at import time.

## Output format

Respond with ONLY raw JSON — no markdown code fences, no prose, no leading or trailing text.

{
  "blocks": [
    {
      "card": { ...Card... },
      "groups": [
        { "title": "…", "cards": [ { ...Card... } ] }
      ]
    }
  ]
}
`;
}

module.exports = {
  buildLookupPrompt,
  MAX_BLOCKS,
  MAX_GROUPS_TOTAL,
  MAX_CARDS_PER_GROUP,
};
