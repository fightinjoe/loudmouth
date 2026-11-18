const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createTranslate } = require('../index');
const { loadProtectionConfig } = require('../protection/identity');
const { localProtection, isLocalOrigin } = require('../../dev/local-protection');
const { configuration } = require('../../scripts/deployment-config');

function request(overrides = {}) {
  return Object.assign(new EventEmitter(), { method: 'POST', path: '/phrasebook-title', body: { seed: 'ordering vegan food' }, headers: { 'content-type': 'application/json' }, ...overrides });
}
function response() {
  return Object.assign(new EventEmitter(), { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; this.headersSent = true; this.writableEnded = true; return this; }, send(body) { return this.json(body); } });
}
function fixture() {
  let calls = 0;
  const provider = async () => { calls += 1; return { text: '{"title":"Vegan Dinner"}', model: 'gemini-3.5-flash-lite', usage: { inputTokens: 10, outputTokens: 10 } }; };
  provider.maxOutputTokens = 256;
  const translate = createTranslate({ ...localProtection({ PROTECTION_ENV: 'local' }), registry: { 'gemini-3.5-flash-lite': provider }, log() {} });
  return { translate, calls: () => calls };
}

test('local mode completes a request with no tokens, verified pricing or ledger', async () => {
  const { translate, calls } = fixture();
  const res = response();
  await translate(request(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.title, 'Vegan Dinner');
  assert.equal(calls(), 1);
});

test('local mode answers preflight for a network origin and refuses a public one before provider work', async () => {
  const { translate, calls } = fixture();
  const preflight = response();
  await translate(request({ method: 'OPTIONS', headers: { origin: 'http://tiny:5750' } }), preflight);
  assert.equal(preflight.statusCode, 204);
  assert.equal(preflight.headers['Access-Control-Allow-Origin'], 'http://tiny:5750');
  const refused = response();
  await translate(request({ headers: { origin: 'https://attacker.example', 'content-type': 'application/json' } }), refused);
  assert.equal(refused.statusCode, 403);
  assert.equal(calls(), 0);
});

test('only loopback, network-name and private-address origins are local', () => {
  for (const origin of ['http://localhost:8000', 'http://127.0.0.1:8000', 'http://[::1]:8000', 'http://tiny:5750', 'http://laptop.local:8000', 'http://192.168.1.20:8000', 'http://10.0.0.5:8000', 'http://172.20.1.1:8000', 'http://100.101.102.103:8000']) {
    assert.equal(isLocalOrigin(origin), true, origin);
  }
  for (const origin of ['https://attacker.example', 'http://localhost.attacker.example', 'http://8.8.8.8:8000', 'http://172.32.0.1', 'http://localhost:8000/', 'file://', 'null', '']) {
    assert.equal(isLocalOrigin(origin), false, origin);
  }
});

test('local mode cannot be composed on Cloud Run or in production, and the deployed paths reject it', () => {
  assert.throws(() => localProtection({ PROTECTION_ENV: 'local', K_SERVICE: 'translation-api' }));
  assert.throws(() => localProtection({ PROTECTION_ENV: 'local', NODE_ENV: 'production' }));
  assert.throws(() => localProtection({ PROTECTION_ENV: 'development' }));
  assert.throws(() => localProtection({}));
  const env = { PROTECTION_ENV: 'local', GCP_PROJECT_ID: 'real-project', FIREBASE_PROJECT_ID: 'real-project', APP_CHECK_APP_IDS: '1:123:web:abc', CORS_ALLOWED_ORIGINS: 'https://example.test' };
  // The production entrypoint and the deployment preflight do not know the mode.
  assert.throws(() => loadProtectionConfig(env), { status: 503, code: 'ADMISSION_UNAVAILABLE' });
  assert.throws(() => configuration(env), /staging or production/);
});
