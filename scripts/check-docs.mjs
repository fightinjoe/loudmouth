#!/usr/bin/env node
// Wiki health check. Run from anywhere: `node scripts/check-docs.mjs [--fix]`.
// Errors fail the run; warnings (stale `verified` dates) do not. `--fix` regenerates docs/index.md and repairs what it can: hard wraps, header quoting and generated parts of docs/todo pages.
// Conventions checked here are documented in docs/wiki.md.
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize, relative, resolve, sep } from 'node:path';
import { parseFrontmatter as frontmatter, quoteFrontmatter } from './lib/frontmatter.mjs';

const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const FIX = process.argv.includes('--fix');
const errors = [];
const warnings = [];
const err = (file, msg) => errors.push(`${file}: ${msg}`);
const warn = (file, msg) => warnings.push(`${file}: ${msg}`);

const KINDS = ['index', 'brief', 'spec', 'guide', 'rules', 'ledger', 'record', 'proposal', 'skill'];
const STATUSES = ['current', 'proposal', 'disabled'];
const MD_OUTSIDE_DOCS = [/^AGENTS\.md$/, /^README\.md$/, /^\.agents\/skills\/[^/]+\/SKILL\.md$/, /^\.agents\/commands\/[^/]+\.md$/];
const WORKTREE_SKILLS = ['add_worktree', 'commit_worktree', 'finalize_worktree', 'merge_worktree'];
// Backticked paths may be written relative to the doc, the repo root, or one of these package roots.
const PATH_ROOTS = ['', 'api', 'api/src', 'web/app', 'web/app/src', 'evals', 'ios'];
const PATH_EXTENSIONS = new Set(['.md', '.html', '.js', '.mjs', '.ts', '.json', '.txt', '.py', '.sh', '.yaml', '.yml', '.css', '.swift']);
const INDEX = 'docs/index.md';

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
// During a merge conflict ls-files lists an unmerged path once per stage; count each path once.
const files = [...new Set(git('ls-files', '-co', '--exclude-standard').split('\n'))].filter(f => f && existsSync(join(ROOT, f)));
const read = f => readFileSync(join(ROOT, f), 'utf8');
const exists = f => existsSync(join(ROOT, f));
const isIgnored = f => { try { execFileSync('git', ['check-ignore', '-q', f], { cwd: ROOT, stdio: 'ignore' }); return true; } catch { return false; } };

// ---------- parsing helpers ----------

// Strip fenced code blocks, keeping line numbers stable.
const stripFences = text => text.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, block => block.replace(/[^\n]/g, ''));

function slug(heading) {
  return heading
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[`*~]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

const anchorCache = new Map();
function anchors(file) {
  if (anchorCache.has(file)) return anchorCache.get(file);
  const text = read(file);
  const set = new Set();
  if (file.endsWith('.md')) {
    const seen = new Map();
    for (const line of stripFences(text).split('\n')) {
      const m = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
      if (!m) continue;
      const base = slug(m[1]);
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      set.add(n ? `${base}-${n}` : base);
    }
  }
  for (const m of text.matchAll(/\s(?:id|name)="([^"]+)"/g)) set.add(m[1]);
  anchorCache.set(file, set);
  return set;
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

// ---------- 0. no hard-wrapped prose ----------
// Each paragraph, list item and blockquote paragraph is one source line; viewers wrap it.
// Fenced code, tables, headings, HTML, rules and link definitions are left as written.
const FENCE = /^\s*(```|~~~)/;
const isList = l => /^\s*([-*+]|\d+[.)])\s+/.test(l);
const isQuote = l => /^\s*>/.test(l);
const isRaw = l => /^\s*\|/.test(l) || /^\s{0,3}#{1,6}\s/.test(l) || /^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(l)
  || /^\s*</.test(l) || /^\s{0,3}\[[^\]]+\]:\s/.test(l);
