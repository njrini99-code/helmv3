// Regression test for the Tier-1 states audit (2026-05-28).
//
// Asserts that every route-level `error.tsx` in src/app/golf and
// src/app/baseball routes Sentry errors through the canonical
// `RouteErrorBoundary` (or `CompactRouteErrorBoundary`) wrapper. Files
// that render `{error.message}` directly bypass Sentry tagging and
// leak Supabase error messages — both of which we explicitly forbid
// going forward.
//
// Run via: node --test scripts/__tests__/error-boundary-coverage.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const repoRoot = resolve(import.meta.dirname, '../..');

function findErrorFiles() {
  const out = execFileSync(
    'find',
    ['src/app/golf', 'src/app/baseball', '-name', 'error.tsx'],
    { encoding: 'utf8', cwd: repoRoot },
  );
  return out.trim().split('\n').filter(Boolean);
}

test('every route-level error.tsx is wired into Sentry', () => {
  const files = findErrorFiles();
  assert.ok(files.length > 0, 'expected at least one error.tsx in src/app');

  const bypassed = [];
  for (const rel of files) {
    const abs = resolve(repoRoot, rel);
    const src = readFileSync(abs, 'utf8');
    // Accept either the canonical RouteErrorBoundary wrapper OR a
    // direct logError() call (the underlying Sentry pipeline). What we
    // reject is `console.error` only and the original auth-leak style
    // of rendering raw {error.message}.
    const usesCanonical =
      /from\s+['"]@\/components\/errors['"]/.test(src) &&
      /(RouteErrorBoundary|CompactRouteErrorBoundary)/.test(src);
    const callsLogError = /\blogError\s*\(/.test(src);
    if (!usesCanonical && !callsLogError) bypassed.push(rel);
  }

  assert.deepEqual(
    bypassed,
    [],
    `These error.tsx files bypass Sentry tagging — switch to RouteErrorBoundary from '@/components/errors' or call logError() directly:\n  - ${bypassed.join('\n  - ')}`,
  );
});

// Match a {...error.message...} JSX expression. Conservative: only
// flag a single `{ ... }` block referencing error.message, not larger
// multi-line interpolations.
const LEAK_PATTERN = /\{[^{}]*error\.message[^{}]*\}/g;

// Strip the entire content of any `process.env.NODE_ENV === 'development' && ( ... )`
// JSX block before scanning. We do a depth-aware paren-walk so nested JSX
// expressions don't false-negative the strip.
function stripDevOnlyBlocks(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const devStart = src.indexOf("process.env.NODE_ENV", i);
    if (devStart === -1) {
      out.push(src.slice(i));
      break;
    }
    // Find the matching `&& (` after devStart
    const ampParen = src.indexOf('&& (', devStart);
    if (ampParen === -1) {
      out.push(src.slice(i));
      break;
    }
    // Walk to the matching `)` from after `&& (`
    let depth = 1;
    let j = ampParen + 4;
    while (j < src.length && depth > 0) {
      const ch = src[j];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      j++;
    }
    out.push(src.slice(i, devStart));
    i = j; // skip the entire dev-only block
  }
  return out.join('');
}

test('no error.tsx renders {error.message} directly to users', () => {
  const files = findErrorFiles();
  const leakers = [];

  for (const rel of files) {
    const abs = resolve(repoRoot, rel);
    const src = readFileSync(abs, 'utf8');
    const stripped = stripDevOnlyBlocks(src);
    if (LEAK_PATTERN.test(stripped)) {
      // Only flag if the file does NOT delegate to RouteErrorBoundary
      // — the canonical wrapper renders error.message inside its own
      // NODE_ENV guard and is already safe.
      if (!/RouteErrorBoundary|CompactRouteErrorBoundary/.test(src)) {
        leakers.push(rel);
      }
    }
    LEAK_PATTERN.lastIndex = 0;
  }

  assert.deepEqual(
    leakers,
    [],
    `These error.tsx files render raw {error.message} to users (Supabase leak risk):\n  - ${leakers.join('\n  - ')}`,
  );
});
