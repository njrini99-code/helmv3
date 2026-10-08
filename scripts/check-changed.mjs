#!/usr/bin/env node
/**
 * check:changed — the inner-loop gate. Runs only what the diff can have broken.
 *
 *   npm run check:changed                   changed vs origin/main + uncommitted
 *   npm run check:changed -- --base HEAD~3  a different base
 *   npm run check:changed -- --list         print the plan and run nothing
 *   npm run check:changed -- --no-tests     skip a step (--no-lint, --no-types, --no-tests)
 *   npm run check:changed -- --install      install dependencies if node_modules is missing
 *
 * What it runs, one process at a time, in this order:
 *   1. ESLint on the changed lintable files only (src with --max-warnings 0 like
 *      `npm run lint`; scripts, e2e, hooks and edge functions fail on errors,
 *      because their warnings are a ratcheted baseline, not a gate).
 *   2. tsgo --noEmit (`npm run typecheck:fast`, which takes a serialize slot) when
 *      a TypeScript file or a tsconfig/package manifest changed.
 *   3. vitest on the changed test files, then `vitest related` on the changed
 *      source files, in the `unit` and `unit-dom` projects only.
 *
 * Every step runs even if an earlier one failed, so one pass shows everything;
 * the exit code is non-zero when any step failed. It is NOT wrapped in
 * serialize.mjs itself: tsgo already takes a slot, and holding one here too
 * would deadlock a 2-slot queue against itself.
 *
 * Type-aware lint, the ratchets, the Next build and the full suite stay CI-only
 * (`npm run gates:review` previews the review gate; /gates picks the rest).
 *
 * Dependencies: if node_modules is present nothing is installed. If it is
 * missing the run stops with the exact command, unless --install is passed,
 * which runs scripts/ensure-worktree-deps.mjs (disk preflight included).
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

/** Exit status serialize.mjs uses for "could not get a slot" (EX_TEMPFAIL). */
export const QUEUED_EXIT_CODE = 75;

const LINT_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/;
const LINT_ROOTS = ['src/', 'scripts/', 'e2e/', '.claude/hooks/', 'supabase/functions/'];
const NOT_LINTED = [/^scripts\/[^/]+\.js$/, /^node_modules\//, /^\.next\//, /^archive\//, /^design\//, /^replay\/fixtures\//];
const TEST_FILE = /\.(test|spec)\.(ts|tsx|mjs|js)$/;
/** Directories tsconfig.json excludes, so a change there cannot move the type check. */
const TSC_EXCLUDED = [/^scripts\//, /^supabase\/functions\//, /^design\//, /^archive\//, /^replay\/fixtures\//, /^tools\//];

/**
 * Sort a list of changed paths into the work each step needs. Pure.
 *
 * @param {string[]} files  repo-relative, forward slashes, existing and deleted alike
 * @param {(f: string) => boolean} exists  whether the path is still on disk
 */
export function classifyChanged(files, exists = () => true) {
  const live = [...new Set(files)].filter((f) => exists(f));
  const lint = live.filter((f) => LINT_EXT.test(f) && LINT_ROOTS.some((r) => f.startsWith(r)) && !NOT_LINTED.some((re) => re.test(f)));
  const vitestScope = (f) => (f.startsWith('src/') || f.startsWith('scripts/')) && /\.(ts|tsx|mjs|js)$/.test(f);
  const tests = live.filter((f) => TEST_FILE.test(f) && vitestScope(f));
  const sources = live.filter((f) => !TEST_FILE.test(f) && vitestScope(f));
  const types =
    files.some((f) => /(^|\/)tsconfig[^/]*\.json$/.test(f) || f === 'package.json' || f === 'package-lock.json') ||
    live.some((f) => /\.(ts|tsx|mts)$/.test(f) && !TSC_EXCLUDED.some((re) => re.test(f)));
  return { lint, lintSrc: lint.filter((f) => f.startsWith('src/')), lintOther: lint.filter((f) => !f.startsWith('src/')), tests, sources, types };
}

/**
 * Turn per-step exit codes into the process exit code. Pure.
 * A run whose only failures were "queued" exits 75 so a caller can retry just that.
 *
 * @param {Array<{ name: string, code: number | null }>} results
 */
export function overallExit(results) {
  const failed = results.filter((r) => r.code !== 0);
  if (failed.length === 0) return 0;
  return failed.every((r) => r.code === QUEUED_EXIT_CODE) ? QUEUED_EXIT_CODE : 1;
}

function git(args) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return r.status === 0 ? r.stdout.split('\n').map((l) => l.trim()).filter(Boolean) : null;
}

/** Changed paths: merge-base diff against `base`, plus staged, unstaged and untracked. */
export function gatherChangedFiles(base) {
  const files = new Set();
  const fromBase = base ? git(['diff', '--name-only', '--diff-filter=ACMRD', `${base}...HEAD`]) : null;
  for (const f of fromBase ?? []) files.add(f);
  for (const f of git(['diff', '--name-only', '--diff-filter=ACMRD', 'HEAD']) ?? []) files.add(f);
  for (const f of git(['ls-files', '--others', '--exclude-standard']) ?? []) files.add(f);
  return { files: [...files].sort(), baseUsed: fromBase !== null ? base : null };
}

function resolveBase(explicit) {
  if (explicit) return explicit;
  for (const ref of ['origin/main', 'main']) {
    if (git(['rev-parse', '--verify', '--quiet', ref])) return ref;
  }
  return null;
}

function step(name, command, args, env = {}) {
  // A 170-file run would otherwise print a 6,000-character command line.
  const line = [command, ...args].join(' ');
  console.error(`\n=== ${name}\n$ ${line.length > 240 ? `${line.slice(0, 200)} … (${args.length} arguments)` : line}`);
  const started = Date.now();
  const r = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env } });
  const code = r.status ?? (r.signal ? 1 : 0);
  return { name, code, seconds: Math.round((Date.now() - started) / 100) / 10 };
}

