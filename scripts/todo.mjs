#!/usr/bin/env node
// Todo ledger tool for docs/todo. Run from anywhere inside the repository.
//
//   node scripts/todo.mjs add --ledger <ledger> [--section <path> [--create]] --slug <slug> --title <title> --description <row>
//        --summary <line> --what <text> --why <text> --done <text> [--open <text>] [--status open] [--date YYYY-MM-DD]
//   node scripts/todo.mjs add --ledger <ledger> [--section <path> [--create]] --record <slug> --description <row>
//        [--status open] [--date YYYY-MM-DD]
//   node scripts/todo.mjs move --from <ledger> --slug <slug> --to <ledger> [--section <path> [--create]]
//   node scripts/todo.mjs milestone --slug <slug> --title <title> --summary <line> --description <text after the bold title>
//        --intro <text> [--status planned] [--date YYYY-MM-DD]
//   node scripts/todo.mjs milestone --launch "<Adjective Insect>" [--slug <slug>] --summary <line> --description <text>
//        --intro <text> [--status planned] [--date YYYY-MM-DD]
//
// <ledger> is a ledger page under docs/todo without `.md`, for example `backlog` or `antsy-aphid`.
// --section names a heading on the ledger page whose table receives the row: `Future work` is `## Future work`,
// `Client/Web` is `### Web` inside `## Client`. --create adds missing headings and their table (a new `##` goes
// before `## Notes`). Without --section the row goes into the table above the page's first section.
// --record adds a task row linking an existing record of the ledger, for subsections whose rows share one record.
// move carries every row linking the record. --launch names a launch milestone `Launch: <name>` (slug from the
// name), checks that the name alliterates and takes the next letter after the index's last launch, and scaffolds
// the standard launch sections.
// Every command finishes by running `node scripts/check-docs.mjs --fix` and exits non-zero if it fails.
// Conventions are in docs/wiki.md; the procedure that uses this tool is docs/skills/ajw_log_todo.md.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { parseFrontmatter, scalar } from './lib/frontmatter.mjs';

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

const frontmatter = text => parseFrontmatter(text)?.data ?? {};

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

const isLaunch = title => title.startsWith('Launch: ');
const partOf = l => {
  if (l.name === 'backlog') return `Part of the [${proseTitle(l.title)}](../${l.name}.md).`;
  if (isLaunch(l.title)) return `Part of [${l.title}](../${l.name}.md).`;
  return `Part of the [${proseTitle(l.title)}](../${l.name}.md) milestone.`;
};

const TABLE_HEAD = ['| Date | Status | Description | Details |', '|---|---|---|---|'];
// Standard sections of a launch milestone page, in order; `## Notes` (no table) always comes last.
const LAUNCH_SECTIONS = ['Client/Web', 'Client/iOS', 'API + Server', 'Launch', 'Product + legal'];

