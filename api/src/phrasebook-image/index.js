'use strict';

const sharp = require('sharp');

const IMAGE_MODEL = 'black-forest-labs/flux.2-klein-4b';
const MAX_FILE_BYTES = 6 * 1024 * 1024;
const MAX_BASE64_LENGTH = 8 * 1024 * 1024;
const MAX_PIXELS = 4_000_000;
const TOTAL_TIMEOUT_MS = 120_000;
const PNG_PREFIX = 'data:image/png;base64,';
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function requestError(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function parsePhrasebookImageRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).length !== 2
      || !Object.keys(body).every((key) => ['prompt', 'output_format'].includes(key))) {
    throw requestError('Request must contain only prompt and output_format');
  }
  if (typeof body.prompt !== 'string' || !body.prompt.trim() || body.prompt.trim().length > 2000) {
    throw requestError('prompt must contain 1–2000 characters');
  }
  if (body.output_format !== 'png') {
    throw requestError('Only png output is supported');
  }
  return { prompt: body.prompt.trim(), output_format: 'png' };
}

// Race cancellation as well as forwarding it: a stalled transport must not hold
// the route open after the request deadline or client disconnect.
async function boundedWork(work, parentSignal, timeoutMs) {
  if (parentSignal?.aborted) throw parentSignal.reason || new Error('Request cancelled');
  const controller = new AbortController();
  const forward = () => controller.abort(parentSignal.reason || new Error('Request cancelled'));
  parentSignal?.addEventListener('abort', forward, { once: true });
  const timer = setTimeout(() => controller.abort(new Error('Image request timed out')), timeoutMs);
  let onAbort;
  const cancelled = new Promise((resolve, reject) => {
    onAbort = () => reject(controller.signal.reason);
    if (controller.signal.aborted) onAbort();
    else controller.signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([work(controller.signal), cancelled]);
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener('abort', onAbort);
    parentSignal?.removeEventListener('abort', forward);
  }
}

async function readJson(response) {
  if (!response.ok) throw new Error('Image provider request failed');
  const maxBytes = MAX_BASE64_LENGTH + 64 * 1024;
  const length = response.headers.get('content-length');
  if (length !== null && Number(length) > maxBytes) throw new Error('Image provider response is too large');
  if (!response.body) throw new Error('Image provider returned an empty response');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error('Image provider response is too large');
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function decodePng(base64) {
  if (typeof base64 !== 'string' || !base64.length || base64.length > MAX_BASE64_LENGTH
      || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    throw new Error('Invalid PNG encoding');
  }
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > MAX_FILE_BYTES || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('Invalid PNG file');
  }
  return bytes;
}

async function inspectPng(bytes) {
  const image = sharp(bytes, { limitInputPixels: MAX_PIXELS, failOn: 'warning' });
  const metadata = await image.metadata();
  const { width, height } = metadata;
  if (metadata.format !== 'png' || !width || !height || width * height > MAX_PIXELS
      || (metadata.pages || 1) !== 1 || Math.abs(width / height - 16 / 9) > 0.03) {
    throw new Error('Invalid PNG dimensions or format');
  }
  // stats decodes the pixels, rejecting corrupt compressed data rather than
  // trusting a PNG header.
  const stats = await image.stats();
  const alpha = stats.channels[stats.channels.length - 1];
  if (metadata.hasAlpha && alpha.max <= 0) {
    throw new Error('PNG must contain visible pixels');
  }
  return { width, height };
}

function reportedCost(result) {
  const cost = result?.usage?.cost;
  return typeof cost === 'number' && Number.isFinite(cost) && cost >= 0 ? cost : null;
}

async function performPhrasebookImage(body, { signal, fetchImpl = fetch } = {}) {
  const { prompt } = parsePhrasebookImageRequest(body);
  const startedAt = performance.now();
  try {
    if (!process.env.OPENROUTER_API_KEY) throw new Error('Image credentials unavailable');
    return await boundedWork(async (pipelineSignal) => {
      const stageStartedAt = performance.now();
      const generated = await readJson(await fetchImpl('https://openrouter.ai/api/v1/images', {
        method: 'POST',
        redirect: 'error',
        signal: pipelineSignal,
        headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: IMAGE_MODEL, prompt, aspect_ratio: '16:9',
          output_format: 'png', n: 1,
          provider: { only: ['black-forest-labs'], allow_fallbacks: false } }),
      }));
      if (!Array.isArray(generated.data) || generated.data.length !== 1) throw new Error('Expected one generated PNG');
      const generatedBase64 = generated.data[0]?.b64_json;
      const dimensions = await inspectPng(decodePng(generatedBase64));
      if (pipelineSignal.aborted) throw pipelineSignal.reason;
      const costUsd = reportedCost(generated);
      const stages = [{ provider: 'openrouter', model: IMAGE_MODEL, costUsd, durationMs: Math.round(performance.now() - stageStartedAt) }];
      return {
        image: { dataUrl: PNG_PREFIX + generatedBase64, mediaType: 'image/png', ...dimensions },
        usage: { model: IMAGE_MODEL, costUsd, durationMs: Math.round(performance.now() - startedAt), stages },
      };
    }, signal, TOTAL_TIMEOUT_MS);
  } catch {
    // Do not expose upstream bodies, URLs, authorization headers, or keys.
    throw Object.assign(new Error('Phrasebook illustration failed'), { status: 502 });
  }
}

async function handlePhrasebookImage(req, res) {
  const controller = new AbortController();
  const disconnect = () => controller.abort(new Error('Client disconnected'));
  const close = () => { if (!res.writableEnded) disconnect(); };
  req.once?.('aborted', disconnect);
  res.once?.('close', close);
  if (req.aborted || res.destroyed) disconnect();
  try {
    const response = await performPhrasebookImage(req.body, { signal: controller.signal });
    console.log({ event: 'usage', route: 'phrasebook-image', ...response.usage, failureLevel: 0 });
    if (!controller.signal.aborted) return res.status(200).json(response);
  } catch (error) {
    const status = error.status || 502;
    if (status === 400) {
      console.warn({ event: 'request_invalid', route: 'phrasebook-image', failureLevel: 2, status, error: error.message });
    } else {
      console.error({ event: 'request_failed', route: 'phrasebook-image', failureLevel: 2, status });
    }
    if (!controller.signal.aborted) return res.status(status).json({ error: error.message });
  } finally {
    req.removeListener?.('aborted', disconnect);
    res.removeListener?.('close', close);
  }
}

module.exports = { performPhrasebookImage, handlePhrasebookImage, parsePhrasebookImageRequest };
