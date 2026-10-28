import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { calibrationPlan, loadFixtures, prepareRequests, sha256 } from '../pipelines/runner.mjs';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const groups = [
  { key: 'a', stage: 'a', timeoutMs: 120000 },
  { key: 'b', stage: 'b', timeoutMs: 60000 },
  { key: 'cDetection', stage: 'c-detection', timeoutMs: 60000 },
  { key: 'cRepair', stage: 'c-known-location-repair', timeoutMs: 60000 },
];
const author = { name: 'co-design assistant', role: 'assistant' };
const json = value => `${JSON.stringify(value, null, 2)}\n`;
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
function bind(input) {
  fields(input, groups.map(group => group.key), groups.map(group => group.key), 'bindings');
  return Object.fromEntries(groups.map(group => {
    const value = input[group.key];
    fields(value, ['model', 'provider', 'maxOutputTokens', 'timeoutMs', 'pricing', 'settings'], ['model', 'provider', 'maxOutputTokens', 'pricing'], group.key);
    nonempty(value.model, `${group.key}.model`); nonempty(value.provider, `${group.key}.provider`);
    assert(Number.isSafeInteger(value.maxOutputTokens) && value.maxOutputTokens > 0, `${group.key}.maxOutputTokens must be a positive safe integer`);
    const timeoutMs = value.timeoutMs ?? group.timeoutMs;
    assert(Number.isSafeInteger(timeoutMs) && timeoutMs > 0, `${group.key}.timeoutMs must be a positive safe integer`);
    const pricing = value.pricing;
    fields(pricing, ['inputPerMillion', 'outputPerMillion', 'currency', 'source', 'date'], ['inputPerMillion', 'outputPerMillion', 'currency', 'source', 'date'], `${group.key}.pricing`);
    assert(pricing.currency === 'USD', `${group.key}.pricing.currency must be USD`);
    for (const key of ['inputPerMillion', 'outputPerMillion']) assert(typeof pricing[key] === 'number' && Number.isFinite(pricing[key]) && pricing[key] >= 0, `${group.key}.pricing.${key} must be finite and nonnegative`);
    nonempty(pricing.source, `${group.key}.pricing.source`);
    assert(typeof pricing.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(pricing.date) && new Date(pricing.date).toISOString().slice(0, 10) === pricing.date, `${group.key}.pricing.date must be YYYY-MM-DD`);
    const settings = value.settings ?? {};
    object(settings, `${group.key}.settings`);
    // Model, routing, request formatting and output bounds belong to this binding, not overrides.
    const policyKeys = ['model', 'models', 'messages', 'prompt', 'stream', 'provider', 'route', 'response_format', 'api_key', 'authorization', 'headers', 'transforms', 'max_tokens', 'max_completion_tokens'];
    assert(Object.keys(settings).every(key => !policyKeys.includes(key.toLowerCase())), `${group.key}.settings contains a policy field or output-token override`);
    return [group.key, structuredClone({ ...value, settings, timeoutMs })];
  }));
}

