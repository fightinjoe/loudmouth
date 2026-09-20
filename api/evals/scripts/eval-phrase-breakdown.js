#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');
const { LLM_REGISTRY, getBackendName } = require('../../src/llm-config');
const { buildPhraseBreakdownPrompt } = require('../../src/phrase-breakdown/prompt');
const {
  parsePhraseBreakdownRequest, validatePhraseBreakdownResponse,
  PHRASE_BREAKDOWN_MAX_TOKENS, PHRASE_BREAKDOWN_TIMEOUT_MS,
} = require('../../src/phrase-breakdown');
const { buildUsageReport } = require('../../src/pricing');

const EVALS = path.resolve(__dirname, '..');
const HELP = `Evaluate /phrase-breakdown using real providers and production validation/normalization.
No HTTP server required. Makes paid calls; does not modify the production prompt.

From the repository root:
  node --env-file=api/.env api/evals/scripts/eval-phrase-breakdown.js

Options:
  --prompt=PATH           Compare a candidate against production (otherwise production only)
  --baseline-prompt=PATH  Use a frozen experimental baseline; requires --prompt
  --fixtures=PATH         Fixture array (default: evals/fixtures/phrase-breakdown.json)
  --case=ID               Run one fixture
  --backend=NAME          Provider registry key (default: server configuration)
  --repetitions=N         Samples per phrase and prompt (default: 1)
  --out=PATH              New artifact file; never overwrite an existing run
  --replay=PATH           Print saved results without model calls or revalidation
  --verbose              Include roles, explanations, provenance, and review questions
  --help                 Show this help

Compact output groups Text — Meaning beneath each chunk. Raw and normalized boundaries
are shown when normalization removes punctuation. Full responses are always saved.
PASS means mechanical checks only, not linguistic correctness. No runner retries.
`;

async function callModel(handler, prompt, options) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      handler(prompt, { maxOutputTokens: options.maxOutputTokens, signal: controller.signal }),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(`Model call exceeded ${options.timeoutMs}ms`);
          controller.abort(error);
          reject(error);
        }, options.timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function printRecord(record, verbose = false) {
  const usage = record.usage;
  console.log(`\n${record.request.language} | ${usage?.model ?? 'no model response'} | ${record.variant} #${record.repetition} | ${record.findings.length ? 'FAIL' : 'PASS'} mechanical${usage ? ` | ${(usage.durationMs / 1000).toFixed(2)}s | ${usage.outputTokens} output tokens` : ''}`);
  console.log(`${record.request.text} → ${record.request.translation}`);
  if (record.request.context) console.log(`Context: ${record.request.context}`);
  for (const finding of record.findings) console.log(`! ${finding}`);
  if (verbose && record.provenance) console.log(`Provenance: ${record.provenance}`);
  if (record.raw != null) {
    try {
      const raw = JSON.parse(record.raw);
      const data = record.normalized ?? raw;
      if (record.normalization?.removed.length || verbose) {
        console.log(`Raw chunks:        ${raw.chunks.map(c => JSON.stringify(c.text)).join(' | ')}`);
        console.log(`Normalized chunks: ${data.chunks.map(c => JSON.stringify(c.text)).join(' | ')}`);
        if (record.normalization) console.log(`Removed ${record.normalization.removed.length}; local validation/normalization ${record.normalization.durationMs.toFixed(2)}ms`);
        for (const finding of record.rawFindings ?? []) console.log(`Raw finding: ${finding}`);
      }
      for (const [index, chunk] of data.chunks.entries()) {
        console.log(`  ${index}. ${JSON.stringify(chunk.text)} → ${chunk.gloss}`);
        const items = chunk.learningItems;
        if (!Array.isArray(items)) console.log('     ! Missing or invalid learningItems');
        else if (items.length) console.log(`     Learn: ${items.map(item => `${item?.text} — ${item?.meaning}`).join(' | ')}`);
        if (verbose) {
          console.log(`     Role: ${chunk.role}`);
          console.log(`     Explanation: ${chunk.explanation}`);
        }
      }
      if (data.pattern) {
        console.log(`  Historical pattern: ${data.pattern.formula}`);
        if (verbose) console.log(JSON.stringify(data.pattern, null, 2));
      }
    } catch {
      console.log(record.raw);
    }
  }
  if (verbose) {
    console.log('Human review:');
    for (const question of record.review ?? []) console.log(`  - ${question}`);
  }
}