const hardBreak = l => / {2}$|\\$/.test(l);
function unwrap(text) {
  const lines = text.split('\n');
  const out = [];
  let i = 0;
  if (lines[0] === '---') { // frontmatter
    const end = lines.indexOf('---', 1);
    if (end > 0) { out.push(...lines.slice(0, end + 1)); i = end + 1; }
  }
  let fence = null;
  let joinable = false; // previous output line is prose that may continue
  for (; i < lines.length; i++) {
    const line = lines[i];
    const f = line.match(FENCE);
    if (fence) { out.push(line); if (f && f[1] === fence) fence = null; continue; }
    if (f) { fence = f[1]; out.push(line); joinable = false; continue; }
    if (!line.trim() || isRaw(line)) { out.push(line); joinable = false; continue; }
    const prev = out[out.length - 1];
    if (joinable && !hardBreak(prev) && !isList(line)) {
      if (isQuote(line) && isQuote(prev)) {
        const content = line.replace(/^\s*>\s?/, '');
        if (content.trim() && !isList(content) && !isRaw(content)) { out[out.length - 1] = `${prev.trimEnd()} ${content.trim()}`; continue; }
      } else if (!isQuote(line) && !isQuote(prev)) {
        out[out.length - 1] = `${prev.trimEnd()} ${line.trim()}`;
        continue;
      }
    }
    out.push(line);
    joinable = true;
  }
  return out.join('\n');
}
const prose = files.filter(f => f.endsWith('.md') && (f.startsWith('docs/') || MD_OUTSIDE_DOCS.some(r => r.test(f))));
for (const f of prose) {
  let text = read(f);
  const quoted = quoteFrontmatter(text);
  if (quoted !== text && FIX) { writeFileSync(join(ROOT, f), quoted); console.log(`quoted header values in ${f}`); text = quoted; }
  for (const p of frontmatter(text)?.problems ?? []) err(f, p);
  const fixed = unwrap(text);
  if (fixed === text) continue;
  if (FIX) { writeFileSync(join(ROOT, f), fixed); console.log(`unwrapped ${f}`); continue; }
  const a = text.split('\n'), b = fixed.split('\n');
  let n = 0;
  while (n < b.length && a[n] === b[n]) n++;
  err(f, `line ${n + 1}: hard-wrapped prose; write each paragraph and list item on one line (\`--fix\` joins them)`);
}

// ---------- 1. location and naming ----------
for (const f of files) {
  if (f.endsWith('.md') && !f.startsWith('docs/') && !MD_OUTSIDE_DOCS.some(r => r.test(f))) {
    err(f, 'Markdown outside docs/ (move it into the wiki)');
  }
  if (f.startsWith('docs/') && f !== f.toLowerCase()) err(f, 'docs/ paths must be lowercase');
}

const docs = files.filter(f => f.startsWith('docs/') && f.endsWith('.md'));
const docHtml = files.filter(f => f.endsWith('.html') && (f.startsWith('docs/') || f.startsWith('explorations/')));
const linkSources = [...docs, ...docHtml, ...files.filter(f => MD_OUTSIDE_DOCS.some(r => r.test(f)))];

// ---------- 2. frontmatter ----------
const meta = new Map();
for (const f of docs) {
  const fm = frontmatter(read(f));
  if (!fm) { err(f, 'missing frontmatter header block'); continue; }
  const d = fm.data;
  meta.set(f, d);
  for (const key of ['kind', 'status', 'summary', 'verified']) if (!d[key] || (Array.isArray(d[key]) && !d[key].length)) err(f, `frontmatter: missing "${key}"`);
  if (d.kind && !KINDS.includes(d.kind)) err(f, `frontmatter: kind "${d.kind}" not in ${KINDS.join('|')}`);
  if (d.status && !STATUSES.includes(d.status)) err(f, `frontmatter: status "${d.status}" not in ${STATUSES.join('|')}`);
  if (d.verified && !/^\d{4}-\d{2}-\d{2}$/.test(d.verified)) err(f, 'frontmatter: verified must be YYYY-MM-DD');
  const inProposals = f.startsWith('docs/proposals/');
  if (inProposals !== (d.status === 'proposal')) err(f, 'status: proposal is required in, and only allowed in, docs/proposals/');
  if (d.status === 'disabled' && !f.startsWith('docs/skills/')) err(f, 'status: disabled is only for docs/skills/');
  if (d.kind === 'ledger' && !Array.isArray(d.statuses)) err(f, 'frontmatter: ledgers need a statuses list');
  if (d.sources !== undefined && !Array.isArray(d.sources)) err(f, 'frontmatter: sources must be a list');
  for (const s of Array.isArray(d.sources) ? d.sources : []) if (!exists(s)) err(f, `frontmatter: source "${s}" does not exist`);
}

