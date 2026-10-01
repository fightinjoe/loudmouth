'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const sharp = require('sharp');
const { performPhrasebookImage, handlePhrasebookImage, parsePhrasebookImageRequest } = require('../phrasebook-image');
const { validatePhrasebookImageResponse } = require('../schema');

const request = { prompt: 'Watercolor dancing shoes', output_format: 'png', background: 'transparent' };
const prefix = 'data:image/png;base64,';
const originalKeys = { OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY, FAL_KEY: process.env.FAL_KEY };
let opaque;
let transparent;
let empty;
before(async () => {
  process.env.OPENROUTER_API_KEY = 'test-openrouter-private';
  process.env.FAL_KEY = 'test-fal-private';
  opaque = await sharp({ create: { width: 32, height: 18, channels: 4, background: { r: 200, g: 120, b: 80, alpha: 1 } } }).png().toBuffer();
  empty = await sharp({ create: { width: 32, height: 18, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
  // A real PNG with an opaque subject and transparent surrounding pixels.
  const subject = await sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toBuffer();
  transparent = await sharp(empty).composite([{ input: subject, left: 12, top: 5 }]).png().toBuffer();
});
after(() => {
  for (const [key, value] of Object.entries(originalKeys)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function transport(finalImage = transparent, generatedImage = opaque) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, ...options, body: JSON.parse(options.body) });
    return Response.json(calls.length === 1
      ? { data: [{ b64_json: generatedImage.toString('base64') }], usage: { cost: 0.001 } }
      : { image: { url: typeof finalImage === 'string' ? finalImage : prefix + finalImage.toString('base64') } });
  };
  return { calls, fetchImpl };
}

function response() {
  return Object.assign(new EventEmitter(), {
    writableEnded: false,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; this.writableEnded = true; return this; },
  });
}

test('accepts only the bounded server-controlled PNG request', () => {
  assert.deepEqual(parsePhrasebookImageRequest({ ...request, prompt: '  art  ' }), { ...request, prompt: 'art' });
  assert.equal(parsePhrasebookImageRequest({ ...request, prompt: 'a'.repeat(2000) }).prompt.length, 2000);
  for (const body of [null, [], {}, { ...request, prompt: '' }, { ...request, prompt: 'a'.repeat(2001) },
    { ...request, output_format: 'jpeg' }, { ...request, background: 'white' },
    { ...request, model: 'other' }, { ...request, provider: 'other' }, { ...request, url: 'https://evil.example' }]) {
    assert.throws(() => parsePhrasebookImageRequest(body), { status: 400 });
  }
});

test('persists real transparent PNG bytes and separates known and unknown stage cost', async () => {
  const fake = transport();
  const result = validatePhrasebookImageResponse(await performPhrasebookImage(request, fake));
  assert.deepEqual(result.image, { dataUrl: prefix + transparent.toString('base64'), mediaType: 'image/png', width: 32, height: 18 });
  const decoded = await sharp(Buffer.from(result.image.dataUrl.slice(prefix.length), 'base64')).raw().toBuffer();
  assert.equal(decoded[3], 0);
  assert.equal(decoded[(9 * 32 + 16) * 4 + 3], 255); // white subject stays opaque
  assert.equal(result.usage.costUsd, null);
  assert.equal(result.usage.stages[0].costUsd, 0.001);
  assert.equal(result.usage.stages[1].costUsd, null);
  assert.equal(fake.calls.length, 2);
  assert.deepEqual(fake.calls.map((call) => call.url), ['https://openrouter.ai/api/v1/images', 'https://fal.run/fal-ai/birefnet/v2']);
  assert.equal(Object.hasOwn(fake.calls[0].body, 'background'), false);
  assert.equal(fake.calls[1].body.image_url, prefix + opaque.toString('base64'));
  assert.equal(JSON.stringify(result).includes('private'), false);
});

test('rejects opaque, empty-alpha, corrupt, non-PNG, and remote URL matting results', async () => {
  const jpeg = await sharp(opaque).jpeg().toBuffer();
  for (const image of [opaque, empty, Buffer.from('not png'), jpeg, transparent.subarray(0, 40),
    'https://attacker.example/image.png', 'data:image/jpeg;base64,' + jpeg.toString('base64')]) {
    const fake = transport(image);
    await assert.rejects(performPhrasebookImage(request, fake), { status: 502 });
    assert.equal(fake.calls.length, 2);
  }
});

test('rejects invalid aspect ratio and decoded pixel limit', async () => {
  for (const [width, height] of [[20, 20], [3000, 1688]]) {
    const image = await sharp({ create: { width, height, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 0.5 } } }).png().toBuffer();
    await assert.rejects(performPhrasebookImage(request, transport(image)), { status: 502 });
  }
});

