/**
 * Builds the single-call /lookup prompt (v0 — see docs/API_DESIGN.md §4, §5).
 *
 * One prompt does everything: disambiguate the input into 1..N word-senses (blocks),
 * emit a primary Card per block, and emit deck-context-biased related groups whose
 * cards are saveable Card objects. The planner+fillers fan-out (docs/FANOUT_DESIGN.md)
 * is a deferred optimization; this builder is the v0 baseline.
 *
 * DATA FLOW
 *   { input, context, deck }                     input/context already split from the
 *        │                                         raw seed on the FIRST '(' (§2.A)
 *        ▼
 *   buildLookupPrompt() ── one prompt string ──▶ LLM ──▶ LookupResponse JSON (§3)
 *
 *   input   = the term to translate            e.g. "dinner", "surf"
 *   context = disambiguation/bias, if any      e.g. "v. to ride a wave",
 *             (never translated itself)              "ordering at a restaurant"
 */

// Caps + ranges from docs/API_DESIGN.md §2.B (kept in one place so the prompt and
// the validator/clamps agree).
const MAX_BLOCKS = 4;
const MAX_GROUPS_TOTAL = 8;
const MAX_CARDS_PER_GROUP = 10;
const MIN_CARDS_PER_GROUP = 3;

const LANG_NAMES = { zh: 'Mandarin Chinese', ja: 'Japanese' };
const LANG_LEVELS = { zh: 'HSK 1–4', ja: 'JLPT N5–N3' };

/**
 * Per-language ReadingToken instructions (mirrors cards-prompt.js so /lookup and
 * /generate-cards annotate identically).
 */
function readingInstructions(lang) {
  return lang === 'zh'
    ? `an array of ReadingToken pairs, one per character. Each token is [base, annotation] where base is the character and annotation is its tone-marked pinyin. Example for 菜单: [["菜","cài"],["单","dān"]]`
    : `an array of ReadingToken pairs. Each token is [base, annotation|null]. Kanji get a hiragana annotation; kana and katakana use null. Example for 注文: [["注","ちゅう"],["文","もん"]]  Example for おすすめ: [["おすすめ",null]]`;
}

function cardReadingExample(lang) {
  return lang === 'zh'
    ? `[["晚","wǎn"],["餐","cān"]]`
    : `[["注","ちゅう"],["文","もん"],["してもいいですか",null]]`;
}

/**
 * VIBE → a natural-language register description for the prompt.
 * formality + audience set tone; ability caps difficulty (docs/API_DESIGN.md G4).
 */
function describeDeck(deck) {
  const { ability, formality, audience, freeText } = deck;
  const lines = [
    `- Learner ability: ${ability} — this CAPS difficulty (vocabulary + grammar complexity), it does not change how many cards you produce.`,
    `- Formality: ${formality}; Audience: ${audience} — together these set the register/tone (e.g. "casual conversation with strangers", "formal speech with staff").`,
  ];
  if (freeText && freeText.trim()) {
    lines.push(`- Situation notes: ${freeText.trim()} — spread the groups across the registers this implies rather than averaging into one bland middle.`);
  }
  return lines.join('\n');
}

/**
 * @param {{ input: string, context?: string, deck: object }} args
 * @returns {string} the prompt string
 */
