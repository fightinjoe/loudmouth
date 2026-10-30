#!/usr/bin/env bun
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadFixtures, validateFixtures, prepareRequests, evaluateResponses, runMock, calibrationPlan } from './runner.mjs';
import { renderReport } from './report.mjs';

const help = `Offline phrasebook evaluation (no provider execution)
  bun evals/pipelines/cli.mjs validate [--json]
  bun evals/pipelines/cli.mjs run a|b|c|ab --mock [--context ID] [--json]
  bun evals/pipelines/cli.mjs evaluate a|b|c|ab --input PATH [--context ID] [--json]
  bun evals/pipelines/cli.mjs prepare a|b|c --context ID [--json]
  bun evals/pipelines/cli.mjs calibration --plan [--json]

Prepare always emits complete JSON requests; --json is optional there.
Saved responses: {version:1,responses:[{contextId,english?,translation?,reviews?}]}.
C reviews: [{id,detection,repairs:[{focus:{handle,field,category},response}]}].
English uses {topics:[{title,thingsToSay,likelyExchanges,words,exampleConversation}]};
translation uses flat {phrases,words,phraseRomanizations?,wordRomanizations?}.
Live fixtures are authored v4 structural migrations, not historical replay or gold.
Responses are raw JSON values or JSON strings. No raw files are written.`;

function parse(argv) {
  if (argv.length === 1 && ['--help', '-h'].includes(argv[0])) return { command: 'help' };
  const args = [...argv];
  const command = args.shift();
  const configs = {
    validate: { pipeline: false, flags: ['json'] },
    run: { pipeline: true, flags: ['mock', 'context', 'json'] },
    evaluate: { pipeline: true, flags: ['input', 'context', 'json'] },
    prepare: { pipeline: true, flags: ['context', 'json'] },
    calibration: { pipeline: false, flags: ['plan', 'json'] },
  };
  assert(configs[command], `Unknown command: ${command ?? '(missing)'}\n${help}`);
  const config = configs[command];
  const pipeline = config.pipeline ? args.shift() : undefined;
  if (config.pipeline) assert((command === 'prepare' ? ['a', 'b', 'c'] : ['a', 'b', 'c', 'ab']).includes(pipeline), `Invalid ${command} pipeline: ${pipeline ?? '(missing)'}`);
  const options = {};
  while (args.length) {
    const flag = args.shift();
    assert(flag.startsWith('--') && config.flags.includes(flag.slice(2)), `Unknown option: ${flag}`);
    const name = flag.slice(2);
    assert(!Object.hasOwn(options, name), `Duplicate option: ${flag}`);
    if (['input', 'context'].includes(name)) {
      const value = args.shift();
      assert(value && !value.startsWith('-'), `${flag} requires a value`);
      options[name] = value;
    } else options[name] = true;
  }
  if (command === 'run') assert(options.mock, 'run requires --mock; provider execution is not supported');
  if (command === 'evaluate') assert(options.input, 'evaluate requires --input PATH');
  if (command === 'prepare') assert(options.context, 'prepare requires --context ID');
  if (command === 'calibration') assert(options.plan, 'calibration requires --plan; dispatch is not supported');
  return { command, pipeline, options };
}

export function main(argv = process.argv.slice(2), io = { out: text => process.stdout.write(text), error: text => process.stderr.write(text) }) {
  try {
    const { command, pipeline, options = {} } = parse(argv);
    if (command === 'help') { io.out(`${help}\n`); return 0; }
    const fixtures = loadFixtures();
    let result;
    if (command === 'validate') result = validateFixtures(fixtures);
    if (command === 'run') result = runMock(fixtures, pipeline, { contextId: options.context });
    if (command === 'evaluate') result = evaluateResponses(fixtures, pipeline, JSON.parse(readFileSync(options.input, 'utf8')), { contextId: options.context });
    if (command === 'prepare') result = prepareRequests(fixtures, pipeline, { contextId: options.context });
    if (command === 'calibration') result = calibrationPlan(fixtures);
    const json = options.json || command === 'prepare';
    io.out(json ? `${JSON.stringify(result, null, 2)}\n` : command === 'validate' ? `Fixtures valid: ${result.contexts} contexts, ${result.reviews} review cases. Authored/proposed; not linguistically certified.\n` : `${renderReport(result)}\n`);
    return result.structuralPass === false || result.fixtureExpectationsPass === false ? 1 : 0;
  } catch (error) { io.error(`Offline evaluation error: ${error.message}\n`); return 1; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main();