// ---------- 3. links and anchors ----------
const inbound = new Map();
function checkTarget(from, target, line) {
  if (/^[a-z][\w+.-]*:/i.test(target) || target.startsWith('//')) return; // external
  const [rawPath, anchor] = target.split('#');
  const path = decodeURI(rawPath);
  const resolved = path ? normalize(join(dirname(from), path)).split(sep).join('/') : from;
  if (resolved.startsWith('..')) return err(from, `line ${line}: link leaves the repository: ${target}`);
  if (!exists(resolved)) return err(from, `line ${line}: broken link ${target}`);
  if (!inbound.has(resolved)) inbound.set(resolved, new Set());
  if (resolved !== from) inbound.get(resolved).add(from);
  if (anchor && /\.(md|html)$/.test(resolved) && !anchors(resolved).has(anchor)) err(from, `line ${line}: missing anchor #${anchor} in ${resolved}`);
}
for (const f of linkSources) {
  const raw = read(f);
  const text = f.endsWith('.md') ? stripFences(raw) : raw;
  const patterns = f.endsWith('.md')
    ? [/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g, /\s(?:href|src)="([^"]+)"/g]
    : [/\s(?:href|src)="([^"]+)"/g];
  for (const re of patterns) for (const m of text.matchAll(re)) {
    if (m[1].startsWith('data:') || m[1].includes('${')) continue;
    checkTarget(f, m[1], lineOf(text, m.index));
  }
}

// ---------- 4. backticked paths ----------
for (const f of [...docs, 'AGENTS.md', 'README.md'].filter(exists)) {
  const text = stripFences(read(f));
  for (const m of text.matchAll(/`([^`\s]+)`/g)) {
    const p = m[1].replace(/[:#].*$/, '').replace(/[),.;]+$/, '');
    if (!p.includes('/') || !PATH_EXTENSIONS.has(extname(p))) continue;
    if (/[<>*{}$]|XYZ|\.\.\.|…/.test(p) || p.startsWith('~') || p.startsWith('/') || /^[a-z]+:\/\//.test(p)) continue;
    const candidates = [normalize(join(dirname(f), p)), ...PATH_ROOTS.map(r => normalize(join(r, p)))].map(c => c.split(sep).join('/'));
    if (candidates.some(c => c.startsWith('..'))) continue; // sibling repositories are out of scope
    if (candidates.some(c => exists(c))) continue;
    if (isIgnored(normalize(p))) continue;
    err(f, `line ${lineOf(text, m.index)}: path \`${m[1]}\` does not exist`);
  }
}

