const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createTranslate } = require('../index');
const { gatewayClaims, loadProtectionConfig, verifyIdentity } = require('../protection/identity');
const config = { mode: 'staging', projectId: 'demo-api-protection', appIds: ['1:123:web:abc'], origins: ['https://example.test'] };
const claims = overrides => Buffer.from(JSON.stringify({ sub: 'caller', iss: `https://securetoken.google.com/${config.projectId}`, aud: config.projectId, exp: Date.now() / 1000 + 3600, ...overrides })).toString('base64url');
function request(overrides = {}) {
  return Object.assign(new EventEmitter(), { method: 'POST', path: '/phrasebook-title', body: { seed: 'ordering vegan food' }, headers: { 'content-type': 'application/json', 'x-apigateway-api-userinfo': claims(), 'x-firebase-appcheck': 'app-token' }, ...overrides });
}
function response() {
  return Object.assign(new EventEmitter(), { headers: {}, statusCode: 200, setHeader(k,v) { this.headers[k] = v; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; this.headersSent = true; this.writableEnded = true; return this; }, send(body) { return this.json(body); } });
}
function fixture(options = {}) {
  const events = [];
  const ledger = { async reserve({workPlan}) { events.push('reserve'); return { reservationId: 'reservation', ...workPlan, createdAt: Date.now() }; }, async settle(value) { events.push('settle'); ledger.settlement = value; } };
  const provider = async () => { events.push('provider'); return { text: '{"title":"Vegan Dinner"}', model: 'gemini-3.5-flash-lite', usage: { inputTokens: 10, outputTokens: 10 } }; };
  provider.maxOutputTokens = 256;
  const translate = createTranslate({ config, ledger, registry: { 'gemini-3.5-flash-lite': provider }, buildWorkPlan: () => ({ weight: 2, reserveMicros: 100000, maxAttempts: 1, deadlineMs: 2000, pricingVersion: 'test' }), verifyIdentity: (req,cfg) => verifyIdentity(req,cfg,{verifyAppCheck: async () => ({ appId: config.appIds[0] })}), log() {}, ...options });
  return { translate, events, ledger };
}
test('gateway claims reject missing, forged project, expired and oversized evidence', () => {
  for (const value of ['', '!', claims({ aud: 'another-project' }), claims({ iss: 'wrong' }), claims({ sub: '' }), claims({ exp: 1 }), 'a'.repeat(16385)]) assert.throws(() => gatewayClaims(value, config.projectId), { code: 'AUTH_REQUIRED' });
  assert.equal(gatewayClaims(claims(), config.projectId).sub, 'caller');
});
test('production cannot select development verification or emulator configuration', () => {
  const env = { PROTECTION_ENV: 'development', GCP_PROJECT_ID: config.projectId, FIREBASE_PROJECT_ID: config.projectId, APP_CHECK_APP_IDS: config.appIds[0], CORS_ALLOWED_ORIGINS: 'http://localhost:8080', K_SERVICE: 'service' };
  assert.throws(() => loadProtectionConfig(env), { code: 'ADMISSION_UNAVAILABLE' });
  assert.throws(() => loadProtectionConfig({ ...env, PROTECTION_ENV: 'production', FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099' }), { code: 'ADMISSION_UNAVAILABLE' });
});
test('missing identity and wrong app evidence cannot reserve or call a provider', async () => {
  for (const wrongApp of [false,true]) {
    const { translate, events } = fixture({ verifyIdentity: (req,cfg) => verifyIdentity(req,cfg,{verifyAppCheck: async () => ({appId: '1:123:web:wrong'})}) });
    const req = request();
    if (!wrongApp) delete req.headers['x-apigateway-api-userinfo'];
    const res = response(); await translate(req,res);
    assert.equal(res.statusCode, wrongApp ? 403 : 401); assert.deepEqual(events, []);
  }
});
test('verification infrastructure failure is unavailable, not invalid evidence or fail-open', async () => {
  await assert.rejects(verifyIdentity(request(), config, {verifyAppCheck: async () => { throw Object.assign(new Error('private details'), {code:'app-check/internal-error'}); }}), {status:503,code:'ADMISSION_UNAVAILABLE'});
});
test('valid work reserves before provider execution and settles after response', async () => {
  const { translate, events, ledger } = fixture(); const res = response(); await translate(request(),res);
  assert.equal(res.statusCode,200); assert.deepEqual(events,['reserve','provider','settle']);
  assert.equal(ledger.settlement.reservationId,'reservation');
});
test('invalid parsed input consumes no allowance', async () => {
  const {translate,events}=fixture(); const res=response(); await translate(request({body:{}}),res);
  assert.equal(res.statusCode,400); assert.deepEqual(events,[]);
});
test('App Check key-fetch errors wrapped as invalid-argument remain service outages', async () => {
  await assert.rejects(verifyIdentity(request(), config, { verifyAppCheck: async () => {
    throw Object.assign(new Error('key fetch failed'), { code: 'app-check/invalid-argument', cause: { code: 'key-fetch-error' } });
  } }), { status: 503, code: 'ADMISSION_UNAVAILABLE' });
});
test('preflight is unauthenticated but does not authorize a subsequent POST', async () => {
  const {translate,events}=fixture(); const headers={origin:'https://example.test','content-type':'application/json'};
  const preflight=response(); await translate(request({method:'OPTIONS',headers}),preflight); assert.equal(preflight.statusCode,204);
  const post=response(); await translate(request({headers}),post); assert.equal(post.statusCode,401); assert.deepEqual(events,[]);
});
test('unapproved origins, oversized bytes, unsupported encodings and array bodies reject before work', async () => {
  for (const [override,status] of [[{headers:{origin:'https://evil.test'}},403],[{rawBody:Buffer.alloc(65537)},413],[{headers:{'content-encoding':'gzip'}},415],[{body:[]},400]]) {
    const {translate,events}=fixture(); const res=response(); await translate(request(override),res); assert.equal(res.statusCode,status); assert.deepEqual(events,[]);
  }
});
test('quota retry guidance is preserved without exposing internal exception messages', async () => {
  const {translate,events}=fixture({ledger:{async reserve(){throw Object.assign(new Error('secret contents'),{status:429,code:'CALLER_QUOTA',retryAfterSeconds:60});}}});
  const res=response(); await translate(request(),res); assert.equal(res.statusCode,429); assert.equal(res.headers['Retry-After'],'60'); assert.equal(res.body.code,'CALLER_QUOTA'); assert.equal(JSON.stringify(res.body).includes('secret'),false); assert.deepEqual(events,[]);
});
