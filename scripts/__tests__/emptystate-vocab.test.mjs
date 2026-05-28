// Regression test for the W6-copy brand-voice pass (2026-05-28).
//
// The 13 typed `<EmptyState />` configs (roster, rounds, calendar, messages,
// stats, qualifiers, announcements, travel, search, watchlist, pipeline,
// camps, videos) must carry golf-voice copy: a non-empty title and a helpful
// one-line description. Configs that ship a CTA must keep that CTA — the
// brand-voice pass is copy-only and must never drop an action or its href.
//
// We parse the source rather than import the TSX (the file is a client
// component with JSX), asserting on the structured config block.
//
// Run via: node --test scripts/__tests__/emptystate-vocab.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../..');
const emptyStatePath = resolve(repoRoot, 'src/components/ui/empty-state.tsx');
const src = readFileSync(emptyStatePath, 'utf8');

// The 13 typed configs this wave is responsible for.
const TYPED_KEYS = [
  'roster',
  'rounds',
  'calendar',
  'messages',
  'stats',
  'qualifiers',
  'announcements',
  'travel',
  'search',
  'watchlist',
  'pipeline',
  'camps',
  'videos',
];

// Configs that intentionally render WITHOUT a primary action.
// (`search` reflects a query/filter result; `camps` is a passive "check back"
// state.) Every other typed config MUST keep its CTA.
const ACTIONLESS_KEYS = new Set(['search', 'camps']);

// Isolate the `emptyStateConfigs` record body so we slice each config cleanly.
const recordStart = src.indexOf('const emptyStateConfigs');
assert.ok(recordStart !== -1, 'expected to find the emptyStateConfigs record');
const recordBody = src.slice(recordStart);

/**
 * Extract the brace-balanced object literal that follows `key: {`.
 * Returns the inner text of that config object.
 */
function extractConfigBlock(body, key) {
  const keyMarker = new RegExp(`\\b${key}:\\s*{`).exec(body);
  assert.ok(keyMarker, `expected a typed EmptyState config for "${key}"`);
  let i = keyMarker.index + keyMarker[0].length;
  let depth = 1;
  const start = i;
  for (; i < body.length && depth > 0; i++) {
    const ch = body[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
  }
  assert.equal(depth, 0, `unbalanced braces while parsing config "${key}"`);
  return body.slice(start, i - 1);
}

function readStringField(block, field) {
  // Matches: field: 'value' OR field: "value" (no nested quotes of same kind).
  const m = new RegExp(`\\b${field}:\\s*(['"])((?:\\\\.|(?!\\1).)*)\\1`).exec(block);
  return m ? m[2] : null;
}

test('every typed EmptyState config has a non-empty golf-voice title', () => {
  for (const key of TYPED_KEYS) {
    const block = extractConfigBlock(recordBody, key);
    const title = readStringField(block, 'title');
    assert.ok(title && title.trim().length > 0, `config "${key}" is missing a title`);
  }
});

test('every typed EmptyState config has a helpful description', () => {
  for (const key of TYPED_KEYS) {
    const block = extractConfigBlock(recordBody, key);
    const description = readStringField(block, 'description');
    assert.ok(
      description && description.trim().length >= 12,
      `config "${key}" is missing a helpful description (got: ${JSON.stringify(description)})`,
    );
  }
});

test('action-bearing typed configs keep their CTA (label + any href)', () => {
  for (const key of TYPED_KEYS) {
    if (ACTIONLESS_KEYS.has(key)) continue;
    const block = extractConfigBlock(recordBody, key);
    assert.match(block, /\baction:\s*{/, `config "${key}" lost its action: block`);

    // The CTA label must survive the copy pass.
    const labelMatch = /\blabel:\s*(['"])((?:\\.|(?!\1).)*)\1/.exec(block);
    assert.ok(
      labelMatch && labelMatch[2].trim().length > 0,
      `config "${key}" dropped its CTA label`,
    );
  }
});

test('intentionally action-less configs (search, camps) stay action-less', () => {
  for (const key of ACTIONLESS_KEYS) {
    const block = extractConfigBlock(recordBody, key);
    assert.doesNotMatch(
      block,
      /\baction:\s*{/,
      `config "${key}" unexpectedly gained an action — confirm this is intended`,
    );
  }
});

// Lock the exact hrefs that drive navigation CTAs so a copy edit can never
// silently re-point or drop them.
const REQUIRED_HREFS = {
  rounds: '/golf/dashboard/rounds/new',
  stats: '/golf/dashboard/rounds/new',
  watchlist: '/baseball/dashboard/discover',
  pipeline: '/baseball/dashboard/discover',
};

test('navigation CTAs keep their exact hrefs', () => {
  for (const [key, href] of Object.entries(REQUIRED_HREFS)) {
    const block = extractConfigBlock(recordBody, key);
    const got = readStringField(block, 'href');
    assert.equal(got, href, `config "${key}" href drifted from ${href}`);
  }
});
