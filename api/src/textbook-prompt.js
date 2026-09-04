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
const MAX_GROUPS_TOTAL = 8;
// vocab occupies one of the MAX_GROUPS_TOTAL groups, so cap conversations at
// MAX_GROUPS_TOTAL - 1 to keep a full checklist + vocab under the group cap.
const MAX_CHECKLIST_ITEMS = MAX_GROUPS_TOTAL - 1;
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

## Step 2 — the conversations to prep

Propose the short CONVERSATIONS this situation breaks into — the scenes the learner would actually go through, in the order they happen (before → during → after). Each checklist item is ONE conversation, named by a short, learner-recognizable TITLE that reveals its goal where possible: "Compliments and offering help" or "Asking about the food", not a vague label like "Dinner" or a word-category like "Food vocabulary". Order them along the situation's arc. Default-check the conversations that carry the core of the encounter (the opening and the main exchange) and leave clearly-secondary ones unchecked. **Hard cap: ${MAX_CHECKLIST_ITEMS} conversations.**

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
 * Call 2 — generate the phrasebook as a set of short conversations plus one
 * pooled vocab group. One group per checked conversation title (its turns as
 * `phrase` cards, the speaker in `notes`), then a final "vocab" group of
 * `word` cards (the source phrase in `notes`). The response stays
 * `{ title, groups }`; reuses the same Card schema, reading-token rules, and
 * gender-collapse rule as /lookup. Unlike /lookup, /textbook is
 * level-independent: it takes no `ability`.
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

  const conversationsBlock = checklist.length > 0
    ? checklist.map((label) => `- ${label}`).join('\n')
    : "(no conversations chosen — infer 3-4 sensible scenes across the situation's arc)";

  return `You are generating a bespoke, situation-specific phrasebook for a language learner — a custom textbook chapter for tonight, tailored to their exact situation, not a generic curriculum. You are a TEACHER: teach enough that the learner can both PRODUCE their side of this situation and UNDERSTAND what the other person says back.

The phrasebook is a set of short CONVERSATIONS the learner can rehearse, plus the key WORDS drawn from them. Generate it as groups: one group per conversation, then one final "vocab" group.

Topic/situation: ${topic}
Target language: ${langName}
Level: do NOT assume or bias toward any learner proficiency level. Assume common courtesy and survival basics (yes/no, hello, thank you, please, excuse me) are ALREADY OWNED; do not teach them unless this situation genuinely turns on them. Spend the whole budget on the highest-value, level-invariant core: the real phrases and words this situation needs. Choose broadly-useful register and sentence complexity — neither dumbed-down nor needlessly complex. This governs word/phrase choice and sentence complexity, never the translated intent.

## Context the learner gave

${answersBlock}

## Conversations to write (one group each, IN THIS ORDER)

${conversationsBlock}

Each line above is one conversation to write, already ordered as the encounter unfolds (before → during → after). Keep that order.

## Step 1 — write each conversation

For EACH conversation title above, write one short, realistic, two-sided exchange for this exact situation.

- 3–8 turns, aim for 6. Each turn is ONE card.
- Bias every turn by the learner's context — role, scene, relationship, region. If a context answer assigns the learner a role, every speaker:"you" line must be valid for that role; never make the learner perform the partner's role.
- At least two turns must depend on the supplied role, scene, relationship, skill level, constraint, object, or action. A conversation that could move unchanged to an unrelated situation is too generic.
- Give each conversation a concrete progression: an initiation or situation, a meaningful reply, and a response or resolution. At least one partner reply must give the learner new information, ask them something, make a decision, or change what happens next.
- Alternate speakers strictly — one speaker never answers or reassures their own previous turn.
- Preserve cause and effect: a complication is introduced, then gets a natural response in the next turn; never jump from an unrelated line to an apology or recovery.
- Every turn carries a distinct, high-value line. Bias to single sentences; combine only where it is natural to say two at once ("Hello! How are you?").
- Keep each conversation DISTINCT from the others — no turn that merely repeats another conversation's line. Prefer one longer coherent conversation over two near-duplicates; fold a yes/no pair into ONE conversation as a later beat (e.g. ask → accept … ask again → politely decline), not two near-identical conversations.

Emit each conversation as a group: title = the conversation title above (verbatim), cards = its turns in order. Each turn card: text = the spoken line, translation = its English gloss, reading per the rules below, type = "phrase", and notes = a JSON object naming the speaker, {"speaker":"you"} or {"speaker":"partner"}.

## Step 2 — the vocab group

After the conversations, emit ONE final group with title exactly "vocab", holding the highest-value situation-specific WORDS drawn from across all the conversations.

- 10–15 word cards (type "word"), aim for 12: nouns, adjectives, and verbs the learner will say, hear, point at, or choose between.
- Nouns in citation form (with an article where the language needs it); verbs in the infinitive / dictionary form; modifiers in reusable form.
- Build vocab by scanning the completed conversations, not from the topic alone. First identify the central action or state named by the topic. If any conversation expresses it, the first vocab card MUST be its reusable citation form, even when the line uses an inflected form (for example, Spanish "¿Bailas?" yields "bailar"). Draw from every conversation when useful, prioritizing recurring verbs, concrete nouns, and modifiers over peripheral terminology.
- Do NOT include words unchanged in English ("salsa", "hotel"), generic courtesy basics, or obvious loanwords. Exclude encyclopedic or glossary-only words the learner would not use in the room.
- Each vocab card's notes is a JSON object naming the phrase it came from: {"source":"<the exact ${langName} line it appeared in>"}.
- Every vocab card's English translation must differ materially from its text.

## Step 3 — name the phrasebook

Produce a single top-level title: a concise one-line English name (2–4 words, at most ${MAX_TITLE_LENGTH} characters), Title Case, capturing the whole situation at a glance. Do not merely restate the raw topic. E.g. "dinner with my partner's parents" → "Dinner With The Parents".

## Budget

At most ${MAX_GROUPS_TOTAL} groups total, INCLUDING the vocab group (so at most ${MAX_GROUPS_TOTAL - 1} conversations). At most ${MAX_CARDS_PER_GROUP} cards per group. Do not pad to hit a count.

## Content quality bar (non-negotiable)

- Teacher, not dictionary — but the situation's transactional vocabulary IS the lesson.
- Favor common, conversational language a person would actually SAY to someone they are trying to connect with, in the ${level} range unless the situation demands otherwise.
- Reject stiff, textbook, or exam-flavored content — the irony of this endpoint's own name is intentional; it does not relax this bar.${genderInstruction(language)}

## Card schema (every card, in every group)

{
  "lang": "${language}",
  "text": "the word or phrase in ${langName}",
  "translation": "clear, natural English (1–2 most common senses only)",
  "type": "\\"phrase\\" for a conversation turn, \\"word\\" for a vocab item",
  "reading": ${readingExample},
  "formality": "optional — this card's own register, ONLY when a register-varying alternative is worth contrasting; omit otherwise",
  "notes": "a JSON object: {\\"speaker\\":\\"you\\"|\\"partner\\"} on conversation turns, {\\"source\\":\\"…\\"} on vocab cards"
}

- text — ONLY the exact word or line as spoken in ${langName}: never an English gloss, never a speaker-label prefix ("Staff:", "店員:"), never surrounding quotation dressing. English belongs in translation.
- reading — ALWAYS include. Must be a ReadingToken array: ${readingInstructions(language)}
- type — set on EVERY card: "phrase" for a conversation turn, "word" for a vocab item.
- notes — a JSON object: {"speaker":…} on conversation turns, {"source":…} on vocab cards. Omit only when truly nothing applies.
- formality — set ONLY when this word has a register-varying alternative worth contrasting; omit otherwise.
- Omit every optional field entirely when not applicable — never emit empty strings, empty arrays, or null.
- Do NOT include context, id, importedAt, or definition — the service fills context from the group title; the rest are assigned at import time or are not applicable here.

## Output format

Respond with ONLY raw JSON — no markdown code fences, no prose, no leading or trailing text.

{
  "title": "…",
  "groups": [
    { "title": "…conversation title…", "cards": [ { ...Card... } ] },
    { "title": "vocab", "cards": [ { ...Card... } ] }
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