const headingLevel = l => /^(#{1,6}) /.exec(l)?.[1].length;

// Line range [lo, hi) of the heading named by `parts` (`## parts[0]`, then `### parts[1]` inside it);
// `missing` is the index of the first part that does not exist, with the range of its parent.
function locate(lines, parts) {
  let lo = 0;
  let hi = lines.length;
  for (const [n, name] of parts.entries()) {
    const level = n + 2;
    const at = lines.findIndex((l, i) => i >= lo && i < hi && l.trim() === `${'#'.repeat(level)} ${name}`);
    if (at < 0) return { missing: n, lo, hi };
    const end = lines.findIndex((l, i) => i > at && i < hi && (headingLevel(l) ?? 9) <= level);
    lo = at;
    hi = end < 0 ? hi : end;
  }
  return { lo, hi };
}

function sectionParts(section) {
  if (section === undefined) return [];
  const parts = section.split('/').map(p => p.trim());
  if (parts.some(p => !p) || parts.length > 2) fail('--section is "Section" or "Section/Subsection"');
  return parts;
}

// Add headings (and a table under the last one) for the parts of `section` from `missing` on, at the end of the
// parent's range; a new `##` section goes before `## Notes`.
function createSection(lines, parts, { missing, hi }) {
  let pos = hi;
  const notes = lines.findIndex(l => l.trim() === '## Notes');
  if (missing === 0 && notes >= 0) pos = notes;
  while (pos > 0 && !lines[pos - 1].trim()) pos--;
  const block = parts.slice(missing).flatMap((p, k) => ['', `${'#'.repeat(missing + k + 2)} ${p}`]);
  const added = [...block, '', ...TABLE_HEAD];
  lines.splice(pos, 0, ...added);
  const after = pos + added.length;
  if (after < lines.length && lines[after].trim()) lines.splice(after, 0, '');
}

// Insert a row as the first data row (newest first) of the table directly under the section heading, or of the
// table above the page's first section when no section is given.
function insertRow(text, row, file, section, create = false) {
  const lines = text.split('\n');
  const parts = sectionParts(section);
  const found = locate(lines, parts);
  if (found.missing !== undefined) {
    const name = `"${parts.slice(0, found.missing + 1).join('/')}"`;
    if (!create) fail(`${file} has no ${name} section; pass --create to add it`);
    createSection(lines, parts, found);
    console.log(`created section ${name} in ${file}`);
    return insertRow(lines.join('\n'), row, file, section);
  }
  const start = parts.length ? found.lo + 1 : lines.findIndex(l => /^# /.test(l)) + 1;
  let stop = lines.findIndex((l, i) => i >= start && headingLevel(l));
  if (stop < 0) stop = lines.length;
  const header = lines.findIndex((l, i) => i >= start && i < stop && LEDGER_HEADER.test(l));
  if (header < 0 || !/^\|[\s:|-]+\|?\s*$/.test(lines[header + 1] ?? '')) {
    fail(parts.length ? `${file}: "${section}" has no ledger table directly under it` : `${file} has no ledger table above its first section; pass --section`);
  }
  lines.splice(header + 2, 0, row);
  return lines.join('\n');
}

// Pad the first ledger table's cells so its columns line up in the source (the index is kept aligned).
function alignTable(text) {
  const lines = text.split('\n');
  const start = lines.findIndex(l => LEDGER_HEADER.test(l));
  let end = start;
  while (lines[end]?.startsWith('|')) end++;
  const rows = lines.slice(start, end).map(l => l.trim().slice(1, -1).split('|').map(c => c.trim()));
  const widths = rows[0].map((_, i) => Math.max(...rows.map(r => (r[i] ?? '').length)));
  const out = rows.map((r, n) => `| ${widths.map((w, i) => (n === 1 ? '-'.repeat(w) : (r[i] ?? '').padEnd(w))).join(' | ')} |`);
  lines.splice(start, end - start, ...out);
  return lines.join('\n');
}

// Remove every row linking `detailsTarget`, in page order.
function removeRows(text, detailsTarget, file) {
  const lines = text.split('\n');
  const rows = lines.filter(l => l.startsWith('|') && l.includes(`](${detailsTarget})`));
  if (!rows.length) fail(`${file}: no row links ${detailsTarget}`);
  return { text: lines.filter(l => !rows.includes(l)).join('\n'), rows };
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
const SECTION = { section: { type: 'string' }, create: { type: 'boolean' } };
const RECORD_FIELDS = ['slug', 'title', 'summary', 'what', 'why', 'done', 'open'];

function add(argv) {
  const { values: v } = parseArgs({
    args: argv,
    options: { ...COMMON, ...SECTION, ledger: { type: 'string' }, record: { type: 'string' }, slug: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, summary: { type: 'string' }, what: { type: 'string' }, why: { type: 'string' }, done: { type: 'string' }, open: { type: 'string' } },
  });
  const l = ledger(v.ledger);
  const status = v.status ?? 'open';
  const date = v.date ?? localDate();
  if (!l.statuses.includes(status)) fail(`--status must be one of ${l.statuses.join(', ')}`);
  if (!DATE.test(date)) fail('--date must be YYYY-MM-DD');
  const description = line('description', v.description, { cell: true });

  if (v.record !== undefined) {
    const given = RECORD_FIELDS.filter(k => v[k] !== undefined);
    if (given.length) fail(`--record links an existing record; drop ${given.map(k => `--${k}`).join(', ')}`);
    const slug = slugArg('record', v.record);
    const record = join(TODO, l.name, `${slug}.md`);
    if (!existsSync(record)) fail(`${rel(record)} does not exist`);
    writeFileSync(l.path, insertRow(l.text, `| ${date} | ${status} | ${description} | [details](${l.name}/${slug}.md) |`, rel(l.path), v.section, v.create));
    console.log(`added a row linking ${rel(record)} in ${rel(l.path)}`);
    checkDocs();
    return;
  }

  const slug = slugArg('slug', v.slug);
  const fields = {
    title: line('title', v.title), summary: line('summary', v.summary),
    what: line('what', v.what), why: line('why', v.why), done: line('done', v.done),
    open: v.open === undefined ? undefined : line('open', v.open),
  };
  const record = join(TODO, l.name, `${slug}.md`);
  if (existsSync(record)) fail(`${rel(record)} already exists`);

  const body = [
    '---', 'kind: record', 'status: current', `summary: ${scalar(fields.summary)}`, `verified: ${date}`, '---', '',
    `# ${fields.title}`, '', partOf(l), '',
    `- **What:** ${fields.what}`, `- **Why:** ${fields.why}`,
    ...(fields.open ? [`- **Open questions:** ${fields.open}`] : []),
    `- **Done when:** ${fields.done}`, '',
  ].join('\n');
  const updated = insertRow(l.text, `| ${date} | ${status} | ${description} | [details](${l.name}/${slug}.md) |`, rel(l.path), v.section, v.create);

  mkdirSync(dirname(record), { recursive: true });
  writeFileSync(record, body);
  writeFileSync(l.path, updated);
  console.log(`added ${rel(record)} and its row in ${rel(l.path)}`);
  checkDocs();
}

function move(argv) {
  const { values: v } = parseArgs({ args: argv, options: { ...SECTION, from: { type: 'string' }, to: { type: 'string' }, slug: { type: 'string' } } });
  const from = ledger(v.from);
  const to = ledger(v.to);
  if (from.name === to.name) fail('--from and --to are the same ledger');
  const slug = slugArg('slug', v.slug);
  const oldAbs = join(TODO, from.name, `${slug}.md`);
  const newAbs = join(TODO, to.name, `${slug}.md`);
  if (!existsSync(oldAbs)) fail(`${rel(oldAbs)} does not exist`);
  if (existsSync(newAbs)) fail(`${rel(newAbs)} already exists`);

  const { text: fromText, rows } = removeRows(from.text, `${from.name}/${slug}.md`, rel(from.path));
  const movedRows = rows.map(row => {
    const cells = row.slice(1, row.trimEnd().length - 1).split('|').map(c => c.trim());
    if (!to.statuses.includes(cells[1])) fail(`status "${cells[1]}" is not valid in ${rel(to.path)} (${to.statuses.join(', ')})`);
    return `| ${cells[0]} | ${cells[1]} | ${cells[2]} | [details](${to.name}/${slug}.md) |`;
  });

  // The record's own links: the source ledger becomes the destination ledger; everything else is re-relativized.
  let record = read(oldAbs).replace(new RegExp(`Part of (?:the )?\\[[^\\]]*\\]\\(\\.\\./${from.name}\\.md\\)(?: milestone)?\\.`), partOf(to));
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
  // Inserting each row at the top, last first, keeps the rows in their original order.
  let toText = retarget(to.text, dirname(to.path), oldAbs, newAbs);
  for (const row of movedRows.toReversed()) toText = insertRow(toText, row, rel(to.path), v.section, v.create);
  writeFileSync(to.path, toText);
  for (const [f, text] of rewrites) writeFileSync(f, text);
  if (!readdirSync(dirname(oldAbs)).length) rmdirSync(dirname(oldAbs));

  console.log(`moved ${rel(oldAbs)} -> ${rel(newAbs)}`);
  for (const [f] of rewrites) console.log(`relinked ${rel(f)}`);
  checkDocs();
}

function milestone(argv) {
  const { values: v } = parseArgs({
    args: argv,
    options: { ...COMMON, slug: { type: 'string' }, title: { type: 'string' }, launch: { type: 'string' }, summary: { type: 'string' }, description: { type: 'string' }, intro: { type: 'string' } },
  });
  const index = read(INDEX);
  let title;
  let slug;
  if (v.launch !== undefined) {
    if (v.title !== undefined) fail('--launch sets the title; omit --title');
    const name = line('launch', v.launch, { cell: true });
    const words = name.split(/\s+/);
    if (words.length !== 2 || words.some(w => !/^[A-Z][a-z]+$/.test(w)) || words[0][0] !== words[1][0]) {
      fail('--launch is an alliterative adjective and insect, two capitalized words with the same initial, for example "Antsy Aphid"');
    }
    const used = [...index.matchAll(/\*\*Launch: ([A-Z])[a-z]+ [A-Z][a-z]+\*\*/g)].map(m => m[1].charCodeAt(0));
    const next = String.fromCharCode(used.length ? Math.max(...used) + 1 : 'A'.charCodeAt(0));
    if (words[0][0] !== next) fail(`the next launch name starts with "${next}"`);
    title = `Launch: ${name}`;
    slug = slugArg('slug', v.slug ?? name.toLowerCase().replace(/\s+/, '-'));
  } else {
    title = line('title', v.title, { cell: true });
    if (isLaunch(title)) fail('name launch milestones with --launch');
    slug = slugArg('slug', v.slug);
  }
  const path = join(TODO, `${slug}.md`);
  if (slug === 'index' || existsSync(path)) fail(`${rel(path)} already exists`);
  const statuses = frontmatter(index).statuses ?? [];
  const status = v.status ?? 'planned';
  const date = v.date ?? localDate();
  if (!statuses.includes(status)) fail(`--status must be one of ${statuses.join(', ')}`);
  if (!DATE.test(date)) fail('--date must be YYYY-MM-DD');
  const f = { summary: line('summary', v.summary), description: line('description', v.description, { cell: true }), intro: line('intro', v.intro) };

  const lines = [
    '---', 'kind: ledger', 'status: current', `summary: ${scalar(f.summary)}`, `verified: ${date}`, 'statuses: [open, in-progress, blocked, done]', '---', '',
    `# ${title}`, '', f.intro, '',
    ...(v.launch !== undefined ? ['## Notes', ''] : [...TABLE_HEAD, '']),
  ];
  if (v.launch !== undefined) for (const s of LAUNCH_SECTIONS) {
    const parts = sectionParts(s);
    const found = locate(lines, parts);
    if (found.missing !== undefined) createSection(lines, parts, found);
  }
  const row = `| ${date} | ${status} | **${title}**<br>${f.description} | [details](${slug}.md) |`;
  const updatedIndex = alignTable(insertRow(index, row, rel(INDEX)));

  writeFileSync(path, lines.join('\n'));
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
