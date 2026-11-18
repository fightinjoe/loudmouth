'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');
const { computeCostUsd } = require('../pricing');
const { serializeInput, checkResponse } = require('../llms/bounds');
const scope = new AsyncLocalStorage();
const imageAttempts = new WeakMap();

function failure(message) { return Object.assign(new Error(message), { status: 502 }); }
function finiteCount(value) { return Number.isFinite(value) && value >= 0; }
// Rejection statuses establish that this attempt was not accepted for generation.
// HTTP 408/5xx (especially proxy 504) do not establish remote termination.
function isTerminalRejection(status) {
  return [400, 401, 403, 404, 413, 422, 429].includes(Number(status));
}

function accountReply(attempt, reply, image = false, terminal = true) {
  if (!attempt) return;
  attempt.terminal = terminal;
  attempt.unresolved = !terminal;
  const usage = reply?.usage;
  let cost = null;
  let complete = false;
  if (image) {
    if (finiteCount(usage?.cost)) { cost = usage.cost; complete = true; }
  } else {
    if (finiteCount(usage?.costUsd)) cost = usage.costUsd;
    if (finiteCount(usage?.inputTokens) && finiteCount(usage?.outputTokens)
        && reply.usageComplete !== false) {
      const estimate = computeCostUsd(reply.model, usage);
      if (finiteCount(estimate)) {
        if (cost === null) cost = estimate;
        complete = true;
      }
    }
  }
  const micros = cost === null ? null : Math.ceil(cost * 1e6);
  const known = Number.isSafeInteger(micros) && micros >= 0;
  attempt.usageComplete = complete && known;
  attempt.knownCostMicros = known ? micros : 0;
}

// Preserve paid replies before endpoint validation can discard them.
function recordProviderReply(reply, { terminal = true } = {}) {
  accountReply(scope.getStore()?.attempt, reply, false, terminal);
}

function recordProviderFailure(error) {
  const attempt = scope.getStore()?.attempt;
  if (attempt && isTerminalRejection(error?.status)) {
    attempt.terminal = true;
    attempt.unresolved = false;
  }
}

function begin(record, backend, options = {}) {
  if (record.closed || record.signal.aborted || options.signal?.aborted || Date.now() >= record.deadlineAt) {
    throw failure('Provider work cancelled or deadline exceeded');
  }
  if (record.items.length >= record.plan.maxAttempts) throw failure('Provider attempt budget exhausted');
  const limit = record.plan.backendLimits?.[backend];
  if (backend !== 'image' && record.plan.backendLimits) {
    if (!limit || record.items.filter(item => item.backend === backend).length >= limit.maxAttempts) {
      throw failure('Provider backend attempt budget exhausted');
    }
    if (!Number.isInteger(options.maxOutputTokens) || options.maxOutputTokens < 1
        || options.maxOutputTokens > limit.maxOutputTokens) throw failure('Provider output budget exceeded');
  }
  if (backend === 'image' && !record.plan.image) throw failure('Image work was not admitted');
  const attempt = { backend, knownCostMicros: 0, usageComplete: false, terminal: false, unresolved: true };
  record.items.push(attempt);
  return attempt;
}

function accountFailure(attempt, error) {
  if (error?.reply) accountReply(attempt, error.reply, false, error.providerTerminal !== false);
  if (error?.providerNotStarted) {
    attempt.knownCostMicros = 0;
    attempt.usageComplete = true;
    attempt.terminal = true;
    attempt.unresolved = false;
  } else if (error?.providerTerminal) {
    attempt.terminal = true;
    attempt.unresolved = false;
  }
  // A rejected network/abort promise is not proof that remote work terminated.
}

async function runWithWork(reservation, fn) {
  const plan = reservation.workPlan || reservation;
  const controller = new AbortController();
  const parent = reservation.signal;
  const forward = () => controller.abort(parent.reason || failure('Request cancelled'));
  if (parent?.aborted) forward();
  else parent?.addEventListener('abort', forward, { once: true });
  const createdAt = Number.isFinite(reservation.createdAt) ? reservation.createdAt : Date.now();
  const record = {
    plan, items: [], signal: controller.signal, closed: false,
    deadlineAt: createdAt + Math.min(plan.deadlineMs, 245000),
    snapshot() {
      const items = this.items.map(item => ({ ...item }));
      return { items, knownCostMicros: items.reduce((sum, item) => sum + item.knownCostMicros, 0),
        usageComplete: items.every(item => item.usageComplete),
        terminal: items.every(item => item.terminal), unresolved: items.some(item => item.unresolved) };
    },
  };
  const timer = setTimeout(() => controller.abort(failure('Provider work deadline exceeded')),
    Math.max(0, record.deadlineAt - Date.now()));
  try { return await scope.run({ record }, () => fn(record)); }
  finally {
    record.closed = true;
    clearTimeout(timer);
    parent?.removeEventListener('abort', forward);
    controller.abort(failure('Request work ended'));
  }
}

function wrapRegistry(registry) {
  return Object.fromEntries(Object.entries(registry).map(([backend, handler]) => {
    const wrapped = async (prompt, options = {}) => {
      const record = scope.getStore()?.record;
      if (!record) throw failure('Provider work has no admission');
      serializeInput({ ...prompt, responseJsonSchema: options.responseJsonSchema });
      const attempt = begin(record, backend, options);
      const signal = options.signal ? AbortSignal.any([record.signal, options.signal]) : record.signal;
      return scope.run({ record, attempt }, async () => {
        try {
          const reply = await handler(prompt, { ...options, signal });
          accountReply(attempt, reply);
          checkResponse(reply);
          return reply;
        } catch (error) {
          accountFailure(attempt, error);
          throw error;
        }
      });
    };
    for (const key of ['timeoutMs', 'maxOutputTokens']) {
      if (handler[key] !== undefined) wrapped[key] = handler[key];
    }
    return [backend, wrapped];
  }));
}

function trackedFetch(fetchImpl) {
  return async (url, options = {}) => {
    const record = scope.getStore()?.record;
    if (!record) throw failure('Image work has no admission');
    const attempt = begin(record, 'image', options);
    try {
      const signal = options.signal ? AbortSignal.any([record.signal, options.signal]) : record.signal;
      const response = await fetchImpl(url, { ...options, signal });
      imageAttempts.set(response, attempt);
      return response;
    } catch (error) {
      accountFailure(attempt, error);
      throw error;
    }
  };
}

function recordImageResponse(response, data, error) {
  const attempt = imageAttempts.get(response);
  if (!attempt) return;
  const terminal = response.ok && !data?.error
    || isTerminalRejection(response.status)
    || (response.ok && isTerminalRejection(data?.error?.code));
  if (data !== undefined) accountReply(attempt, data, true, terminal);
  else accountFailure(attempt, { providerTerminal: response.ok
    ? error?.providerTerminal === true : isTerminalRejection(response.status) });
  imageAttempts.delete(response);
}

module.exports = { runWithWork, wrapRegistry, trackedFetch, recordProviderReply, recordProviderFailure, recordImageResponse, isTerminalRejection };
