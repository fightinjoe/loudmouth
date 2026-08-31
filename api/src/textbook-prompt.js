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

Propose a checklist of concrete, learner-recognizable goals that map to the ARC of this situation — approaching/opening, the core interaction, wrapping up, and recovering when something goes wrong — e.g. "Ask someone to dance & the etiquette", not a vague or dictionary-style label like "Dancing" or "Dance vocabulary". Each item is a communicative goal the learner would recognize, not a category of words to memorize. Each checked item guides one section of the eventual phrasebook. Default-check the items that carry the interaction itself — the opening/approach and the core exchange most learners need first — and leave clearly-secondary items unchecked. **Hard cap: ${MAX_CHECKLIST_ITEMS} items.**

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

  return `You are generating a bespoke, situation-specific phrasebook for a language learner — a custom textbook chapter for tonight, tailored to their exact situation, not a generic curriculum. You are a TEACHER, not a dictionary: every card must be language the learner can PUT TO WORK in this situation — a line they would actually say, or a word they would genuinely say or hear in the moment — never encyclopedic vocabulary ABOUT the topic. Generate the FULL phrasebook now, organized around the real arc of the encounter.

Topic/situation: ${topic}
Target language: ${langName}
${describeAbility(ability)} \`ability\` affects word/phrase choice and sentence complexity on every card, never the translated intent.

## Context the learner gave

${answersBlock}

## Sections the learner wants covered (cover their intent; you may reshape)

${checklistBlock}

## Step 1 — build the groups around the encounter, covering what the learner asked for

Treat the checklist above as the learner's intended COVERAGE, not a rigid outline. Organize the phrasebook around the natural arc of the situation — opening/approach, the core interaction, wrapping up, and recovering when something goes wrong — and produce one themed group per stage or goal. You MAY rename, merge, split, reorder, and ADD connective groups the checklist left out (e.g. an opening/small-talk group, a "when you get lost" group) as long as every checked item's intent is covered somewhere. Bias every card by the context answers above — role, scene, or region should shape which phrases and words are chosen.

- **Every card must be put to work.** Favor whole phrases and power-move lines the learner can say to connect with someone, plus the high-frequency standalone words they will actually say or hear (greetings, yes/no, please/thanks, the few key nouns and verbs that come up in the moment). Do NOT pad a group with dictionary-style vocabulary the learner would never utter in the situation (e.g. body parts, or theory terms like "musicality" or "connection") — teacher, not glossary.
- A group may freely mix words and phrases — organize by situation/goal, not grammatical form.
- Order cards within each group from simplest/most broadly useful to more nuanced.
- Keep every card distinct — no near-duplicates within or across the whole phrasebook.
- Name each group with a short, scannable English noun-phrase title describing its moment in the encounter (e.g. "Asking someone to dance", "When you get lost"); reuse a checklist label as the title when it already fits.
- **Group budget.** Hard cap ${MAX_GROUPS_TOTAL} groups TOTAL, and this MUST include the example-conversation group from Step 2 — so keep the themed groups to at most ${MAX_GROUPS_TOTAL - 1}. Cards per group: hard cap ${MAX_CARDS_PER_GROUP}; aim for 6–10 distinct cards in a themed group.

## Coverage check

Before continuing, verify: every checked checklist item's intent is covered by some group; the phrasebook follows the encounter's arc rather than a pile of categories; every card is something the learner would actually say, hear, or use in the moment (no glossary padding); cards are distributed across groups rather than concentrated in one; and each group runs simplest → most nuanced. Do not pad with near-duplicates to hit a count.

## Step 2 — add one example-conversation group (prototype)

Add exactly ONE final group, titled "Example conversation", that strings the phrasebook's key lines into a short, realistic exchange for this situation (aim for 6–12 turns). This is the single most valuable output for the learner: it shows the phrases working together in sequence.

- Use ONLY language already introduced in the earlier groups (lightly inflected as the dialogue requires) — the conversation reinforces the chapter, it does not add new material.
- Each turn is one card: \`text\` = the spoken line, \`translation\` = its English gloss, \`reading\` per the usual rules below.
- Identify the speaker of each turn with a compact JSON blob in that card's \`notes\`, e.g. \`{"speaker":"you"}\` or \`{"speaker":"partner"}\`. (Experimental staging field — turn structure lives in \`notes\` until it earns a place in the schema.)
- Keep turns in conversation order; this group counts against the ${MAX_GROUPS_TOTAL}-group cap.

## Step 3 — name the phrasebook

Produce a single top-level \`title\` for the whole phrasebook: a concise, **one-line** name (aim for 2–4 words, at most ${MAX_TITLE_LENGTH} characters) that captures the whole situation at a glance — a shelf label the learner will scan in a list, in Title Case, in English. Encapsulate the situation as a whole; do NOT merely restate the raw topic verbatim, and do NOT reuse a single section/checklist label. E.g. topic "talking to a doctor about my annual physical" → "Annual Physical Visit"; "salsa dancing" (Latin America, social club, leading) → "Salsa Social Dancing".

## Content quality bar (non-negotiable)

- **Teacher, not dictionary.** Every card earns its place by being usable in the moment — a line to say or a word to say/hear. Cut anything that only describes or catalogs the topic.
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
