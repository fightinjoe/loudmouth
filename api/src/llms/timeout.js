'use strict';

// Single-call endpoints share cancellation mechanics, not timeout or error policy.
async function callWithTimeout(handler, prompt, opts, timeoutMs, TimeoutError) {
  const controller = new AbortController();
  const parent = opts.signal;
  const forward = () => controller.abort(parent.reason || new Error('Request cancelled'));
  if (parent?.aborted) forward();
  else parent?.addEventListener('abort', forward, { once: true });
  const timer = setTimeout(() => {
    controller.abort(new TimeoutError(`LLM request timed out after ${timeoutMs}ms`));
  }, timeoutMs);
  let onAbort;
  const cancelled = new Promise((resolve, reject) => {
    onAbort = () => reject(controller.signal.reason);
    if (controller.signal.aborted) onAbort();
    else controller.signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    const call = Promise.resolve().then(() => {
      if (controller.signal.aborted) throw controller.signal.reason;
      return handler(prompt, { ...opts, signal: controller.signal });
    });
    return await Promise.race([call, cancelled]);
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener('abort', onAbort);
    parent?.removeEventListener('abort', forward);
  }
}

module.exports = { callWithTimeout };
