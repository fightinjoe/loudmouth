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

For each question, produce a short label and a small set of mutually exclusive, genuinely-different-in-effect options, plus a sensible default (must be one of the options). **Hard cap: ${MAX_QUESTIONS} questions.** Most topics need far fewer — only ask what actually changes the output. Proficiency or language confidence is not a required axis, but MAY be asked when it would materially change the phrases; when asked, the selected answer will be honored during generation.

## Step 2 — the conversations to prep

Propose the short CONVERSATIONS this situation breaks into — the scenes the learner would actually go through, in the order they happen (before → during → after). Each checklist item is ONE conversation, named by a short, scan-friendly TITLE that describes one communicative goal. Use 2–5 words, preferably a simple verb phrase. Avoid "and", slashes, parentheticals, etiquette explanations, and other implementation detail. For example, prefer "Ask Someone To Dance" to "Ask Someone To Dance & Read The Room's Etiquette". Do not use a vague label like "Dinner" or a word-category label like "Food Vocabulary". If the topic or context contains a defining identity or hard constraint, include and default-check a conversation for stating that need directly before conversations about verification, modification, or the transaction. Order titles along the situation's arc. Default-check the conversations that carry the core of the encounter and leave clearly-secondary ones unchecked. **Hard cap: ${MAX_CHECKLIST_ITEMS} conversations.**

## Content quality bar (non-negotiable)

Read like a thoughtful assistant who understands the situation, not a form generator. Favor concise, specific options and checklist titles over generic ones. Reject stiff or textbook-flavored phrasing in the labels themselves.

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

  return `You are generating a bespoke, situation-specific phrasebook for a language learner. The primary
product is a set of meaningful, reusable words and phrases that the learner can memorize and use
to converse. Realistic conversations are the method for selecting and testing that language; do not
optimize for story realism at the expense of reuse.

Priorities, in order:
1. Reusable, memorizable words and phrases.
2. The learner's ability to express their needs, preferences, constraints, intentions, and identity.
3. The learner's ability to understand likely partner language.
4. Useful positive/negative and alternative outcomes.
5. Natural conversational sequencing.
6. Situational detail only when it improves reuse or comprehension.

You are a TEACHER: teach enough that the learner can PRODUCE their side of this situation and
UNDERSTAND what the other person says back.

The phrasebook is a set of short CONVERSATIONS the learner can rehearse, plus the key WORDS drawn
from them. Generate it as groups: one group per conversation, then one final "vocab" group.

Topic/situation: ${topic}
Target language: ${langName}
Level: default to level-neutral, common language. If the context explicitly gives the learner's proficiency or language confidence, HONOR it: prefer simpler, shorter constructions for lower proficiency and allow broader vocabulary and syntax for higher proficiency, while preserving the same practical intent and essential content. Assume common courtesy and survival basics (yes/no, hello, thank you, please, excuse me) are ALREADY OWNED; do not teach them unless this situation genuinely turns on them.

## Context the learner gave

${answersBlock}

## Conversations to write (one group each, IN THIS ORDER)

${conversationsBlock}

Each line above is one conversation to write, already ordered as the encounter unfolds (before → during → after). Keep that order.
Before writing, identify the topic's ESSENTIAL CONCEPTS: its primary action; every explicit learner identity; every explicit need or hard constraint; and any indispensable object, destination, or relationship. Each essential identity, need, and hard constraint MUST appear (1) in a direct learner-originating phrase, (2) in a general request, question, or response when useful, and (3) in vocab using the ordinary target-language term. Do not replace a concise identity or constraint only with an enumeration of examples.

## Step 1 — write each conversation

For EACH conversation title above, write one short, realistic, two-sided exchange for the situation. The title is only a compact navigation label; do not repeat every title word in the dialogue.

- 3–6 turns, aim for 4. Each turn is ONE card. Prefer fewer turns when extra turns would require invented detail.
- Use the natural speech act for the setting. Do not ask an ability or identity question when the learner would naturally make an invitation, request, offer, refusal, or greeting instead. Before emitting a line, check that its English intent is socially natural in this situation, then render that intent idiomatically in ${langName}; never translate an awkward English sentence literally.
- Use context to select the relevant phrase frames, register, and substitutions, not to decorate every line with concrete detail. If a context answer assigns the learner a role, every speaker:"you" line must be valid for that role; never make the learner perform the partner's role.
- Include at least one reusable learner-originating line when the situation gives the learner a need, preference, constraint, intention, or identity to express. Teach what the learner is, can do, wants, needs, prefers, refuses, or cannot accept; do not teach only questions and partner replies.
- Keep lines short and adaptable. Prefer phrases that can be reused by changing one word or short phrase. A phrase is too specific if the learner would need to memorize it again rather than substitute a slot.
- Use no more than one or two concrete situation-specific nouns per line unless the noun is itself a core learning target. Do not invent personal backstory, technical commentary, or observations about a person's performance, appearance, or circumstances.
- Give each conversation a compact progression, but allow confirmation, reassurance, acknowledgment, or repetition when that is the natural reply. Do not invent facts solely to create progression.
- Across the phrasebook, cover both sides of natural choices when relevant: acceptance and refusal/deferral, available and unavailable, allowed and not allowed, success and recovery, or continuation and closure. Prefer short functional contrasts over branching storylines; do not force a negative branch where unnatural.
- For safety, allergy, dietary, religious, or other hard constraints, never infer that a named item or action is compatible from its name alone. Prioritize verification, modification, and refusal language. A partner may present a specific option as compatible only after the exchange explicitly confirms the relevant ingredients, preparation, or conditions.
- Keep each conversation DISTINCT from the others — no turn that merely repeats another conversation's line.

Emit each conversation as a group: title = the conversation title above (verbatim), cards = its turns in order. Each turn card: text = the spoken line, translation = its English gloss, reading per the rules below, type = "phrase", and notes = a JSON object naming the speaker, {"speaker":"you"} or {"speaker":"partner"}.

## Step 2 — the vocab group

After the conversations, emit ONE final group with title exactly "vocab", holding the highest-value situation-specific WORDS drawn from across all the conversations.

- 10–15 word cards (type "word"), aim for 12: nouns, adjectives, and verbs the learner will say, hear, point at, or choose between.
- Nouns in citation form (with an article where the language needs it); verbs in the infinitive / dictionary form; modifiers in reusable form.
- Build vocab by scanning the completed conversations, not from the topic alone. Put the topic's essential concepts first: its primary action plus every explicit identity, need, or hard constraint. Use each concept's reusable citation form, even when the conversation uses an inflected form. Then draw from every conversation when useful, prioritizing words that support reuse and learner self-expression over peripheral terminology.
- Exclude words unchanged in English and obvious loanwords only when they add no practical learning value. ALWAYS include the conventional target-language term for an essential identity, constraint, need, or action, even when it is borrowed or resembles English. Also exclude generic courtesy basics, duplicate near-synonyms, and encyclopedic, menu-catalog, or glossary-only words. Do not optimize for filling the count; omit a weak card.
- When a situation involves a hard constraint, prioritize words for stating the constraint, verifying it, modifying a request, accepting an alternative, or refusing an unsafe/unavailable option.
- Each vocab card's notes is a JSON object naming the phrase it came from: {"source":"<the exact ${langName} line it appeared in>"}.
- Every vocab card's English translation must use the ordinary learner-facing meaning; do not make the gloss artificially specialized merely to differ from the target text.

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
