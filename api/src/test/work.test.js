'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runWithWork, wrapRegistry, trackedFetch, recordProviderReply, recordProviderFailure } = require('../protection/work');
const { serializeInput, readBoundedJson, MAX_INPUT_BYTES, MAX_RESPONSE_BYTES } = require('../llms/bounds');
const { callWithTimeout } = require('../llms/timeout');
const { performPhrasebookImage } = require('../phrasebook-image');
const { parseRouteInput, buildWorkPlan, getPricingStatus } = require('../protection/policy');
const { PRICING } = require('../pricing');

const model = 'gemini-3.5-flash-lite';
const prompt = { instructions: 'Return JSON', input: '{}' };
const reply = () => ({ model, text: '{}', usage: { inputTokens: 10, outputTokens: 5 } });
const plan = (extra = {}) => ({ maxAttempts: 1, deadlineMs: 1000,
  backendLimits: { [model]: { maxAttempts: 1, maxOutputTokens: 256 } }, ...extra });
const options = { maxOutputTokens: 256 };

function environment(t, values) {
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
}

test('policy reuses parsers, reserves every bounded stage and requires fresh pricing', t => {
  environment(t, { PRICING_VERIFIED_AT: new Date().toISOString(), IMAGE_RESERVE_MICROS: undefined,
    LLM_BACKEND: model, PHRASEBOOK_GENERATION_BACKEND: 'deepseek-v4.1-flash' });
  const parsed = parseRouteInput('/phrasebook', { seed: 'Dinner', language: 'ja', answers: {},
    checklist: Array.from({ length: 8 }, (_, index) => `Topic ${index}`) });
  assert.ok(parsed.value);
  const work = buildWorkPlan('/phrasebook', parsed.value);
  assert.equal(work.weight, 80);
  assert.equal(work.maxAttempts, 128);
  assert.equal(work.deadlineMs, 245000);
  const rates = [PRICING[model], PRICING['deepseek/deepseek-v4.1-flash']];
  assert.equal(work.reserveMicros, Math.ceil(64 * rates.reduce((sum, rate) =>
    sum + MAX_INPUT_BYTES * rate.inputPer1M + 6000 * rate.outputPer1M, 0) * 1.25));
  assert.ok(parseRouteInput('/phrasebook-image', {}).error);
  assert.throws(() => buildWorkPlan('/phrasebook-image', { prompt: 'Dinner' }), { code: 'ADMISSION_UNAVAILABLE' });
  assert.equal(buildWorkPlan('/context', { seed: 'Dinner', language: 'ja' }).weight, 10);
  assert.equal(buildWorkPlan('/phrasebook-title', { seed: 'Dinner' }).weight, 2);
  assert.equal(buildWorkPlan('/phrase-breakdown', {}).weight, 5);
  assert.equal(getPricingStatus({ now: Date.now() + 31 * 86400000 }).valid, false);
  process.env.PRICING_VERIFIED_AT = 'invalid';
  assert.throws(() => buildWorkPlan('/context', {}), { code: 'ADMISSION_UNAVAILABLE' });
});

test('work preserves metadata, enforces attempts/output caps and accounts failed paid replies', async () => {
  let calls = 0;
  const provider = async () => { calls++; recordProviderReply(reply()); throw new Error('Invalid paid content'); };
  provider.timeoutMs = 100;
  provider.maxOutputTokens = 256;
  const registry = wrapRegistry({ [model]: provider });
  assert.equal(registry[model].timeoutMs, 100);
  assert.equal(registry[model].maxOutputTokens, 256);
  await runWithWork(plan(), async record => {
    await assert.rejects(registry[model](prompt, { maxOutputTokens: 257 }), /output budget/);
    assert.equal(calls, 0);
    await assert.rejects(registry[model](prompt, options), /Invalid paid content/);
    await assert.rejects(registry[model](prompt, options), /attempt budget/);
    const snapshot = record.snapshot();
    assert.equal(snapshot.terminal, true);
    assert.equal(snapshot.usageComplete, true);
    assert.equal(snapshot.unresolved, false);
    assert.equal(snapshot.knownCostMicros, 16);
  });
  assert.equal(calls, 1);
});

test('missing usage retains liability but terminal replies can release capacity', async () => {
  const registry = wrapRegistry({ [model]: async () => ({ model, text: '{}', usage: { costUsd: 0.01 } }) });
  await runWithWork(plan(), async record => {
    await registry[model](prompt, options);
    assert.equal(record.snapshot().usageComplete, false);
    assert.equal(record.snapshot().terminal, true);
    assert.equal(record.snapshot().knownCostMicros, 10000);
  });
});

test('timeout races retain outstanding attempts and cancellation prevents another start', async () => {
  let finish;
  let signal;
  const registry = wrapRegistry({ [model]: async (_prompt, opts) => {
    signal = opts.signal;
    return new Promise(resolve => { finish = resolve; });
  } });
  let record;
  await runWithWork(plan(), async work => {
    record = work;
    await assert.rejects(callWithTimeout(registry[model], prompt, options, 5, Error), /timed out/);
    assert.equal(signal.aborted, true);
    assert.equal(record.snapshot().terminal, false);
    assert.equal(record.snapshot().unresolved, true);
  });
  finish(reply());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(record.snapshot().terminal, true);
  assert.equal(record.snapshot().usageComplete, true);
  const cancelled = new AbortController();
  cancelled.abort(new Error('Disconnected'));
  await runWithWork({ ...plan(), signal: cancelled.signal }, async work => {
    await assert.rejects(registry[model](prompt, options), /cancelled/);
    assert.equal(work.snapshot().items.length, 0);
  });
});

