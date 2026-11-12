#!/usr/bin/env node
// Todo ledger tool for docs/todo. Run from anywhere inside the repository.
//
//   node scripts/todo.mjs add --ledger <ledger> --slug <slug> --title <title> --description <row>
//        --summary <line> --what <text> --why <text> --done <text> [--open <text>] [--status open] [--date YYYY-MM-DD]
//   node scripts/todo.mjs move --from <ledger> --slug <slug> --to <ledger>
//   node scripts/todo.mjs milestone --slug <slug> --title <title> --summary <line> --description <row>
//        --intro <text> [--status planned] [--date YYYY-MM-DD]
//
// <ledger> is a ledger page under docs/todo without `.md`, for example `backlog` or `v4-release`.
// Every command finishes by running `node scripts/check-docs.mjs --fix` and exits non-zero if it fails.
// Conventions are in docs/wiki.md; the procedure that uses this tool is docs/skills/ajw_log_todo.md.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const TODO = join(ROOT, 'docs/todo');
const INDEX = join(TODO, 'index.md');
const LEDGER_HEADER = /^\|\s*Date\s*\|\s*Status\s*\|\s*Description\s*\|(\s*Details\s*\|)?\s*$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

class UsageError extends Error {}
const fail = msg => { throw new UsageError(msg); };
const read = p => readFileSync(p, 'utf8');
const rel = p => relative(ROOT, p);

function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// One-line text only: the wiki forbids hard wraps, and table cells cannot hold `|`.
function line(name, value, { cell = false } = {}) {
  if (value === undefined || !value.trim()) fail(`--${name} is required`);
  if (/[\r\n]/.test(value)) fail(`--${name} must be a single line`);
  if (cell && value.includes('|')) fail(`--${name} cannot contain "|" (it is a table cell)`);
  return value.trim();
}

function slugArg(name, value) {
  if (!value || !SLUG.test(value)) fail(`--${name} must be lowercase kebab-case`);
  return value;
}

function frontmatter(text) {
  const end = text.startsWith('---\n') ? text.indexOf('\n---', 4) : -1;
  if (end < 0) return {};
  const data = {};
  for (const l of text.slice(4, end).split('\n')) {
    const m = l.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (!m) continue;
    const v = m[2].trim();
    data[m[1]] = v.startsWith('[') && v.endsWith(']') ? v.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean) : v;
  }
  return data;
}

function ledger(name) {
  const path = join(TODO, `${slugArg('ledger', name)}.md`);
  if (name === 'index' || !existsSync(path)) fail(`no ledger docs/todo/${name}.md`);
  const text = read(path);
  const fm = frontmatter(text);
  if (fm.kind !== 'ledger') fail(`docs/todo/${name}.md is not a ledger`);
  const h1 = text.match(/^# (.+)$/m)?.[1];
  if (!h1) fail(`docs/todo/${name}.md has no title`);
  return { name, path, text, statuses: fm.statuses ?? [], title: h1 };
}

// Prose form of a page title: "Public launch" -> "public launch", acronyms kept ("API protection").
const proseTitle = t => (/^[A-Z][a-z]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t);

const partOf = l => (l.name === 'backlog'
  ? `Part of the [${proseTitle(l.title)}](../${l.name}.md).`
  : `Part of the [${proseTitle(l.title)}](../${l.name}.md) milestone.`);

// Insert a row as the first data row of the page's first ledger table (newest first).
function insertRow(text, row, file) {
  const lines = text.split('\n');
  const header = lines.findIndex(l => LEDGER_HEADER.test(l));
  if (header < 0 || !/^\|[\s:|-]+\|?\s*$/.test(lines[header + 1] ?? '')) fail(`${file} has no ledger table`);
  lines.splice(header + 2, 0, row);
  return lines.join('\n');
}

function removeRow(text, detailsTarget, file) {
  const lines = text.split('\n');
  const hits = lines.flatMap((l, i) => (l.startsWith('|') && l.includes(`](${detailsTarget})`) ? [i] : []));
  if (hits.length !== 1) fail(`${file}: expected one row linking ${detailsTarget}, found ${hits.length}`);
  const [row] = lines.splice(hits[0], 1);
  return { text: lines.join('\n'), row };
}

function markdownFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = join(dir, e.name);
    return e.isDirectory() ? markdownFiles(p) : e.name.endsWith('.md') ? [p] : [];
  });
}

