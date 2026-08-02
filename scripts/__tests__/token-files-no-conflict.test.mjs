// Regression test — token-files-no-conflict
// =========================================
// Asserts that src/styles/tokens.css and src/app/globals.css do NOT
// redeclare any CSS custom property inside their `:root` blocks. This
// exists because the W0 audit found that --radius-md/lg/xl/2xl, the
// --shadow-sm/md/lg tier, the --duration-* and --ease-* scale, and the
// --glass-*-bg/border/blur tints were declared in BOTH files with
// different values, and globals.css silently won by load order.
//
// If a future change reintroduces a duplicate, this test fails so the
// conflict is caught at PR time instead of at the next surface audit.
//
// Run: `node --test scripts/__tests__/token-files-no-conflict.test.mjs`
// This previously ran under `node --test`, which nothing invokes, so it
// never executed. Promoted to vitest (issue #1194).

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..');

/** Extract every --var-name declared inside any `:root { ... }` block. */
function extractRootVars(absolutePath) {
  const content = readFileSync(absolutePath, 'utf8');
  // Match every `:root { ... }` block, including ones split across the
  // file. Use a greedy-but-balanced approach: find `:root` followed by
  // `{`, then walk until the matching `}`.
  const vars = new Set();
  let i = 0;
  while (i < content.length) {
    const idx = content.indexOf(':root', i);
    if (idx === -1) break;
    const openBrace = content.indexOf('{', idx);
    if (openBrace === -1) break;
    // Walk to matching close brace.
    let depth = 1;
    let j = openBrace + 1;
    while (j < content.length && depth > 0) {
      const ch = content[j];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      j++;
    }
    const block = content.slice(openBrace + 1, j - 1);
    // Skip declarations inside `:root` that are inside a comment block.
    const noBlockComments = block.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of noBlockComments.matchAll(/(^|[\s;{])(--[a-z0-9-]+)\s*:/gi)) {
      vars.add(m[2]);
    }
    i = j;
  }
  return vars;
}

test('tokens.css and globals.css do not redeclare any CSS var in :root', () => {
  const tokens = extractRootVars(resolve(REPO_ROOT, 'src/styles/tokens.css'));
  const globals = extractRootVars(resolve(REPO_ROOT, 'src/app/globals.css'));

  // Sanity check: each file actually has some tokens.
  assert.ok(tokens.size > 0, 'src/styles/tokens.css should declare CSS variables');
  assert.ok(globals.size > 0, 'src/app/globals.css should declare CSS variables');

  // Allowlist: vars that may intentionally appear in both files (none
  // expected post-W0; left as a documented escape hatch).
  const allowed = new Set([]);

  const overlap = [...tokens].filter((v) => globals.has(v) && !allowed.has(v));
  assert.deepEqual(
    overlap.sort(),
    [],
    `Token vars declared in BOTH src/styles/tokens.css AND src/app/globals.css:\n  ${overlap.sort().join('\n  ')}\n\nPick one canonical home (src/styles/tokens.css) and delete the other declaration.`
  );
});

test('tokens.css declares the canonical W0 invariants', () => {
  const tokens = extractRootVars(resolve(REPO_ROOT, 'src/styles/tokens.css'));
  const required = [
    // Color invariants
    '--color-primary-600',
    '--color-cream-100',
    '--color-warm-900',
    '--color-destructive',
    '--color-warning',
    '--color-success',
    '--color-info',
    '--color-pga-tour',
    '--focus-ring',
    // Radius canonical (synthesis §5)
    '--radius-sm',
    '--radius-md',
    '--radius-lg',
    '--radius-xl',
    '--radius-2xl',
    '--radius-3xl',
    '--radius-full',
    // Shadow canonical (4 tiers)
    '--shadow-sm',
    '--shadow-md',
    '--shadow-lg',
    '--shadow-focus',
    // Z-index tier (synthesis §5)
    '--z-base',
    '--z-raised',
    '--z-overlay',
    '--z-modal',
    '--z-toast',
    '--z-toolbar',
    '--z-tooltip',
    // Typography canonical (9-step)
    '--text-display-size',
    '--text-h1-size',
    '--text-h2-size',
    '--text-h3-size',
    '--text-body-lg-size',
    '--text-body-size',
    '--text-body-sm-size',
    '--text-caption-size',
    '--text-eyebrow-size',
  ];
  const missing = required.filter((v) => !tokens.has(v));
  assert.deepEqual(
    missing,
    [],
    `tokens.css is missing canonical W0 invariants:\n  ${missing.join('\n  ')}`
  );
});