test('transport rejection is unresolved even after its local promise rejects', async () => {
  const registry = wrapRegistry({ [model]: async () => { throw new Error('Connection reset'); } });
  await runWithWork(plan(), async record => {
    await assert.rejects(registry[model](prompt, options));
    assert.equal(record.snapshot().terminal, false);
    assert.equal(record.snapshot().unresolved, true);
  });
});

test('concurrent work scopes never mix costs', async () => {
  const registry = wrapRegistry({ [model]: async (_prompt, opts) => {
    await new Promise(resolve => setImmediate(resolve));
    return { ...reply(), usage: { inputTokens: opts.maxOutputTokens, outputTokens: 0 } };
  } });
  const snapshots = await Promise.all([10, 100].map(maxOutputTokens => runWithWork(plan(), async record => {
    await registry[model](prompt, { maxOutputTokens });
    return record.snapshot();
  })));
  assert.deepEqual(snapshots.map(value => value.knownCostMicros), [3, 30]);
});

test('byte bounds reject oversized inputs before calls and bounded fetch JSON before decoding', async () => {
  assert.throws(() => serializeInput({ input: 'x'.repeat(MAX_INPUT_BYTES) }), /byte limit/);
  let calls = 0;
  const registry = wrapRegistry({ [model]: async () => { calls++; return reply(); } });
  await runWithWork(plan(), async record => {
    await assert.rejects(registry[model]({ ...prompt, input: 'x'.repeat(MAX_INPUT_BYTES) }, options), /byte limit/);
    assert.equal(calls, 0);
    assert.equal(record.snapshot().items.length, 0);
  });
  await assert.rejects(readBoundedJson(new Response('x'.repeat(MAX_RESPONSE_BYTES + 1))), /byte limit/);
  const oversized = wrapRegistry({ [model]: async () => ({ ...reply(), text: 'x'.repeat(MAX_RESPONSE_BYTES) }) });
  await runWithWork(plan(), async record => {
    await assert.rejects(oversized[model](prompt, options), /byte limit/);
    assert.equal(record.snapshot().usageComplete, true);
  });
});

test('image charge is retained before PNG validation fails', async t => {
  environment(t, { OPENROUTER_API_KEY: 'test-only' });
  const fetchImpl = trackedFetch(async () => new Response(JSON.stringify({
    usage: { cost: 0.025 }, data: [{ b64_json: 'AAAA' }],
  }), { status: 200 }));
  await runWithWork(plan({ image: true, backendLimits: {} }), async record => {
    await assert.rejects(performPhrasebookImage({ prompt: 'Dinner', output_format: 'png' }, { fetchImpl }), /illustration failed/);
    assert.equal(record.snapshot().knownCostMicros, 25000);
    assert.equal(record.snapshot().usageComplete, true);
    assert.equal(record.snapshot().terminal, true);
  });
});

test('a resumed process cannot start attempts after its absolute deadline', async () => {
  let calls = 0;
  const registry = wrapRegistry({ [model]: async () => { calls++; return reply(); } });
  await runWithWork({ ...plan(), createdAt: Date.now() - 2000 }, async record => {
    await assert.rejects(registry[model](prompt, options), /deadline exceeded/);
    assert.equal(record.snapshot().items.length, 0);
  });
  assert.equal(calls, 0);
});

test('SDK HTTP timeout and server errors retain unresolved capacity', async () => {
  for (const status of [408, 500, 502, 503, 504]) {
    const registry = wrapRegistry({ [model]: async () => {
      const error = Object.assign(new Error('Upstream failure'), { status });
      recordProviderFailure(error);
      throw error;
    } });
    await runWithWork(plan(), async record => {
      await assert.rejects(registry[model](prompt, options));
      assert.equal(record.snapshot().terminal, false, `HTTP ${status}`);
      assert.equal(record.snapshot().unresolved, true, `HTTP ${status}`);
    });
  }
  const rejected = wrapRegistry({ [model]: async () => {
    const error = Object.assign(new Error('Rejected'), { status: 429 });
    recordProviderFailure(error);
    throw error;
  } });
  await runWithWork(plan(), async record => {
    await assert.rejects(rejected[model](prompt, options));
    assert.equal(record.snapshot().terminal, true);
    assert.equal(record.snapshot().usageComplete, false);
  });
});

test('OpenRouter timeout JSON and HTML errors never prove remote termination', async t => {
  environment(t, { OPENROUTER_API_KEY: 'test-only' });
  const { callDeepSeek } = require('../llms/openrouter');
  const registry = wrapRegistry({ [model]: callDeepSeek });
  for (const status of [408, 504]) {
    for (const body of [JSON.stringify({ error: { code: status } }), '<html>Gateway timeout</html>']) {
      t.mock.method(globalThis, 'fetch', async () => new Response(body, { status }));
      await runWithWork(plan(), async record => {
        await assert.rejects(registry[model](prompt, options));
        assert.equal(record.snapshot().terminal, false);
        assert.equal(record.snapshot().unresolved, true);
      });
    }
  }
});

test('image timeout responses retain capacity even with reported partial charges', async t => {
  environment(t, { OPENROUTER_API_KEY: 'test-only' });
  for (const body of [JSON.stringify({ error: { code: 504 }, usage: { cost: 0.025 } }),
    '<html>Gateway timeout</html>']) {
    const fetchImpl = trackedFetch(async () => new Response(body, { status: 504 }));
    await runWithWork(plan({ image: true, backendLimits: {} }), async record => {
      await assert.rejects(performPhrasebookImage({ prompt: 'Dinner', output_format: 'png' }, { fetchImpl }));
      assert.equal(record.snapshot().terminal, false);
      assert.equal(record.snapshot().unresolved, true);
      assert.equal(record.snapshot().knownCostMicros, body.startsWith('{') ? 25000 : 0);
    });
  }
});
