const { randomUUID } = require('node:crypto');
const { handlePhrasebookTitle } = require('./phrasebook-title');
const { handleContext } = require('./context');
const { handlePhrasebook } = require('./phrasebook');
const { handlePhraseBreakdown } = require('./phrase-breakdown');
const { handlePhrasebookImage } = require('./phrasebook-image');
const { getBackendName, getPhrasebookGenerationBackendName, LLM_REGISTRY } = require('./llm-config');
const { getFirestore } = require('firebase-admin/firestore');
const { loadProtectionConfig, firebaseApp, header, verifyIdentity, failure } = require('./protection/identity');
const { parseRouteInput, buildWorkPlan } = require('./protection/policy');
const { createLedger } = require('./protection/ledger');
const { runWithWork, wrapRegistry, trackedFetch } = require('./protection/work');
const log = require('./log');

getBackendName();
getPhrasebookGenerationBackendName();
const HANDLERS = {
  '/context': handleContext,
  '/phrasebook-title': handlePhrasebookTitle,
  '/phrasebook': handlePhrasebook,
  '/phrase-breakdown': handlePhraseBreakdown,
  '/phrasebook-image': handlePhrasebookImage,
};

// Injection is an in-process test seam, never selected by headers or environment.
function createTranslate(dependencies = {}) {
  let ledger;
  const registry = wrapRegistry(dependencies.registry || LLM_REGISTRY);
  const handlers = dependencies.handlers || HANDLERS;
  const emit = dependencies.log || log.info;
  // Cloud Run's trace ID ties these events to the platform request log; local requests get a fresh UUID.
  return (req, res) => log.withRequest(
    { requestId: req.get?.('X-Cloud-Trace-Context')?.split('/')[0] || randomUUID() },
    () => translate(req, res),
  );
  async function translate(req, res) {
    const startedAt = Date.now();
    const path = req.path || '/';
    const route = Object.hasOwn(HANDLERS, path) ? path : 'unknown';
    let reservation, work, activeLedger;
    const controller = new AbortController();
    const disconnect = () => { if (!res.writableEnded) controller.abort(); };
    req.once?.('aborted', disconnect);
    res.once?.('close', disconnect);
    let deadline;
    try {
      const config = dependencies.config || loadProtectionConfig();
      res.setHeader('Vary', 'Origin');
      const origin = header(req, 'Origin');
      if (origin && !config.origins.includes(origin)) throw failure(403, 'ORIGIN_FORBIDDEN', 'This origin is not approved.');
      if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Firebase-AppCheck');
      res.setHeader('Access-Control-Expose-Headers', 'Retry-After');
      if (!Object.hasOwn(HANDLERS, path)) return res.status(404).json({ error: 'Unknown path', code: 'NOT_FOUND' });
      if (req.method === 'OPTIONS') return res.status(204).send('');
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });
      const encoding = header(req, 'Content-Encoding').toLowerCase();
      if (encoding && encoding !== 'identity') throw failure(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content encoding is not supported.');
      if (req.rawBody && req.rawBody.byteLength > 65536) throw failure(413, 'PAYLOAD_TOO_LARGE', 'Request exceeds 64 KiB.');
      if (!/^application\/json(?:\s*;|$)/i.test(header(req, 'Content-Type'))) throw failure(415, 'UNSUPPORTED_MEDIA_TYPE', 'JSON content is required.');
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Buffer.isBuffer(req.body)) throw failure(400, 'INVALID_REQUEST', 'A JSON object is required.');
      const identity = await (dependencies.verifyIdentity || verifyIdentity)(req, config);
      const parsed = parseRouteInput(path, req.body);
      if (parsed.error) throw failure(400, 'INVALID_REQUEST', 'Invalid request input.');
      const workPlan = (dependencies.buildWorkPlan || buildWorkPlan)(path, parsed.value);
      if (controller.signal.aborted) return;
      activeLedger = dependencies.ledger || (ledger ||= createLedger({ db: getFirestore(firebaseApp(config)), projectId: config.projectId }));
      reservation = await activeLedger.reserve({ uid: identity.uid, path, workPlan, now: Date.now() });
      emit({ event: 'admission_outcome', route, outcome: 'accepted', platform: identity.platform, durationMs: Date.now() - startedAt });
      // Admission time counts against the outer deadline, including a suspended process.
      const remaining = Math.min(245000, workPlan.deadlineMs) - (Date.now() - startedAt);
      if (remaining <= 0) controller.abort();
      else deadline = setTimeout(() => controller.abort(), remaining);
      await runWithWork({ ...reservation, workPlan, signal: controller.signal }, async record => {
        work = record;
        if (controller.signal.aborted) throw failure(502, 'PROVIDER_FAILED', 'Generation deadline exceeded.');
        if (path === '/phrasebook-image') {
          await handlers[path](req, res, { signal: controller.signal, fetchImpl: trackedFetch(dependencies.fetchImpl || globalThis.fetch) });
        } else {
          await handlers[path](req, res, registry, { signal: controller.signal });
        }
      });
      if (res.statusCode >= 500) emit({ event: 'admission_outcome', route, outcome: 'provider_failed', status: res.statusCode, durationMs: Date.now() - startedAt });
    } catch (error) {
      const status = Number.isInteger(error.status) && error.status >= 400 && error.status <= 599 ? error.status : 503;
      const code = error.code && /^[A-Z_]+$/.test(error.code) ? error.code : 'ADMISSION_UNAVAILABLE';
      const retryAfterSeconds = Number.isFinite(error.retryAfterSeconds) ? Math.max(1, Math.ceil(error.retryAfterSeconds)) : status === 503 ? 30 : undefined;
      if (![401, 403].includes(status) || Math.random() < 0.01) emit({ event: 'admission_outcome', route, outcome: 'rejected', code, status, sampled: [401, 403].includes(status), durationMs: Date.now() - startedAt });
      if (!res.headersSent && !res.destroyed) {
        if (retryAfterSeconds) res.setHeader('Retry-After', String(retryAfterSeconds));
        const messages = { 400: 'Invalid request input.', 401: 'A verified session is required.', 403: 'App or origin verification failed.', 413: 'Request exceeds 64 KiB.', 415: 'JSON with identity content encoding is required.', 429: 'Generation allowance is temporarily unavailable.', 502: 'Generation could not complete.', 503: 'Generation is paused or temporarily unavailable.' };
        res.status(status).json({ error: messages[status] || 'Generation could not complete.', code, ...(retryAfterSeconds ? { retryAfterSeconds } : {}) });
      }
    } finally {
      clearTimeout(deadline);
      req.removeListener?.('aborted', disconnect);
      res.removeListener?.('close', disconnect);
      if (reservation) {
        try {
          await activeLedger.settle({ reservationId: reservation.reservationId, attempts: work ? work.snapshot() : { items: [], knownCostMicros: 0, usageComplete: true, unresolved: false, terminal: true }, now: Date.now() });
        } catch {
          emit({ event: 'reservation_outcome', route, outcome: 'settlement_failed', status: 'uncertain' });
        }
      }
    }
  }
}
exports.createTranslate = createTranslate;
exports.translate = createTranslate();

