#!/usr/bin/env node
'use strict';

/**
 * Pre-deploy eval harness for /lookup (docs/API_DESIGN.md "Test coverage",
 * EVAL section). Calls the REAL LLM backends — unlike api/src/test/lookup.test.js,
 * which mocks the LLM — and checks:
 *
 *   - STRUCTURAL invariants: <=4 blocks, <=8 groups total, <=10 cards/group,
 *     no near-duplicate cards, valid schema (the shared validators already
 *     enforce the caps; this independently re-checks the *actual* response,
 *     which also catches a validator regression, plus dedup, which the
 *     request-time validator does not attempt).
 *   - READING CORRECTNESS: cards for known golden words are checked against
 *     their known-correct reading tokens. `reading` shape is validated at
 *     request time (api/src/card-validate.js); PHONETIC correctness has no
 *     runtime guard (docs/API_DESIGN.md "Known gap") — this golden set is
 *     the only place that catches a wrong pinyin tone / kanji reading.
 *   - CONVERSATIONAL QUALITY BAR: an LLM-judge pass asking "would a person
 *     actually say this to someone they want to connect with?" on a sample
 *     of the produced cards.
 *
 * GOLDEN-SET SAMPLING STRATEGY (docs/API_DESIGN.md Appendix, "Deferred" ->
 * golden-set coverage): the full input space is 4 languages x 4 abilities x
 * 3 formalities x 4 audiences x 3 llms = 576 combinations. This harness does
 * NOT run the full cross-product (too slow/expensive for a pre-deploy gate).
 * Instead GOLDEN_CASES samples a REPRESENTATIVE SUBSET: every value of every
 * axis appears in at least one case (round-robin assignment across a fixed
 * list of anchor terms — the 3 API_DESIGN.md worked examples plus 3 more
 * chosen to cover the remaining languages/backends), so a regression tied to
 * any single axis value is likely to surface even though not every
 * combination is exercised. Revisit sampling only if production surfaces a
 * combination-specific gap this doesn't catch.
 *
 * USAGE
 *   node evals/lookup.eval.js [--limit=N] [--llm=google|claude|chatgpt] [--no-judge]
 *
 * Run from api/ (so the relative requires below resolve), or anywhere via an
 * absolute path — module resolution here does not depend on cwd.
 * Requires the same env vars as api/src/llms/*.js for whichever backends the
 * selected cases use (ANTHROPIC_API_KEY, OPENAI_API_KEY, GCP_PROJECT_ID).
 *
 * Exit code: 0 if no structural/schema failures and the judge pass rate meets
 * JUDGE_PASS_THRESHOLD; 1 otherwise. Always prints a full pass/fail report.
 */

const path = require('node:path');

const { performLookup } = require(path.join(__dirname, '..', 'src', 'lookup.js'));
const { parseTerm } = require(path.join(__dirname, '..', 'src', 'lookup-parse.js'));
const { callAnthropic } = require(path.join(__dirname, '..', 'src', 'llms', 'anthropic.js'));
const { callOpenAI } = require(path.join(__dirname, '..', 'src', 'llms', 'openai.js'));
const { callGenAI } = require(path.join(__dirname, '..', 'src', 'llms', 'genai.js'));

const LLM_REGISTRY = { google: callGenAI, claude: callAnthropic, chatgpt: callOpenAI };

const MAX_BLOCKS = 4;
const MAX_GROUPS_TOTAL = 8;
const MAX_CARDS_PER_GROUP = 10;

const ABILITIES = ['none', 'beginner', 'intermediate', 'advanced'];
const FORMALITIES = ['casual', 'polite', 'formal'];
const AUDIENCES = ['stranger', 'staff', 'acquaintance', 'family'];
const LLMS = ['google', 'claude', 'chatgpt'];

const JUDGE_PASS_THRESHOLD = 0.7;
const JUDGE_SAMPLE_SIZE_PER_CASE = 2;

// ---------------------------------------------------------------------------
// golden set — cases (structural + judge) and known-correct readings
// ---------------------------------------------------------------------------

function buildGoldenCases() {
  const anchors = [
    { term: 'bathroom (looking for a restroom)', language: 'ja' }, // API_DESIGN Example 1
    { term: 'dinner', language: 'ja' }, // API_DESIGN Example 2
    { term: 'water', language: 'ja' }, // API_DESIGN Example 3
    { term: 'coffee', language: 'es' }, // API_DESIGN Example 4 (ability contrast)
    { term: 'menu', language: 'zh' }, // covers zh + reading-correctness golden set
    { term: 'excuse me', language: 'cs' }, // covers cs + rounds out the axis cycle
  ];
  return anchors.map((anchor, i) => ({
    ...anchor,
    ability: ABILITIES[i % ABILITIES.length],
    formality: FORMALITIES[i % FORMALITIES.length],
    audience: AUDIENCES[i % AUDIENCES.length],
    llm: LLMS[i % LLMS.length],
  }));
}