// ---------- 5. todo pages ----------
// On docs/todo pages other than the milestone index, a done row's description is struck through and done rows
// sink to the bottom of their table, newest first; other rows keep their order. Milestone pages (all but the
// backlog) also carry a generated progress table, one row per ledger table, above their first section.
const LEDGER_HEADER = /^\|\s*Date\s*\|\s*Status\s*\|\s*Description\s*\|(\s*Details\s*\|)?\s*$/;
const PROGRESS_HEADER = /^\|\s*Section\s*\|/;
const statusLabel = s => s[0].toUpperCase() + s.slice(1).replace(/-/g, ' ');
function tidyTodo(text, statuses, milestone) {
  const lines = text.split('\n');
  const tables = [];
  let h2 = '';
  let h3 = '';
  for (let i = 0; i < lines.length; i++) {
    const h = /^(#{2,3}) (.+?)\s*$/.exec(lines[i]);
    if (h) { if (h[1] === '##') { h2 = h[2]; h3 = ''; } else h3 = h[2]; continue; }
    if (!LEDGER_HEADER.test(lines[i])) continue;
    let end = i + 2;
    while (end < lines.length && lines[end].startsWith('|')) end++;
    const rows = lines.slice(i + 2, end).map(line => {
      const c = line.split('|');
      if (c.length < 5) return { status: '', date: '', line };
      const status = c[2].trim();
      const description = c[3].trim().replace(/^~~(.*)~~$/, '$1');
      const wanted = status === 'done' ? `~~${description}~~` : description;
      if (c[3].trim() !== wanted) c[3] = ` ${wanted} `;
      return { status, date: c[1].trim(), line: c.join('|') };
    });
    const done = rows.filter(r => r.status === 'done').sort((a, b) => b.date.localeCompare(a.date));
    lines.splice(i + 2, rows.length, ...rows.filter(r => r.status !== 'done').map(r => r.line), ...done.map(r => r.line));
    tables.push({ label: [h2, h3].filter(Boolean).join(' › ') || 'All', rows });
    i = end - 1;
  }
  if (!milestone) return lines.join('\n');

  const old = lines.findIndex(l => PROGRESS_HEADER.test(l));
  if (old >= 0) {
    let end = old;
    while (end < lines.length && lines[end].startsWith('|')) end++;
    if (end < lines.length && !lines[end].trim()) end++;
    lines.splice(old, end - old);
  }
  const counted = tables.filter(t => t.rows.length);
  if (!counted.length) return lines.join('\n');
  const count = (rows, s) => rows.filter(r => r.status === s).length;
  const all = counted.flatMap(t => t.rows);
  const progress = [
    `| Section | ${statuses.map(statusLabel).join(' | ')} |`,
    `|---|${statuses.map(() => '---|').join('')}`,
    ...counted.map(t => `| ${t.label} | ${statuses.map(s => count(t.rows, s)).join(' | ')} |`),
    `| **Total** | ${statuses.map(s => `**${count(all, s)}**`).join(' | ')} |`,
    '',
  ];
  let at = lines.findIndex(l => /^## /.test(l));
  if (at < 0) at = lines.findIndex(l => LEDGER_HEADER.test(l));
  lines.splice(at, 0, ...progress);
  return lines.join('\n');
}
for (const f of docs.filter(f => /^docs\/todo\/[^/]+\.md$/.test(f) && f !== 'docs/todo/index.md' && meta.get(f)?.kind === 'ledger')) {
  const text = read(f);
  const tidy = tidyTodo(text, meta.get(f).statuses ?? [], f !== 'docs/todo/backlog.md');
  if (tidy === text) continue;
  if (FIX) { writeFileSync(join(ROOT, f), tidy); console.log(`tidied ${f}`); continue; }
  err(f, 'done rows must be struck through and last in their table, and the progress table current (`--fix` updates them)');
}

// ---------- 6. ledgers ----------
for (const f of docs.filter(f => meta.get(f)?.kind === 'ledger')) {
  const lines = read(f).split('\n');
  const statuses = meta.get(f).statuses ?? [];
  let inTable = false;
  let tables = 0;
  lines.forEach((line, i) => {
    if (LEDGER_HEADER.test(line)) { inTable = true; tables++; return; }
    if (!inTable) return;
    if (!line.startsWith('|')) { inTable = false; return; }
    if (/^\|[\s:-]+\|/.test(line) && !/\w/.test(line)) return;
    const cells = line.slice(1, line.trimEnd().endsWith('|') ? line.trimEnd().length - 1 : undefined).split('|').map(c => c.trim());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cells[0] ?? '')) err(f, `line ${i + 1}: ledger date must be YYYY-MM-DD`);
    if (!statuses.includes(cells[1])) err(f, `line ${i + 1}: ledger status "${cells[1]}" not in ${statuses.join('|')}`);
    if (!cells[2]) err(f, `line ${i + 1}: ledger description is empty`);
  });
  if (!tables) err(f, 'ledger has no "| Date | Status | Description | Details |" table');
}

