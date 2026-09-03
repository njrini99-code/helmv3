/**
 * registry.mjs — load memory/registry.yml and resolve a requested feature id
 * to its canonical entry.
 *
 * WHY NOT scripts/knowledge/lib/registry.mjs's loadRegistry()
 *
 * That parser is a hand-rolled line matcher, not a YAML parser, and it does
 * not handle inline flow sequences: `feature_keys: [round_tracking,
 * course_library]` (memory/registry.yml's actual syntax for every
 * observability.feature_keys line) comes back as the LITERAL STRING
 * `"[round_tracking, course_library]"`, not an array — confirmed against this
 * worktree's own registry.yml before writing this module. `feature-registry-
 * reconcile.ts`, `check-authority.mjs` and `document-inventory.mjs` all avoid
 * this by loading with `js-yaml` instead, which is what this module does too.
 * `scripts/knowledge/lib/registry.mjs`'s `matchGlob` export IS reused below —
 * it is a pure function with no parsing involved, so there is nothing to
 * duplicate there.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { escapeRegExp } from './regex.mjs';

export const REGISTRY_PATH = 'memory/registry.yml';

/** Load + parse memory/registry.yml. Returns { registry, rawText }. */
export function loadRegistry(repoRoot) {
  const rawText = readFileSync(join(repoRoot, REGISTRY_PATH), 'utf-8');
  const registry = yaml.load(rawText);
  return { registry, rawText };
}

export class UnknownFeatureError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnknownFeatureError';
    this.code = 'UNKNOWN_FEATURE';
  }
}

/**
 * Resolve `--feature <requestedId>` to a canonical memory/registry.yml
 * feature id.
 *
 * Two ways an id resolves:
 *
 *   1. DIRECT — requestedId is itself a `features:` key. This is the common
 *      case and carries no caveat.
 *   2. FEATURE_REGISTRY_KEY — requestedId is not a registry feature id, but
 *      is a runtime FeatureKey (src/lib/admin/feature-registry.ts vocabulary,
 *      surfaced in the registry only as `observability.feature_keys`).
 *      `round_tracking` is the running example: it is
 *      `src/lib/admin/feature-registry.ts`'s own `key: 'round_tracking'`, and
 *      `memory/registry.yml`'s `golf_round_lifecycle.observability.
 *      feature_keys` lists it explicitly — but `round_tracking` itself is
 *      NOT a `features:` key. Per `memory/decisions/ADR-2026-08-30-helm-
 *      knowledge-authority.md` §3/§4, this is deliberate: FeatureKeys are a
 *      many-to-one RUNTIME OBSERVABILITY vocabulary, not a second spelling
 *      of the feature id, and "no feature is reachable under two spellings
 *      without an explicit alias recorded in the registry" — a FeatureKey is
 *      not that alias. Resolving through it is correct, but the resolution
 *      itself is a fact worth surfacing, not a silent no-op — see `note`
 *      below and where callers are expected to print it.
 *
 * Anything else is a hard failure: the caller should exit non-zero and print
 * `error.message`. This is the ONLY class of hard failure this tool has.
 */
export function resolveFeatureId(requestedId, registry) {
  const features = registry?.features ?? {};

  if (Object.prototype.hasOwnProperty.call(features, requestedId)) {
    return { canonicalId: requestedId, requestedId, via: 'direct', note: null };
  }

  const owners = [];
  for (const [id, entry] of Object.entries(features)) {
    const keys = entry?.observability?.feature_keys;
    if (Array.isArray(keys) && keys.includes(requestedId)) owners.push(id);
  }

  if (owners.length === 1) {
    const canonicalId = owners[0];
    return {
      canonicalId,
      requestedId,
      via: 'feature_registry_key',
      note:
        `'${requestedId}' is not a memory/registry.yml feature_id. It is a ` +
        `FeatureKey (src/lib/admin/feature-registry.ts runtime observability ` +
        `vocabulary) owned by feature '${canonicalId}' via ` +
        `observability.feature_keys. Per ADR-2026-08-30-helm-knowledge-` +
        `authority.md §3/§4 this is a many-to-one FeatureKey mapping, not a ` +
        `registry alias — the contract below is compiled for '${canonicalId}', ` +
        `not for a distinct '${requestedId}' feature.`,
    };
  }

  if (owners.length > 1) {
    throw new UnknownFeatureError(
      `Ambiguous feature id '${requestedId}': it is a FeatureKey claimed by ` +
        `more than one registry feature (${owners.join(', ')}) — this is a ` +
        `CONTESTED_FEATURE_KEY registry defect (see scripts/knowledge/lib/` +
        `feature-registry-reconcile.ts), not something this tool can resolve. ` +
        `Fix memory/registry.yml before compiling a contract for this id.`,
    );
  }

  throw new UnknownFeatureError(
    `Unknown feature id '${requestedId}': not a memory/registry.yml ` +
      `feature_id, and not a FeatureKey in any feature's ` +
      `observability.feature_keys.`,
  );
}

/**
 * The line range of one feature's YAML block in the raw registry text —
 * `js-yaml` gives correct VALUES but no line numbers, and provenance needs
 * file:line. This is a targeted re-scan of the same raw text `loadRegistry`
 * already read, not a second parser: it only ever answers "which line is
 * this already-known value on", never "what does this file mean".
 */
export function getFeatureBlock(rawText, featureId) {
  const lines = rawText.split('\n');
  const entryRe = /^  ([a-z0-9_]+):\s*$/;
  let start = -1;
  let end = lines.length;
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(entryRe);
    if (!m) continue;
    if (start === -1 && m[1] === featureId) {
      start = i;
      continue;
    }
    if (start !== -1 && m[1] !== featureId) {
      end = i;
      break;
    }
  }
  if (start === -1) return null;
  // Lines are 0-indexed here; report 1-indexed line numbers to match every
  // editor/grep convention this repo's other tooling already uses.
  return { startLine: start + 1, endLine: end, lines: lines.slice(start, end) };
}

/**
 * Find the 1-indexed line number of a scalar value inside a feature block —
 * either a list item (`- value`) or `key: value`. Returns null rather than
 * guessing when the exact text cannot be found (e.g. a value reconstructed
 * by the YAML parser from a folded/quoted string won't round-trip verbatim).
 */
export function findLineForValue(block, value) {
  if (!block) return null;
  const needleList = `- ${value}`;
  const needleKey = `: ${value}`;
  for (let i = 0; i < block.lines.length; i += 1) {
    const trimmed = block.lines[i].trim();
    if (trimmed === needleList || trimmed.endsWith(needleKey) || trimmed === value) {
      return block.startLine + i;
    }
  }
  return null;
}

/** Find the 1-indexed line number of a `key:` line inside a feature block. */
export function findLineForKey(block, key) {
  if (!block) return null;
  const re = new RegExp(`^\\s*${escapeRegExp(key)}:`);
  for (let i = 0; i < block.lines.length; i += 1) {
    if (re.test(block.lines[i])) return block.startLine + i;
  }
  return null;
}