const GOLDEN_CASES = buildGoldenCases();

// Known-correct reading tokens for common words, keyed by language + exact
// surface text. Checked whenever a produced card happens to use that exact
// text — a light-touch net, not exhaustive (docs/API_DESIGN.md "Known gap").
const GOLDEN_READINGS = [
  { language: 'ja', text: '水', reading: [['水', 'みず']] },
  { language: 'ja', text: 'トイレ', reading: [['トイレ', null]] },
  { language: 'ja', text: 'お手洗い', reading: [['お', null], ['手', 'て'], ['洗', 'あら'], ['い', null]] },
  { language: 'zh', text: '菜单', reading: [['菜', 'cài'], ['单', 'dān']] },
  { language: 'es', text: 'café', reading: [['café', null]] },
];

// ---------------------------------------------------------------------------
// structural invariants
// ---------------------------------------------------------------------------

function normalizeForDedup(text) {
  return text.trim().toLowerCase().replace(/[!?。、，,.！？\s]/g, '');
}

/** @returns {string[]} human-readable problems; empty = structurally clean */
function checkStructural(response) {
  const problems = [];

  if (response.blocks.length > MAX_BLOCKS) {
    problems.push(`${response.blocks.length} blocks > ${MAX_BLOCKS}`);
  }

  let totalGroups = 0;
  const seenCardKeys = new Set();

  for (const block of response.blocks) {
    for (const group of block.groups) {
      totalGroups++;
      if (group.cards.length > MAX_CARDS_PER_GROUP) {
        problems.push(`group "${group.title}" has ${group.cards.length} cards > ${MAX_CARDS_PER_GROUP}`);
      }
      if (group.cards.length === 0) {
        problems.push(`group "${group.title}" is empty (should have been dropped)`);
      }
      for (const card of group.cards) {
        const key = `${card.lang}:${normalizeForDedup(card.text)}`;
        if (seenCardKeys.has(key)) {
          problems.push(`near-duplicate card text: "${card.text}"`);
        }
        seenCardKeys.add(key);
      }
    }
  }

  if (totalGroups > MAX_GROUPS_TOTAL) {
    problems.push(`${totalGroups} groups total > ${MAX_GROUPS_TOTAL}`);
  }

  return problems;
}

// ---------------------------------------------------------------------------
// reading correctness (golden set)
// ---------------------------------------------------------------------------

function allCards(response) {
  const cards = [];
  for (const block of response.blocks) {
    cards.push(block.card);
    for (const group of block.groups) {
      cards.push(...group.cards);
    }
  }
  return cards;
}

function checkReadingCorrectness(response, language, report) {
  for (const card of allCards(response)) {
    const golden = GOLDEN_READINGS.find((g) => g.language === language && g.text === card.text);
    if (!golden) continue;
    report.goldenChecked++;
    const matches = JSON.stringify(card.reading) === JSON.stringify(golden.reading);
    if (matches) {
      report.goldenPassed++;
    } else {
      report.goldenFailures.push({ text: card.text, expected: golden.reading, actual: card.reading });
    }
  }
}

// ---------------------------------------------------------------------------
// LLM-judge — conversational quality bar
// ---------------------------------------------------------------------------

function buildJudgePrompt(card) {
  return `You are judging a phrasebook flashcard against a conversational-quality bar.

Card: "${card.text}" — "${card.translation}"${card.notes ? `\nNotes: ${card.notes}` : ''}

Question: would a real person actually SAY this to someone they are trying to connect with — or is it stiff, textbook, or exam-flavored?

Respond with ONLY raw JSON, no code fences: {"pass": true|false, "reason": "one short sentence"}`;
}

async function judgeCard(card, judgeLlm) {
  const handler = LLM_REGISTRY[judgeLlm];
  const raw = await handler(buildJudgePrompt(card), { maxOutputTokens: 200 });
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    return { pass: parsed.pass === true, reason: typeof parsed.reason === 'string' ? parsed.reason : '' };
  } catch (err) {
    return { pass: false, reason: `judge response unparsable: ${cleaned.slice(0, 200)}` };
  }
}

function sampleCardsForJudging(response, n) {
  return allCards(response).slice(0, n);
}

