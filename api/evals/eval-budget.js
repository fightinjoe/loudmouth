#!/usr/bin/env node
/**
 * Budget probe for the conversation-first /textbook pivot.
 *
 * Measures, for a CANDIDATE multi-conversation generate prompt, whether the
 * output fits each backend's two hard gates:
 *   - output tokens  vs. the effective output-token ceiling
 *   - wall latency   vs. the effective request timeout
 * swept over N conversations x backend, with the CURRENT single-conversation
 * generate prompt (buildTextbookGeneratePrompt) as a baseline row.
 *
 * This is the step-1 measurement from docs/designs/conversation-first-pivot.md
 * ("Open Questions -> Generation budget"): it decides serial-vs-fan-out and the
 * conversation-count cap BEFORE the wire contract is written.
 *
 * ISOLATION: it calls the src/llms/* adapters directly and reuses the current
 * prompt builder for the baseline. It does NOT modify src/, does NOT run the
 * server, and does NOT change the shipped /textbook contract. Delete it (or keep
 * re-running it) freely; nothing else depends on it.
 *
 * Usage (from api/src, so ../.env + node_modules resolve):
 *   npm run eval:budget                      # salsa fixture, all backends, N=3,5,8
 *   npm run eval:budget -- --all             # every fixture under evals/
 *   npm run eval:budget -- --dir=talking-to-a-doctor-about-a-headcold
 *   npm run eval:budget -- --llm=google,claude --n=4,6
 *   npm run eval:budget -- --dry-run         # build prompts, no model calls (free)
 *
 * Requires GCP_PROJECT_ID / ANTHROPIC_API_KEY / OPENAI_API_KEY for real calls
 * (the npm script sources ../.env). --dry-run needs none.
 */

const fs = require('fs');
const path = require('path');

const { callGenAI, callGenAIFlash } = require('../src/llms/genai');
const { callAnthropic } = require('../src/llms/anthropic');
const { callOpenAI } = require('../src/llms/openai');
const { buildTextbookGeneratePrompt } = require('../src/textbook-prompt');
const { computeCostUsd } = require('../src/pricing');
const {
  genderInstruction,
  readingInstructions,
  cardReadingExample,
} = require('../src/lookup-prompt');

// ---------------------------------------------------------------------------
// backends + effective gates (mirror textbook.js: adapter capability first,
// else the shared /textbook generate ceiling/timeout)
// ---------------------------------------------------------------------------

const REGISTRY = {
  google: callGenAI,
  'g-flash': callGenAIFlash,
  claude: callAnthropic,
  chatgpt: callOpenAI,
};
const ALL_LLMS = Object.keys(REGISTRY);

// docs/API_DESIGN.md shared conventions + src/textbook.js constants.
const SHARED_CEILING_TOKENS = 30000; // TEXTBOOK_GENERATE_MAX_TOKENS
const SHARED_TIMEOUT_MS = 15000; // TEXTBOOK_TIMEOUT_MS

const ceilingFor = (handler) => handler.maxOutputTokens ?? SHARED_CEILING_TOKENS;
const timeoutFor = (handler) => handler.timeoutMs ?? SHARED_TIMEOUT_MS;

const LANG_NAMES = { zh: 'Mandarin Chinese', ja: 'Japanese', es: 'Spanish', cs: 'Czech' };
const LANG_LEVELS = { zh: 'HSK 1-4', ja: 'JLPT N5-N3' };

// ---------------------------------------------------------------------------
// candidate prompt: N distinct two-sided conversations + one pooled vocab list.
// Faithful to the current card schema + reading rules so output token counts
// are realistic. This is a PROBE prompt, not the eventual contract.
// ---------------------------------------------------------------------------

