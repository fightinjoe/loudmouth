#!/usr/bin/env -S deno run --allow-net --allow-read --allow-write --allow-run

/**
 * Cross-LLM batch runner for /textbook evals.
 *
 * Drives eval-textbook.js once per (context file × LLM) so every backend
 * generates against the SAME pinned call-1 context — the whole point of the
 * `.ctx-*.json` files (see eval-textbook.js `--context-file`). Call 1 is held
 * fixed; only the generate call (call 2) varies by `llm`, so the resulting
 * samples/<slug>.yaml files are directly comparable across models.
 *
 * For each api/evals/.ctx-*.json it reads the pinned `topic`/`language` and,
 * for each selected LLM, spawns:
 *
 *   deno run eval-textbook.js --topic=… --language=… --llm=… \
 *     --context-file=<that .ctx file> --url=… [--checklist=…] [--force]
 *
 * USAGE
 *   deno run --allow-net --allow-read --allow-write --allow-run \
 *     evals/eval-all.js \
 *     [--llm=google,claude,chatgpt]   # subset; default: all three
 *     [--url=http://localhost:8080]
 *     [--checklist=default|all]
 *     [--concurrency=N]               # default: number of selected LLMs
 *     [--force]                       # reseed each sample's ideal section
 *
 * Requires the dev server already running (`cd src && npm run dev`) and `deno`
 * on PATH. Exits non-zero if any (context × LLM) run fails.
 */

const ALL_LLMS = ['google', 'claude', 'chatgpt'];
const EVALS_DIR = new URL('./', import.meta.url);
const EVAL_TEXTBOOK = new URL('./eval-textbook.js', import.meta.url);

function parseFlags(argv) {
  const flags = { url: 'http://localhost:8080', checklist: 'default', force: false };
  for (const arg of argv) {
    if (arg === '--force') flags.force = true;
    else if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq === -1) throw new Error(`Malformed flag (expected --key=value): ${arg}`);
      flags[arg.slice(2, eq)] = arg.slice(eq + 1);
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  return flags;
}

function resolveLlms(flags) {
  if (!flags.llm) return ALL_LLMS;
  const llms = flags.llm.split(',').map((s) => s.trim()).filter(Boolean);
  const bad = llms.filter((l) => !ALL_LLMS.includes(l));
  if (bad.length) throw new Error(`Unknown --llm value(s): ${bad.join(', ')}; must be from ${ALL_LLMS.join(', ')}`);
  return llms;
}

async function findCtxFiles() {
  const files = [];
  for await (const entry of Deno.readDir(EVALS_DIR)) {
    if (entry.isFile && entry.name.startsWith('.ctx-') && entry.name.endsWith('.json')) {
      files.push(entry.name);
    }
  }
  return files.sort();
}

async function readCtx(name) {
  const url = new URL(name, EVALS_DIR);
  const saved = JSON.parse(await Deno.readTextFile(url));
  if (!saved.topic || !saved.language) {
    throw new Error(`${name} is missing topic/language — not a valid pinned context file`);
  }
  return { name, topic: saved.topic, language: saved.language, path: url.pathname };
}

async function runOne(ctx, llm, flags) {
  const args = [
    'run', '--allow-net', '--allow-read', '--allow-write', EVAL_TEXTBOOK.pathname,
    `--topic=${ctx.topic}`,
    `--language=${ctx.language}`,
    `--llm=${llm}`,
    `--context-file=${ctx.path}`,
    `--url=${flags.url}`,
    `--checklist=${flags.checklist}`,
  ];
  if (flags.force) args.push('--force');

  const started = Date.now();
  const { code, stdout, stderr } = await new Deno.Command('deno', {
    args,
    stdout: 'piped',
    stderr: 'piped',
  }).output();

  return {
    ctx,
    llm,
    ok: code === 0,
    code,
    ms: Date.now() - started,
    out: new TextDecoder().decode(stdout).trimEnd(),
    err: new TextDecoder().decode(stderr).trimEnd(),
  };
}

async function runPool(tasks, concurrency, onDone) {
  const results = new Array(tasks.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= tasks.length) return;
      results[i] = await tasks[i]();
      onDone(results[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}

async function main() {
  const flags = parseFlags(Deno.args);
  const llms = resolveLlms(flags);

  const ctxNames = await findCtxFiles();
  if (ctxNames.length === 0) {
    throw new Error(`No .ctx-*.json files found in ${EVALS_DIR.pathname}. Create one first with eval-textbook.js --context-file=…`);
  }
  const contexts = await Promise.all(ctxNames.map(readCtx));

  const concurrency = flags.concurrency ? Math.max(1, Number(flags.concurrency)) : llms.length;
  if (Number.isNaN(concurrency)) throw new Error(`--concurrency must be a number`);

  console.log(
    `Running ${contexts.length} context(s) × ${llms.length} LLM(s) = ${contexts.length * llms.length} generations ` +
    `against ${flags.url} (concurrency ${concurrency})\n`,
  );

  const tasks = [];
  for (const ctx of contexts) {
    for (const llm of llms) tasks.push(() => runOne(ctx, llm, flags));
  }

  const results = await runPool(tasks, concurrency, (r) => {
    const status = r.ok ? '✓' : '✗';
    console.log(`${status} ${r.ctx.name} · ${r.llm} (${(r.ms / 1000).toFixed(1)}s)`);
    const body = r.ok ? r.out : `${r.out}\n${r.err}`.trim();
    if (body) console.log(body.split('\n').map((l) => `    ${l}`).join('\n'));
    console.log('');
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`Done: ${results.length - failed.length}/${results.length} succeeded.`);
  if (failed.length) {
    console.log('Failed:');
    for (const r of failed) console.log(`  - ${r.ctx.name} · ${r.llm} (exit ${r.code})`);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error('eval-all failed:', err.message);
    Deno.exit(1);
  });
}
