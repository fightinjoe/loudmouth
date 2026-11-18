#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');

function required(env, key) {
  const value = env[key];
  if (!value || value !== value.trim()) throw new Error(`${key} must be explicitly configured`);
  return value;
}
function configuration(env = process.env) {
  const project = required(env, 'GCP_PROJECT_ID');
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project) || project.startsWith('demo-')) throw new Error('A real explicit GCP_PROJECT_ID is required for deployment');
  if (required(env, 'FIREBASE_PROJECT_ID') !== project) throw new Error('Firebase and GCP project must match');
  const protectionEnv = required(env, 'PROTECTION_ENV');
  if (!['staging', 'production'].includes(protectionEnv)) throw new Error('Deployment requires staging or production');
  for (const [key, value] of Object.entries(env)) {
    if (value && (/EMULATOR|APP_CHECK_DEBUG|APPCHECK_DEBUG/.test(key))) throw new Error(`Deployment forbids ${key}`);
  }
  const appIds = required(env, 'APP_CHECK_APP_IDS').split(',');
  if (appIds.some(id => !/^1:[0-9]+:(web|ios):[a-zA-Z0-9]+$/.test(id))) throw new Error('APP_CHECK_APP_IDS must contain exact registered Firebase app IDs');
  const origins = required(env, 'CORS_ALLOWED_ORIGINS').split(',');
  for (const origin of origins) {
    const url = new URL(origin);
    if (url.origin !== origin || url.protocol !== 'https:' || /^(localhost|127\.|\[::1\])/.test(url.hostname) || url.hostname.endsWith('.localhost')) throw new Error('CORS_ALLOWED_ORIGINS requires exact non-local HTTPS origins');
  }
  const verified = required(env, 'PRICING_VERIFIED_AT');
  const timestamp = Date.parse(verified);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(verified) || !Number.isFinite(timestamp) || timestamp > Date.now() || Date.now() >= timestamp + 30 * 86400000) throw new Error('PRICING_VERIFIED_AT must be verified UTC pricing less than 30 days old');
  if (env.IMAGE_RESERVE_MICROS && (!/^[1-9]\d*$/.test(env.IMAGE_RESERVE_MICROS) || !Number.isSafeInteger(Number(env.IMAGE_RESERVE_MICROS)))) throw new Error('IMAGE_RESERVE_MICROS must be a verified positive safe integer');
  if (required(env, 'SECURITY_REVIEW_APPROVED') !== 'true') throw new Error('Complete IAM/hostname/ancestor audit and explicitly approve SECURITY_REVIEW_APPROVED=true');
  required(env, 'FIRESTORE_LOCATION');
  const runtime = {
    NODE_ENV: 'production',
    GCP_PROJECT_ID: project, FIREBASE_PROJECT_ID: project,
    GCP_LOCATION: env.GCP_LOCATION || 'us-central1',
    GCP_VERTEX_LOCATION: env.GCP_VERTEX_LOCATION || 'global',
    LLM_BACKEND: env.LLM_BACKEND || 'gemini-3.5-flash-lite',
    PHRASEBOOK_GENERATION_BACKEND: env.PHRASEBOOK_GENERATION_BACKEND || 'deepseek-v4.1-flash',
    PROTECTION_ENV: protectionEnv, APP_CHECK_APP_IDS: appIds.join(','),
    CORS_ALLOWED_ORIGINS: origins.join(','), PRICING_VERIFIED_AT: verified,
  };
  if (!['gemini-3.5-flash-lite', 'g-flash', 'claude', 'chatgpt'].includes(runtime.LLM_BACKEND)) throw new Error('Unsupported LLM_BACKEND');
  if (!['gemini-3.5-flash-lite', 'deepseek-v4.1-flash'].includes(runtime.PHRASEBOOK_GENERATION_BACKEND)) throw new Error('Unsupported PHRASEBOOK_GENERATION_BACKEND');
  if (env.IMAGE_RESERVE_MICROS) runtime.IMAGE_RESERVE_MICROS = env.IMAGE_RESERVE_MICROS;
  return runtime;
}
if (require.main === module) {
  try {
    const config = configuration();
    if (process.argv[2] === 'env') fs.writeFileSync(process.argv[3], JSON.stringify(config), { mode: 0o600 });
    else if (process.argv[2] === 'gateway') {
      const url = new URL(process.argv[3]);
      if (url.protocol !== 'https:' || !url.hostname.endsWith('.run.app') || url.origin !== process.argv[3]) throw new Error('Expected canonical HTTPS Cloud Run URL');
      const template = fs.readFileSync(path.join(__dirname, '../config/api-gateway.yaml'), 'utf8');
      fs.writeFileSync(process.argv[4], template.replaceAll('https://YOUR_CLOUD_RUN_URL', url.origin).replaceAll('YOUR_FIREBASE_PROJECT_ID', config.FIREBASE_PROJECT_ID), { mode: 0o600 });
    } else if (process.argv[2] !== 'validate') throw new Error('Usage: deployment-config.js validate | env FILE | gateway URL FILE');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { configuration };
