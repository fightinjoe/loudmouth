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
 * into { title, groups } JSON. It plans facts, essential concepts, functions,
 * and a phrase bank internally before assembling one group per selected
 * checklist item plus vocab.
 *
 * Reuses lookup-prompt.js's reading-token instructions and gender-collapse
 * rule (not duplicated) — the Card shape and quality bar are identical to
 * /lookup's. /textbook takes no fixed `ability`; it stays level-neutral unless
 * a dynamically selected context answer explicitly supplies proficiency.
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

Treat the learner's topic as stated fact. Ask about a medically, culturally, religiously, or personally significant fact only when its answer would materially change generation; never assume one significant fact from another. When the topic does not supply the answer, include a neutral "Not specified" option and make it the default so tailoring never invents a fact. Keep distinct claims in distinct options: never combine a medical condition with an ethical constraint, or dietary identity with cross-contamination tolerance.
For each question, produce a short label and a small set of mutually exclusive, genuinely-different-in-effect options, plus a sensible default (must be one of the options). **Hard cap: ${MAX_QUESTIONS} questions.** Most topics need far fewer — only ask what actually changes the output. Proficiency or language confidence is not a required axis, but MAY be asked when it would materially change the phrases; when asked, the selected answer will be honored during generation.

## Step 2 — the conversations to prep

Propose the short CONVERSATIONS this situation breaks into — the scenes the learner would actually go through, in the order they happen (before → during → after). Each checklist item is ONE conversation, named by a short, scan-friendly TITLE that describes one communicative goal. Use 2–5 words, preferably a simple verb phrase. Avoid "and", slashes, parentheticals, etiquette explanations, and other implementation detail. For example, prefer "Ask Someone To Dance" to "Ask Someone To Dance & Read The Room's Etiquette". Do not use a vague label like "Dinner" or a word-category label like "Food Vocabulary". Always include and default-check a conversation in which the learner performs the topic's primary action; preparation, verification, payment, or closure does not replace the action itself. If the topic or context contains a defining identity or hard constraint, also include and default-check a conversation for stating that need directly before verification, modification, or transaction conversations. A conversation may later contain multiple same-speaker alternatives, so do not split acceptance/refusal or available/unavailable variants into duplicate checklist items. **Hard cap: ${MAX_CHECKLIST_ITEMS} conversations.** Do not add a vocab item; vocabulary is generated separately.
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
 * Call 2 — plan a phrase bank, then assemble it as short conversation groups
 * plus one pooled vocab group. One group per checked conversation title
 * (`phrase` cards with speaker notes), then a final "vocab" group (`word`
 * cards with source-phrase notes). The internal plan is discarded; the
 * response remains `{ title, groups }` and reuses /lookup's Card, reading, and
 * gender-collapse rules.
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
product is a bank of meaningful, reusable words and phrases that the learner can memorize and use
to converse. Conversations organize and rehearse that bank; phrase quality and semantic coverage
matter more than a perfectly linear story.

Required coverage, factual fidelity, role fidelity, and safety are gates: never trade them away for
style or flow. Among outputs that satisfy those invariants, priorities are:
1. Reusable, memorizable words and phrases.
2. The learner's ability to express needs, preferences, constraints, intentions, and identity.
3. The learner's ability to understand likely partner language.
4. Useful positive/negative and alternative outcomes.
5. Natural conversational sequencing.
6. Situational detail only when it improves reuse or comprehension.

You are a TEACHER: teach enough that the learner can PRODUCE their side of this situation and
UNDERSTAND what the other person says back.

Topic/situation: ${topic}
Target language: ${langName}
Level: default to level-neutral, common language. If the context explicitly gives the learner's proficiency or language confidence, HONOR it: prefer simpler, shorter constructions for lower proficiency and allow broader vocabulary and syntax for higher proficiency, while preserving the same practical intent and essential content. Assume common courtesy and survival basics (yes/no, hello, thank you, please, excuse me) are ALREADY OWNED; do not teach them unless this situation genuinely turns on them.

## Context the learner gave

${answersBlock}

## Conversations to write (one group each, IN THIS ORDER)

${conversationsBlock}

Each line above is one destination group, already ordered across the encounter (before → during → after).

## Step 0 — establish the fact and coverage boundary

Before translating anything, silently make four inventories:

1. STATED FACTS: the topic and context assertions you may rely on. Preserve their exact practical
   meaning.
2. UNSTATED FACTS: medically, culturally, religiously, or personally significant claims that were not
   supplied. Do not infer them. One constraint never silently implies another: a diet is not an allergy,
   an identity is not a medical condition, and an unspecified tolerance remains unknown.
