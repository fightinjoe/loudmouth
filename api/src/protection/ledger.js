'use strict';

const { createHash, randomUUID } = require('node:crypto');

const DAY_MS = 86_400_000;
const LEASE_MS = 330_000;
const RETENTION_MS = 35 * DAY_MS;
const ROUTES = new Set(['/context', '/phrasebook-title', '/phrasebook', '/phrase-breakdown', '/phrasebook-image']);
const DEFAULT_CONTROL = Object.freeze({
  enabled: false,
  dailyLimitMicros: 10_000_000,
  monthlyLimitMicros: 200_000_000,
  globalConcurrency: 4,
  callerConcurrency: 4,
  callerDailyWeight: 300,
  activeReservationIds: [],
  uncertainReservationCount: 0,
});

class ProtectionError extends Error {
  constructor(code, status, retryAfterSeconds = 30) {
    const messages = {
      GENERATION_PAUSED: 'Online generation is paused.',
      GLOBAL_CAPACITY: 'Generation is temporarily at capacity.',
      GLOBAL_BUDGET: 'The generation allowance is currently exhausted.',
      CALLER_QUOTA: 'Your daily generation allowance is exhausted.',
      CALLER_CONCURRENCY: 'Please wait for your current generation to finish.',
      ADMISSION_UNAVAILABLE: 'Generation admission is temporarily unavailable.',
    };
    super(messages[code] || messages.ADMISSION_UNAVAILABLE);
    this.name = 'ProtectionError';
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const integer = value => Number.isSafeInteger(value) && value >= 0;
const positive = value => integer(value) && value > 0;
const idsValid = value => Array.isArray(value) && value.every(id => typeof id === 'string' && id.length > 0) && new Set(value).size === value.length;
const unavailable = () => new ProtectionError('ADMISSION_UNAVAILABLE', 503);

function windows(now) {
  const date = new Date(now);
  const day = date.toISOString().slice(0, 10);
  const month = day.slice(0, 7);
  return {
    day,
    month,
    dayKey: `day-${day}`,
    monthKey: `month-${month}`,
    dayEnd: Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1),
    monthEnd: Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1),
  };
}

function validControl(control) {
  return control && typeof control.enabled === 'boolean'
    && ['dailyLimitMicros', 'monthlyLimitMicros', 'globalConcurrency', 'callerConcurrency', 'callerDailyWeight'].every(key => positive(control[key]))
    && control.globalConcurrency <= 4 && control.callerConcurrency <= 4
    && idsValid(control.activeReservationIds)
    && typeof control.pricingVersion === 'string' && control.pricingVersion.length > 0;
}

function readBudget(snapshot) {
  const value = snapshot.exists ? snapshot.data() : { reservedMicros: 0, settledMicros: 0 };
  if (!integer(value.reservedMicros) || !integer(value.settledMicros)
    || !integer(value.reservedMicros + value.settledMicros)) throw unavailable();
  return value;
}

function budgetWrite(value, windowEnd) {
  return { ...value, windowEnd, deleteAfter: value.reservedMicros === 0 ? new Date(windowEnd + RETENTION_MS) : null };
}

function summarizeAttempts(attempts) {
  if (Array.isArray(attempts)) {
    const knownCostMicros = attempts.reduce((sum, item) => sum + (integer(item?.knownCostMicros) ? item.knownCostMicros : 0), 0);
    return {
      knownCostMicros,
      usageComplete: attempts.every(item => item?.usageComplete === true && integer(item.knownCostMicros)),
      terminal: attempts.every(item => item?.terminal === true && item.unresolved !== true),
    };
  }
  const value = attempts || {};
  const items = Array.isArray(value.items) ? summarizeAttempts(value.items) : null;
  const knownCostMicros = integer(value.knownCostMicros) ? value.knownCostMicros : 0;
  return {
    knownCostMicros: items ? Math.max(knownCostMicros, items.knownCostMicros) : knownCostMicros,
    usageComplete: value.usageComplete === true && integer(value.knownCostMicros) && (!items || items.usageComplete),
    terminal: value.terminal === true && value.unresolved !== true && (!items || items.terminal),
  };
}

