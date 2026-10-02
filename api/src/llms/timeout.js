'use strict';

// Single-call endpoints share cancellation mechanics, not timeout or error policy.
function callWithTimeout(handler, prompt, opts, timeoutMs, TimeoutError) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      const error = new TimeoutError(`LLM request timed out after ${timeoutMs}ms`);
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });
  const call = Promise.resolve().then(() => handler(prompt, { ...opts, signal: controller.signal }));
  return Promise.race([call, timeout]).finally(() => clearTimeout(timer));
}

module.exports = { callWithTimeout };