3. ESSENTIAL CONCEPTS: the primary action; every explicit learner identity, need, and hard constraint;
   the conventional category term needed to explain each identity or constraint without merely listing
   examples; and only indispensable situation anchors. Record the conventional ${langName} lemma for
   each, retaining essential loanwords.
4. COMMUNICATIVE FUNCTIONS needed for the selected groups: self-description, request, verification,
   modification, acceptance, refusal, recovery, and closure, as applicable.

Do not emit these inventories. Use them as the source of truth for the phrase bank and vocab.

## Step 1 — silently plan the phrase bank

Plan a compact bank before writing any conversation. Every bank item must have:

- communicative intent;
- one natural ${langName} phrase and an ordinary English gloss;
- speaker: "you" or "partner";
- essential concepts covered;
- positive, negative, or alternative role when applicable;
- a reusable substitution: the one word or short phrase a learner can swap, or "none";
- exactly one destination conversation title from the selected list.

The bank MUST contain:

- a direct speaker:"you" phrase that performs the primary action when it is the learner's action;
- a direct speaker:"you" phrase for every explicit learner identity, need, and hard constraint;
- useful learner requests, questions, modifications, responses, and refusals supported by those concepts;
- likely partner language the learner must recognize;
- both positive and negative or alternative outcomes when the situation naturally involves a choice;
- at least one emitted source phrase for EVERY essential concept so its lemma can appear in vocab.

Approve an item only if it is idiomatic, socially appropriate, concise, reusable nearby, consistent
with the stated facts, free of significant unstated claims, and valid for the learner's selected role.
Reject literal translations of awkward English speech acts, invented observations, personal backstory,
technical commentary, and one-off connector lines.

For safety, allergy, dietary, religious, or other hard constraints, never infer that a named item or
action is compatible from its name alone. Plan verification, modification, and refusal language before
any specific recommendation. A partner may present a specific option as compatible only after a bank
item explicitly verifies the relevant ingredients, preparation, or conditions.

Do not emit the bank as a separate object.

## Step 2 — assemble conversation groups from the bank

For EACH selected title, emit one group using ONLY its approved bank items, copied verbatim. Do not
invent greetings, acknowledgments, transitions, or other lines during assembly merely to create flow.

- Usually use 3–6 cards, aiming for 4; use fewer rather than add an unplanned line.
- Each card contains one spoken phrase. Keep it short and adaptable; generally use no more than one or
  two concrete situation-specific nouns unless a noun is itself a core learning target.
- Include partner replies that help the learner recognize likely language.
- Alternatives belong in the SAME group. Two or three alternatives may appear consecutively even when
  that makes the group non-linear; assign every alternative the same speaker. Never repeat an invitation
  or question merely to force acceptance and refusal into a fake linear exchange.
- Outside an alternatives set, alternate speakers when natural. Phrase quality, coverage, and factual
  safety take precedence over turn-taking and narrative coherence.
- Keep groups distinct; place each bank item in exactly one group.

Each card: text = the planned spoken phrase, translation = its planned ordinary English gloss, reading
per the rules below, type = "phrase", and notes = {"speaker":"you"} or {"speaker":"partner"}.

## Step 3 — build vocab from the same inventory and bank

Emit ONE final group titled exactly "vocab", with 10–15 useful situation-specific word cards, aiming
for 12. Select required lemmas directly from the ESSENTIAL CONCEPTS inventory, then select supporting
words that occur in approved phrase-bank items. Do not rediscover vocab from the topic after assembly.

- Include the conventional target-language lemma for EVERY essential concept, including the primary
  action and every explicit identity, need, and hard constraint, even when it is a loanword or resembles
  English.
- Use reusable citation forms: nouns with an article where needed, verbs in infinitive/dictionary form,
  and modifiers in reusable form.
- After required lemmas, prioritize words supporting verification, modification, alternatives,
  learner self-expression, and reuse across nearby situations.
- Exclude generic courtesy basics, duplicate near-synonyms, and encyclopedic, menu-catalog, or
  glossary-only words. Do not pad with weak cards.
- Each word must occur in at least one emitted conversation line. Its notes must name that exact
  ${langName} source line: {"source":"…"}.
- Use an ordinary learner-facing English gloss; do not specialize it artificially.

## Step 4 — verify invariants

Before emitting JSON, silently verify:

- every essential concept occurs in an emitted phrase and has a vocab card;
- the primary action and every essential identity, need, and hard constraint have a direct learner phrase;
- every conventional essential loanword is retained;
- stated facts remain true and no significant unstated fact was invented;
- safety-sensitive recommendations follow explicit verification;
- every speaker:"you" phrase respects the learner's role;
- explicit proficiency changes complexity; absent proficiency remains level-neutral;
- every conversation card came from the planned bank and every vocab card from its inventory/bank.

Repair the bank and assembled output until all checks pass.

## Step 5 — name the phrasebook

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
