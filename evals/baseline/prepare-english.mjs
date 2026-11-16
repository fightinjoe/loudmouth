import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sha256 } from '../pipelines/runner.mjs';

const require = createRequire(import.meta.url);
const { parsePhrasebookRequest } = require('../../api/src/phrasebook/parse.js');
const { buildPhrasebookGenerationPrompt } = require('../../api/src/phrasebook/prompt.js');
const { PHRASEBOOK_GENERATION_MAX_TOKENS, generationTasks } = require('../../api/src/phrasebook/index.js');

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const suiteName = 'phrasebook-english';
const fixturePath = 'evals/fixtures/baseline-phrasebook-english.json';
const parsePath = 'api/src/phrasebook/parse.js';
const indexPath = 'api/src/phrasebook/index.js';
const productionPath = 'evals/pipelines/production.mjs';
const promptPath = 'api/src/phrasebook/prompt.txt';
const sourcePaths = [fixturePath, promptPath, parsePath, indexPath, 'api/src/phrasebook/prompt.js', productionPath,
  'evals/rubric.json', 'docs/evals/rubric.md', 'evals/baseline/prepare-english.mjs'];
const author = { name: 'co-design assistant', role: 'assistant' };
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const readSource = file => readFile(path.join(projectRoot, file), 'utf8');

function object(value, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
}
function fields(value, allowed, required, label) {
  object(value, label);
  assert(Object.keys(value).every(key => allowed.includes(key)) && required.every(key => Object.hasOwn(value, key)), `${label}: unexpected or missing fields`);
}
function nonempty(value, label) {
  assert(typeof value === 'string' && value.trim() === value && value.length, `${label} must be a nonempty, trimmed string`);
}

// One binding per model: its own pinned provider, reasoning settings and dated rates.
function bind(input) {
  fields(input, ['timeoutMs', 'models'], ['models'], 'bindings');
  const timeoutMs = input.timeoutMs ?? 120000;
  assert(Number.isSafeInteger(timeoutMs) && timeoutMs > 0, 'bindings.timeoutMs must be a positive safe integer');
  assert(Array.isArray(input.models) && input.models.length, 'bindings.models must be a nonempty array');
  const models = input.models.map((value, index) => {
    const label = `models[${index}]`;
    fields(value, ['model', 'provider', 'settings', 'pricing'], ['model', 'provider', 'pricing'], label);
    nonempty(value.model, `${label}.model`); nonempty(value.provider, `${label}.provider`);
    fields(value.pricing, ['inputPerMillion', 'outputPerMillion', 'currency', 'source', 'date'], ['inputPerMillion', 'outputPerMillion', 'currency', 'source', 'date'], `${label}.pricing`);
    assert(value.pricing.currency === 'USD', `${label}.pricing.currency must be USD`);
    for (const key of ['inputPerMillion', 'outputPerMillion']) assert(Number.isFinite(value.pricing[key]) && value.pricing[key] >= 0, `${label}.pricing.${key} must be finite and nonnegative`);
    nonempty(value.pricing.source, `${label}.pricing.source`);
    assert(/^\d{4}-\d{2}-\d{2}$/.test(value.pricing.date), `${label}.pricing.date must be YYYY-MM-DD`);
    const settings = value.settings ?? {};
    object(settings, `${label}.settings`);
    assert(!Object.keys(settings).some(key => ['max_tokens', 'max_completion_tokens'].includes(key)), `${label}.settings must not override the production output cap`);
    return structuredClone({ ...value, settings });
  });
  assert.equal(new Set(models.map(item => item.model)).size, models.length, 'Each model may appear once');
  return { timeoutMs, models };
}

function adapterSource(suiteDir) {
  const relative = file => JSON.stringify(path.relative(suiteDir, path.join(projectRoot, file)).split(path.sep).join('/'));
  return `import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { englishChanges } from ${relative(productionPath)};

const require = createRequire(import.meta.url);
const { validateGenerationResponse } = require(${relative(parsePath)});
const { buildGenerationResponseJsonSchema } = require(${relative(indexPath)});

// Replays the frozen production request with the response schema production sends.
export function buildPrompt(caseInput, variant) {
  assert.equal(variant.instructions, caseInput.request.instructions, 'Variant must contain the exact frozen request instructions');
  return { ...structuredClone(caseInput.request), schema: buildGenerationResponseJsonSchema() };
}

// The production parser decides acceptance; a throw is a parser rejection.
export function normalize(parsed, caseInput, context) {
  const { topic: title } = JSON.parse(caseInput.request.input);
  const { topic, flags, failureLevel } = validateGenerationResponse(context.raw, title);
  const changes = englishChanges(parsed, topic);
  if (failureLevel) changes.push({ path: '', reason: \`Production parser repaired the reply (failureLevel=\${failureLevel}): \${flags.map(flag => flag.code).join(', ')}.\` });
  return { value: { topic }, changes };
}
`;
}