function buildBudgetGeneratePrompt({ topic, language, context, conversationCount }) {
  const langName = LANG_NAMES[language] || language;
  const level = LANG_LEVELS[language] || 'common, high-frequency';
  const readingExample = cardReadingExample(language);
  const N = conversationCount;

  const answers = context?.answers && typeof context.answers === 'object' ? context.answers : {};
  const checklist = Array.isArray(context?.checklist) ? context.checklist : [];

  const answersBlock = Object.keys(answers).length > 0
    ? Object.entries(answers).map(([label, value]) => `- ${label}: ${value}`).join('\n')
    : '(no context answers given)';
  const checklistBlock = checklist.length > 0
    ? checklist.map((label) => `- ${label}`).join('\n')
    : '(no coverage hints given - infer sensible scenes from the topic alone)';

  return `You are generating a bespoke, situation-specific phrasebook for a language learner, organized as SEVERAL short two-sided conversations (scenes) along the arc of ONE encounter, plus a single pooled vocabulary list distilled from those conversations. You are a TEACHER: teach enough that the learner can both PRODUCE their side and UNDERSTAND what the other person says back.

Topic/situation: ${topic}
Target language: ${langName}
Level: do NOT assume or bias toward any learner proficiency level. Assume common courtesy and survival basics (yes/no, hello, thank you, please, excuse me) are ALREADY OWNED; do not teach them unless this situation genuinely turns on them. Spend the whole budget on the highest-value, level-invariant core. Choose broadly-useful register and sentence complexity - neither dumbed-down nor needlessly complex.

## Context the learner gave

${answersBlock}

## Coverage hints (goals the learner cares about; fold/split as needed to hit the scene count)

${checklistBlock}

## Step 1 - produce EXACTLY ${N} distinct conversations

Design ${N} short, realistic, two-sided conversations, each a distinct SCENE along the encounter's timeline (before / during / after). Return them in timeline order.

- Each conversation: 4-8 turns, target 6. Two-sided; speakers alternate strictly; no speaker answers their own prior turn.
- Every turn carries a distinct, high-value line. Bias to single sentences; combine only where natural (e.g. "Hello! How are you?").
- Make each conversation as DISTINCT as possible. No redundant turns across conversations. Prefer one longer coherent conversation over two near-duplicates, and fold complementary yes/no paths (accept vs. politely decline) into ONE conversation.
- Bias every turn by the learner's context (role, scene, region). Respect any assigned role for every \`speaker:"you"\` line.
- Each turn is ONE card: \`text\` = the spoken line, \`translation\` = its English gloss, \`reading\` per the rules below, and \`notes\` carries a JSON blob identifying the speaker, e.g. {"speaker":"you"} or {"speaker":"partner"}.

## Step 2 - pooled vocabulary

Distill ONE global vocabulary list from across ALL conversations: 6-15 \`type:"word"\` cards - the highest-value situation-specific nouns, adjectives, and verbs.

- Verbs in the infinitive / dictionary form; nouns in citation form (with an article where the language needs it); modifiers in reusable form.
- Exclude survival basics, English-identical loanwords/cognates, and encyclopedic jargon the learner would not use in the room.
- Every vocab card's \`notes\` must include a back-reference to the source line it came from, as a JSON blob, e.g. {"source":"<the exact ${langName} phrase it appeared in>"}.
- Every vocab \`translation\` must differ materially from its \`text\`.

## Step 3 - name the phrasebook

Produce a single top-level \`title\`: a concise one-line Title Case English name (2-4 words, at most 60 characters) capturing the whole situation at a glance. Do not merely restate the raw topic.

## Content quality bar (non-negotiable)

- Teacher, not dictionary - but the situation's transactional vocabulary IS the lesson.
- Favor common, conversational language a person would actually SAY, in the ${level} range unless the situation demands otherwise.
- Reject stiff, textbook, or exam-flavored content.${genderInstruction(language)}

## Card schema (every card, in every conversation and in vocab)

{
  "lang": "${language}",
  "text": "the word or phrase in ${langName}",
  "translation": "clear, natural English (1-2 most common senses only)",
  "type": "\\"word\\" for a standalone vocabulary item, \\"phrase\\" for a set expression or full spoken line",
  "reading": ${readingExample},
  "formality": "optional - this card's own register, ONLY when a register-varying alternative is worth contrasting; omit otherwise",
  "notes": "optional JSON blob - {\\"speaker\\":...} on conversation turns, {\\"source\\":...} on vocab cards"
}

- \`text\` - ONLY the exact word or line as spoken in ${langName}: never an English gloss, never a speaker label prefix, never quotation dressing.
- \`reading\` - ALWAYS include. Must be a ReadingToken array: ${readingInstructions(language)}
- \`type\` - set on EVERY card (\`"word"\` or \`"phrase"\`).
- Omit every optional field entirely when not applicable - never emit empty strings, arrays, or null.
- Do NOT include \`context\`, \`id\`, \`importedAt\`, or \`definition\`.

## Output format

Respond with ONLY raw JSON - no markdown code fences, no prose, no leading or trailing text.

{
  "title": "...",
  "conversations": [
    { "title": "...", "cards": [ { ...Card... } ] }
  ],
  "vocab": [ { ...Card (type:"word")... } ]
}
`;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseFlags(argv) {
  const flags = {};
  for (const arg of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (m) flags[m[1]] = m[2] === undefined ? true : m[2];
  }
  return flags;
}

function resolveLlms(value) {
  if (!value || value === 'all' || value === true) return ALL_LLMS;
  const requested = String(value).split(',').map((s) => s.trim()).filter(Boolean);
  const unknown = requested.filter((l) => !ALL_LLMS.includes(l));
  if (unknown.length) {
    throw new Error(`Unknown backend(s): ${unknown.join(', ')}. Known: ${ALL_LLMS.join(', ')}`);
  }
  return requested;
}

function resolveNs(value) {
  if (!value || value === true) return [3, 5, 8];
  return String(value).split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isInteger(n) && n > 0);
}

