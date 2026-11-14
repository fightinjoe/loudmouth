#!/usr/bin/env node
// Measured API cost per call and per phrasebook, and the per-user cost model built on it. Reads the API's
// `usage` events (one per finished request, `costUsd` from provider-reported charges or api/src/pricing.js)
// and joins /phrasebook usage to `phrasebook_ok` by requestId for language, topic and card counts.
//
//   node scripts/cost-report.mjs [--since 30d] [--project <id>] [--service translation-api]
//   node scripts/cost-report.mjs --file <events.jsonl>
//
// Model assumptions (defaults are the owner's 2026-11-13 estimates, docs/todo/public-launch/business-model.md):
//   --cjk-share 40         percent of phrasebooks in Japanese or Chinese
//   --abandon 20           percent of started creations never saved (charged in full)
//   --breakdowns 10        phrase breakdowns opened per phrasebook
//   --per-month 5          phrasebooks per active user-month
//   --trip-share 80        percent of users active for one month only; the rest are active every month
// Output is Markdown on stdout.
import { parseArgs } from 'node:util';
import { logSourceOptions, percentile, readEvents, sourceLine, table } from './lib/log-events.mjs';

const { values: args } = parseArgs({
  options: {
    since: { type: 'string', default: '30d' },
    ...logSourceOptions,
    'cjk-share': { type: 'string', default: '40' },
    abandon: { type: 'string', default: '20' },
    breakdowns: { type: 'string', default: '10' },
    'per-month': { type: 'string', default: '5' },
    'trip-share': { type: 'string', default: '80' },
  },
});
const number = name => {
  const value = Number(args[name]);
  if (!Number.isFinite(value) || value < 0) throw new Error(`--${name} must be a nonnegative number`);
  return value;
};
const cjkShare = number('cjk-share') / 100;
const abandon = number('abandon') / 100;
const breakdowns = number('breakdowns');
const perMonth = number('per-month');
const tripShare = number('trip-share') / 100;
if (abandon >= 1) throw new Error('--abandon must be below 100');

const usd = value => (value == null ? '–' : `$${value < 0.01 ? value.toFixed(4) : value.toFixed(3)}`);
const mean = values => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);
const priced = events => events.map(event => event.costUsd).filter(cost => typeof cost === 'number' && Number.isFinite(cost));

const events = readEvents(args);
const usage = events.filter(event => event.event === 'usage');
const lines = ['# Cost report', '', sourceLine(args), ''];

// Per call: every usage event, failed /phrasebook requests (`phrasebook:failed`) included as their own row.
const routes = Map.groupBy(usage, event => event.route);
lines.push('## Cost per call', '', table(['Route', 'Calls', 'Priced', 'Mean', 'p50', 'p90', 'Max', 'Total'], [...routes]
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(([route, list]) => {
    const costs = priced(list);
    const at = p => (costs.length ? percentile(costs, p) : null);
    return [`\`${route}\``, list.length, costs.length, usd(mean(costs)), usd(at(0.5)), usd(at(0.9)), usd(at(1)), usd(costs.reduce((sum, cost) => sum + cost, 0))];
  })), '', 'Unpriced calls (`costUsd: null`) are excluded from the cost columns.', '');

// Per phrasebook by language: successful /phrasebook usage joined to its phrasebook_ok event.
const ok = new Map(events.filter(event => event.event === 'phrasebook_ok').map(event => [event.requestId, event]));
const books = usage
  .filter(event => event.route === 'phrasebook' && typeof event.costUsd === 'number' && ok.has(event.requestId))
  .map(event => ({ cost: event.costUsd, ...ok.get(event.requestId) }));
const isCjk = book => book.language === 'ja' || book.language === 'zh';
lines.push('## /phrasebook cost by language', '', books.length === 0 ? 'No priced phrasebooks.' : table(
  ['Language', 'Phrasebooks', 'Mean cost', 'Mean topics', 'Cost per topic', 'Mean cards'],
  [...Map.groupBy(books, book => book.language)].sort((a, b) => a[0].localeCompare(b[0])).map(([language, list]) => [
    language, list.length, usd(mean(list.map(book => book.cost))), mean(list.map(book => book.groups)).toFixed(1),
    usd(mean(list.map(book => book.cost / book.groups))), Math.round(mean(list.map(book => book.cards))),
  ]),
), '', 'Topics are every generated topic, including ones the learner drops before saving.', '');

// Model: creation = context + title + image + phrasebook (weighted CJK/other), divided by the saved share,
// plus breakdowns. Any missing measured input leaves the model unavailable rather than guessed.
const routeMean = route => mean(priced(routes.get(route) ?? []));
const inputs = {
  '/context': routeMean('context'),
  '/phrasebook-title': routeMean('phrasebook-title'),
  '/phrasebook-image': routeMean('phrasebook-image'),
  '/phrasebook, ja or zh': mean(books.filter(isCjk).map(book => book.cost)),
  '/phrasebook, es, cs or uk': mean(books.filter(book => !isCjk(book)).map(book => book.cost)),
  '/phrase-breakdown': routeMean('phrase-breakdown'),
};
const missing = Object.entries(inputs).filter(([, value]) => value == null).map(([name]) => `\`${name}\``);
lines.push('## Cost model', '', `Assumptions: ${cjkShare * 100}% Japanese or Chinese, ${abandon * 100}% of creations abandoned and charged in full, ${breakdowns} breakdowns per phrasebook, ${perMonth} phrasebooks per active month, ${tripShare * 100}% one-month users.`, '');
if (missing.length) {
  lines.push(`No measured cost for ${missing.join(', ')}; the model needs every input.`, '');
} else {
  const shared = inputs['/context'] + inputs['/phrasebook-title'] + inputs['/phrasebook-image'];
  const creation = shared + cjkShare * inputs['/phrasebook, ja or zh'] + (1 - cjkShare) * inputs['/phrasebook, es, cs or uk'];
  const saved = creation / (1 - abandon);
  const breakdownCost = breakdowns * inputs['/phrase-breakdown'];
  const phrasebook = saved + breakdownCost;
  const month = perMonth * phrasebook;
  lines.push(table(['Unit', 'Cost'], [
    ...Object.entries(inputs).map(([name, value]) => [`Mean \`${name}\``, usd(value)]),
    ['One creation, language mix', usd(creation)],
    ['Per saved phrasebook, abandoned creations included', usd(saved)],
    [`${breakdowns} breakdowns`, usd(breakdownCost)],
    ['**One phrasebook, all-in**', `**${usd(phrasebook)}**`],
    ['**Active user-month**', `**${usd(month)}**`],
    ['Per acquired user, first year', usd(tripShare * month + (1 - tripShare) * 12 * month)],
  ]), '', 'Model and image calls only; hosting is not in the logs.', '');
}

process.stdout.write(lines.join('\n'));