function main() {
  const argv = process.argv.slice(2);
  const flag = (f) => argv.includes(f);
  const value = (f) => {
    const i = argv.indexOf(f);
    return i === -1 ? null : argv[i + 1] ?? null;
  };
  const base = resolveBase(value('--base'));
  const explicit = argv.includes('--files') ? argv.slice(argv.indexOf('--files') + 1).filter((a) => !a.startsWith('--')) : null;
  const { files, baseUsed } = explicit ? { files: explicit, baseUsed: null } : gatherChangedFiles(base);
  const plan = classifyChanged(files, (f) => existsSync(resolve(ROOT, f)));

  console.error(`check:changed: ${files.length} changed file(s)${baseUsed ? ` vs ${baseUsed} plus uncommitted` : ' (uncommitted only; no base ref found)'}`);
  console.error(`  lint ${plan.lint.length} · types ${plan.types ? 'yes' : 'no'} · test files ${plan.tests.length} · related to ${plan.sources.length} source file(s)`);
  if (flag('--list')) {
    for (const f of files) console.error(`  ${f}`);
    process.exit(0);
  }
  if (files.length === 0) {
    console.error('Nothing changed; nothing to check.');
    process.exit(0);
  }

  if (!existsSync(resolve(ROOT, 'node_modules'))) {
    if (!flag('--install')) {
      console.error('\nnode_modules is missing. Install dependencies (disk preflight included), then re-run:');
      console.error('  node scripts/ensure-worktree-deps.mjs .      # or pass --install here');
      process.exit(2);
    }
    const dep = step('install dependencies', 'node', ['scripts/ensure-worktree-deps.mjs', ROOT]);
    if (dep.code !== 0) process.exit(dep.code);
  }
  if (!existsSync(resolve(ROOT, '.env.local'))) {
    console.error('note: no .env.local here. Lint, types and unit tests do not need it; build and e2e do.');
  }

  const results = [];
  if (!flag('--no-lint')) {
    if (plan.lintSrc.length) {
      results.push(step('eslint (src, zero warnings)', 'npx', ['--no-install', 'eslint', '--max-warnings', '0', '--no-warn-ignored', ...plan.lintSrc]));
    }
    if (plan.lintOther.length) {
      results.push(step('eslint (scripts, e2e, hooks, edge functions; errors only)', 'npx', ['--no-install', 'eslint', '--no-warn-ignored', ...plan.lintOther]));
    }
  }
  if (!flag('--no-types') && plan.types) {
    results.push(step('typecheck (tsgo)', 'npm', ['run', 'typecheck:fast']));
  }
  if (!flag('--no-tests')) {
    const projects = ['--project', 'unit', '--project', 'unit-dom'];
    if (plan.tests.length) {
      results.push(step('vitest (changed test files)', 'npx', ['--no-install', 'vitest', 'run', ...projects, '--passWithNoTests', ...plan.tests]));
    }
    if (plan.sources.length) {
      results.push(step('vitest related (changed source files)', 'npx', ['--no-install', 'vitest', 'related', '--run', ...projects, '--passWithNoTests', ...plan.sources]));
    }
  }

  console.error('\n=== check:changed summary');
  for (const r of results) console.error(`  ${r.code === 0 ? 'ok    ' : r.code === QUEUED_EXIT_CODE ? 'queued' : 'FAILED'}  ${r.name}  (exit ${r.code}, ${r.seconds}s)`);
  if (results.length === 0) console.error('  no step applied to these files');
  process.exit(overallExit(results));
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();