// ---------------------------------------------------------------------------
// runner
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { limit: null, llm: null, noJudge: false };
  for (const arg of argv) {
    if (arg.startsWith('--limit=')) args.limit = Number(arg.slice('--limit='.length));
    else if (arg.startsWith('--llm=')) args.llm = arg.slice('--llm='.length);
    else if (arg === '--no-judge') args.noJudge = true;
  }
  return args;
}

function deriveParsedRequest(golden) {
  const { term, context } = parseTerm(golden.term);
  return {
    term,
    context,
    language: golden.language,
    ability: golden.ability,
    formality: golden.formality,
    audience: golden.audience,
    llm: golden.llm,
  };
}

function printReport(report) {
  console.log('\n' + '='.repeat(72));
  console.log('LOOKUP EVAL REPORT');
  console.log('='.repeat(72));

  console.log(`\nCases run: ${report.total}`);

  console.log(`\nSchema/response failures: ${report.schemaFailures.length}`);
  for (const f of report.schemaFailures) {
    console.log(`  FAIL [${f.case.llm}] "${f.case.term}" (${f.case.language}): ${f.error}`);
  }

  console.log(`\nStructural failures: ${report.structuralFailures.length}`);
  for (const f of report.structuralFailures) {
    console.log(`  FAIL [${f.case.llm}] "${f.case.term}" (${f.case.language}): ${f.problems.join('; ')}`);
  }

  const goldenRate = report.goldenChecked > 0 ? (report.goldenPassed / report.goldenChecked) : null;
  console.log(`\nReading correctness (golden set): ${report.goldenPassed}/${report.goldenChecked} matched`
    + (goldenRate !== null ? ` (${(goldenRate * 100).toFixed(0)}%)` : ' (no golden-set terms appeared in output)'));
  for (const f of report.goldenFailures) {
    console.log(`  FAIL "${f.text}": expected ${JSON.stringify(f.expected)}, got ${JSON.stringify(f.actual)}`);
  }

  const judgeRate = report.judged > 0 ? (report.judgePassed / report.judged) : null;
  console.log(`\nConversational-quality LLM-judge: ${report.judgePassed}/${report.judged} passed`
    + (judgeRate !== null ? ` (${(judgeRate * 100).toFixed(0)}%, threshold ${(JUDGE_PASS_THRESHOLD * 100).toFixed(0)}%)` : ' (skipped)'));
  for (const f of report.judgeFailures) {
    console.log(`  FAIL "${f.card}": ${f.reason}`);
  }

  const criticalFail = report.schemaFailures.length > 0 || report.structuralFailures.length > 0;
  const judgeFail = judgeRate !== null && judgeRate < JUDGE_PASS_THRESHOLD;
  const overall = !criticalFail && !judgeFail;

  console.log('\n' + '='.repeat(72));
  console.log(overall ? 'RESULT: PASS' : 'RESULT: FAIL');
  console.log('='.repeat(72) + '\n');

  return overall;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let cases = args.llm ? GOLDEN_CASES.filter((c) => c.llm === args.llm) : GOLDEN_CASES;
  if (args.limit) cases = cases.slice(0, args.limit);

  const report = {
    total: cases.length,
    schemaFailures: [],
    structuralFailures: [],
    goldenChecked: 0,
    goldenPassed: 0,
    goldenFailures: [],
    judged: 0,
    judgePassed: 0,
    judgeFailures: [],
  };

  for (const golden of cases) {
    process.stdout.write(`[${golden.llm}] "${golden.term}" (${golden.language}, ${golden.ability}/${golden.formality}/${golden.audience}) ... `);

    let response;
    try {
      response = await performLookup(deriveParsedRequest(golden), LLM_REGISTRY);
    } catch (err) {
      report.schemaFailures.push({ case: golden, error: err.message });
      console.log(`SCHEMA FAIL: ${err.message}`);
      continue;
    }

    const problems = checkStructural(response);
    if (problems.length > 0) {
      report.structuralFailures.push({ case: golden, problems });
      console.log(`STRUCTURAL FAIL: ${problems.join('; ')}`);
    } else {
      console.log('structural ok');
    }

    checkReadingCorrectness(response, golden.language, report);

    if (!args.noJudge) {
      for (const card of sampleCardsForJudging(response, JUDGE_SAMPLE_SIZE_PER_CASE)) {
        const verdict = await judgeCard(card, golden.llm);
        report.judged++;
        if (verdict.pass) {
          report.judgePassed++;
        } else {
          report.judgeFailures.push({ card: card.text, reason: verdict.reason });
        }
      }
    }
  }

  const passed = printReport(report);
  process.exitCode = passed ? 0 : 1;
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Eval harness crashed:', err);
    process.exitCode = 1;
  });
}

module.exports = { checkStructural, checkReadingCorrectness, GOLDEN_CASES, GOLDEN_READINGS };