/** The injected db is a server Firestore client; never a browser SDK. */
function createLedger({ db, projectId, pricing = () => ({ valid: false }), clock = Date.now,
  logger = entry => console.log(JSON.stringify(entry)), idGenerator = randomUUID, transactionTimeoutMs = 4500 } = {}) {
  if (!db || typeof projectId !== 'string' || !projectId.trim()) throw new Error('An explicit projectId and Firestore client are required.');
  const controlRef = db.collection('protectionControl').doc('current');
  const budgets = db.collection('protectionBudgets');
  const callers = db.collection('protectionCallers');
  const reservations = db.collection('protectionReservations');

  function timestamp(value) {
    const result = value === undefined ? clock() : value instanceof Date ? value.getTime() : value;
    if (!Number.isFinite(result) || result < 0 || result > 8.64e15) throw unavailable();
    return result;
  }

  function emit(entry) {
    // Monitoring must not change the outcome of a committed transaction.
    try { logger(entry); } catch { /* Admission state remains authoritative. */ }
  }

  async function transaction(operation) {
    let timer;
    try {
      // A timed-out transaction may still commit. Its reservation remains held,
      // but this caller never receives admission and must not start provider work.
      return await Promise.race([
        db.runTransaction(operation, { maxAttempts: 3 }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(unavailable()), transactionTimeoutMs); }),
      ]);
    } catch (error) {
      if (error instanceof ProtectionError) throw error;
      throw unavailable();
    } finally {
      clearTimeout(timer);
    }
  }

  async function reserve({ uid, path, workPlan, now } = {}) {
    const startedAt = timestamp(now);
    const reservationId = idGenerator();
    const window = windows(startedAt);
    if (typeof uid !== 'string' || uid.length === 0 || uid.length > 128 || !ROUTES.has(path)
      || !workPlan || !positive(workPlan.weight) || !positive(workPlan.reserveMicros)
      || !positive(workPlan.maxAttempts) || !positive(workPlan.deadlineMs) || workPlan.deadlineMs > 245_000
      || typeof workPlan.pricingVersion !== 'string' || !workPlan.pricingVersion) throw unavailable();
    const callerKey = createHash('sha256').update(projectId).update('\0').update(uid).digest('hex');
    const callerRef = callers.doc(callerKey);
    const reservationRef = reservations.doc(reservationId);
    try {
      const reservation = await transaction(async tx => {
        const [controlSnap, daySnap, monthSnap, callerSnap, priorSnap] = await tx.getAll(
          controlRef, budgets.doc(window.dayKey), budgets.doc(window.monthKey), callerRef, reservationRef,
        );
        if (priorSnap.exists) {
          const prior = priorSnap.data();
          if (prior.callerKey !== callerKey || prior.route !== path || prior.status !== 'active'
            || prior.pricingVersion !== workPlan.pricingVersion || prior.reservedMicros !== workPlan.reserveMicros) throw unavailable();
          return { ...workPlan, ...prior, reservationId };
        }
        const control = controlSnap.exists ? controlSnap.data() : null;
        if (!validControl(control) || !control.enabled) throw new ProtectionError('GENERATION_PAUSED', 503);
        if (control.pricingVersion !== workPlan.pricingVersion) throw new ProtectionError('GENERATION_PAUSED', 503);
        const day = readBudget(daySnap);
        const month = readBudget(monthSnap);
        const caller = callerSnap.exists ? callerSnap.data() : { day: window.day, usedWeight: 0, activeReservationIds: [] };
        if (!integer(caller.usedWeight) || !idsValid(caller.activeReservationIds)) throw unavailable();
        const usedWeight = caller.day === window.day ? caller.usedWeight : 0;
        if (usedWeight + workPlan.weight > control.callerDailyWeight) {
          throw new ProtectionError('CALLER_QUOTA', 429, Math.max(1, Math.ceil((window.dayEnd - startedAt) / 1000)));
        }
        if (caller.activeReservationIds.length >= control.callerConcurrency) throw new ProtectionError('CALLER_CONCURRENCY', 429);
        if (control.activeReservationIds.length >= control.globalConcurrency) throw new ProtectionError('GLOBAL_CAPACITY', 503);
        const dailyExceeded = day.reservedMicros + day.settledMicros + workPlan.reserveMicros > control.dailyLimitMicros;
        const monthlyExceeded = month.reservedMicros + month.settledMicros + workPlan.reserveMicros > control.monthlyLimitMicros;
        if (dailyExceeded || monthlyExceeded) {
          const boundary = monthlyExceeded ? window.monthEnd : window.dayEnd;
          throw new ProtectionError('GLOBAL_BUDGET', 503, Math.max(1, Math.ceil((boundary - startedAt) / 1000)));
        }
        const record = {
          callerKey, route: path, weight: workPlan.weight, pricingVersion: workPlan.pricingVersion,
          dayKey: window.dayKey, monthKey: window.monthKey, dayEnd: window.dayEnd, monthEnd: window.monthEnd,
          reservedMicros: workPlan.reserveMicros, knownCostMicros: null,
          status: 'active', concurrencyReleased: false, accountingState: 'reserved',
          createdAt: startedAt, leaseExpiresAt: startedAt + LEASE_MS, deleteAfter: null,
        };
        tx.create(reservationRef, record);
        tx.set(budgets.doc(window.dayKey), budgetWrite({ ...day, reservedMicros: day.reservedMicros + workPlan.reserveMicros }, window.dayEnd));
        tx.set(budgets.doc(window.monthKey), budgetWrite({ ...month, reservedMicros: month.reservedMicros + workPlan.reserveMicros }, window.monthEnd));
        tx.set(callerRef, {
          day: window.day, usedWeight: usedWeight + workPlan.weight,
          activeReservationIds: [...caller.activeReservationIds, reservationId], deleteAfter: null,
        });
        tx.update(controlRef, { activeReservationIds: [...control.activeReservationIds, reservationId] });
        return { ...workPlan, ...record, reservationId };
      });
      emit({ event: 'ledger_outcome', route: path, outcome: 'accepted', reservedMicros: workPlan.reserveMicros, durationMs: Math.max(0, clock() - startedAt) });
      return reservation;
    } catch (error) {
      emit({ event: 'ledger_outcome', route: path, outcome: 'rejected', code: error.code || 'ADMISSION_UNAVAILABLE', durationMs: Math.max(0, clock() - startedAt) });
      throw error;
    }
  }

  async function finish({ reservationId, attempts, now, evidence, operator = false, knownCostMicros }) {
    const finishedAt = timestamp(now);
    if (typeof reservationId !== 'string' || !reservationId || reservationId.includes('/')) throw unavailable();
    const outcome = operator ? {
      terminal: true, usageComplete: knownCostMicros !== undefined, knownCostMicros: knownCostMicros ?? 0,
    } : summarizeAttempts(attempts);
    if (!integer(outcome.knownCostMicros)) throw unavailable();
    try {
      const result = await transaction(async tx => {
        const ref = reservations.doc(reservationId);
        const snapshot = await tx.get(ref);
        if (!snapshot.exists) throw unavailable();
        const record = snapshot.data();
        // Operator reconciliation is authoritative over a process waking up late.
        if (record.accountingState === 'settled' || (!operator && record.reconciledAt !== undefined)) return { ...record, reservationId };
        if (operator && record.reconciledAt !== undefined && knownCostMicros === undefined) return { ...record, reservationId };
        if (record.accountingState !== 'reserved' || !positive(record.reservedMicros)
          || !Number.isFinite(record.dayEnd) || !Number.isFinite(record.monthEnd)) throw unavailable();
        const callerRef = callers.doc(record.callerKey);
        const [controlSnap, callerSnap, daySnap, monthSnap] = await tx.getAll(controlRef, callerRef, budgets.doc(record.dayKey), budgets.doc(record.monthKey));
        const control = controlSnap.exists ? controlSnap.data() : null;
        const caller = callerSnap.exists ? callerSnap.data() : null;
        if (!control || !idsValid(control.activeReservationIds)
          || (!record.concurrencyReleased && (!caller || !idsValid(caller.activeReservationIds)))) throw unavailable();
        const day = readBudget(daySnap);
        const month = readBudget(monthSnap);
        const cost = Math.max(record.knownCostMicros || 0, outcome.knownCostMicros);
        const complete = outcome.terminal && outcome.usageComplete;
        const release = outcome.terminal && !record.concurrencyReleased;
        if (!record.concurrencyReleased && (!control.activeReservationIds.includes(reservationId)
          || !caller.activeReservationIds.includes(reservationId))) throw unavailable();
        if (complete) {
          if (day.reservedMicros < record.reservedMicros || month.reservedMicros < record.reservedMicros) throw unavailable();
          const update = budget => {
            const settledMicros = budget.settledMicros + cost;
            if (!integer(settledMicros)) throw unavailable();
            return { ...budget, reservedMicros: budget.reservedMicros - record.reservedMicros, settledMicros };
          };
          tx.set(budgets.doc(record.dayKey), budgetWrite(update(day), record.dayEnd));
          tx.set(budgets.doc(record.monthKey), budgetWrite(update(month), record.monthEnd));
        }
        const uncertainDelta = (complete ? 0 : 1) - (record.status === 'uncertain' ? 1 : 0);
        const uncertainReservationCount = (control.uncertainReservationCount || 0) + uncertainDelta;
        if (!integer(uncertainReservationCount)) throw unavailable();
        const controlUpdate = { uncertainReservationCount };
        if (release) {
          controlUpdate.activeReservationIds = control.activeReservationIds.filter(id => id !== reservationId);
          const activeReservationIds = caller.activeReservationIds.filter(id => id !== reservationId);
          const callerDayEnd = windows(Date.parse(`${caller.day}T00:00:00Z`)).dayEnd;
          tx.update(callerRef, { activeReservationIds, deleteAfter: activeReservationIds.length ? null : new Date(callerDayEnd + RETENTION_MS) });
        }
        if (cost > record.reservedMicros) {
          controlUpdate.enabled = false;
          controlUpdate.overshoot = true;
          controlUpdate.pauseReason = 'RESERVATION_OVERSHOOT';
        }
        if (Object.keys(controlUpdate).length) tx.update(controlRef, controlUpdate);
        const updated = {
          ...record,
          knownCostMicros: cost,
          status: complete ? 'settled' : 'uncertain',
          accountingState: complete ? 'settled' : 'reserved',
          concurrencyReleased: record.concurrencyReleased || release,
          updatedAt: finishedAt,
          deleteAfter: complete ? new Date(Math.max(record.monthEnd, finishedAt) + RETENTION_MS) : null,
          ...(operator ? { reconciledAt: finishedAt, terminalEvidenceHash: createHash('sha256').update(evidence).digest('hex') } : {}),
        };
        tx.set(ref, updated);
        return { ...updated, reservationId };
      });
      emit({ event: 'reservation_outcome', route: result.route, outcome: result.status,
        accountingState: result.accountingState, concurrencyReleased: result.concurrencyReleased,
        reservedMicros: result.reservedMicros, knownCostMicros: result.knownCostMicros,
        overshoot: result.knownCostMicros > result.reservedMicros });
      return result;
    } catch (error) {
      emit({ event: 'reservation_outcome', outcome: 'ADMISSION_UNAVAILABLE' });
      throw error;
    }
  }

  const settle = args => finish(args || {});

  async function reconcile({ reservationId, terminalEvidence, knownCostMicros, now } = {}) {
    if (typeof terminalEvidence !== 'string' || !terminalEvidence.trim() || terminalEvidence.length > 4096
      || (knownCostMicros !== undefined && !integer(knownCostMicros))) throw new Error('Reconciliation requires terminal evidence and an optional complete nonnegative integer cost.');
    return finish({ reservationId, knownCostMicros, now, operator: true, evidence: terminalEvidence });
  }

  async function init({ now } = {}) {
    const at = timestamp(now);
    const price = await pricing({ now: at });
    return transaction(async tx => {
      const snapshot = await tx.get(controlRef);
      if (snapshot.exists) return snapshot.data();
      const control = { ...DEFAULT_CONTROL, activeReservationIds: [], pricingVersion: price?.pricingVersion || '', createdAt: at };
      tx.create(controlRef, control);
      return control;
    });
  }

  async function pause({ now } = {}) {
    const at = timestamp(now);
    return transaction(async tx => {
      const snapshot = await tx.get(controlRef);
      if (!snapshot.exists) throw new ProtectionError('GENERATION_PAUSED', 503);
      tx.update(controlRef, { enabled: false, pausedAt: at });
      return { ...snapshot.data(), enabled: false, pausedAt: at };
    });
  }

  async function resume({ now } = {}) {
    const at = timestamp(now);
    const window = windows(at);
    const price = await pricing({ now: at });
    if (!price?.valid || !price.pricingVersion || !Number.isFinite(price.expiresAt) || price.expiresAt <= at) throw new ProtectionError('GENERATION_PAUSED', 503);
    return transaction(async tx => {
      const [controlSnap, daySnap, monthSnap] = await tx.getAll(controlRef, budgets.doc(window.dayKey), budgets.doc(window.monthKey));
      const control = controlSnap.exists ? controlSnap.data() : null;
      if (!control || !validControl({ ...control, pricingVersion: price.pricingVersion })
        || control.overshoot === true) throw new ProtectionError('GENERATION_PAUSED', 503);
      const day = readBudget(daySnap);
      const month = readBudget(monthSnap);
      if (day.reservedMicros + day.settledMicros >= control.dailyLimitMicros
        || month.reservedMicros + month.settledMicros >= control.monthlyLimitMicros) throw new ProtectionError('GLOBAL_BUDGET', 503);
      if (control.activeReservationIds.length) {
        const active = await tx.getAll(...control.activeReservationIds.map(id => reservations.doc(id)));
        if (active.some(snapshot => !snapshot.exists || snapshot.data().status === 'uncertain'
          || snapshot.data().leaseExpiresAt <= at)) throw new ProtectionError('GENERATION_PAUSED', 503);
      }
      tx.update(controlRef, { enabled: true, pricingVersion: price.pricingVersion, resumedAt: at });
      return { ...control, enabled: true, pricingVersion: price.pricingVersion, resumedAt: at };
    });
  }

  async function status({ now, monitor = false } = {}) {
    const at = timestamp(now);
    const window = windows(at);
    try {
      // A read-only transaction gives a coherent view and works with datastore.viewer.
      const state = await db.runTransaction(async tx => {
        const [controlSnap, daySnap, monthSnap] = await tx.getAll(controlRef, budgets.doc(window.dayKey), budgets.doc(window.monthKey));
        const control = controlSnap.exists ? controlSnap.data() : null;
        const day = readBudget(daySnap);
        const month = readBudget(monthSnap);
        const activeIds = control?.activeReservationIds;
        if (control && !idsValid(activeIds)) throw unavailable();
        const active = activeIds?.length ? await tx.getAll(...activeIds.map(id => reservations.doc(id))) : [];
        return { control, day, month, active: active.map(snapshot => snapshot.exists ? snapshot.data() : null) };
      }, { readOnly: true });
      const price = await pricing({ now: at });
      const dailyLimitMicros = state.control?.dailyLimitMicros || 0;
      const monthlyLimitMicros = state.control?.monthlyLimitMicros || 0;
      const report = {
        event: 'protection_monitor',
        enabled: Boolean(validControl(state.control) && state.control.enabled),
        pricingValid: price?.valid === true && price.expiresAt > at && price.pricingVersion === state.control?.pricingVersion,
        dailyReservedMicros: state.day.reservedMicros, dailySettledMicros: state.day.settledMicros, dailyLimitMicros,
        monthlyReservedMicros: state.month.reservedMicros, monthlySettledMicros: state.month.settledMicros, monthlyLimitMicros,
        dailyUtilization: dailyLimitMicros ? (state.day.reservedMicros + state.day.settledMicros) / dailyLimitMicros : 0,
        monthlyUtilization: monthlyLimitMicros ? (state.month.reservedMicros + state.month.settledMicros) / monthlyLimitMicros : 0,
        activeReservations: state.active.length,
        uncertainReservations: Math.max(state.control?.uncertainReservationCount || 0,
          state.active.filter(record => !record || record.status === 'uncertain').length),
        staleReservations: state.active.filter(record => !record || record.leaseExpiresAt <= at).length,
        oldestLeaseAgeSeconds: Math.max(0, ...state.active.map(record => record ? Math.floor((at - record.createdAt) / 1000) : 330)),
        overshoot: state.control?.overshoot === true,
      };
      if (monitor) emit(report);
      return report;
    } catch {
      if (monitor) emit({ event: 'protection_monitor_failure', code: 'ADMISSION_UNAVAILABLE' });
      throw unavailable();
    }
  }

  return { reserve, settle, init, pause, resume, status, reconcile };
}

// Runtime entry points are lazy so importing the module does not initialize ADC.
let defaultLedger;
function getDefaultLedger() {
  if (!defaultLedger) {
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCP_PROJECT_ID;
    if (!projectId) throw unavailable();
    const { getApps, initializeApp, applicationDefault } = require('firebase-admin/app');
    const { getFirestore } = require('firebase-admin/firestore');
    const app = getApps().find(candidate => candidate.options.projectId === projectId)
      || initializeApp({ projectId, credential: applicationDefault() }, 'protection-ledger');
    defaultLedger = createLedger({ db: getFirestore(app), projectId });
  }
  return defaultLedger;
}

module.exports = {
  createLedger, ProtectionError, DEFAULT_CONTROL, LEASE_MS,
  reserve: args => getDefaultLedger().reserve(args),
  settle: args => getDefaultLedger().settle(args),
};
