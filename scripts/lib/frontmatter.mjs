// Page header blocks (YAML frontmatter), shared by check-docs.mjs and todo.mjs.
// Dependency-free on purpose: CI runs the checker without installing packages. Supports the subset the wiki
// uses: `key: value` scalars (plain, 'single' or "double" quoted), flow lists `[a, b]`, and block lists
// (`key:` followed by indented `- item` lines). Conventions are in docs/wiki.md#page-header.

const INDICATOR = /^[-?:,[\]{}#&*!|>'"%@`]/;

// A plain YAML scalar cannot contain ": " or " #", end with ":", start with an indicator, or carry edge spaces.
export const needsQuotes = v => v !== v.trim() || v.includes(': ') || v.includes(' #') || v.endsWith(':') || INDICATOR.test(v);

// Format a value for a header line, double-quoting it only when a plain scalar would be invalid.
export const scalar = v => (needsQuotes(v) ? JSON.stringify(v) : v);

const KEY_LINE = /^([A-Za-z][\w-]*):(?:\s+(.*))?$/;
const ITEM_LINE = /^(\s+-\s+)(.*)$/;

// The header line with an invalid plain value double-quoted, or the line unchanged.
function quoteLine(line) {
  const key = line.match(KEY_LINE);
  const item = key ? null : line.match(ITEM_LINE);
  const prefix = key ? `${key[1]}: ` : item?.[1];
  const v = (key ? key[2] : item?.[2])?.trim();
  if (!v || v.startsWith('"') || v.startsWith("'")) return line;
  if (key && v.startsWith('[') && v.endsWith(']')) return line;
  return needsQuotes(v) ? prefix + JSON.stringify(v) : line;
}

function unquote(raw, problem) {
  const v = raw.trim();
  if (v.startsWith('"')) {
    try { return JSON.parse(v); } catch { problem('invalid double-quoted value'); return v; }
  }
  if (v.startsWith("'")) {
    if (!/^'(?:[^']|'')*'$/.test(v)) problem('invalid single-quoted value');
    return v.slice(1, -1).replaceAll("''", "'");
  }
  return v;
}

function blockRange(text) {
  if (!text.startsWith('---\n')) return null;
  const end = text.indexOf('\n---', 4);
  return end < 0 ? null : end;
}

// { data, body, bodyLine, problems } or null when the page has no header block.
// `problems` lists lines that are not valid YAML for the supported subset, with 1-based line numbers.
export function parseFrontmatter(text) {
  const end = blockRange(text);
  if (end === null) return null;
  const data = {};
  const problems = [];
  let list = null;
  text.slice(4, end).split('\n').forEach((line, i) => {
    const n = i + 2;
    const problem = msg => problems.push(`line ${n}: ${msg}`);
    if (!line.trim()) return;
    if (quoteLine(line) !== line) problem('header value contains ": ", " #" or starts with a YAML indicator; wrap it in double quotes (`--fix` quotes it)');
    const item = line.match(ITEM_LINE);
    if (item && list) { list.push(unquote(item[2], problem)); return; }
    const m = line.match(KEY_LINE);
    if (!m) { problem('not a `key: value` header line'); return; }
    const v = (m[2] ?? '').trim();
    list = null;
    if (!v) data[m[1]] = list = [];
    else if (v.startsWith('[') && v.endsWith(']')) data[m[1]] = v.slice(1, -1).split(',').map(s => unquote(s, problem)).filter(Boolean);
    else data[m[1]] = unquote(v, problem);
  });
  return { data, body: text.slice(text.indexOf('\n', end + 1) + 1), bodyLine: text.slice(0, end).split('\n').length + 2, problems };
}

// The text with every invalid plain header value double-quoted.
export function quoteFrontmatter(text) {
  const end = blockRange(text);
  if (end === null) return text;
  return `---\n${text.slice(4, end).split('\n').map(quoteLine).join('\n')}${text.slice(end)}`;
}