const LINK = /\]\(([^)\s]+)\)/g;
const isLocal = target => !/^[a-z][a-z0-9+.-]*:/i.test(target) && !target.startsWith('#');

// Rewrite every relative Markdown link in `text` (a file at `fromFile`) whose target resolves to `oldAbs`.
function retarget(text, fromDir, oldAbs, newAbs, newFromDir = fromDir) {
  return text.replace(LINK, (whole, target) => {
    if (!isLocal(target)) return whole;
    const [path, anchor] = target.split(/(?=#)/);
    if (resolve(fromDir, path) !== oldAbs) return whole;
    return `](${relative(newFromDir, newAbs)}${anchor ?? ''})`;
  });
}

function checkDocs() {
  try {
    execFileSync('node', [join(ROOT, 'scripts/check-docs.mjs'), '--fix'], { cwd: ROOT, stdio: 'inherit' });
  } catch {
    process.exitCode = 1;
  }
}

const COMMON = { date: { type: 'string' }, status: { type: 'string' } };

function add(argv) {
  const { values: v } = parseArgs({
    args: argv,
    options: { ...COMMON, ledger: { type: 'string' }, slug: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, summary: { type: 'string' }, what: { type: 'string' }, why: { type: 'string' }, done: { type: 'string' }, open: { type: 'string' } },
  });
  const l = ledger(v.ledger);
  const slug = slugArg('slug', v.slug);
  const status = v.status ?? 'open';
  const date = v.date ?? localDate();
  if (!l.statuses.includes(status)) fail(`--status must be one of ${l.statuses.join(', ')}`);
  if (!DATE.test(date)) fail('--date must be YYYY-MM-DD');
  const fields = {
    title: line('title', v.title), description: line('description', v.description, { cell: true }), summary: line('summary', v.summary),
    what: line('what', v.what), why: line('why', v.why), done: line('done', v.done),
    open: v.open === undefined ? undefined : line('open', v.open),
  };
  const record = join(TODO, l.name, `${slug}.md`);
  if (existsSync(record)) fail(`${rel(record)} already exists`);

  const body = [
    '---', 'kind: record', 'status: current', `summary: ${fields.summary}`, `verified: ${date}`, '---', '',
    `# ${fields.title}`, '', partOf(l), '',
    `- **What:** ${fields.what}`, `- **Why:** ${fields.why}`,
    ...(fields.open ? [`- **Open questions:** ${fields.open}`] : []),
    `- **Done when:** ${fields.done}`, '',
  ].join('\n');
  const updated = insertRow(l.text, `| ${date} | ${status} | ${fields.description} | [details](${l.name}/${slug}.md) |`, rel(l.path));

  mkdirSync(dirname(record), { recursive: true });
  writeFileSync(record, body);
  writeFileSync(l.path, updated);
  console.log(`added ${rel(record)} and its row in ${rel(l.path)}`);
  checkDocs();
}

function move(argv) {
  const { values: v } = parseArgs({ args: argv, options: { from: { type: 'string' }, to: { type: 'string' }, slug: { type: 'string' } } });
  const from = ledger(v.from);
  const to = ledger(v.to);
  if (from.name === to.name) fail('--from and --to are the same ledger');
  const slug = slugArg('slug', v.slug);
  const oldAbs = join(TODO, from.name, `${slug}.md`);
  const newAbs = join(TODO, to.name, `${slug}.md`);
  if (!existsSync(oldAbs)) fail(`${rel(oldAbs)} does not exist`);
  if (existsSync(newAbs)) fail(`${rel(newAbs)} already exists`);

  const { text: fromText, row } = removeRow(from.text, `${from.name}/${slug}.md`, rel(from.path));
  const cells = row.slice(1, row.trimEnd().length - 1).split('|').map(c => c.trim());
  if (!to.statuses.includes(cells[1])) fail(`status "${cells[1]}" is not valid in ${rel(to.path)} (${to.statuses.join(', ')})`);
  const movedRow = `| ${cells[0]} | ${cells[1]} | ${cells[2]} | [details](${to.name}/${slug}.md) |`;

  // The record's own links: the source ledger becomes the destination ledger; everything else is re-relativized.
  let record = read(oldAbs).replace(new RegExp(`\\[[^\\]]*\\]\\(\\.\\./${from.name}\\.md\\)( milestone)?`), partOf(to).slice('Part of the '.length, -1));
  record = record.replace(LINK, (whole, target) => {
    if (!isLocal(target)) return whole;
    const [path, anchor] = target.split(/(?=#)/);
    const abs = resolve(dirname(oldAbs), path);
    return `](${relative(dirname(newAbs), abs === oldAbs ? newAbs : abs)}${anchor ?? ''})`;
  });

  const others = markdownFiles(join(ROOT, 'docs')).filter(f => f !== oldAbs && f !== from.path && f !== to.path);
  const rewrites = [];
  for (const f of others) {
    const before = read(f);
    const after = retarget(before, dirname(f), oldAbs, newAbs);
    if (after !== before) rewrites.push([f, after]);
  }

  mkdirSync(dirname(newAbs), { recursive: true });
  renameSync(oldAbs, newAbs);
  writeFileSync(newAbs, record);
  writeFileSync(from.path, retarget(fromText, dirname(from.path), oldAbs, newAbs));
  writeFileSync(to.path, insertRow(retarget(to.text, dirname(to.path), oldAbs, newAbs), movedRow, rel(to.path)));
  for (const [f, text] of rewrites) writeFileSync(f, text);
  if (!readdirSync(dirname(oldAbs)).length) rmdirSync(dirname(oldAbs));

  console.log(`moved ${rel(oldAbs)} -> ${rel(newAbs)}`);
  for (const [f] of rewrites) console.log(`relinked ${rel(f)}`);
  checkDocs();
}

function milestone(argv) {
  const { values: v } = parseArgs({
    args: argv,
    options: { ...COMMON, slug: { type: 'string' }, title: { type: 'string' }, summary: { type: 'string' }, description: { type: 'string' }, intro: { type: 'string' } },
  });
  const slug = slugArg('slug', v.slug);
  const path = join(TODO, `${slug}.md`);
  if (slug === 'index' || existsSync(path)) fail(`${rel(path)} already exists`);
  const index = read(INDEX);
  const statuses = frontmatter(index).statuses ?? [];
  const status = v.status ?? 'planned';
  const date = v.date ?? localDate();
  if (!statuses.includes(status)) fail(`--status must be one of ${statuses.join(', ')}`);
  if (!DATE.test(date)) fail('--date must be YYYY-MM-DD');
  const f = {
    title: line('title', v.title), summary: line('summary', v.summary),
    description: line('description', v.description, { cell: true }), intro: line('intro', v.intro),
  };

  const page = [
    '---', 'kind: ledger', 'status: current', `summary: ${f.summary}`, `verified: ${date}`, 'statuses: [open, in-progress, blocked, done]', '---', '',
    `# ${f.title}`, '', f.intro, '',
    '| Date | Status | Description | Details |', '|---|---|---|---|', '',
  ].join('\n');
  const updatedIndex = insertRow(index, `| ${date} | ${status} | ${f.description} | [details](${slug}.md) |`, rel(INDEX));

  writeFileSync(path, page);
  writeFileSync(INDEX, updatedIndex);
  console.log(`created ${rel(path)} and its row in ${rel(INDEX)}`);
  checkDocs();
}

const COMMANDS = { add, move, milestone };
const [command, ...rest] = process.argv.slice(2);
try {
  if (!COMMANDS[command]) fail(`usage: node scripts/todo.mjs <${Object.keys(COMMANDS).join('|')}> [options]; see the header of scripts/todo.mjs`);
  COMMANDS[command](rest);
} catch (e) {
  if (!(e instanceof UsageError) && !e.code?.startsWith('ERR_PARSE_ARGS')) throw e;
  console.error(`todo: ${e.message}`);
  process.exitCode = 2;
}
