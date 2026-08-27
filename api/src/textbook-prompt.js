/**
 * Builds the two /textbook prompts (docs/API_DESIGN.md "Catchphrase guided
 * phrasebook generation (/textbook)", "2a./2b. Generate [model]" +
 * "Model behavior").
 *
 * Call 1 (buildTextbookQuestionsPrompt) turns { topic, language, ability }
 * into { questions, checklist } JSON — dynamic clarifying questions plus a
 * checklist of candidate phrasebook sections, both topic-driven.
 *
 * Call 2 (buildTextbookGeneratePrompt) turns { topic, language, ability,
 * context } into { groups } JSON — one themed group of cards per checked
 * checklist item, biased by the learner's context answers.
 *
 * Reuses lookup-prompt.js's reading-token instructions, gender-collapse
 * rule, and ability description verbatim (not duplicated) — the Card shape
 * and quality bar are identical to /lookup's.
 */

const {
  genderInstruction,
  readingInstructions,
  cardReadingExample,
  describeAbility,
} = require('./lookup-prompt');

// Caps from docs/API_DESIGN.md's /textbook Outputs section.
const MAX_QUESTIONS = 6;
const MAX_CHECKLIST_ITEMS = 8;
const MAX_GROUPS_TOTAL = 8;
const MAX_CARDS_PER_GROUP = 15;
// A phrasebook title is a one-line shelf label, not a sentence — keep it
// short enough to render on a single line in the nav/content headers.
const MAX_TITLE_LENGTH = 60;

const LANG_NAMES = { zh: 'Mandarin Chinese', ja: 'Japanese', es: 'Spanish', cs: 'Czech' };
const LANG_LEVELS = { zh: 'HSK 1–4', ja: 'JLPT N5–N3' };

/**
 * Call 1 — dynamic context questions + a suggested checklist, both
 * topic-driven, no fixed field list (docs/API_DESIGN.md "Model behavior").
 *
 * @param {{ topic: string, language: string, ability: string }} args
 * @returns {string}
 */
function buildTextbookQuestionsPrompt({ topic, language, ability }) {
  const langName = LANG_NAMES[language] || language;

  return `You are planning a bespoke, situation-specific phrasebook for a language learner — think "a custom textbook chapter for tonight," not a generic curriculum. The learner has given you a topic or situation; your job here is NOT to generate the phrasebook yet, only to figure out what to ask them so the eventual phrasebook is genuinely tailored to their actual situation.

Topic/situation: ${topic}
Target language: ${langName}
${describeAbility(ability)}

## Step 1 — dynamic context questions

Read the topic and infer the axes that would MEANINGFULLY CHANGE what phrasebook content should be generated — not generic demographic filler, but the questions this SPECIFIC topic actually turns on. Example: a dance topic turns on role (leading/following) and scene/style; a family-dinner topic would instead turn on relationship-to-host and dietary needs. Do not ask the same fixed question set for every topic — derive it from this topic.

For each question, produce a short label and a small set of mutually exclusive, genuinely-different-in-effect options, plus a sensible default (must be one of the options). **Hard cap: ${MAX_QUESTIONS} questions.** Most topics need far fewer — only ask what actually changes the output.

## Step 2 — suggested checklist

Propose a checklist of concrete, learner-recognizable phrasebook sections/goals for this topic — e.g. "Ask someone to dance & the etiquette", not a vague label like "Dancing". Each item becomes one section of the eventual phrasebook if the learner leaves it checked. Default-check the 1–2 items most learners would want first; leave clearly-secondary items unchecked. **Hard cap: ${MAX_CHECKLIST_ITEMS} items.**

## Content quality bar (non-negotiable)

Read like a thoughtful assistant who understands the situation, not a form generator. Favor concrete, specific options and checklist items over generic ones. Reject stiff or textbook-flavored phrasing in the labels themselves.

## Output format

Respond with ONLY raw JSON — no markdown code fences, no prose, no leading or trailing text.

{
  "questions": [
    { "label": "string", "options": ["string", "..."], "default": "string" }
  ],
  "checklist": [
    { "label": "string", "checked": true }
  ]
}
`;
}

/**
 * Call 2 — bulk-generate the full phrasebook content: one group per checked
 * checklist item, biased by the learner's context answers. Reuses the same
 * Card schema, reading-token rules, and gender-collapse rule as /lookup.
 *
 * @param {{ topic: string, language: string, ability: string, context: { answers?: object, checklist?: string[] } }} args
 * @returns {string}
 */
