/**
 * Builds the two /textbook prompts (docs/API_DESIGN.md "Catchphrase guided
 * phrasebook generation (/textbook)", "2a./2b. Generate [model]" +
 * "Model behavior").
 *
 * Call 1 (buildTextbookQuestionsPrompt) turns { topic, language } into
 * { questions, checklist } JSON — dynamic clarifying questions plus a
 * checklist of candidate phrasebook sections, both topic-driven.
 *
 * Call 2 (buildTextbookGeneratePrompt) turns { topic, language, context }
 * into { groups } JSON — one themed group of cards per checked checklist
 * item, biased by the learner's context answers.
 *
 * Reuses lookup-prompt.js's reading-token instructions and gender-collapse
 * rule (not duplicated) — the Card shape and quality bar are identical to
 * /lookup's. Unlike /lookup, /textbook is level-independent: it takes no
 * `ability`; generation targets the situation's high-value core, and
 * difficulty/depth are later scoped client actions (docs/API_DESIGN.md
 * "/textbook").
 */

const {
  genderInstruction,
  readingInstructions,
  cardReadingExample,
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
 * @param {{ topic: string, language: string }} args
 * @returns {string}
 */
function buildTextbookQuestionsPrompt({ topic, language }) {
  const langName = LANG_NAMES[language] || language;

  return `You are planning a bespoke, situation-specific phrasebook for a language learner — think "a custom textbook chapter for tonight," not a generic curriculum. The learner has given you a topic or situation; your job here is NOT to generate the phrasebook yet, only to figure out what to ask them so the eventual phrasebook is genuinely tailored to their actual situation.

Topic/situation: ${topic}
Target language: ${langName}

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
 * @param {{ topic: string, language: string, context: { answers?: object, checklist?: string[] } }} args
 * @returns {string}
 */
function buildTextbookGeneratePrompt({ topic, language, context }) {
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

  return `You are generating a bespoke, situation-specific phrasebook for a language learner — a custom textbook chapter for tonight, tailored to their exact situation, not a generic curriculum. You are a TEACHER: teach enough that the learner can both PRODUCE their side of this encounter and UNDERSTAND what the other person says back. Every card must be language the learner can PUT TO WORK — a line they would say, a line they would hear and must follow, or a word they would point at, choose between, name, or hear in the moment. Generate the FULL phrasebook now, organized around the real arc of the encounter.

Topic/situation: ${topic}
Target language: ${langName}
Level: do NOT assume or bias toward any learner proficiency level. Assume common courtesy and survival basics (yes/no, hello, thank you, please, excuse me) are ALREADY OWNED; do not teach them unless this specific situation genuinely turns on them. Spend the whole budget on the highest-value, level-invariant core: the key phrases this situation needs, its real context-specific vocabulary, and the two-sided example conversation. Choose broadly-useful register and sentence complexity — neither dumbed-down nor needlessly complex. This governs word/phrase choice and sentence complexity on every card, never the translated intent. Opening a bespoke chapter to language the learner already knows is a failure.

## Context the learner gave

${answersBlock}

## Sections the learner wants covered (cover their intent; you may reshape)

${checklistBlock}

## Step 1 — build the groups around the encounter, covering what the learner asked for

Treat the checklist above as the learner's intended COVERAGE, not a rigid outline. Organize the phrasebook around the natural arc of the situation — opening/approach, the core interaction, wrapping up, and recovering when something goes wrong — and produce one themed group per stage or goal. You MAY rename, merge, split, reorder, and ADD connective groups the checklist left out (e.g. an opening/small-talk group, a "when you get lost" group) as long as every checked item's intent is covered somewhere. Bias every card by the context answers above — role, scene, or region should shape which phrases and words are chosen.

- **Teach both voices.** A real encounter is two-sided. Alongside the lines the learner will SAY, teach the key lines they will HEAR from the other person (staff, host, partner) and must understand to keep going — the questions they'll be asked and, crucially, the ANSWERS to their own questions (a price, a quantity, "it's 100% wool", "it's out of stock"). A phrasebook that teaches only the learner's half leaves them able to speak but unable to follow the reply. A heard line is still an ORDINARY card: put ONLY the spoken target-language line in \`text\` (never a speaker label like "店員:" or "スタッフ —", and never English), and its English in \`translation\`; if useful, note who says it in \`notes\`. Speaker labels belong ONLY in the Example-conversation group's \`notes\`, never in \`text\`.
- **Teach the situation's real vocabulary as WORDS, not disguised sentences.** The transactional nouns and adjectives specific to THIS situation — the things the learner will point at, name, choose between, or hear (a yarn shop: fiber types, yarn weights, needle and tool names, colors, textures; a clinic: symptoms, body areas) — ARE the lesson, not padding. Teach them as a compact vocabulary group of short \`type:"word"\` cards, PLUS one or two reusable frames the learner drops them into (e.g. "これは〜ですか" / "〜はありますか"). Do NOT expand a frame into one near-duplicate sentence per word ("Is it wool?", "Is it cotton?", "Is it soft?") — teach the words once and the frame once.
- **Still no glossary padding.** Cut encyclopedic or theory vocabulary the learner would never actually say or hear in this moment (obscure anatomy, jargon like "musicality"). The test is "would the learner say or hear this word in the room?", not "is it about the topic?".
- **Optional patterns group.** Where the phrases in this chapter lean on a small generative system (e.g. Japanese counters, a key particle or verb pattern), you MAY add ONE compact "Key patterns" group that teaches those as cards — the pattern in \`text\`, its use in \`translation\`, a short usage tip in \`notes\` — so the learner can bend the phrases rather than only parrot them.
- A group may freely mix words and phrases — organize by situation/goal, not grammatical form.
- Order cards within each group from simplest/most broadly useful to more nuanced.
- Keep every card distinct — no near-duplicates within or across the whole phrasebook.
- Name each group with a short, scannable English noun-phrase title describing its moment in the encounter or the kind of vocabulary it holds (e.g. "Fibers & materials", "Asking for a recommendation", "When you get lost"); reuse a checklist label as the title when it already fits.
- **Group budget.** Hard cap ${MAX_GROUPS_TOTAL} groups TOTAL, and this MUST include the example-conversation group from Step 2 — so keep every other group to at most ${MAX_GROUPS_TOTAL - 1} combined. Cards per group: hard cap ${MAX_CARDS_PER_GROUP}; aim for 6–10 distinct cards in a themed group. The example-conversation group is REQUIRED and comes LAST; do not let other groups crowd it out of the budget.

## Coverage check

Before continuing, verify: every checked checklist item's intent is covered by some group; the phrasebook follows the encounter's arc rather than a pile of categories; every card is something the learner would actually say, hear, or use in the moment (no glossary padding); the situation's real vocabulary is taught as \`word\` cards plus reusable frames, not as repeated near-duplicate sentences; the key lines the learner will HEAR (not only say) are taught, including answers to their own questions; nothing re-teaches basic courtesy or survival language the learner already owns; cards are distributed across groups rather than concentrated in one; and each group runs simplest → most nuanced. Do not pad with near-duplicates to hit a count.

## Step 2 — add one example-conversation group (prototype)

Add exactly ONE final group, titled "Example conversation", that strings the phrasebook's key lines into a short, realistic exchange for this situation (aim for 6–12 turns). This is the single most valuable output for the learner: it shows the phrases working together in sequence.

- It MUST be a genuine two-sided exchange in which information flows BOTH ways: the learner asks and the other person ANSWERS with real content (a price, a quantity, a recommendation), and vice versa. Never stack several turns from the same speaker that merely restate the same point — each turn advances the exchange, and speakers generally alternate.
- Use ONLY language already introduced in the earlier groups (lightly inflected as the dialogue requires), including the HEARD lines you taught for the other speaker — the conversation reinforces the chapter, it does not add new material.
- Each turn is one card: \`text\` = the spoken line, \`translation\` = its English gloss, \`reading\` per the usual rules below.
- Identify the speaker of each turn with a compact JSON blob in that card's \`notes\`, e.g. \`{"speaker":"you"}\` or \`{"speaker":"partner"}\`. (Experimental staging field — turn structure lives in \`notes\` until it earns a place in the schema.)
- Keep turns in conversation order; this group counts against the ${MAX_GROUPS_TOTAL}-group cap.

## Step 3 — name the phrasebook

Produce a single top-level \`title\` for the whole phrasebook: a concise, **one-line** name (aim for 2–4 words, at most ${MAX_TITLE_LENGTH} characters) that captures the whole situation at a glance — a shelf label the learner will scan in a list, in Title Case, in English. Encapsulate the situation as a whole; do NOT merely restate the raw topic verbatim, and do NOT reuse a single section/checklist label. E.g. topic "talking to a doctor about my annual physical" → "Annual Physical Visit"; "salsa dancing" (Latin America, social club, leading) → "Salsa Social Dancing".

## Content quality bar (non-negotiable)

- **Teacher, not dictionary — but the situation's transactional vocabulary IS the lesson.** Cut vocabulary that only catalogs the topic; KEEP and teach as \`word\` cards the nouns and adjectives the learner will point at, choose between, say, or hear in the moment.
- Favor common, conversational language a person would actually SAY to someone they're trying to connect with, in the ${level} range unless the situation demands otherwise.
- Reject stiff, textbook, or exam-flavored content — the irony of this endpoint's own name is intentional; it does not relax this bar.${genderInstruction(language)}

## Card schema (every group card)

{
  "lang": "${language}",
  "text": "the word or phrase in ${langName}",
  "translation": "clear, natural English (1–2 most common senses only)",
  "type": "set on every card: \\"word\\" for a standalone vocabulary item, \\"phrase\\" for a set expression or full spoken line",
  "reading": ${readingExample},
  "formality": "optional — this card's own register (\\"casual\\" | \\"polite\\" | \\"formal\\" | \\"slang\\"), ONLY when this word has a register-varying alternative worth contrasting; omit otherwise",
  "notes": "optional — grammar, collocations, or usage tips; never register (that's \`formality\`)"
}

- \`text\` — ONLY the exact word or line as spoken in ${langName}: never an English gloss, never a speaker label or prefix ("Staff:", "店員:", "スタッフ —"), never surrounding quotation dressing. English belongs in \`translation\`.
- \`reading\` — ALWAYS include. Must be a ReadingToken array: ${readingInstructions(language)}
- \`type\` — set on EVERY card: \`"word"\` for a standalone vocabulary item (a fiber, a tool, a color, an adjective), \`"phrase"\` for a set expression or a full spoken line. This is how the client tells a vocabulary group from a phrase group, so never omit it.
- \`formality\` — set ONLY when this word has a register-varying alternative worth contrasting (e.g. トイレ casual vs お手洗い polite). Do NOT tag a card \`polite\` just because its sentence uses ます-form — a whole chapter of identically "polite"-tagged cards is noise; omit it for any word with no register variant.
- Omit every optional field entirely when not applicable — never emit empty strings, empty arrays, or null.
- Do NOT include \`context\`, \`id\`, \`importedAt\`, or \`definition\` — the service fills \`context\` in afterward from the group title; the rest are assigned at import time or are not applicable to this endpoint.

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