// Records must be reachable from a ledger.
for (const f of docs.filter(f => meta.get(f)?.kind === 'record')) {
  const from = [...(inbound.get(f) ?? [])].filter(s => meta.get(s)?.kind === 'ledger');
  if (!from.length) err(f, 'record is not linked from any ledger');
}

// ---------- 7. skills ----------
const shellDir = '.agents/skills';
const shells = existsSync(join(ROOT, shellDir)) ? readdirSync(join(ROOT, shellDir)).filter(n => statSync(join(ROOT, shellDir, n)).isDirectory()) : [];
for (const name of shells) {
  const shell = `${shellDir}/${name}/SKILL.md`;
  if (!exists(shell)) { err(`${shellDir}/${name}`, 'missing SKILL.md'); continue; }
  const fm = frontmatter(read(shell));
  if (!fm) { err(shell, 'missing frontmatter'); continue; }
  if (fm.data.name !== name) err(shell, `name "${fm.data.name}" must match directory "${name}"`);
  if (!fm.data.description) err(shell, 'missing description');
  if (!WORKTREE_SKILLS.includes(name) && !name.startsWith('ajw_')) err(shell, 'repository skills must be prefixed ajw_');
  const body = `docs/skills/${name}.md`;
  if (!fm.body.includes(body)) err(shell, `body must point to ${body}`);
  if (!exists(body)) err(shell, `${body} does not exist`);
  else if (meta.get(body)?.status !== 'current') err(body, 'has an enabled shell but status is not current');
  if (fm.body.split('\n').filter(l => l.trim()).length > 6) err(shell, 'shell should stay thin; put the procedure in the docs/skills page');
  if (!exists(`${shellDir}/${name}/agents/openai.yaml`)) err(shell, 'missing agents/openai.yaml');
  const link = join(ROOT, '.claude/skills', name);
  let linked = false;
  try { linked = lstatSync(link).isSymbolicLink() && readlinkSync(link) === `../../${shellDir}/${name}`; } catch {}
  if (!linked) err(shell, `missing symlink .claude/skills/${name} -> ../../${shellDir}/${name}`);
}
for (const f of docs.filter(f => f.startsWith('docs/skills/'))) {
  const name = f.slice('docs/skills/'.length, -3);
  if (meta.get(f)?.kind !== 'skill') err(f, 'docs/skills pages need kind: skill');
  if (meta.get(f)?.status === 'disabled' && shells.includes(name)) err(f, 'disabled skill still has a shell');
  if (meta.get(f)?.status === 'current' && !shells.includes(name)) err(f, `enabled skill has no shell at ${shellDir}/${name}/SKILL.md`);
}
if (existsSync(join(ROOT, '.claude/skills'))) for (const n of readdirSync(join(ROOT, '.claude/skills'))) {
  if (!shells.includes(n)) err(`.claude/skills/${n}`, 'no matching .agents/skills shell');
}
for (const f of files.filter(f => /^\.agents\/commands\/[^/]+\.md$/.test(f))) {
  const name = f.slice('.agents/commands/'.length, -3);
  if (!read(f).includes(`docs/skills/${name}.md`)) err(f, `command must point to docs/skills/${name}.md`);
  if (!shells.includes(name)) err(f, 'command has no enabled skill');
}