const EVALS_DIR = __dirname;

function discoverFixtures(flags) {
  if (flags.dir) return [String(flags.dir)];
  if (flags.all) {
    return fs.readdirSync(EVALS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && fs.existsSync(path.join(EVALS_DIR, d.name, 'context.json')))
      .map((d) => d.name)
      .sort();
  }
  return ['salsa-dancing-in-austin-tx']; // default single fixture
}

function loadFixture(name) {
  const file = path.join(EVALS_DIR, name, 'context.json');
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { name, topic: raw.topic, language: raw.language, context: raw.context };
}

// ---------------------------------------------------------------------------
// measurement
// ---------------------------------------------------------------------------

async function measureCell({ llm, prompt, dryRun }) {
  const handler = REGISTRY[llm];
  const ceiling = ceilingFor(handler);
  const timeout = timeoutFor(handler);

  if (dryRun) {
    return {
      llm, ceiling, timeout,
      model: '(dry-run)',
      inputTokens: Math.round(prompt.length / 4), // rough char/4 estimate
      outputTokens: null, durationMs: null, jsonValid: null,
      verdict: 'DRY', error: null,
    };
  }

  const t0 = Date.now();
  try {
    // Allow the model the full ceiling; a fit is "produced valid JSON well
    // under the ceiling", a miss is "truncated at / near the ceiling".
    const res = await handler(prompt, { maxOutputTokens: ceiling });
    const durationMs = Date.now() - t0;
    let jsonValid = false;
    try { JSON.parse(res.text); jsonValid = true; } catch { /* truncated / malformed */ }
    const outputTokens = res.usage.outputTokens ?? 0;
    const inputTokens = res.usage.inputTokens ?? 0;
    const fitTokens = jsonValid && outputTokens < ceiling * 0.98;
    const fitTime = durationMs < timeout;
    return {
      llm, ceiling, timeout, model: res.model, inputTokens, outputTokens,
      durationMs, jsonValid, fitTokens, fitTime,
      costUsd: computeCostUsd(res.model, { inputTokens, outputTokens }),
      verdict: fitTokens && fitTime ? 'PASS' : 'FAIL',
      error: null,
    };
  } catch (err) {
    return {
      llm, ceiling, timeout, model: '(error)',
      inputTokens: null, outputTokens: null, durationMs: Date.now() - t0,
      jsonValid: null, verdict: 'ERROR', error: String(err && err.message || err),
    };
  }
}

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

const pad = (v, w) => String(v ?? '').padEnd(w);
const padl = (v, w) => String(v ?? '').padStart(w);

function fmtCost(c) {
  return c == null ? '-' : `$${c.toFixed(4)}`;
}
function pct(out, ceil) {
  return out == null ? '-' : `${Math.round((out / ceil) * 100)}%`;
}

function renderTable(rows) {
  const header = ['scenes', 'backend', 'model', 'in', 'out', 'ceiling', 'out%', 'ms', 'timeout', 'cost', 'json', 'verdict'];
  const widths = [8, 8, 26, 6, 7, 8, 5, 7, 8, 9, 5, 8];
  const line = (cells) => '| ' + cells.map((c, i) => (i >= 3 && i <= 10 ? padl(c, widths[i]) : pad(c, widths[i]))).join(' | ') + ' |';
  const out = [];
  out.push(line(header));
  out.push('|' + widths.map((w) => '-'.repeat(w + 2)).join('|') + '|');
  for (const r of rows) {
    out.push(line([
      r.scenes, r.llm, r.model,
      r.inputTokens ?? '-', r.outputTokens ?? '-', r.ceiling,
      pct(r.outputTokens, r.ceiling),
      r.durationMs ?? '-', r.timeout,
      fmtCost(r.costUsd), r.jsonValid == null ? '-' : (r.jsonValid ? 'ok' : 'BAD'),
      r.verdict,
    ]));
  }
  return out.join('\n');
}

