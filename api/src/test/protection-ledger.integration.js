'use strict';

// Intentionally excluded from *.test.js: run under firebase emulators:exec.
const { describe, test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const path = require('node:path');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { createLedger, LEASE_MS } = require('../protection/ledger');

const projectId = 'demo-api-protection';
const NOW = Date.parse('2026-11-04T12:00:00.000Z');
const plan = { weight: 10, reserveMicros: 1000, maxAttempts: 1, deadlineMs: 30_000, pricingVersion: 'emulator-pricing-v1' };
const pricing = () => ({ valid: true, pricingVersion: plan.pricingVersion, expiresAt: NOW + 100 * 86_400_000 });
const complete = cost => ({ knownCostMicros: cost, usageComplete: true, terminal: true, unresolved: false });
const unknown = terminal => ({ knownCostMicros: 125, usageComplete: false, terminal, unresolved: !terminal });
const collections = ['protectionControl', 'protectionBudgets', 'protectionCallers', 'protectionReservations'];

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('This integration suite requires FIRESTORE_EMULATOR_HOST.');
if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== projectId) throw new Error('Only demo-api-protection is permitted.');
process.env.GCLOUD_PROJECT = projectId;

function request(uid, overrides = {}) {
  return { uid, path: '/context', workPlan: plan, now: NOW, ...overrides };
}

function makeClient() {
  const app = initializeApp({ projectId }, `ledger-${randomUUID()}`);
  const db = getFirestore(app);
  return { app, db, ledger: createLedger({ db, projectId, pricing, clock: () => NOW, logger: () => {} }) };
}