function buildLookupPrompt({ input, context, deck }) {
  const lang = deck.language;
  const langName = LANG_NAMES[lang] || lang;
  const level = LANG_LEVELS[lang] || 'common, high-frequency';
  const readingExample = cardReadingExample(lang);

  const contextLine = context && context.trim()
    ? `\nContext (disambiguation / bias — NEVER translate this, use it only to pin the sense and bias the groups): ${context.trim()}`
    : '';

  return `You are a language look-up engine for a travel phrasebook app. Given an English term, you return its ${langName} translation(s) PLUS related groups of vocabulary the learner might want, biased by their deck's context.

Term to look up (translate from English into ${langName}): ${input}${contextLine}

## Deck context (bias every choice by this)

${describeDeck(deck)}

Context is the CENTER OF GRAVITY, not a hard filter.

## Step 1 — disambiguate into blocks (word-senses)

Split the term into its distinct, meaningfully-different senses. Produce one "block" per sense.
- Only split on senses that yield MEANINGFULLY DIFFERENT ${langName} translations (e.g. "switch" = the device vs. to change; "bank" = finance vs. river). Do not over-split trivial nuances.
- If a Context is given, use it to PIN the sense (e.g. "surf" + "v. to ride a wave" → only the verb).
- Most look-ups are a single block. **Hard cap: ${MAX_BLOCKS} blocks.**

For each block emit a "primary" — the direct translation as a Card (schema below). The blocks are shown to the user in order; there is NO separate block label. When you produced MORE THAN ONE block, set each primary's \`definition\` to a short English gloss naming that block's meaning (e.g. "the physical device" vs. "to change/swap") so the senses stay distinguishable once saved. Omit \`definition\` entirely when the term was unambiguous (a single block). NEVER set \`context\` on a primary.

## Step 2 — related groups (per block)

For each block, produce related "groups" of vocabulary the learner would find useful in this deck's situation.
- **Total groups across ALL blocks: hard cap ${MAX_GROUPS_TOTAL}.** Typical single-sense look-up: 2–4. Very constrained term: 0–1. Rich multi-sense term: spread the ${MAX_GROUPS_TOTAL}-group budget across blocks (blocks SHARE the budget; they do NOT each get ${MAX_GROUPS_TOTAL}).
- Each group has a \`title\` — a short, human-scannable heading describing its CONTENT ("Ordering at a restaurant", "Teasing your host family"), not a persona or the deck settings.
- **Cards per group: aim ${MIN_CARDS_PER_GROUP}–8** (up to ${MAX_CARDS_PER_GROUP}). **Do NOT create a group with fewer than ${MIN_CARDS_PER_GROUP} cards** — a group that thin isn't differentiated or substantial enough to exist; fold it into another group or drop it.
- **Distinct, not divergent:** every card in a group is clearly related to the group's \`title\`, and the cards are distinct from ONE ANOTHER — avoid near-duplicates. Do NOT emit "Check, please!", "check (the bill)", and "May I have the check?" as three cards in one group; that is one idea. Pick the single best phrasing and move on.
- A card's term may be a word OR a phrase — groups are NOT split by word-vs-phrase, and a group may contain both. Do not label cards or groups with a type.

## Content quality bar (non-negotiable)

- Favor common, conversational, everyday content in the ${level} range unless the term demands otherwise.
- Would a real person actually SAY this to someone they're trying to connect with? Reject technically-correct-but-stiff, textbook, or exam-flavored content.
- No near-duplicate cards across groups either, within this look-up.

## Card schema (every primary AND every group card)

{
  "lang": "${lang}",
  "text": "the word or phrase in ${langName} characters",
  "translation": "clear, natural English (1–2 most common senses only)",
  "reading": ${readingExample},
  "definition": "optional — pinned sense gloss; set on a disambiguated primary, usually omit on group cards",
  "notes": "optional — grammar, register, collocations; omit if not useful",
  "example": { "text": "optional example sentence", "reading": ${readingExample}, "translation": "optional English" }
}

- \`reading\` — ALWAYS include. Must be a ReadingToken array: ${readingInstructions(lang)}
- Omit any optional field entirely — do NOT emit empty strings, empty arrays, or null.
- Do NOT include a card \`type\`, a group \`type\`, or a card \`context\` field — the service adds the group heading to each card afterward; repeating it wastes output.
- Do NOT include \`id\` or \`importedAt\` — the app assigns those.

## Output format

Respond with ONLY this JSON object. No markdown code fences, no prose.

{
  "seed": "${input}${context && context.trim() ? ` (${context.trim()})` : ''}",
  "blocks": [
    {
      "primary": { ...Card... },
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
  MIN_CARDS_PER_GROUP,
};
