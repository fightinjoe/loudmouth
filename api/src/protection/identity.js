const { getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getAppCheck } = require('firebase-admin/app-check');

function failure(status, code, message, retryAfterSeconds) {
  return Object.assign(new Error(message), { status, code, retryAfterSeconds });
}
function loadProtectionConfig(env = process.env) {
  const mode = env.PROTECTION_ENV;
  const projectId = env.FIREBASE_PROJECT_ID;
  if (!['development', 'staging', 'production'].includes(mode) || !projectId || projectId !== env.GCP_PROJECT_ID) {
    throw failure(503, 'ADMISSION_UNAVAILABLE', 'Generation configuration is unavailable.', 30);
  }
  if (mode === 'development' && env.K_SERVICE) throw failure(503, 'ADMISSION_UNAVAILABLE', 'Development verification is unavailable on Cloud Run.', 30);
  const emulated = Object.keys(env).some(key => /EMULATOR_HOST|FIREBASE_APPCHECK_DEBUG_TOKEN/.test(key) && env[key]);
  if (emulated && !(mode === 'development' && projectId.startsWith('demo-') && !env.K_SERVICE)) {
    throw failure(503, 'ADMISSION_UNAVAILABLE', 'Unsafe verification configuration.', 30);
  }
  const appIds = (env.APP_CHECK_APP_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  const origins = (env.CORS_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!appIds.length || !origins.length || appIds.some(id => !/^1:\d+:(web|ios):[a-zA-Z0-9]+$/.test(id)) || origins.some(origin => {
    try {
      const url = new URL(origin);
      return url.origin !== origin || !['https:', 'http:'].includes(url.protocol) || (mode !== 'development' && (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)));
    } catch { return true; }
  })) throw failure(503, 'ADMISSION_UNAVAILABLE', 'Generation configuration is unavailable.', 30);
  return { mode, projectId, appIds, origins };
}
function firebaseApp(config) {
  return getApps().find(app => app.name === 'protection') || initializeApp({ projectId: config.projectId }, 'protection');
}
function header(req, name) {
  const value = req.get ? req.get(name) : req.headers?.[name.toLowerCase()];
  return typeof value === 'string' ? value : '';
}
function gatewayClaims(encoded, projectId, now = Date.now()) {
  const denied = () => failure(401, 'AUTH_REQUIRED', 'A verified session is required.');
  if (!encoded || Buffer.byteLength(encoded) > 16384 || !/^[A-Za-z0-9_-]+={0,2}$/.test(encoded)) throw denied();
  let claims;
  try { claims = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); } catch { throw denied(); }
  if (!claims || typeof claims.sub !== 'string' || !claims.sub.trim() || claims.sub.length > 128 ||
      claims.iss !== `https://securetoken.google.com/${projectId}` || claims.aud !== projectId ||
      !Number.isFinite(claims.exp) || claims.exp <= now / 1000) throw denied();
  return claims;
}
function infrastructureError(error) {
  const code = String(error?.code || '');
  return /internal-error|network|credential|fetch|server-unavailable|unknown-error|ENOTFOUND|ECONN|ETIMEDOUT|app\/invalid-credential/.test(code);
}
async function verifyIdentity(req, config, dependencies = {}) {
  let claims;
  if (config.mode === 'development') {
    const authorization = header(req, 'Authorization');
    if (!/^Bearer \S+$/.test(authorization) || authorization.length > 16384) throw failure(401, 'AUTH_REQUIRED', 'A verified session is required.');
    try {
      claims = await (dependencies.verifyIdToken || (token => getAuth(firebaseApp(config)).verifyIdToken(token)))(authorization.slice(7));
    } catch (error) {
      if (infrastructureError(error)) throw failure(503, 'ADMISSION_UNAVAILABLE', 'Session verification is temporarily unavailable.', 30);
      throw failure(401, 'AUTH_REQUIRED', 'A verified session is required.');
    }
  } else {
    claims = gatewayClaims(header(req, 'X-Apigateway-Api-Userinfo'), config.projectId);
  }
  const uid = claims.uid || claims.sub;
  if (typeof uid !== 'string' || !uid.trim() || uid.length > 128) throw failure(401, 'AUTH_REQUIRED', 'A verified session is required.');
  const token = header(req, 'X-Firebase-AppCheck');
  if (!token || token.length > 16384) throw failure(403, 'APP_VERIFICATION_FAILED', 'App verification is required.');
  let evidence;
  try {
    evidence = await (dependencies.verifyAppCheck || (value => getAppCheck(firebaseApp(config)).verifyToken(value)))(token);
  } catch (error) {
    // Only known invalid-token failures are client faults; unknown infrastructure errors fail closed as unavailable.
    if (['app-check/invalid-argument', 'app-check/invalid-app-check-token', 'app-check/app-check-token-expired'].includes(error?.code) &&
        (!error.cause || ['invalid-token', 'token-expired', 'no-matching-kid-error', 'invalid-argument'].includes(error.cause.code))) {
      throw failure(403, 'APP_VERIFICATION_FAILED', 'App verification failed.');
    }
    throw failure(503, 'ADMISSION_UNAVAILABLE', 'App verification is temporarily unavailable.', 30);
  }
  if (!config.appIds.includes(evidence.appId)) throw failure(403, 'APP_VERIFICATION_FAILED', 'This app is not approved for generation.');
  return { uid, platform: evidence.appId.includes(':ios:') ? 'ios' : 'web' };
}
module.exports = { failure, loadProtectionConfig, firebaseApp, header, gatewayClaims, verifyIdentity };