describe('Firestore protection ledger (real emulator transactions)', { concurrency: false }, () => {
  let clients;
  let db;
  let ledger;
  before(async () => {
    clients = Array.from({ length: 20 }, makeClient);
    ({ db, ledger } = clients[0]);
    await db.doc('protectionControl/connectivity').set({ emulatorOnly: true });
  });
  beforeEach(async () => {
    for (const collection of collections) await db.recursiveDelete(db.collection(collection));
    await ledger.init({ now: NOW });
    await ledger.resume({ now: NOW });
  });
  after(async () => {
    for (const collection of collections) await db.recursiveDelete(db.collection(collection));
    await Promise.all(clients.map(async client => { await client.db.terminate(); await deleteApp(client.app); }));
  });

  test('first installation reports disabled and refuses admission before control initialization', async () => {
    await db.doc('protectionControl/current').delete();
    assert.equal((await ledger.status({ now: NOW })).enabled, false);
    await assert.rejects(ledger.reserve(request('first-install')), { code: 'GENERATION_PAUSED' });
    assert.equal((await db.collection('protectionReservations').get()).size, 0);
    await ledger.init({ now: NOW });
    assert.equal((await ledger.status({ now: NOW })).enabled, false);
  });

  test('20 separate clients race the final money allowance; only one provider starts', async () => {
    await db.doc('protectionBudgets/day-2026-11-04').set({ reservedMicros: 0, settledMicros: 9_999_000 });
    let providerStarts = 0;
    const results = await Promise.allSettled(clients.map(async (client, i) => {
      const admitted = await client.ledger.reserve(request(`last-allowance-${i}`));
      providerStarts += 1;
      return admitted;
    }));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(providerStarts, 1);
    for (const result of results.filter(result => result.status === 'rejected')) {
      assert.ok(['GLOBAL_BUDGET', 'ADMISSION_UNAVAILABLE'].includes(result.reason.code));
    }
    const day = (await db.doc('protectionBudgets/day-2026-11-04').get()).data();
    assert.equal(day.reservedMicros, 1000);
    assert.equal(day.settledMicros, 9_999_000);
    assert.equal((await db.collection('protectionReservations').get()).size, 1);
  });

  test('20 different UIDs cannot acquire more than four global slots', async () => {
    const results = await Promise.allSettled(clients.map((client, i) => client.ledger.reserve(request(`slots-${i}`))));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 4);
    const control = (await db.doc('protectionControl/current').get()).data();
    assert.equal(control.activeReservationIds.length, 4);
    assert.equal((await db.doc('protectionBudgets/day-2026-11-04').get()).data().reservedMicros, 4000);
    assert.equal((await db.collection('protectionReservations').get()).size, 4);
  });

  test('admission ID remains idempotent across an ambiguous repeated transaction', async () => {
    const reservationId = randomUUID();
    const repeatable = createLedger({ db, projectId, pricing, idGenerator: () => reservationId, clock: () => NOW, logger: () => {} });
    const first = await repeatable.reserve(request('same-admission'));
    const second = await repeatable.reserve(request('same-admission'));
    assert.equal(first.reservationId, second.reservationId);
    const caller = (await db.doc(`protectionCallers/${first.callerKey}`).get()).data();
    assert.equal(caller.usedWeight, plan.weight);
    assert.equal(caller.activeReservationIds.length, 1);
    assert.equal((await db.doc('protectionBudgets/day-2026-11-04').get()).data().reservedMicros, 1000);
  });

  test('complete paid replies settle despite endpoint validation failure, exactly once', async () => {
    const reservation = await ledger.reserve(request('validation-failed'));
    await Promise.all(clients.slice(0, 4).map(client => client.ledger.settle({ reservationId: reservation.reservationId, attempts: complete(275), now: NOW + 1000 })));
    const day = (await db.doc('protectionBudgets/day-2026-11-04').get()).data();
    assert.equal(day.reservedMicros, 0);
    assert.equal(day.settledMicros, 275);
    assert.ok(day.deleteAfter.toMillis() > NOW);
    const saved = (await db.doc(`protectionReservations/${reservation.reservationId}`).get()).data();
    assert.equal(saved.accountingState, 'settled');
    assert.equal(saved.concurrencyReleased, true);
    assert.ok(saved.deleteAfter.toMillis() > NOW);
    const caller = (await db.doc(`protectionCallers/${reservation.callerKey}`).get()).data();
    assert.equal(caller.usedWeight, 10, 'Failed paid work never refunds daily weight');
  });

  test('unknown terminal usage releases only concurrency and retains full liability', async () => {
    const reservation = await ledger.reserve(request('unknown-bill'));
    const result = await ledger.settle({ reservationId: reservation.reservationId, attempts: unknown(true), now: NOW + 100 });
    assert.equal(result.status, 'uncertain');
    assert.equal(result.concurrencyReleased, true);
    assert.equal(result.accountingState, 'reserved');
    assert.equal(result.knownCostMicros, 125);
    assert.equal(result.deleteAfter, null);
    const day = (await db.doc('protectionBudgets/day-2026-11-04').get()).data();
    assert.equal(day.reservedMicros, 1000);
    assert.equal(day.settledMicros, 0);
    assert.equal(day.deleteAfter, null);
    const report = await ledger.status({ now: NOW + 100, monitor: true });
    assert.equal(report.activeReservations, 0);
    assert.equal(report.uncertainReservations, 1);
  });

  test('a killed worker leaves money and slots held past lease expiry', { timeout: 15_000 }, async () => {
    const child = spawn(process.execPath, ['-e', `
      const { initializeApp } = require('firebase-admin/app');
      const { getFirestore } = require('firebase-admin/firestore');
      const { createLedger } = require('./protection/ledger');
      const db = getFirestore(initializeApp({ projectId: ${JSON.stringify(projectId)} }));
      const ledger = createLedger({ db, projectId: ${JSON.stringify(projectId)}, logger: () => {} });
      ledger.reserve(${JSON.stringify(request('crashed-worker'))}).then(record => {
        process.send({ reservationId: record.reservationId });
        setInterval(() => {}, 1000);
      }).catch(() => process.exit(1));
    `], { cwd: path.resolve(__dirname, '..'), stdio: ['ignore', 'ignore', 'ignore', 'ipc'], env: process.env });
    let timer;
    let held;
    try {
      held = await Promise.race([
        once(child, 'message').then(([message]) => message),
        once(child, 'exit').then(() => { throw new Error('Worker exited before admission.'); }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Worker admission timed out.')), 10_000); }),
      ]);
    } finally {
      clearTimeout(timer);
      const exited = once(child, 'exit');
      if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited; }
    }
    const later = NOW + LEASE_MS + 1000;
    const report = await clients[1].ledger.status({ now: later, monitor: true });
    assert.equal(report.activeReservations, 1);
    assert.equal(report.staleReservations, 1);
    assert.equal(report.dailyReservedMicros, 1000);
    assert.equal((await db.doc(`protectionReservations/${held.reservationId}`).get()).data().deleteAfter, null);
    await ledger.pause({ now: later });
    await assert.rejects(ledger.resume({ now: later }), error => error.code === 'GENERATION_PAUSED');
  });

  test('unresolved transport retains capacity until explicit operator terminal evidence', async () => {
    const reservation = await ledger.reserve(request('unresolved'));
    const settled = await ledger.settle({ reservationId: reservation.reservationId, attempts: unknown(false), now: NOW + 100 });
    assert.equal(settled.concurrencyReleased, false);
    await assert.rejects(ledger.reconcile({ reservationId: reservation.reservationId, terminalEvidence: '' }));
    await ledger.reconcile({ reservationId: reservation.reservationId, terminalEvidence: 'Provider confirms this request has terminated.', now: NOW + LEASE_MS });
    await ledger.settle({ reservationId: reservation.reservationId, attempts: complete(0), now: NOW + LEASE_MS + 1 });
    const day = (await db.doc('protectionBudgets/day-2026-11-04').get()).data();
    assert.equal(day.reservedMicros, 1000, 'Late process cannot erase operator-retained liability');
    assert.equal(day.settledMicros, 0);
    assert.equal((await ledger.status({ now: NOW + LEASE_MS })).activeReservations, 0);
  });

  test('late settlement racing reconciliation never double debits or refunds', async () => {
    const reservation = await ledger.reserve(request('reconciliation-race'));
    await ledger.settle({ reservationId: reservation.reservationId, attempts: unknown(false), now: NOW + 10 });
    await Promise.all([
      clients[1].ledger.reconcile({ reservationId: reservation.reservationId, terminalEvidence: 'Final provider bill and termination confirmed.', knownCostMicros: 400, now: NOW + 100 }),
      clients[2].ledger.settle({ reservationId: reservation.reservationId, attempts: complete(400), now: NOW + 101 }),
      clients[3].ledger.reconcile({ reservationId: reservation.reservationId, terminalEvidence: 'Final provider bill and termination confirmed.', knownCostMicros: 400, now: NOW + 102 }),
    ]);
    const day = (await db.doc('protectionBudgets/day-2026-11-04').get()).data();
    assert.equal(day.reservedMicros, 0);
    assert.equal(day.settledMicros, 400);
    assert.equal((await ledger.status({ now: NOW + 200 })).uncertainReservations, 0);
  });

  test('retained unknown cost can later reconcile after inactive caller TTL deletion', async () => {
    const reservation = await ledger.reserve(request('caller-expired'));
    await ledger.reconcile({ reservationId: reservation.reservationId, terminalEvidence: 'Terminal work confirmed, billing pending.', now: NOW + 100 });
    await db.doc(`protectionCallers/${reservation.callerKey}`).delete();
    const result = await ledger.reconcile({ reservationId: reservation.reservationId, terminalEvidence: 'Complete bill now available.', knownCostMicros: 350, now: NOW + 36 * 86_400_000 });
    assert.equal(result.accountingState, 'settled');
    assert.equal((await db.doc('protectionBudgets/day-2026-11-04').get()).data().settledMicros, 350);
  });

  test('midnight and month rollover settle the original accounting windows', async () => {
    const now = Date.parse('2026-11-30T23:59:59Z');
    const reservation = await ledger.reserve(request('midnight', { now }));
    await ledger.settle({ reservationId: reservation.reservationId, attempts: complete(200), now: now + 3000 });
    assert.equal((await db.doc('protectionBudgets/day-2026-11-30').get()).data().settledMicros, 200);
    assert.equal((await db.doc('protectionBudgets/month-2026-11').get()).data().settledMicros, 200);
    assert.equal((await db.doc('protectionBudgets/day-2026-12-01').get()).exists, false);
    assert.equal((await db.doc('protectionBudgets/month-2026-12').get()).exists, false);
  });

  test('overshoot records the full cost and atomically pauses admission', async () => {
    const reservation = await ledger.reserve(request('overshoot'));
    await ledger.settle({ reservationId: reservation.reservationId, attempts: complete(1500), now: NOW + 100 });
    assert.equal((await db.doc('protectionBudgets/day-2026-11-04').get()).data().settledMicros, 1500);
    assert.equal((await db.doc('protectionControl/current').get()).data().enabled, false);
    await assert.rejects(ledger.reserve(request('after-overshoot')), error => error.code === 'GENERATION_PAUSED');
    await assert.rejects(ledger.resume({ now: NOW + 100 }), error => error.code === 'GENERATION_PAUSED');
  });

  test('init never resets a kill switch, counters, or active work', async () => {
    await ledger.reserve(request('init-preserves'));
    await ledger.pause({ now: NOW });
    await ledger.init({ now: NOW });
    const report = await ledger.status({ now: NOW });
    assert.equal(report.enabled, false);
    assert.equal(report.activeReservations, 1);
    assert.equal(report.dailyReservedMicros, 1000);
  });

  test('three weighted flows exhaust the daily caller quota without refund on failure', async () => {
    for (let i = 0; i < 3; i += 1) {
      const reservation = await ledger.reserve(request('daily-quota', { workPlan: { ...plan, weight: 100 } }));
      await ledger.settle({ reservationId: reservation.reservationId, attempts: complete(0), now: NOW + i });
    }
    await assert.rejects(ledger.reserve(request('daily-quota')), error => error.status === 429 && error.code === 'CALLER_QUOTA' && error.retryAfterSeconds === 43_200);
    const nextDay = NOW + 86_400_000;
    const next = await ledger.reserve(request('daily-quota', { now: nextDay }));
    assert.equal((await db.doc(`protectionCallers/${next.callerKey}`).get()).data().usedWeight, 10);
  });

  test('monitor is read-only and emits bounded numeric status fields', async () => {
    const entries = [];
    const monitor = createLedger({ db, projectId, pricing, logger: entry => entries.push(entry), clock: () => NOW });
    const beforeState = (await db.doc('protectionControl/current').get()).data();
    await monitor.status({ now: NOW, monitor: true });
    assert.deepEqual((await db.doc('protectionControl/current').get()).data(), beforeState);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].event, 'protection_monitor');
    for (const field of ['dailyReservedMicros', 'dailySettledMicros', 'dailyLimitMicros', 'monthlyReservedMicros', 'monthlySettledMicros', 'monthlyLimitMicros', 'activeReservations', 'uncertainReservations', 'staleReservations', 'dailyUtilization', 'monthlyUtilization']) assert.equal(typeof entries[0][field], 'number');
    assert.equal(JSON.stringify(entries).includes('callerKey'), false);
  });

  test('a real emulator connection outage fails closed without provider work', { timeout: 30_000 }, async () => {
    // Cut only this client's TCP path, not the shared emulator managed by the CLI.
    const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
    const endpoint = new URL(`http://${emulatorHost}`);
    const sockets = new Set();
    const proxy = net.createServer(socket => {
      const upstream = net.connect(Number(endpoint.port), endpoint.hostname);
      sockets.add(socket); sockets.add(upstream);
      socket.on('error', () => {}); upstream.on('error', () => socket.destroy());
      socket.on('close', () => { sockets.delete(socket); upstream.destroy(); });
      upstream.on('close', () => { sockets.delete(upstream); socket.destroy(); });
      socket.pipe(upstream); upstream.pipe(socket);
    });
    await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
    const child = spawn(process.execPath, ['-e', `
      const { initializeApp } = require('firebase-admin/app');
      const { getFirestore } = require('firebase-admin/firestore');
      const { createLedger } = require('./protection/ledger');
      const db = getFirestore(initializeApp({ projectId: ${JSON.stringify(projectId)} }));
      const ledger = createLedger({ db, projectId: ${JSON.stringify(projectId)}, logger: () => {}, transactionTimeoutMs: 250 });
      process.on('message', async () => {
        let providerStarts = 0;
        try {
          await ledger.reserve(${JSON.stringify(request('outage'))});
          providerStarts += 1;
          process.send({ providerStarts });
        } catch (error) {
          process.send({ providerStarts, status: error.status, code: error.code });
        }
      });
      db.doc('protectionControl/current').get().then(() => process.send({ ready: true })).catch(() => process.exit(1));
    `], { cwd: path.resolve(__dirname, '..'), stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      env: { ...process.env, FIRESTORE_EMULATOR_HOST: `127.0.0.1:${proxy.address().port}` } });
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Outage worker timed out.')), 10_000);
    });
    try {
      const [ready] = await Promise.race([once(child, 'message'), deadline]);
      assert.equal(ready.ready, true);
      for (const socket of sockets) socket.destroy();
      await new Promise(resolve => proxy.close(resolve));
      const reply = once(child, 'message');
      child.send({ run: true });
      const [result] = await Promise.race([reply, deadline]);
      assert.equal(result.status, 503);
      assert.equal(result.code, 'ADMISSION_UNAVAILABLE');
      assert.equal(result.providerStarts, 0);
      assert.equal((await db.collection('protectionReservations').get()).size, 0);
    } finally {
      clearTimeout(timer);
      const exited = once(child, 'exit');
      if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited; }
      for (const socket of sockets) socket.destroy();
      if (proxy.listening) await new Promise(resolve => proxy.close(resolve));
    }
  });
});
