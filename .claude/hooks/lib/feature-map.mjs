// .claude/hooks/lib/feature-map.mjs — hook-side wrapper around
// scripts/knowledge/lib/registry.mjs.
//
// BLOCKER, found by the P0 audit and reproduced live before this file was
// written: `mapFilesToFeatures` / `matchGlob` silently return ZERO matches for
// an absolute path —
//   absolute '/Users/…/helmv3/src/app/golf/actions/access-code.ts' -> []
//   relative 'src/app/golf/actions/access-code.ts'                 -> ['auth_onboarding_join']
// and `Write`/`Edit`/`MultiEdit`'s `tool_input.file_path` IS absolute. Every
// hook in this build that maps a file to a feature goes through
// `toRepoRelative` first, or the context gate matches nothing, ever, while
// looking like it works — the same invisible-by-reading failure class as
// guard-bash.sh's BSD-sed `\+` bug and its `-b`-mistaken-for-a-path bug,
// neither caught by reading, both caught by running the hook.
import { loadRegistry, mapFilesToFeatures } from '../../../scripts/knowledge/lib/registry.mjs';

// In-process cache keyed on repoRoot. Parsing memory/registry.yml measures
// ~5-10ms once imported (audit, timed live) — cheap enough that this cache
// exists only to avoid re-parsing within a single hook's multi-file loop, not
// because the parse itself is a bottleneck. No cache file, no mtime check:
// each hook invocation is a fresh `node` process anyway (~30ms cold start
// dominates), so a per-process cache is all there is to gain.
let cachedRegistry = null;
let cachedRepoRoot = null;

export async function getRegistry(repoRoot) {
  if (cachedRegistry && cachedRepoRoot === repoRoot) return cachedRegistry;
  cachedRegistry = await loadRegistry(repoRoot);
  cachedRepoRoot = repoRoot;
  return cachedRegistry;
}

/** Absolute or already-relative -> repo-relative, forward-slashed, no leading ./ */
export function toRepoRelative(repoRoot, filePath) {
  if (!filePath) return filePath;
  const p = String(filePath).replace(/\\/g, '/');
  const root = String(repoRoot || '.').replace(/\\/g, '/').replace(/\/+$/, '');
  let rel = p;
  if (root && (p === root || p.startsWith(`${root}/`))) {
    rel = p.slice(root.length).replace(/^\/+/, '');
  }
  return rel.replace(/^\.\//, '');
}

/**
 * True only when `filePath` resolves to somewhere INSIDE `repoRoot`. Session
 * scratchpad/staging directories (e.g. /private/tmp/claude-.../scratchpad/)
 * are absolute paths that never start with the repo root, so `toRepoRelative`
 * leaves them unchanged (still absolute) rather than stripping a prefix that
 * isn't there — that unchanged-absolute-path shape is exactly the signal
 * this checks for. Live incident, 2026-08-21: the pre-rebuild stop-verify.sh
 * counted scratchpad `.ts`/`.mjs` files an orchestrating session wrote as
 * "touched, unverified" and demanded gates be run against them — there is
 * nothing there to gate, they are not repo state.
 */
export function isWithinRepo(repoRoot, filePath) {
  if (!filePath) return false;
  const rel = toRepoRelative(repoRoot, filePath);
  // A genuine repo-relative result never starts with `/`; `toRepoRelative`
  // leaves a path unchanged (still absolute) exactly when it found no
  // repoRoot prefix to strip, which is the "outside the repo" signal.
  return typeof rel === 'string' && !rel.startsWith('/');
}

export async function mapPathToFeatures(repoRoot, filePath) {
  const registry = await getRegistry(repoRoot);
  const relPath = toRepoRelative(repoRoot, filePath);
  const features = mapFilesToFeatures(registry, [relPath]);
  return { relPath, features };
}

/**
 * Reverse index: registry `docs.feature` path -> feature id. Built from the
 * registry rather than assumed by a `memory/features/<id-with-dashes>.md`
 * filename convention — the audit found that convention does NOT hold for
 * every feature (`baseball_core`'s canonical doc is
 * `memory/context/baseballhelm-features.md`, not under memory/features/ at
 * all). Guessing the transform would silently under-count context loads for
 * exactly the features that don't follow the common pattern.
 */
export async function buildFeatureDocIndex(repoRoot) {
  const registry = await getRegistry(repoRoot);
  const index = new Map();
  for (const [id, feature] of Object.entries(registry.features ?? {})) {
    const docPath = feature.docs?.feature;
    if (typeof docPath === 'string' && docPath) {
      index.set(docPath.replace(/^\.\//, ''), id);
    }
  }
  return index;
}

/** CLAUDE_PROJECT_DIR first (what every existing hook uses), then the
 * hook stdin JSON's own `cwd` field, then process.cwd() last — per the audit,
 * do not rely on process.cwd() alone; its value depends on how the harness
 * spawned the command. */
export function resolveRepoRoot(input) {
  return process.env.CLAUDE_PROJECT_DIR || input?.cwd || process.cwd();
}

// Governed roots = the union of golf-feature-ownership.md's, baseball-roles.md's
// and database.md's `paths:` frontmatter — gate where memory/registry.yml has
// meaning, not "all of src/". Deliberately excludes genuinely shared/platform
// code (src/components/ui, src/components/fairway, shared hooks/stores) that
// no single registry feature owns. Shared between guard-feature-context.mjs
// (real-time PreToolUse gate) and stop-check.mjs (Stop-time cross-check) so
// the two can never silently drift apart on what counts as "governed."
export const GOVERNED_PATTERNS = [
  /^src\/app\/golf\//,
  /^src\/lib\/golf\//,
  /^src\/components\/golf\//,
  /^src\/app\/api\/golf\//,
  /^src\/app\/baseball\//,
  /^src\/lib\/baseball\//,
  /^src\/components\/baseball\//,
  /^supabase\/migrations\//,
  /\.sql$/,
  /^src\/lib\/supabase\//,
  /^scripts\/db\//,
];

export function isGoverned(relPath) {
  return GOVERNED_PATTERNS.some((re) => re.test(relPath));
}

/**
 * Exclusions, checked before the governed-root test so they short-circuit to
 * allow unconditionally. Both are already outside GOVERNED_PATTERNS today —
 * documented explicitly (not left implicit) so a future edit to the governed
 * list does not accidentally start gating them:
 *   - memory/** — including writing the very feature doc the context gate
 *     would otherwise require; that write is often the memory-contract
 *     update itself (spec §12), never something to gate on its own presence.
 *   - generated files with an authorized generator, and the *-baseline.json
 *     ratchets, which regenerate only via each gate's own --update flag.
 */
export function isExcluded(relPath) {
  return (
    relPath.startsWith('memory/') ||
    relPath.endsWith('-baseline.json') ||
    relPath === 'next-env.d.ts' ||
    relPath === 'public/sw.js'
  );
}