// Produces native Prompt Romp inputs only; Romp owns init, prepared plans, approval and dispatch.
export async function materializeEnglish({ destination, bindings, topicsPerRequest }) {
  nonempty(destination, 'destination');
  const root = path.resolve(destination);
  assert(path.relative(projectRoot, root).startsWith('evals/.runs/'), 'destination must be a new directory under evals/.runs/');
  assert(topicsPerRequest === undefined || (Number.isSafeInteger(topicsPerRequest) && topicsPerRequest > 0), 'topics per request must be a positive integer');
  const bound = bind(bindings);
  const fixtures = JSON.parse(await readSource(fixturePath));
  const instructions = await readSource(promptPath);
  const cases = fixtures.flatMap(({ id, request }) => {
    const parsed = parsePhrasebookRequest(request);
    assert(!parsed.error, `${id}: ${parsed.error}`);
    // Production splits the whole request, so each kept topic still names all its otherTopics.
    return generationTasks(parsed.value).slice(0, topicsPerRequest).map((task, index) => {
      const prompt = buildPhrasebookGenerationPrompt(task);
      assert.equal(prompt.instructions, instructions, 'Use the unchanged production English prompt');
      const frozen = { instructions: prompt.instructions, input: prompt.input };
      return {
        id: `${id}--${index + 1}`, input: { request: frozen }, tags: [id],
        provenance: { kind: 'baseline-fixture', source: fixturePath, requestId: id, topicIndex: index, topic: task.topic, requestSha256: sha256(frozen) },
      };
    });
  });
  const sourceManifest = {
    sourceSha256: Object.fromEntries(await Promise.all(sourcePaths.map(async file => [file, sha256(await readSource(file))]))),
    limitation: 'Source hashes are provenance, not executable snapshots. Requests are frozen in cases.json; the adapter imports the live production parser, response schema and change description.',
  };
  const rubric = JSON.parse(await readSource('evals/rubric.json'));
  const rubricText = await readSource(rubric.source.replace(/^\.\.\//, ''));
  const criteria = [
    { id: 'contract', description: 'Raw JSON parsing, the production response schema sent with each request (buildGenerationResponseJsonSchema) and acceptance by the production parser (validateGenerationResponse). Technical validity does not establish learning quality.', method: 'deterministic', layer: 'raw', priority: 1, gate: true },
    ...rubric.dimensions.filter(dimension => dimension.lanes.includes('a')).map((dimension, index) => ({ id: dimension.id, description: dimension.question, method: 'human', layer: 'normalized', priority: index + 2 })),
  ];
  const suiteDir = path.join(root, 'evals', 'suites', suiteName);
  const config = {
    endpoint: suiteName, generation: { max_tokens: PHRASEBOOK_GENERATION_MAX_TOKENS },
    routing: { allow_fallbacks: false, require_parameters: true },
    judge: null, requirePreparedPlan: true, retries: 0, concurrency: 1, repetitions: 1, decisionRepetitions: 1,
    timeoutMs: bound.timeoutMs, maxCallsPerSample: 1,
    pricing: Object.fromEntries(bound.models.map(item => [item.model, item.pricing])),
    adapterDependencies: ['source-manifest.json'],
  };
  const brief = `Lane A English generation: ${cases.length} per-topic production model requests from ${fixturePath}, models ${bound.models.map(item => item.model).join(', ')}; production prompt, response schema and output cap, one repetition, serial, no retries, no paid judge.`;
  const note = {
    author, hypothesis: 'Compare English-generation quality, parser acceptance, latency and cost across the bound models on the same frozen requests.', change: 'model',
    brief, decisionScope: { caseIds: cases.map(item => item.id), repetitions: 1 },
    nextAction: 'Obtain explicit human brief approval and exact-plan paid authorization. This assistant proposal approves nothing.', sourceRefs: [],
  };
  await mkdir(path.dirname(root), { recursive: true });
  await mkdir(root); // Exclusive: never overwrite earlier native evidence.
  await mkdir(suiteDir, { recursive: true });
  const files = {
    'suite.mjs': `export default ${JSON.stringify(config, null, 2)};\n`,
    'cases.json': json(cases), 'rubric.json': json({ ...rubric, criteria }),
    'goal.md': `# English generation model comparison\n\n${brief}\n\nScore only rules the current prompt asks for (rubric: model comparisons). Diagnostic only; no native-speaker adjudication.\n\n---\n\n${rubricText}`,
    'adapter.mjs': adapterSource(suiteDir), 'source-manifest.json': json(sourceManifest), 'proposal.json': json(note), 'prompt.md': instructions,
  };
  for (const [file, contents] of Object.entries(files)) await writeFile(path.join(suiteDir, file), contents, { flag: 'wx' });
  const commands = bound.models.map(item => ({
    model: item.model,
    plan: ['run', suiteName, '--prompt', path.join(suiteDir, 'prompt.md'), '--model', item.model,
      '--routing', JSON.stringify({ only: [item.provider], allow_fallbacks: false }), '--settings', JSON.stringify(item.settings),
      '--repetitions', '1', '--concurrency', '1', '--plan', '--save-plan', path.join(root, `${item.model.replace(/[^\w.-]+/g, '_')}.prepared.json`)],
  }));
  const result = {
    version: 1, mode: 'native-inputs-only', dispatch: false, approved: false, nativeCwd: root, suite: suiteName,
    cases: cases.map(item => item.id), sourceManifest,
    commands: { init: ['init', suiteName, '--suite', suiteName], note: ['note', suiteName, '--file', path.join(suiteDir, 'proposal.json')], plans: commands },
  };
  await writeFile(path.join(root, 'materialization.json'), json(result), { flag: 'wx' });
  return result;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const args = process.argv.slice(2);
    assert(args.length % 2 === 0, 'Usage: node evals/baseline/prepare-english.mjs --destination PATH --bindings FILE [--topics-per-request N]');
    const options = Object.fromEntries(Array.from({ length: args.length / 2 }, (_, index) => [args[index * 2], args[index * 2 + 1]]));
    assert(Object.keys(options).every(key => ['--destination', '--bindings', '--topics-per-request'].includes(key)) && options['--destination'] && options['--bindings'], 'Usage: node evals/baseline/prepare-english.mjs --destination PATH --bindings FILE [--topics-per-request N]');
    console.log(json(await materializeEnglish({
      destination: options['--destination'],
      bindings: JSON.parse(await readFile(options['--bindings'], 'utf8')),
      topicsPerRequest: options['--topics-per-request'] === undefined ? undefined : Number(options['--topics-per-request']),
    })).trimEnd());
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
