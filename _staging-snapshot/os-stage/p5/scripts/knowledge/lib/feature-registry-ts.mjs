// scripts/knowledge/lib/feature-registry-ts.mjs
//
// Narrow, purpose-built extractor for `src/lib/admin/feature-registry.ts`'s
// `FEATURE_REGISTRY` array. NOT a TypeScript/AST parser — a regex walk over
// the exact literal shape that file has used since W15 Task 3 (`key: '...'`
// blocks with an `actions: { 'file': 'ALL' | ['export', ...] }` map). That is
// a deliberate, audited tradeoff (P0 audit §(b)): a real TS parser is a new
// dependency for one file whose shape has been stable for months; a regex
// walk is ~60 lines and fails LOUDLY (throws) the moment the shape changes,
// rather than silently under-extracting.
//
// This module answers exactly one question for
// scripts/knowledge/check-registry-consistency.mjs and
// scripts/repo-doctor/checks/registry.mjs: "for a given repo-relative file
// path, which FeatureKey(s) does feature-registry.ts assign it to, and is
// that assignment whole-file ('ALL') or a named subset?"
//
// Does NOT extract primaryTable/tier/heartbeat/etc — those are runtime-only
// fields the P0 audit explicitly said do not belong in an agent-routing
// comparison (spec §5). Ownership (the `actions` manifest) is the only field
// this module reads.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const DEFAULT_REL_PATH = 'src/lib/admin/feature-registry.ts';

/**
 * @param {string} repoRoot
 * @param {string} [relPath]
 * @returns {Promise<{ entries: FeatureRegistryEntry[], fileOwners: Map<string, Set<string>> }>}
 */
export async function loadFeatureRegistryTs(repoRoot = process.cwd(), relPath = DEFAULT_REL_PATH) {
  const abs = join(repoRoot, relPath);
  const text = await readFile(abs, 'utf8');
  return parseFeatureRegistryTs(text);
}

/**
 * @typedef {{ key: string, actions: Record<string, 'ALL' | string[]> }} FeatureRegistryEntry
 */

/**
 * @param {string} text — the full source of feature-registry.ts
 * @returns {{ entries: FeatureRegistryEntry[], fileOwners: Map<string, Set<string>> }}
 */
export function parseFeatureRegistryTs(text) {
  const arrayStart = text.indexOf('export const FEATURE_REGISTRY');
  if (arrayStart === -1) {
    throw new Error(
      'feature-registry-ts.mjs: "export const FEATURE_REGISTRY" not found — the extractor\'s ' +
        'assumed shape has changed; update the regex walk before trusting its output.',
    );
  }
  const body = text.slice(arrayStart);

  const entries = [];
  // Split the FEATURE_REGISTRY array into top-level object literals by
  // brace-depth walking from each `{` that immediately follows a `key:`
  // property start. We don't attempt a full array split (commas inside
  // nested arrays/objects make naive splitting unsafe); instead we find
  // every `key: '<id>',` occurrence, then from there scan forward to the
  // matching close brace of that entry's enclosing `{ ... }` object.
  const keyRe = /\n\s{4}key:\s*'([a-z0-9_]+)',/g;
  let m;
  const keyPositions = [];
  while ((m = keyRe.exec(body)) !== null) {
    keyPositions.push({ key: m[1], keyIndex: m.index });
  }

  if (keyPositions.length === 0) {
    throw new Error(
      'feature-registry-ts.mjs: found FEATURE_REGISTRY but zero `key: \'...\',` matches — the ' +
        'extractor\'s indentation/quote assumptions have drifted from the real file.',
    );
  }

  for (const { key, keyIndex } of keyPositions) {
    // Walk backward from the key line to the entry's opening `{`.
    const entryOpen = body.lastIndexOf('{', keyIndex);
    const entryClose = findMatchingBrace(body, entryOpen);
    const entryText = body.slice(entryOpen, entryClose + 1);

    entries.push({ key, actions: extractActions(entryText, key) });
  }

  const fileOwners = new Map();
  for (const entry of entries) {
    for (const file of Object.keys(entry.actions)) {
      if (!fileOwners.has(file)) fileOwners.set(file, new Set());
      fileOwners.get(file).add(entry.key);
    }
  }

  return { entries, fileOwners };
}

/** Extract the `actions: { ... }` object body for one FeatureDef entry text. */
function extractActions(entryText, key) {
  const actionsIdx = entryText.indexOf('actions:');
  if (actionsIdx === -1) {
    throw new Error(`feature-registry-ts.mjs: entry '${key}' has no 'actions:' property.`);
  }
  const braceOpen = entryText.indexOf('{', actionsIdx);
  const braceClose = findMatchingBrace(entryText, braceOpen);
  const actionsBody = entryText.slice(braceOpen + 1, braceClose);

  const actions = {};
  // Each entry is `'file/path.ts': 'ALL'` or `'file/path.ts': [ 'a', 'b', ... ]`.
  const fileEntryRe = /'([^']+)':\s*(?:'(ALL)'|(\[[\s\S]*?\]))/g;
  let fm;
  while ((fm = fileEntryRe.exec(actionsBody)) !== null) {
    const [, filePath, allMarker, arrLiteral] = fm;
    if (allMarker) {
      actions[filePath] = 'ALL';
    } else {
      const exportNames = [...arrLiteral.matchAll(/'([^']+)'/g)].map((x) => x[1]);
      actions[filePath] = exportNames;
    }
  }
  return actions;
}

/** Given the index of an opening `{`, return the index of its matching `}`. */
function findMatchingBrace(text, openIndex) {
  if (text[openIndex] !== '{') {
    throw new Error(`feature-registry-ts.mjs: findMatchingBrace called on non-'{' char at ${openIndex}.`);
  }
  let depth = 0;
  for (let i = openIndex; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error('feature-registry-ts.mjs: unbalanced braces — could not find matching close.');
}

/**
 * Convenience: file -> Set(FeatureKey) map only, repo-root form.
 * @param {string} repoRoot
 * @param {string} [relPath]
 */
export async function buildTsFileOwners(repoRoot = process.cwd(), relPath = DEFAULT_REL_PATH) {
  const { fileOwners } = await loadFeatureRegistryTs(repoRoot, relPath);
  return fileOwners;
}