// ---------- 8. staleness (warning) ----------
const dirty = new Set(git('status', '--porcelain').split('\n').filter(Boolean).map(l => l.slice(3).split(' -> ').pop()));
// Local calendar date, like the commit dates (`%cs`) below and the `verified` dates agents write.
const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
// One pass over history: newest commit date per path.
const lastChange = new Map();
let commitDate = '';
for (const line of git('log', '--format=@%cs', '--name-only').split('\n')) {
  if (line.startsWith('@')) commitDate = line.slice(1);
  else if (line && !lastChange.has(line)) lastChange.set(line, commitDate);
}
const changedOn = s => {
  if ([...dirty].some(p => p === s || p.startsWith(`${s}/`))) return today;
  let latest = lastChange.get(s) ?? '';
  for (const [p, date] of lastChange) if (p.startsWith(`${s}/`) && date > latest) latest = date;
  return latest;
};
for (const [f, d] of meta) {
  if (!Array.isArray(d.sources) || !d.verified) continue;
  for (const s of d.sources) {
    if (!exists(s)) continue;
    const changed = changedOn(s);
    if (changed && changed > d.verified) warn(f, `source ${s} changed ${changed}, after verified ${d.verified}; re-check the page and update verified`);
  }
}

// ---------- 9. index ----------
const SECTION_ORDER = ['', 'todo', 'api', 'web', 'ios', 'evals', 'explorations', 'skills', 'proposals', 'tooling'];
const SECTION_LABELS = { '': 'Core', api: 'API', ios: 'iOS' };
function title(f) {
  const m = stripFences(read(f)).match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : f;
}
function buildIndex() {
  const groups = new Map();
  for (const f of docs) {
    if (f === INDEX) continue;
    const d = meta.get(f);
    if (!d || d.kind === 'record') continue;
    const section = f.slice(5).includes('/') ? f.slice(5).split('/')[0] : '';
    if (!groups.has(section)) groups.set(section, []);
    groups.get(section).push(f);
  }
  const order = [...groups.keys()].sort((a, b) => {
    const ia = SECTION_ORDER.indexOf(a), ib = SECTION_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  const out = [
    '---',
    'kind: index',
    'status: current',
    'summary: Generated catalog of every wiki page; start here.',
    `verified: ${meta.get(INDEX)?.verified ?? today}`,
    '---',
    '',
    '# Catchphrase wiki',
    '',
    'Generated by `node scripts/check-docs.mjs --fix` from page headers; do not edit by hand. Conventions: [wiki.md](wiki.md). Detail records are reached from their ledgers.',
  ];
  for (const s of order) {
    out.push('', `## ${SECTION_LABELS[s] ?? s[0].toUpperCase() + s.slice(1)}`, '');
    const list = groups.get(s).sort((a, b) => {
      const ai = a.endsWith('/index.md') ? 0 : 1, bi = b.endsWith('/index.md') ? 0 : 1;
      return ai - bi || a.localeCompare(b);
    });
    for (const f of list) {
      const d = meta.get(f);
      const tag = d.status === 'current' ? '' : ` _(${d.status})_`;
      out.push(`- [${title(f)}](${relative('docs', f).split(sep).join('/')})${tag} — ${d.summary}`);
    }
  }
  return `${out.join('\n')}\n`;
}
const expected = buildIndex();
if (FIX) {
  if (!exists(INDEX) || read(INDEX) !== expected) { writeFileSync(join(ROOT, INDEX), expected); console.log(`wrote ${INDEX}`); }
} else if (!exists(INDEX) || read(INDEX) !== expected) {
  err(INDEX, 'out of date; run `node scripts/check-docs.mjs --fix`');
}

// ---------- report ----------
for (const w of warnings) console.log(`warning  ${w}`);
for (const e of errors) console.log(`error    ${e}`);
console.log(`\ncheck-docs: ${docs.length} pages, ${errors.length} error(s), ${warnings.length} warning(s)`);
process.exitCode = errors.length ? 1 : 0;
