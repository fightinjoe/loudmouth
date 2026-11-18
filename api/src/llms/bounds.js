'use strict';

const MAX_INPUT_BYTES = 128 * 1024;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

function boundError(message) {
  return Object.assign(new Error(message), { status: 502, providerNotStarted: true });
}

function serializeInput(value) {
  const body = JSON.stringify(value);
  if (Buffer.byteLength(body, 'utf8') > MAX_INPUT_BYTES) {
    throw boundError('Provider input exceeds byte limit');
  }
  return body;
}

function checkResponse(value) {
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_RESPONSE_BYTES) {
    const error = boundError('Provider response exceeds byte limit');
    delete error.providerNotStarted;
    error.providerTerminal = true;
    throw error;
  }
}

async function readBoundedJson(response, maxBytes = MAX_RESPONSE_BYTES) {
  const length = response.headers?.get('content-length');
  if (length !== null && Number(length) > maxBytes) {
    await response.body?.cancel().catch(() => {});
    throw Object.assign(new Error('Provider response exceeds byte limit'), { status: 502 });
  }
  if (!response.body) throw Object.assign(new Error('Provider returned an empty response'), { status: 502 });
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw Object.assign(new Error('Provider response exceeds byte limit'), { status: 502 });
      chunks.push(value);
    }
    try {
      return JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
    } catch {
      throw Object.assign(new Error('Provider returned invalid JSON'), { status: 502, providerTerminal: true });
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

module.exports = { MAX_INPUT_BYTES, MAX_RESPONSE_BYTES, serializeInput, checkResponse, readBoundedJson };
