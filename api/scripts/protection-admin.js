#!/usr/bin/env node
'use strict';

const { createRequire } = require('node:module');
const path = require('node:path');
const { createLedger } = require('../src/protection/ledger');
const { getPricingStatus } = require('../src/protection/policy');
const apiRequire = createRequire(path.join(__dirname, '../src/package.json'));

function parseArguments(argv) {
  const [command, ...rest] = argv;
  if (!['init', 'pause', 'resume', 'status', 'reconcile'].includes(command)) {
    throw new Error('Use init, pause, resume, status [--monitor], or reconcile --reservation ID --terminal-evidence TEXT [--known-cost-micros N].');
  }
  const options = {};
  for (let i = 0; i < rest.length; i += 1) {
    const key = rest[i];
    if (key === '--monitor' && command === 'status' && options.monitor === undefined) {
      options.monitor = true;
    } else if (command === 'reconcile' && ['--reservation', '--terminal-evidence', '--known-cost-micros'].includes(key)) {
      if (Object.hasOwn(options, key) || !rest[i + 1] || rest[i + 1].startsWith('--')) throw new Error('Missing or repeated reconciliation argument.');
      options[key] = rest[++i];
    } else {
      throw new Error('Unsupported command argument.');
    }
  }
  if (command === 'reconcile') {
    if (!options['--reservation'] || !options['--terminal-evidence']) throw new Error('Reconciliation requires a reservation and explicit terminal evidence.');
    if (options['--known-cost-micros'] !== undefined && (!/^\d+$/.test(options['--known-cost-micros'])
      || !Number.isSafeInteger(Number(options['--known-cost-micros'])))) throw new Error('Known cost must be a nonnegative integer in micro-USD.');
  }
  return { command, options };
}

async function main(argv = process.argv.slice(2), environment = process.env) {
  const { command, options } = parseArguments(argv);
  const projectId = environment.GCP_PROJECT_ID;
  if (typeof projectId !== 'string' || !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId)) {
    throw new Error('GCP_PROJECT_ID must explicitly select the operator target project.');
  }
  if (environment.FIREBASE_PROJECT_ID && environment.FIREBASE_PROJECT_ID !== projectId) throw new Error('Firebase and GCP project IDs must match.');
  const emulator = environment.FIRESTORE_EMULATOR_HOST;
  if (emulator && (!projectId.startsWith('demo-') || !['development', 'test'].includes(environment.PROTECTION_ENV))) {
    throw new Error('Firestore emulator access requires an explicit development/test demo project.');
  }
  if (!emulator && projectId.startsWith('demo-')) throw new Error('Demo projects require the Firestore emulator.');
  const { initializeApp, applicationDefault, deleteApp } = apiRequire('firebase-admin/app');
  const { getFirestore } = apiRequire('firebase-admin/firestore');
  const app = initializeApp({ projectId, ...(emulator ? {} : { credential: applicationDefault() }) }, 'protection-admin');
  const db = getFirestore(app);
  const ledger = createLedger({ db, projectId, pricing: getPricingStatus });
  try {
    let result;
    if (command === 'reconcile') {
      result = await ledger.reconcile({
        reservationId: options['--reservation'],
        terminalEvidence: options['--terminal-evidence'],
        ...(options['--known-cost-micros'] !== undefined ? { knownCostMicros: Number(options['--known-cost-micros']) } : {}),
      });
      // Never print caller keys or evidence, including in operator output.
      result = { status: result.status, accountingState: result.accountingState,
        concurrencyReleased: result.concurrencyReleased, reservedMicros: result.reservedMicros, knownCostMicros: result.knownCostMicros };
    } else if (command === 'status') {
      result = await ledger.status({ monitor: options.monitor === true });
    } else {
      const control = await ledger[command]();
      result = { enabled: control.enabled, dailyLimitMicros: control.dailyLimitMicros,
        monthlyLimitMicros: control.monthlyLimitMicros, globalConcurrency: control.globalConcurrency,
        callerConcurrency: control.callerConcurrency, callerDailyWeight: control.callerDailyWeight,
        pricingVersion: control.pricingVersion, overshoot: control.overshoot === true };
    }
    if (!options.monitor) console.log(JSON.stringify({ command, projectId, ...result }));
  } finally {
    await db.terminate();
    await deleteApp(app);
  }
}

if (require.main === module) {
  main().catch(error => {
    const monitor = process.argv.includes('--monitor');
    // SDK errors may contain credentials or infrastructure detail; emit categories only.
    console.error(JSON.stringify({ event: monitor ? 'protection_monitor_failure' : 'protection_admin_failure',
      code: error.code && /^[A-Z_]+$/.test(error.code) ? error.code : 'OPERATOR_COMMAND_FAILED',
      ...(error.code ? {} : { error: 'Check explicit project selection, command arguments, pricing configuration and ADC permissions.' }) }));
    process.exitCode = 1;
  });
}

module.exports = { main, parseArguments };
