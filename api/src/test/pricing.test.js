'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { costFromRates, computeCostUsd, buildUsageReport, PRICING } = require('../pricing');

describe('costFromRates', () => {
  test('applies per-1M rates to input and output tokens', () => {
    // 1,000,000 in @ $3/1M + 500,000 out @ $15/1M = 3 + 7.5 = 10.5
    const cost = costFromRates(
      { inputTokens: 1_000_000, outputTokens: 500_000 },
      { inputPer1M: 3, outputPer1M: 15 },
    );
    assert.equal(cost, 10.5);
  });

  test('returns null when either rate is unset', () => {
    assert.equal(costFromRates({ inputTokens: 10, outputTokens: 10 }, { inputPer1M: null, outputPer1M: 5 }), null);
    assert.equal(costFromRates({ inputTokens: 10, outputTokens: 10 }, { inputPer1M: 5, outputPer1M: null }), null);
    assert.equal(costFromRates({ inputTokens: 10, outputTokens: 10 }, {}), null);
  });

  test('treats missing token counts as zero', () => {
    assert.equal(costFromRates({}, { inputPer1M: 3, outputPer1M: 15 }), 0);
  });
});

describe('computeCostUsd', () => {
  test('returns null for an unknown model', () => {
    assert.equal(computeCostUsd('no-such-model', { inputTokens: 100, outputTokens: 100 }), null);
  });

  test('computes cost from configured per-model rates', () => {
    // gpt-5.6-luna: 1M in @ $0.2/1M + 1M out @ $1.2/1M = 0.2 + 1.2 = 1.4
    assert.equal(
      computeCostUsd('gpt-5.6-luna', { inputTokens: 1_000_000, outputTokens: 1_000_000 }),
      1.4,
    );
    // every configured model now has real rates → a non-null cost
    for (const model of Object.keys(PRICING)) {
      assert.notEqual(computeCostUsd(model, { inputTokens: 100, outputTokens: 100 }), null);
    }
  });
});

describe('buildUsageReport', () => {
  test('reports tokens, total, and cost together', () => {
    assert.deepEqual(
      buildUsageReport('no-such-model', { inputTokens: 12, outputTokens: 34 }),
      { model: 'no-such-model', inputTokens: 12, outputTokens: 34, totalTokens: 46, costUsd: null },
    );
  });

  test('defaults absent usage fields to zero', () => {
    assert.deepEqual(
      buildUsageReport('no-such-model'),
      { model: 'no-such-model', inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: null },
    );
  });
});