test('rejects oversized or malformed provider responses before matting', async () => {
  for (const output of [
    { data: [{ b64_json: 'a'.repeat(8 * 1024 * 1024 + 4) }] },
    { data: [{ b64_json: opaque.toString('base64') }, { b64_json: opaque.toString('base64') }] },
    { data: [{ url: 'https://attacker.example/image.png' }] },
    { data: [{ b64_json: Buffer.from('not png').toString('base64') }] },
  ]) {
    let calls = 0;
    await assert.rejects(performPhrasebookImage(request, { fetchImpl: async () => { calls++; return Response.json(output); } }), { status: 502 });
    assert.equal(calls, 1);
  }
  await assert.rejects(performPhrasebookImage(request, { fetchImpl: async () => new Response('{}', { headers: { 'content-length': 20 * 1024 * 1024 } }) }), { status: 502 });
});

test('provider failures do not retry or leak private upstream errors', async () => {
  for (const failedStage of [1, 2]) {
    let calls = 0;
    const good = transport();
    await assert.rejects(performPhrasebookImage(request, { fetchImpl: async (...args) => {
      calls++;
      if (calls === failedStage) return new Response('test-fal-private', { status: 503 });
      return good.fetchImpl(...args);
    } }), (error) => error.status === 502 && error.message === 'Phrasebook illustration failed');
    assert.equal(calls, failedStage);
  }
});

test('missing credentials fail before dispatch', async () => {
  const key = process.env.FAL_KEY;
  delete process.env.FAL_KEY;
  try {
    const fake = transport();
    await assert.rejects(performPhrasebookImage(request, fake), { status: 502 });
    assert.equal(fake.calls.length, 0);
  } finally { process.env.FAL_KEY = key; }
});

test('cancellation aborts stalled generation without awaiting the transport', async () => {
  const controller = new AbortController();
  let stageSignal;
  const pending = performPhrasebookImage(request, { signal: controller.signal, fetchImpl: async (url, { signal }) => {
    stageSignal = signal;
    return new Promise(() => {});
  } });
  controller.abort();
  await assert.rejects(pending, { status: 502 });
  assert.equal(stageSignal.aborted, true);
  const fake = transport();
  await assert.rejects(performPhrasebookImage(request, { ...fake, signal: controller.signal }), { status: 502 });
  assert.equal(fake.calls.length, 0);
});

test('stage deadline aborts even an uncooperative transport', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let stageSignal;
  const pending = performPhrasebookImage(request, { fetchImpl: async (url, { signal }) => {
    stageSignal = signal;
    return new Promise(() => {});
  } });
  const rejection = assert.rejects(pending, { status: 502 });
  t.mock.timers.tick(60_000);
  await rejection;
  assert.equal(stageSignal.aborted, true);
});

test('handler rejects invalid input and disconnect cancels pending work', async (t) => {
  const bad = response();
  await handlePhrasebookImage({ body: { ...request, model: 'client' } }, bad);
  assert.equal(bad.statusCode, 400);
  let stageSignal;
  t.mock.method(globalThis, 'fetch', async (url, { signal }) => {
    stageSignal = signal;
    return new Promise(() => {});
  });
  const req = Object.assign(new EventEmitter(), { body: request });
  const res = response();
  const pending = handlePhrasebookImage(req, res);
  res.emit('close');
  await pending;
  assert.equal(stageSignal.aborted, true);
  assert.equal(res.statusCode, undefined);
  assert.equal(req.listenerCount('aborted'), 0);
  assert.equal(res.listenerCount('close'), 0);
});

test('matting cancellation and its own deadline abort without retry', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const cancel of [false, true]) {
    const controller = new AbortController();
    let enteredMatting;
    const entered = new Promise((resolve) => { enteredMatting = resolve; });
    let stageSignal;
    let calls = 0;
    const pending = performPhrasebookImage(request, { signal: controller.signal, fetchImpl: async (url, { signal }) => {
      calls++;
      if (calls === 1) return Response.json({ data: [{ b64_json: opaque.toString('base64') }] });
      stageSignal = signal;
      enteredMatting();
      return new Promise(() => {});
    } });
    const rejection = assert.rejects(pending, { status: 502 });
    await entered;
    if (cancel) controller.abort();
    else t.mock.timers.tick(60_000);
    await rejection;
    assert.equal(stageSignal.aborted, true);
    assert.equal(calls, 2);
  }
});

test('handler returns the decoded image or a sanitized upstream failure', async (t) => {
  const fake = transport();
  t.mock.method(globalThis, 'fetch', fake.fetchImpl);
  const res = response();
  await handlePhrasebookImage({ body: request }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.image.dataUrl, prefix + transparent.toString('base64'));
  globalThis.fetch.mock.mockImplementation(async () => { throw new Error('test-openrouter-private'); });
  const failure = response();
  await handlePhrasebookImage({ body: request }, failure);
  assert.equal(failure.statusCode, 502);
  assert.deepEqual(failure.body, { error: 'Phrasebook illustration failed' });
});
