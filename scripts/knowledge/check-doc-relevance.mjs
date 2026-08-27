#!/usr/bin/env node
/**
 * ============================================================================
 * Does a feature's canonical doc actually describe that feature?
 * ----------------------------------------------------------------------------
 * `check-doc-coverage.mjs` already asserts that every mapped doc EXISTS. That
 * is the check that a pointer RESOLVES. It says nothing about what the pointer
 * resolves TO.
 *
 * That gap was real, not hypothetical. On 2026-08-27 `memory/registry.yml`
 * pointed the `recruiting` feature's canonical `docs.feature` at
 * `memory/context/golfhelm-features.md` — a 1,399-line file containing ZERO
 * occurrences of the string "recruit". Every agent session routed to Recruiting
 * HQ loaded 28 unrelated features and nothing about the one it asked for. There
 * were 17 feature docs for 18 features and nobody noticed, because the pointer
 * resolved and `fileExists` was happy.
 *
 * It is the same shape as several other defects found the same night: the
 * bridge EXECUTION_LOG saying "in progress" about code that had shipped, and a
 * `guard-sql.sh` normalization that looked like a fix and was a bypass.
 * Everything that resolves gets trusted; nothing checks that what it resolves
 * to is the right thing.
 *
 * THE HEURISTIC, deliberately conservative. A doc passes if it mentions the
 * feature's own identity at least `MIN_HITS` times — identity being the tokens
 * of the feature id plus the significant words of its display name. A doc that
 * cannot manage to say its own subject's name three times is not describing it.
 *
 * Tokens shorter than MIN_TOKEN_LEN are dropped ("ai", "hq"), because short
 * tokens match substrings of unrelated words and would make this check noisy.
 * A feature whose every token is too short is skipped and reported, rather than
 * silently passing — an unenforceable check must say so out loud.
 * ========================================================================== */
import { readFileSync } from 'node:fs';
import { loadRegistry, fileExists } from './lib/registry.mjs';

export const MIN_TOKEN_LEN = 3;
export const MIN_HITS = 3;
const STOPWORDS = new Set(['and', 'the', 'of', 'for', 'with', 'per']);

/**
 * The pure verdict: does `text` describe the feature identified by id/name?
 * Separated from IO so it can be tested without a registry or a filesystem.
 */
export function describesFeature(id, name, text) {
  const tokens = identityTokens(id, name);
  if (tokens.length === 0) return { checkable: false, tokens, hits: 0, ok: true };
  const hay = String(text).toLowerCase();
  const hits = tokens.reduce((n, t) => n + countOccurrences(hay, t), 0);
  return { checkable: true, tokens, hits, ok: hits >= MIN_HITS };
}

// Running as a script? Only then do the IO. Importing this file (tests) must
// not read a registry or exit the process.
const isCli = process.argv[1] && process.argv[1].endsWith('check-doc-relevance.mjs');
if (isCli) await main();

async function main() {
const repoRoot = process.cwd();
const registry = await loadRegistry(repoRoot);

const failures = [];
const unenforceable = [];
let checked = 0;

for (const [id, feature] of Object.entries(registry.features ?? {})) {
  const doc = feature?.docs?.feature;
  if (!doc) continue;
  // A missing file is check-doc-coverage.mjs's job, not ours. Don't double-report.
  if (!fileExists(repoRoot, doc)) continue;

  const tokens = identityTokens(id, feature.name);
  if (tokens.length === 0) {
    unenforceable.push(`${id}: every identity token is shorter than ${MIN_TOKEN_LEN} chars`);
    continue;
  }

  checked += 1;
  const text = readFileSync(`${repoRoot}/${doc}`, 'utf8').toLowerCase();
  const hits = tokens.reduce((n, t) => n + countOccurrences(text, t), 0);

  if (hits < MIN_HITS) {
    failures.push({ id, doc, tokens, hits });
  }
}

if (unenforceable.length > 0) {
  console.log(`ℹ ${unenforceable.length} feature(s) not checkable by this heuristic:`);
  for (const line of unenforceable) console.log(`   ${line}`);
  console.log('');
}

if (failures.length > 0) {
  console.error(
    `❌ ${failures.length} feature(s) whose canonical doc does not describe them:\n`,
  );
  for (const f of failures) {
    console.error(`   ${f.id}`);
    console.error(`       docs.feature: ${f.doc}`);
    console.error(
      `       mentions its own identity ${f.hits}x (need ${MIN_HITS}); looked for: ${f.tokens.join(', ')}`,
    );
    console.error('');
  }
  console.error('   The file exists — that is why nothing else caught this.');
  console.error('   Point docs.feature at a doc about this feature, or write one.');
  process.exit(1);
}

console.log(`✅ All ${checked} canonical feature docs describe their own feature.`);
}

/**
 * Feature id tokens + significant display-name words, deduped and STEMMED.
 *
 * Stemming matters more than it looks. Matching is substring-of-document, so a
 * needle of `recruiting` does NOT match a doc that says "recruit", "recruits"
 * or "recruited" — a perfectly good doc could fail for using the singular. That
 * is a false positive, and false positives are what get a doc-quality gate
 * deleted within a week. Stripping a trailing ing/ed/s makes the needle
 * strictly more permissive (`recruit` matches all four forms) while the real
 * defect this exists for — a doc with zero mentions in ANY form — still fails.
 */
export function identityTokens(id, name) {
  const raw = [...String(id).split(/[_-]/), ...String(name ?? '').split(/\s+/)];
  const seen = new Set();
  for (const t of raw) {
    const clean = t.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (clean.length < MIN_TOKEN_LEN) continue;
    if (STOPWORDS.has(clean)) continue;
    seen.add(stem(clean));
  }
  return [...seen];
}

/** Trim one common English suffix, but never below MIN_TOKEN_LEN. */
function stem(word) {
  for (const suffix of ['ing', 'ed', 's']) {
    if (word.endsWith(suffix) && word.length - suffix.length >= MIN_TOKEN_LEN) {
      return word.slice(0, -suffix.length);
    }
  }
  return word;
}

/** Plain substring count — no regex, so a token with regex metacharacters is safe. */
export function countOccurrences(haystack, needle) {
  let n = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    n += 1;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return n;
}
