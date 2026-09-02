#!/usr/bin/env node
/**
 * Undo `next build`'s rewrite of tsconfig.json.
 *
 * The build rewrites this file two ways:
 *   1. re-adds `.next/types/**\/*.ts` and `.next/dev/types/**\/*.ts` to `include`
 *   2. reformats arrays (e.g. `"types": ["vitest/globals"]` -> multi-line)
 *
 * Those two include entries were deliberately removed 2026-08-26: they break
 * `npm run typecheck` locally (measured exit 2 with them, exit 0 without) while
 * matching zero files in CI, where `.next` does not exist at typecheck time.
 * So every local build left the tree dirty AND re-armed a broken typecheck.
 * Two separate sessions hit it on 2026-08-27 and hand-reverted it.
 *
 * SAFETY: this restores from git ONLY after proving the working copy differs
 * from HEAD by nothing except those known build artifacts. If anything else
 * changed — someone edited tsconfig.json deliberately in the same session — it
 * leaves the file alone and says so. It must never silently discard real work.
 *
 * Exit 0 always: a postbuild step must not fail a green build.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'tsconfig.json';
const INJECTED = ['.next/types/**/*.ts', '.next/dev/types/**/*.ts'];

/** tsconfig.json carries // comments, so JSON.parse needs them stripped first. */
function parseJsonc(text) {
  let out = '';
  let inString = false;
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const c2 = text.slice(i, i + 2);
    if (inLine) {
      if (c === '\n') { inLine = false; out += c; }
      continue;
    }
    if (inBlock) {
      if (c2 === '*/') { inBlock = false; i++; }
      continue;
    }
    if (inString) {
      out += c;
      if (c === '\\') { out += text[i + 1] ?? ''; i++; continue; }
      if (c === '"') inString = false;
      continue;
    }
    if (c2 === '//') { inLine = true; continue; }
    if (c2 === '/*') { inBlock = true; i++; continue; }
    if (c === '"') { inString = true; out += c; continue; }
    out += c;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}

let head;
try {
  head = git(['show', `HEAD:${FILE}`]);
} catch {
  console.log(`${FILE}: not tracked in HEAD — leaving it alone.`);
  process.exit(0);
}

const working = readFileSync(FILE, 'utf8');
if (working === head) {
  console.log(`${FILE}: unchanged by the build.`);
  process.exit(0);
}

let a, b;
try {
  a = parseJsonc(working);
  b = parseJsonc(head);
} catch (error) {
  console.log(`${FILE}: could not parse for comparison (${error.message}) — leaving it alone.`);
  process.exit(0);
}

// Remove the build's injected include entries from the WORKING copy, then ask
// whether what remains is semantically identical to HEAD. If it is, every
// difference was the build's doing and restoring is safe.
if (Array.isArray(a.include)) {
  a.include = a.include.filter((entry) => !INJECTED.includes(entry));
}

if (JSON.stringify(a) === JSON.stringify(b)) {
  writeFileSync(FILE, head);
  console.log(`${FILE}: reverted the build's rewrite (injected .next include entries + array reformatting).`);
  process.exit(0);
}

console.log(
  `${FILE}: changed by more than the known build rewrite — LEFT ALONE on purpose.\n` +
    '  Someone edited it deliberately; review `git diff tsconfig.json` yourself.\n' +
    '  If the build also re-added the .next include entries, remove those two lines by hand.',
);
process.exit(0);
