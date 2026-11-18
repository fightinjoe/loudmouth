'use strict';

// Local development only: admission without Firebase for `npm run dev` with PROTECTION_ENV=local.
// This file is outside api/src on purpose. deploy.sh uploads only api/src and the monitor image
// copies only api/src and one script, so no deployed artifact contains code that skips verification.
const { randomUUID } = require('node:crypto');
const { buildWorkPlan } = require('../src/protection/policy');

function privateIPv4(host) {
  const match = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(host);
  if (!match) return false;
  const [a, b] = [Number(match[1]), Number(match[2])];
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)
    || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
}

// The web port differs per checkout and device, so origins are matched by rule, not listed:
// loopback, a single-label or .local network name, or a private IPv4 address. A public site has none of these.
function isLocalOrigin(origin) {
  let url;
  try { url = new URL(origin); } catch { return false; }
  if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol)) return false;
  const host = url.hostname;
  return host === '[::1]' || host.endsWith('.localhost') || host.endsWith('.local')
    || /^[a-z0-9-]+$/.test(host) || privateIPv4(host);
}

/** Dependencies for `createTranslate` that admit every request from a local origin. */
function localProtection(env = process.env) {
  if (env.PROTECTION_ENV !== 'local' || env.K_SERVICE || env.NODE_ENV === 'production') {
    throw new Error('Local protection requires PROTECTION_ENV=local, outside Cloud Run and production.');
  }
  // Nothing is reserved or charged here, so verified pricing does not apply. The real attempt,
  // output-token and deadline bounds still do, so local runs hit the same work limits as production.
  const unpriced = { pricing: { valid: true, pricingVersion: 'local' }, imageReserveMicros: 1 };
  return {
    // The router only calls `origins.includes`.
    config: { mode: 'local', projectId: 'local', appIds: [], origins: { includes: isLocalOrigin } },
    verifyIdentity: async () => ({ uid: 'local', platform: 'local' }),
    buildWorkPlan: (path, parsedRequest) => buildWorkPlan(path, parsedRequest, unpriced),
    ledger: {
      async reserve({ workPlan, now }) { return { ...workPlan, reservationId: randomUUID(), createdAt: now }; },
      async settle() {},
    },
  };
}

module.exports = { localProtection, isLocalOrigin };