// Produces native inputs only. Native Romp owns init, prepared plans, approval and dispatch.
export async function materializeCalibration({ destination, bindings, fixtures = loadFixtures() }) {
  nonempty(destination, 'destination');
  const root = path.resolve(destination);
  const relative = path.relative(projectRoot, root);
  assert(['.prompt-romp/', 'evals/.runs/'].some(prefix => relative.startsWith(prefix)), 'destination must be a new directory under .prompt-romp/ or evals/.runs/');
  const bound = bind(bindings);
  const plan = calibrationPlan(fixtures);
  assert.equal(plan.totalCalls, plan.manifest.length, 'Calibration total must match its request manifest');
  const prepared = fixtures.contexts.contexts.flatMap(context => ['a', 'b', 'c'].flatMap(stage => prepareRequests(fixtures, stage, { contextId: context.id }).requests));
  assert.equal(prepared.length, plan.manifest.length);
  const entries = plan.manifest.map(entry => {
    const matches = prepared.filter(candidate => candidate.stage === entry.stage && candidate.contextId === entry.contextId && candidate.reviewId === entry.reviewId && sha256(candidate.request.input) === entry.hashes.input);
    assert.equal(matches.length, 1, `Ambiguous or missing prepared request: ${entry.stage}/${entry.contextId}/${entry.reviewId ?? ''}`);
    assert.deepEqual(matches[0].hashes, entry.hashes, 'Calibration and prepare exports disagree');
    return { ...entry, request: matches[0].request };
  });
  const adapter = await readFile(new URL('./adapter.mjs', import.meta.url), 'utf8');
  const sourceManifest = {
    planSha256: plan.planSha256, dependencyHashes: plan.dependencyHashes,
    fixtureHashes: fixtures.hashes, contextHashes: plan.contextHashes, promptHashes: plan.promptHashes,
    rubric: plan.rubric, materializerSha256: sha256(await readFile(new URL('./prepare.mjs', import.meta.url), 'utf8')),
    adapterSha256: sha256(adapter),
    limitation: 'Source hashes are provenance, not executable dependency snapshots. Requests and the standalone replay adapter are frozen in these suites.',
  };
  const rubric = JSON.parse(await readFile(new URL('../rubric.json', import.meta.url), 'utf8'));
  const criteria = [
    { id: 'contract', description: 'Native raw JSON parsing and the exact per-request response schema; technical validity does not establish learning quality.', method: 'deterministic', layer: 'raw', priority: 1, gate: true },
    ...rubric.dimensions.map((dimension, index) => ({ id: dimension.id, description: dimension.question, method: 'human', layer: 'parsed', priority: index + 2 })),
    { id: 'separate-checks', description: rubric.separateChecks.join('\n'), method: 'human', layer: 'raw', priority: 1, gate: true },
  ];
  await mkdir(path.dirname(root), { recursive: true });
  await mkdir(root); // Exclusive: never overwrite a prior freeze or native evidence.
  const suites = [];
  for (const group of groups) {
    const binding = bound[group.key];
    const selected = entries.filter(entry => entry.stage === group.stage);
    assert(selected.length > 0 && selected.length === plan.counts[group.stage], `${group.stage} count disagrees with exported plan`);
    const name = `calibration-${group.stage}`;
    const dir = path.join(root, 'evals', 'suites', name);
    await mkdir(dir, { recursive: true });
    const sharedInstructions = selected.every(entry => entry.request.instructions === selected[0].request.instructions);
    const promptPath = path.join(dir, sharedInstructions ? 'prompt.md' : 'prompt.json');
    const cases = selected.map((entry, index) => {
      const id = `${entry.contextId}${entry.reviewId ? `--${entry.reviewId}` : ''}--${index + 1}`;
      return {
        id, input: { request: structuredClone(entry.request), ...(!sharedInstructions ? { promptKey: id } : {}) },
        tags: [group.stage, entry.contextId],
        provenance: { kind: 'synthetic', source: 'authored offline calibration fixtures', contextId: entry.contextId, reviewId: entry.reviewId ?? null, oracleAssisted: entry.oracleAssisted ?? false, purpose: entry.purpose ?? null, requestSha256: sha256(entry.request) },
      };
    });
    const prompt = sharedInstructions ? selected[0].request.instructions : json(Object.fromEntries(cases.map(item => [item.id, item.input.request.instructions])));
    const config = {
      endpoint: name, generation: { ...binding.settings, max_tokens: binding.maxOutputTokens },
      routing: { only: [binding.provider], allow_fallbacks: false, require_parameters: true },
      judge: null, requirePreparedPlan: true, retries: 0, concurrency: 1, repetitions: 1,
      timeoutMs: binding.timeoutMs, maxCallsPerSample: 1,
      pricing: { [binding.model]: binding.pricing },
      adapterDependencies: ['source-manifest.json'], adapterRevision: sourceManifest.adapterSha256,
    };
    const note = {
      author, hypothesis: 'Describe one frozen baseline for separate quality, latency, reliability and cost review; no comparison or promotion claim.', change: 'combined',
      brief: `${group.stage}: ${cases.length} exact single-call requests, one repetition, serial, no retries or paid judge. B uses fixed authored English, not live A output. Known-location C is oracle-assisted and is not detector-gated evaluation.`,
      decisionScope: { caseIds: cases.map(item => item.id), repetitions: 1 },
      nextAction: 'Inspect native saved plans and obtain explicit human brief/revision and exact-plan paid authorization. This assistant proposal approves nothing.',
      sourceRefs: [],
    };
    const files = {
      'suite.mjs': `export default ${JSON.stringify(config, null, 2)};\n`,
      'cases.json': json(cases), 'rubric.json': json({ ...rubric, criteria }),
      'goal.md': `# ${group.stage} calibration\n\n${note.brief}\n\n${rubric.priorities.join('\n\n')}\n\nDiagnostic only; independent linguistic review remains pending. Wrong ruby is not an automatic whole-topic failure. Meaning is the user-facing term; senseKey remains the schema field.\n`,
      'adapter.mjs': adapter, 'source-manifest.json': json(sourceManifest), 'proposal.json': json(note),
    };
    for (const [file, contents] of Object.entries(files)) await writeFile(path.join(dir, file), contents, { flag: 'wx' });
    await writeFile(promptPath, prompt, { flag: 'wx' });
    const preparedPlan = path.join(root, `${name}.prepared.json`);
    const proposalNote = path.join(dir, 'proposal.json');
    suites.push({
      key: group.key, stage: group.stage, name, directory: dir, calls: cases.length, binding,
      promptPath, promptFormat: sharedInstructions ? 'exact-instructions' : 'case-id-to-exact-instructions-json', proposalNote, preparedPlan,
      commands: {
        init: ['init', name, '--suite', name],
        note: ['note', name, '--file', proposalNote],
        plan: ['run', name, '--prompt', promptPath, '--model', binding.model, '--repetitions', '1', '--concurrency', '1', '--plan', '--save-plan', preparedPlan],
      },
    });
  }
  const result = { version: 1, mode: 'native-inputs-only', dispatch: false, approved: false, root, nativeCwd: root, totalCalls: plan.totalCalls, counts: plan.counts, sourceManifest, suites };
  await writeFile(path.join(root, 'materialization.json'), json(result), { flag: 'wx' });
  return result;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const args = process.argv.slice(2);
    assert(args.length === 4 && new Set([args[0], args[2]]).size === 2 && [args[0], args[2]].every(key => ['--destination', '--bindings'].includes(key)), 'Usage: node evals/calibration/prepare.mjs --destination PATH --bindings FILE');
    const options = Object.fromEntries([[args[0], args[1]], [args[2], args[3]]]);
    console.log(json(await materializeCalibration({ destination: options['--destination'], bindings: JSON.parse(await readFile(options['--bindings'], 'utf8')) })).trimEnd());
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