async function main() {
  const { values } = parseArgs({ options: {
    prompt: { type: 'string' }, 'baseline-prompt': { type: 'string' },
    fixtures: { type: 'string' }, case: { type: 'string' }, backend: { type: 'string' },
    repetitions: { type: 'string', default: '1' }, out: { type: 'string' },
    replay: { type: 'string' }, verbose: { type: 'boolean', default: false }, help: { type: 'boolean' },
  } });
  if (values.help) return console.log(HELP);
  if (values.replay) {
    const saved = JSON.parse(fs.readFileSync(values.replay, 'utf8'));
    for (const record of saved.records) printRecord(record, values.verbose);
    return;
  }
  if (values['baseline-prompt'] && !values.prompt) throw new Error('--baseline-prompt requires --prompt');
  const repetitions = Number(values.repetitions);
  if (!Number.isSafeInteger(repetitions) || repetitions < 1) throw new Error('--repetitions must be a positive integer');
  const backend = values.backend ?? getBackendName();
  if (!Object.hasOwn(LLM_REGISTRY, backend)) throw new Error(`Unknown backend: ${backend}`);
  const handler = LLM_REGISTRY[backend];
  const promptPath = values.prompt ? path.resolve(values.prompt) : null;
  const baselinePromptPath = values['baseline-prompt'] ? path.resolve(values['baseline-prompt']) : null;
  const candidate = promptPath ? fs.readFileSync(promptPath, 'utf8') : null;
  const baseline = baselinePromptPath ? fs.readFileSync(baselinePromptPath, 'utf8') : null;
  if (candidate !== null && !candidate.trim()) throw new Error('Candidate prompt must not be blank');
  if (baseline !== null && !baseline.trim()) throw new Error('Baseline prompt must not be blank');
  const fixturesPath = path.resolve(values.fixtures ?? path.join(EVALS, 'fixtures/phrase-breakdown.json'));
  const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
  if (!Array.isArray(fixtures)) throw new Error('Fixtures must be an array');
  const selected = fixtures.filter(f => !values.case || f.id === values.case);
  if (!selected.length) throw new Error('No matching fixtures');
  const ids = new Set();
  for (const fixture of selected) {
    if (typeof fixture.id !== 'string' || !fixture.id || ids.has(fixture.id)) throw new Error('Fixture IDs must be nonempty and unique');
    ids.add(fixture.id);
    if (!Array.isArray(fixture.review) || fixture.review.some(q => typeof q !== 'string')) throw new Error(`${fixture.id}: review must be a string array`);
    const parsed = parsePhraseBreakdownRequest(fixture.request);
    if (parsed.error) throw new Error(`${fixture.id}: ${parsed.error}`);
    fixture.request = parsed.value;
  }
  const options = {
    maxOutputTokens: Math.min(PHRASE_BREAKDOWN_MAX_TOKENS, handler.maxOutputTokens ?? Infinity),
    timeoutMs: handler.timeoutMs || PHRASE_BREAKDOWN_TIMEOUT_MS,
  };
  const artifact = { startedAt: new Date().toISOString(), backend, promptPath, baselinePromptPath, fixturesPath, options, records: [] };
  const outputPath = path.resolve(values.out ?? path.join(EVALS, 'artifacts', `phrase-breakdown-${artifact.startedAt.replace(/[:.]/gu, '-')}.json`));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(artifact, null, 2) + '\n', { flag: 'wx' });
  console.log(`Running ${selected.length * repetitions * (candidate === null ? 1 : 2)} provider calls. Artifact: ${outputPath}`);
  for (const fixture of selected) {
    for (let repetition = 1; repetition <= repetitions; repetition++) {
      const variants = candidate === null ? ['production']
        : repetition % 2 ? ['baseline', 'candidate'] : ['candidate', 'baseline'];
      for (const variant of variants) {
        const prompt = buildPhraseBreakdownPrompt(fixture.request);
        if (variant === 'candidate') prompt.instructions = candidate;
        else if (baseline !== null) prompt.instructions = baseline;
        const record = {
          caseId: fixture.id, provenance: fixture.provenance, request: fixture.request,
          itemFormat: 'nested-items', variant, repetition, prompt, review: fixture.review,
          findings: [], rawFindings: [],
        };
        const start = performance.now();
        try {
          const reply = await callModel(handler, prompt, options);
          record.raw = reply.text;
          record.usage = buildUsageReport(reply.model, reply.usage, performance.now() - start);
          const normalizationStart = performance.now();
          try {
            const raw = JSON.parse(reply.text);
            const removed = [];
            const indexMap = [];
            let kept = 0;
            for (const [index, chunk] of (Array.isArray(raw?.chunks) ? raw.chunks : []).entries()) {
              if (typeof chunk?.text === 'string' && /^[\p{P}\p{White_Space}]+$/u.test(chunk.text)) {
                removed.push({ index, text: chunk.text });
                indexMap.push(null);
                record.rawFindings.push(`chunks[${index}] is punctuation/whitespace-only: ${JSON.stringify(chunk.text)}`);
              } else indexMap.push(kept++);
            }
            record.normalized = validatePhraseBreakdownResponse(reply.text, fixture.request.text, fixture.request.language);
            record.normalization = { removed, indexMap, durationMs: performance.now() - normalizationStart };
            const seen = new Set();
            for (const chunk of record.normalized.chunks) {
              for (const item of chunk.learningItems) {
                const key = JSON.stringify([item.text, item.meaning]);
                if (seen.has(key)) record.findings.push(`Repeated learning item and meaning: ${item.text}`);
                seen.add(key);
              }
            }
          } catch (error) {
            record.findings.push(`validation: ${error.message}`);
          }
        } catch (error) {
          record.findings.push(`provider: ${error.message}`);
          record.durationMs = Math.round(performance.now() - start);
        }
        artifact.records.push(record);
        fs.writeFileSync(outputPath, JSON.stringify(artifact, null, 2) + '\n');
        printRecord(record, values.verbose);
      }
    }
  }
  console.log(`\nSaved: ${outputPath}`);
  if (artifact.records.some(r => r.findings.length)) process.exitCode = 1;
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
