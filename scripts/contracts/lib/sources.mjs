/**
 * sources.mjs — gather the raw material the compiler reasons over, for one
 * resolved feature.
 *
 * Every read here is REPO-RELATIVE and goes through either `readTracked`
 * (guarded by the tracked-file set) or a fixed, small list of always-read
 * generated/code files. Nothing walks the filesystem: `document-inventory.
 * mjs`'s header explains why (an internal `.worktrees/` checkout once held
 * MORE files than `src/` itself, and `find`/a raw `readdir` walk does not
 * honour `.gitignore` — tracked git state is the only set that cannot
 * contain a second checkout). `trackedFiles` is a parameter, not a call to
 * `git ls-files` baked in here, so tests can inject a small fixed list
 * instead of requiring a real git repo.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { matchGlob } from '../../knowledge/lib/registry.mjs';

/** `git ls-files`, as a Set. The one real-git call this tool makes. */
export function gitTrackedFiles(repoRoot) {
  const out = execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf-8' });
  return new Set(out.trim().split('\n').filter(Boolean));
}

/** Short HEAD SHA — the staleness anchor `.claude/rules/shipping.md` asks
 * for ("record the anchor SHA and let the reader run `git rev-list --count
 * <sha>..HEAD`"), never a wall-clock date. */
export function gitHeadSha(repoRoot) {
  return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf-8',
  }).trim();
}

function readIfTracked(repoRoot, trackedFiles, path) {
  if (!trackedFiles.has(path)) return null;
  try {
    return readFileSync(join(repoRoot, path), 'utf-8');
  } catch {
    return null;
  }
}

/** Every tracked file matching any glob in `globs`, sorted. */
export function filesMatchingGlobs(trackedFiles, globs) {
  const matched = new Set();
  for (const glob of globs ?? []) {
    for (const file of trackedFiles) {
      if (matchGlob(glob, file)) matched.add(file);
    }
  }
  return [...matched].sort();
}

/**
 * Gather everything the claim/supersede extractors need for one canonical
 * feature. `overrides` lets a test supply `trackedFiles`/`headSha`/a
 * `readFile(path)` function directly instead of touching git or disk — the
 * fixture test in __tests__/resolve.test.mjs is not a git repository.
 */
export function gatherSources(repoRoot, featureId, featureEntry, overrides = {}) {
  const trackedFiles = overrides.trackedFiles ?? gitTrackedFiles(repoRoot);
  const headSha = overrides.headSha ?? gitHeadSha(repoRoot);
  const readFile = overrides.readFile ?? ((p) => readIfTracked(repoRoot, trackedFiles, p));

  const code = featureEntry.code ?? {};
  const docs = featureEntry.docs ?? {};
  const observability = featureEntry.observability ?? {};

  const featureDocPath = typeof docs.feature === 'string' ? docs.feature : null;
  const featureDocText = featureDocPath ? readFile(featureDocPath) : null;

  const ledgerChangesPath = `memory/ledgers/changes/${featureId}.md`;
  const ledgerTestsPath = `memory/ledgers/tests/${featureId}.md`;
  const ledgerChangesText = readFile(ledgerChangesPath);
  const ledgerTestsText = readFile(ledgerTestsPath);

  const adrPaths = [...trackedFiles]
    .filter((p) => p.startsWith('memory/decisions/ADR-') && p.endsWith('.md'))
    .sort();
  const adrFiles = adrPaths
    .map((path) => ({ path, text: readFile(path) }))
    .filter((f) => f.text != null);

  const migrationFiles = filesMatchingGlobs(trackedFiles, code.db)
    .map((path) => ({ path, text: readFile(path) }))
    .filter((f) => f.text != null);

  const featureRegistryPath = 'src/lib/admin/feature-registry.ts';
  const featureRegistryText = readFile(featureRegistryPath);

  const databaseTypesPath = 'src/lib/types/database.ts';
  const databaseTypesText = readFile(databaseTypesPath);

  const schemaBaselinePath = '.doc-schema-baseline.json';
  let schemaBaselineIdentifiers = new Set();
  const schemaBaselineRaw = readFile(schemaBaselinePath);
  if (schemaBaselineRaw) {
    try {
      schemaBaselineIdentifiers = new Set(JSON.parse(schemaBaselineRaw).identifiers ?? []);
    } catch {
      // Malformed baseline is not this tool's problem to report — the
      // schema-drift gate itself owns that. Treat as "no known baseline".
    }
  }

  return {
    repoRoot,
    featureId,
    trackedFiles,
    headSha,
    readFile,
    featureDocPath,
    featureDocText,
    ledgerChangesPath,
    ledgerChangesText,
    ledgerTestsPath,
    ledgerTestsText,
    adrFiles,
    migrationFiles,
    featureRegistryPath,
    featureRegistryText,
    databaseTypesPath,
    databaseTypesText,
    schemaBaselinePath,
    schemaBaselineIdentifiers,
    featureKeys: Array.isArray(observability.feature_keys) ? observability.feature_keys : [],
  };
}
