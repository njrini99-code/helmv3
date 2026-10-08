#!/usr/bin/env node
// .claude/hooks/format-on-edit.mjs — PostToolUse on Write|Edit.
//
// Formats the file Claude just wrote with Prettier, but only when that is safe
// and already wanted:
//   - Prettier resolves from this project (we add no dependency for it), AND
//   - the project has a Prettier config (without one, Prettier's defaults would
//     rewrite whole files on a one-line edit and reformat the repo by attrition), AND
//   - the file is ts/tsx/js/mjs/css/md/json.
// Otherwise it does nothing, silently. It always exits 0 and prints nothing:
// a formatter must never fail or clutter an edit. No deny rule, no prompt.
//
// Today the repo has neither Prettier nor a config, so this is inert. It wakes
// up the day both are added, with no further change here.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname, join, resolve, sep } from 'node:path';

const FORMATTABLE = new Set(['.ts', '.tsx', '.js', '.mjs', '.css', '.md', '.json']);
const CONFIG_FILES = [
  '.prettierrc', '.prettierrc.json', '.prettierrc.yml', '.prettierrc.yaml', '.prettierrc.json5',
  '.prettierrc.js', '.prettierrc.cjs', '.prettierrc.mjs', '.prettierrc.toml',
  'prettier.config.js', 'prettier.config.cjs', 'prettier.config.mjs', 'prettier.config.ts',
];

/** Whether the project defines a Prettier config. */
export function hasPrettierConfig(root, read = (p) => readFileSync(p, 'utf8'), exists = existsSync) {
  if (CONFIG_FILES.some((f) => exists(join(root, f)))) return true;
  try {
    return 'prettier' in JSON.parse(read(join(root, 'package.json')));
  } catch {
    return false;
  }
}

/** Whether Prettier resolves from the project (installed, even transitively). */
export function prettierResolves(root) {
  try {
    createRequire(join(root, 'package.json')).resolve('prettier/package.json');
    return true;
  } catch {
    return false;
  }
}

/**
 * Decide whether to format. Pure given its dependencies, so it is testable.
 * @returns {string | null} the absolute file to format, or null for "do nothing"
 */
export function fileToFormat(input, root, deps = {}) {
  const resolves = deps.prettierResolves ?? prettierResolves;
  const config = deps.hasPrettierConfig ?? hasPrettierConfig;
  const exists = deps.exists ?? existsSync;
  const raw = input?.tool_input?.file_path;
  if (typeof raw !== 'string' || raw === '') return null;
  const file = resolve(root, raw);
  if (!FORMATTABLE.has(extname(file).toLowerCase())) return null;
  if (!(file === root || file.startsWith(root + sep))) return null; // never format outside the project
  if (file.split(sep).includes('node_modules') || file.split(sep).includes('.next')) return null;
  if (!exists(file)) return null;
  if (!resolves(root) || !config(root)) return null;
  return file;
}

function main() {
  let input = {};
  try {
    const raw = readFileSync(0, 'utf8');
    input = raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return;
  }
  const root = resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
  const file = fileToFormat(input, root);
  if (!file) return;
  spawnSync('npx', ['--no-install', 'prettier', '--write', file], { cwd: root, stdio: 'ignore', timeout: 15000 });
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch {
    /* a formatter never fails an edit */
  }
  process.exit(0);
}
