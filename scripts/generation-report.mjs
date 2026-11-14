#!/usr/bin/env node
// Summarize /phrasebook generation logs: requests, per-topic English latency, providers, invalid replies,
// retries and response flags (repairs, missing sections, count overruns). Reads the API's single-line JSON
// log events (api/src/log.js).
//
//   node scripts/generation-report.mjs [--since 7d] [--project <id>] [--service translation-api]
//   node scripts/generation-report.mjs --file <events.jsonl>
//
// Without --file it runs `gcloud logging read` against the Cloud Run service (project from --project or
// GCP_PROJECT_ID); --since is a gcloud freshness such as 6h, 1d or 7d (logs are kept 30 days). --file reads
// one JSON event per line, for example local dev-server output: lines that are not JSON objects are skipped.
// Output is Markdown on stdout.
import { parseArgs } from 'node:util';
import { logSourceOptions, percentile, readEvents, sourceLine, table } from './lib/log-events.mjs';

const { values: args } = parseArgs({
  options: {
    since: { type: 'string', default: '7d' },
    ...logSourceOptions,
  },
});

const seconds = ms => (typeof ms === 'number' ? (ms / 1000).toFixed(1) : ms);
const share = (part, total) => (total ? `${part} (${Math.round(100 * part / total)}%)` : '0');
const countBy = (items, key) => items.reduce((counts, item) => counts.set(key(item), (counts.get(key(item)) ?? 0) + 1), new Map());

const events = readEvents(args);
const of = name => events.filter(event => event.event === name);
const lines = [`# Generation report`, '', sourceLine(args), ''];

// Requests: one usage event per finished /phrasebook request.
const requests = of('usage').filter(event => event.route === 'phrasebook' || event.route === 'phrasebook:failed');
const failed = requests.filter(event => event.route === 'phrasebook:failed');
lines.push('## Requests', '', table(['Requests', 'Failed (level 2)', 'Level 0', 'Level 1', 'Duration p50 s', 'p90 s'], [[
  requests.length, share(failed.length, requests.length),
  requests.filter(event => event.failureLevel === 0).length, requests.filter(event => event.failureLevel === 1).length,
  seconds(percentile(requests.map(event => event.durationMs), 0.5)), seconds(percentile(requests.map(event => event.durationMs), 0.9)),
]]), '');

// English per topic: every generation attempt of one topic in one request, retries included.
const calls = of('llm_call').filter(event => event.route === 'phrasebook:generate');
const topics = new Map();
for (const call of calls) {
  const key = `${call.requestId ?? '?'}:${call.topicIndex ?? '?'}`;
  topics.set(key, (topics.get(key) ?? 0) + call.durationMs);
}
const topicMs = [...topics.values()];
lines.push('## English generation per topic', '', table(['Topics', 'p50 s', 'p90 s', 'p95 s', 'Max s', 'Under 3 s', 'Under 6 s', 'Under 10 s'], [[
  topicMs.length, ...[0.5, 0.9, 0.95].map(p => seconds(percentile(topicMs, p))), seconds(topicMs.length ? Math.max(...topicMs) : '–'),
  ...[3000, 6000, 10000].map(limit => share(topicMs.filter(ms => ms < limit).length, topicMs.length)),
]]), '', 'Per-topic time sums the attempts of one topic (validation retries included; rate-limit backoff excluded).', '');

// Providers: one row per provider that answered a generation attempt.
const byProvider = new Map();
for (const call of calls) {
  const name = call.provider ?? '(none)';
  if (!byProvider.has(name)) byProvider.set(name, []);
  byProvider.get(name).push(call);
}
lines.push('## English generation attempts by provider', '', table(['Provider', 'Attempts', 'p50 s', 'p90 s', 'Output tokens/s p50', 'Not ok'], [...byProvider]
  .sort((a, b) => b[1].length - a[1].length)
  .map(([name, list]) => {
    const notOk = [...countBy(list.filter(call => call.outcome !== 'ok'), call => call.outcome)].map(([outcome, n]) => `${outcome} ${n}`).join(', ');
    return [name, list.length, seconds(percentile(list.map(call => call.durationMs), 0.5)), seconds(percentile(list.map(call => call.durationMs), 0.9)),
      percentile(list.map(call => call.outputTokensPerSecond).filter(Number.isFinite), 0.5), notOk || '–'];
  })), '');

// Invalid replies and retries.
const invalid = of('validation_error').filter(event => event.route === 'phrasebook:generate');
const category = event => (/^JSON parse failed/.test(event.error) ? 'invalid JSON'
  : /incomplete completion/.test(event.error) ? 'incomplete (truncated or empty)'
    : /^unusable sections/.test(event.error) ? 'unusable sections (retried)' : 'unreadable topic or envelope');
lines.push('## Invalid English replies and retries', '', table(['Kind', 'Count'], [
  ...[...countBy(invalid, category)].map(([kind, n]) => [kind, `${n} of ${calls.length} attempts`]),
  ['Generation retries', of('phrasebook_generation_retry').length],
  ['Translation retries', of('phrasebook_translation_retry').length],
  ['Rate-limit retries', of('llm_rate_limit_retry').length],
]), '');

// Response flags: one `phrasebook_flag` event per flag in an accepted response.
const flags = of('phrasebook_flag');
const flagKind = flag => [flag.code, flag.section ?? '–', flag.reason ?? '–'].join('\t');
lines.push('## Response flags', '', flags.length === 0 ? 'None.' : table(['Code', 'Section', 'Reason', 'Flags', 'Max received'], [...countBy(flags, flagKind)]
  .sort((a, b) => b[1] - a[1])
  .map(([kind, n]) => {
    const received = flags.filter(flag => flagKind(flag) === kind && Number.isFinite(flag.received)).map(flag => flag.received);
    return [...kind.split('\t'), n, received.length ? Math.max(...received) : '–'];
  })), '', 'Topics left without a section carry `section-missing`; `content-dropped`, `word-family-merged` and `speaker-repeated` are English repairs.', '');

process.stdout.write(lines.join('\n'));