function buildTextbookGeneratePrompt({ topic, language, ability, context }) {
  const langName = LANG_NAMES[language] || language;
  const level = LANG_LEVELS[language] || 'common, high-frequency';
  const readingExample = cardReadingExample(language);

  const answers = context?.answers && typeof context.answers === 'object' ? context.answers : {};
  const checklist = Array.isArray(context?.checklist) ? context.checklist : [];

  const answersBlock = Object.keys(answers).length > 0
    ? Object.entries(answers).map(([label, value]) => `- ${label}: ${value}`).join('\n')
    : '(no context answers given)';

  const checklistBlock = checklist.length > 0
    ? checklist.map((label) => `- ${label}`).join('\n')
    : '(no checklist items given — infer 2-3 sensible sections from the topic alone)';

  return `You are generating a bespoke, situation-specific phrasebook for a language learner — a custom textbook chapter for tonight, tailored to their exact situation, not a generic curriculum. Generate the FULL phrasebook now: one themed group of cards per checklist item below.

Topic/situation: ${topic}
Target language: ${langName}
${describeAbility(ability)} \`ability\` affects word/phrase choice and sentence complexity on every card, never the translated intent.

## Context the learner gave

${answersBlock}

## Sections to generate (one group per item, in this order)

${checklistBlock}

## Step 1 — generate one group per checklist item, plus core vocabulary

For each checklist item, produce exactly one group whose \`title\` is that item's label (verbatim, or lightly cleaned up if needed) and whose \`cards\` are the words/phrases that section needs. Bias every card's wording by the context answers above — e.g. a "leading" role or a specific regional scene should shape which phrases and vocabulary are chosen. **Total groups across the whole response: hard cap ${MAX_GROUPS_TOTAL}.** **Cards per group: hard cap ${MAX_CARDS_PER_GROUP}.** Aim for 6–10 distinct cards per group — err toward richer, denser coverage rather than a thin list; a vocabulary-heavy section may run all the way to the cap.

- This should read like a real textbook chapter for the situation: a solid base of standalone vocabulary WORDS the learner must recognize, plus the phrases that put those words to work — not a thin list of phrases only.
- **Actively correct the phrase-heavy bias.** When a section implies a category of related THINGS (steps, gear, food items, people, places, body parts, etc.), dedicate that group mostly to standalone vocabulary WORDS naming those things (10+ when the category supports it), not full sentences about them.
- **Add core vocabulary even if no checklist item asked for it.** In addition to the checklist-driven groups, you MAY add up to 2 high-value vocabulary groups (e.g. a "Core survival words" group of greetings/yes-no/please-thanks and a topic-specific word bank) when the checklist alone would leave out the essential standalone vocabulary for this situation — still within the ${MAX_GROUPS_TOTAL}-group hard cap. Put checklist-driven groups first, then any added vocabulary groups.
- A group may freely mix words and phrases — organize by situation/goal, not grammatical form.
- Order cards within each group from simplest/most broadly useful to more nuanced.
- Keep every card distinct — no near-duplicates within or across the whole phrasebook.
- Give each checklist-driven group's \`title\` as-is from the checklist item — do not invent a new title; name any added vocabulary group with a short English noun-phrase title (e.g. "Core survival words").

## Coverage check

Before returning the JSON, verify: every checklist item produced exactly one group; the phrasebook as a whole contains BOTH a substantial body of standalone vocabulary words AND usable phrases (phrases have not crowded out words); any category of related things has a word-rich group; cards are distributed across groups rather than concentrated in one; and each group runs simplest → most nuanced. Do not pad with near-duplicates to hit a count.

## Step 2 — name the phrasebook

Produce a single top-level \`title\` for the whole phrasebook: a concise, **one-line** name (aim for 2–4 words, at most ${MAX_TITLE_LENGTH} characters) that captures the whole situation at a glance — a shelf label the learner will scan in a list, in Title Case, in English. Encapsulate the situation as a whole; do NOT merely restate the raw topic verbatim, and do NOT reuse a single section/checklist label. E.g. topic "talking to a doctor about my annual physical" → "Annual Physical Visit"; "salsa dancing" (Latin America, social club, leading) → "Salsa Social Dancing".

## Content quality bar (non-negotiable)

- Favor common, conversational language a person would actually SAY to someone they're trying to connect with, in the ${level} range unless the situation demands otherwise.
- Reject stiff, textbook, or exam-flavored content — the irony of this endpoint's own name is intentional; it does not relax this bar.${genderInstruction(language)}

## Card schema (every group card)

{
  "lang": "${language}",
  "text": "the word or phrase in ${langName}",
  "translation": "clear, natural English (1–2 most common senses only)",
  "reading": ${readingExample},
  "formality": "optional — this card's own register (\\"casual\\" | \\"polite\\" | \\"formal\\" | \\"slang\\"), only when the word has a register worth marking; omit for words with no register variant",
  "notes": "optional — grammar, collocations, or usage tips; never register (that's \`formality\`)"
}

- \`reading\` — ALWAYS include. Must be a ReadingToken array: ${readingInstructions(language)}
- Omit every optional field entirely when not applicable — never emit empty strings, empty arrays, or null.
- Do NOT include \`context\`, \`id\`, \`importedAt\`, \`definition\`, or a card \`type\` — the service fills \`context\` in afterward from the group title; the rest are assigned at import time or are not applicable to this endpoint.

## Output format

Respond with ONLY raw JSON — no markdown code fences, no prose, no leading or trailing text.

{
  "title": "…",
  "groups": [
    { "title": "…", "cards": [ { ...Card... } ] }
  ]
}
`;
}

module.exports = {
  buildTextbookQuestionsPrompt,
  buildTextbookGeneratePrompt,
  MAX_QUESTIONS,
  MAX_CHECKLIST_ITEMS,
  MAX_GROUPS_TOTAL,
  MAX_CARDS_PER_GROUP,
  MAX_TITLE_LENGTH,
};
