/**
 * Per-model LLM pricing and cost computation.
 *
 * The wrappers in src/llms/*.js report the exact model string they called (their
 * `model` field) plus token `usage`. This module turns that into a USD cost.
 *
 * PLACEHOLDER TABLE — fill in real rates below. Keys MUST be the exact model
 * strings the wrappers report. Rates are USD per 1,000,000 tokens. Any model
 * missing here, or with a null rate, yields `costUsd: null` downstream: tokens
 * are still reported, only the cost is omitted.
 */

const PRICING = {
  // model string (from src/llms/*.js) : { inputPer1M, outputPer1M } in USD / 1M tokens
  'gemini-3.5-flash-lite':      { inputPer1M: 0.3, outputPer1M: 2.5 },
  'gpt-5.6-luna':               { inputPer1M: 0.2, outputPer1M: 1.2 },
  'claude-haiku-4-5-20251001':  { inputPer1M: 1, outputPer1M: 5 },
};

/**
 * Pure cost math: applies explicit per-1M rates to a token count.
 *
 * @param {{ inputTokens?: number, outputTokens?: number }} usage
 * @param {{ inputPer1M?: number|null, outputPer1M?: number|null }} rates
 * @returns {number|null} USD cost, or null when either rate is unset.
 */
function costFromRates({ inputTokens = 0, outputTokens = 0 } = {}, { inputPer1M, outputPer1M } = {}) {
  if (inputPer1M == null || outputPer1M == null) return null;
  return (inputTokens * inputPer1M + outputTokens * outputPer1M) / 1e6;
}

/**
 * Looks up a model's rates in PRICING and computes its cost.
 *
 * @param {string} model
 * @param {{ inputTokens?: number, outputTokens?: number }} usage
 * @returns {number|null} USD cost, or null when the model has no configured rate.
 */
function computeCostUsd(model, usage) {
  return costFromRates(usage, PRICING[model] || {});
}

/**
 * Builds the `usage` block surfaced in the HTTP response body (and logged).
 *
 * @param {string} model
 * @param {{ inputTokens?: number, outputTokens?: number }} usage
 * @returns {{ model: string, inputTokens: number, outputTokens: number, totalTokens: number, costUsd: number|null }}
 */
function buildUsageReport(model, usage = {}) {
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  return {
    model,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    costUsd: computeCostUsd(model, { inputTokens, outputTokens }),
  };
}

module.exports = { PRICING, costFromRates, computeCostUsd, buildUsageReport };