function summarize(rows, ns) {
  // For each backend, the largest candidate N that PASSED both gates.
  const lines = [];
  const byLlm = {};
  for (const r of rows) {
    if (r.scenes === 'baseline') continue;
    (byLlm[r.llm] ||= []).push(r);
  }
  for (const llm of Object.keys(byLlm)) {
    const passed = byLlm[llm].filter((r) => r.verdict === 'PASS').map((r) => r.scenes);
    const maxN = passed.length ? Math.max(...passed) : null;
    lines.push(`- **${llm}**: ${maxN != null ? `serial fits up to ${maxN} conversations` : 'no tested N fits serial'} (passed: ${passed.length ? passed.sort((a, b) => a - b).join(', ') : 'none'}).`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const llms = resolveLlms(flags.llm);
  const ns = resolveNs(flags.n);
  const dryRun = !!flags['dry-run'];
  const fixtures = discoverFixtures(flags).map(loadFixture);
  const outFile = path.join(EVALS_DIR, String(flags.out || 'budget-report.md'));

  const sections = [];
  sections.push('# /textbook budget probe');
  sections.push('');
  sections.push(`Generated ${new Date().toISOString()}${dryRun ? ' (DRY RUN - no model calls, input tokens estimated as chars/4)' : ''}`);
  sections.push('');
  sections.push('Measures the candidate multi-conversation generate prompt against each backend\'s two hard gates:');
  sections.push('output tokens vs. ceiling and wall latency vs. timeout. `baseline` = the current single-conversation prompt.');
  sections.push('Probe only - see `docs/designs/conversation-first-pivot.md` (Open Questions: Generation budget). Not a contract.');
  sections.push('');
  sections.push('Effective per-backend gates:');
  sections.push('');
  for (const llm of llms) {
    const h = REGISTRY[llm];
    sections.push(`- **${llm}**: ceiling ${ceilingFor(h)} output tokens, timeout ${timeoutFor(h)} ms`);
  }
  sections.push('');

  for (const fx of fixtures) {
    console.error(`\n=== ${fx.name} (${fx.language}) ===`);
    const rows = [];

    // baseline: current single-conversation prompt
    const baselinePrompt = buildTextbookGeneratePrompt({ topic: fx.topic, language: fx.language, context: fx.context });
    for (const llm of llms) {
      console.error(`  baseline / ${llm} ...`);
      const cell = await measureCell({ llm, prompt: baselinePrompt, dryRun });
      rows.push({ scenes: 'baseline', ...cell });
    }

    // candidate: N conversations
    for (const n of ns) {
      const prompt = buildBudgetGeneratePrompt({ topic: fx.topic, language: fx.language, context: fx.context, conversationCount: n });
      for (const llm of llms) {
        console.error(`  ${n} scenes / ${llm} ...`);
        const cell = await measureCell({ llm, prompt, dryRun });
        rows.push({ scenes: n, ...cell });
      }
    }

    sections.push(`## ${fx.name}`);
    sections.push('');
    sections.push(`Topic: \`${fx.topic}\` - Language: \`${fx.language}\``);
    sections.push('');
    sections.push(renderTable(rows));
    sections.push('');
    if (!dryRun) {
      sections.push('**Verdict (serial, this fixture):**');
      sections.push('');
      sections.push(summarize(rows, ns));
      sections.push('');
      const anyError = rows.some((r) => r.verdict === 'ERROR');
      if (anyError) {
        sections.push('> Some cells errored (missing credentials or model error). See the `verdict` column; re-run those backends after fixing env.');
        sections.push('');
      }
    }

    const errs = rows.filter((r) => r.error);
    for (const e of errs) console.error(`  ! ${e.scenes}/${e.llm}: ${e.error}`);
  }

  sections.push('---');
  sections.push('');
  sections.push('**Reading this report.** A backend PASSES a scene count only when it produced valid JSON under ~98% of its ceiling AND returned under its timeout. If your target conversation count fails serial on any backend you must support, the fan-out (planner + parallel per-conversation fillers, `docs/FANOUT_DESIGN.md`) becomes required, not optional. Compare each N row against the `baseline` row to see the multi-conversation cost delta.');
  sections.push('');

  fs.writeFileSync(outFile, sections.join('\n'));
  console.error(`\nWrote ${path.relative(process.cwd(), outFile)}`);
  console.log(sections.join('\n'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
