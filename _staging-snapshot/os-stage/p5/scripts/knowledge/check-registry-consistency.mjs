#!/usr/bin/env node
// scripts/knowledge/check-registry-consistency.mjs
//
// Spec §5 / P0 audit §(b): one canonical feature vocabulary. memory/registry.yml
// is the agent/engineering router; src/lib/admin/feature-registry.ts is the
// runtime observability registry. Their granularity legitimately differs (19
// coarse ids vs 86 fine FeatureKeys) — that is BY DESIGN, not a bug. What
// matters is FILE-LEVEL ownership: does a concrete action file mean the same
// feature on both sides?
//
// This is a FILE-driven check, not an ID-driven one, on purpose. An
// ID-set diff alone reports green on a registry pair that materially
// disagrees on every shared feature (P0 audit §3b — all 4 exact-id matches
// diverge in real file ownership despite sharing a name).
//
// Algorithm, per file referenced on either side:
//   1. registryOwners(file) = set of memory/registry.yml feature ids whose
//      `code.actions` list names this exact (non-glob) file.
//   2. tsOwners(file)       = set of feature-registry.ts FeatureKeys whose
//      `actions` map names this file (whole-file 'ALL' or a named export
//      subset both count as ownership).
//   3. If registryOwners is empty: not a registry claim, skip (informational
//      only — a runtime-only file the agent router doesn't track).
//   4. If registryOwners is non-empty and the file does not exist on disk:
//      registry.yml names a dead code path. FAIL unless declared in
//      registry-equivalences.yml's file_divergences with
//      status: missing_on_disk (then WARN).
//   5. If registryOwners is non-empty and tsOwners is empty (file exists,
//      but feature-registry.ts has no entry for it — e.g. a types-only
//      file `withAdminObserved` never wraps): not a conflict, skip.
//   6. If both are non-empty: compute `allowed` = union, over every id in
//      registryOwners, of that id's equivalence members (memory/
//      registry-equivalences.yml's id_relationships[id].members, defaulting
//      to {id} itself when no entry exists). If tsOwners ⊆ allowed: OK. If
//      not: divergence. Declared (file_divergences has this exact path) ->
//      WARN with the tracked note. Undeclared -> FAIL with evidence.
//
// Exit code: 0 if no FAIL, 1 if any FAIL. WARN never fails the run — a
// WARN is "known, tracked, not yet reconciled," which is the honest state
// spec §5 asks this script to make CHECKABLE, not to silently fix.

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import YAML from 'yaml';

import { loadRegistry } from './lib/registry.mjs';
import { loadFeatureRegistryTs } from './lib/feature-registry-ts.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function parseArgv(argv) {
  const opts = { repoRoot: process.cwd(), equivalencesPath: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--repo-root') opts.repoRoot = argv[++i];
    else if (a === '--equivalences') opts.equivalencesPath = argv[++i];
    else if (a === '--json') opts.json = true;
    // Ignore everything else on purpose: scripts/knowledge/check.mjs forwards
    // its own argv (e.g. --files <paths>, --strict from other checkers in
    // the chain) to every child it execFileSync's — this script must not
    // choke on flags meant for a sibling.
  }
  return opts;
}

export async function loadEquivalences(repoRoot, equivalencesPath) {
  const p = equivalencesPath ?? join(repoRoot, 'memory/registry-equivalences.yml');
  if (!existsSync(p)) {
    return { version: 1, id_relationships: {}, file_divergences: [], __missing: true, __path: p };
  }
  const text = await readFile(p, 'utf8');
  const doc = YAML.parse(text) ?? {};
  return {
    version: doc.version ?? 1,
    id_relationships: doc.id_relationships ?? {},
    file_divergences: doc.file_divergences ?? [],
    __path: p,
  };
}

/** Non-glob, string action-file entries only. */
function registryActionFiles(feature) {
  const actions = feature?.code?.actions;
  if (!Array.isArray(actions)) return [];
  return actions.filter((p) => typeof p === 'string' && !p.includes('*'));
}

function ownersFor(equivalences, id) {
  const rel = equivalences.id_relationships?.[id];
  const members = Array.isArray(rel?.members) ? rel.members : null;
  return new Set(members ?? [id]);
}

function findDivergence(equivalences, file) {
  return (equivalences.file_divergences ?? []).find((d) => d.path === file);
}

function toArray(v) {
  if (v === null || v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

/**
 * Core comparison. Pure function of (registry, tsFileOwners, equivalences,
 * fileExistsFn) so it is directly unit-testable without touching disk.
 */
export function computeDivergences({ registry, tsFileOwners, equivalences, fileExists }) {
  const registryOwners = new Map(); // file -> Set(featureId)
  for (const [id, feature] of Object.entries(registry.features ?? {})) {
    for (const file of registryActionFiles(feature)) {
      if (!registryOwners.has(file)) registryOwners.set(file, new Set());
      registryOwners.get(file).add(id);
    }
  }

  const failures = [];
  const warnings = [];
  const clean = [];

  for (const [file, regOwnerSet] of registryOwners.entries()) {
    if (regOwnerSet.size === 0) continue;

    if (!fileExists(file)) {
      const declared = findDivergence(equivalences, file);
      const entry = {
        file,
        registryOwner: [...regOwnerSet],
        runtimeOwner: null,
        reason: 'registry.yml names a code path that does not exist on disk',
      };
      if (declared && declared.status === 'missing_on_disk') {
        warnings.push({ ...entry, tracked: declared.tracked ?? null });
      } else {
        failures.push(entry);
      }
      continue;
    }

    const tsOwnerSet = tsFileOwners.get(file) ?? new Set();
    if (tsOwnerSet.size === 0) {
      // Registry claims a real file feature-registry.ts doesn't track at
      // all (types file, non-action file, etc). Not a conflict.
      clean.push(file);
      continue;
    }

    const allowed = new Set();
    for (const regId of regOwnerSet) for (const m of ownersFor(equivalences, regId)) allowed.add(m);

    const escaped = [...tsOwnerSet].filter((k) => !allowed.has(k));
    if (escaped.length === 0) {
      clean.push(file);
      continue;
    }

    const declared = findDivergence(equivalences, file);
    const entry = {
      file,
      registryOwner: [...regOwnerSet],
      runtimeOwner: [...tsOwnerSet],
      escapedOwners: escaped,
    };
    if (declared && declared.status === 'divergent') {
      warnings.push({ ...entry, tracked: declared.tracked ?? null });
    } else {
      failures.push(entry);
    }
  }

  // ID-set diff — WARN visibility only, per P0 audit §(b) point 2. Not a
  // FAIL: most one-sided ids are legitimate (baseball_core groups 48 ts
  // keys deliberately; feature_awareness_system describes tooling, not a
  // product feature with any runtime health signal).
  const registryIds = new Set(Object.keys(registry.features ?? {}));
  const tsIds = new Set([...tsFileOwners.values()].flatMap((s) => [...s]));
  // tsFileOwners only gives us keys that own at least one file; that is
  // every FeatureKey in practice (all 86 own >=1 file), so this is a
  // faithful id-set proxy without re-parsing the entries list twice.
  const registryOnly = [...registryIds].filter((id) => !tsIds.has(id)).sort();
  const tsOnly = [...tsIds].filter((id) => !registryIds.has(id)).sort();

  return { failures, warnings, clean, registryOnly, tsOnly };
}

async function run(opts) {
  const { repoRoot } = opts;
  const registry = await loadRegistry(repoRoot);
  const { fileOwners: tsFileOwners } = await loadFeatureRegistryTs(repoRoot);
  const equivalences = await loadEquivalences(repoRoot, opts.equivalencesPath);

  const result = computeDivergences({
    registry,
    tsFileOwners,
    equivalences,
    fileExists: (relPath) => existsSync(join(repoRoot, relPath)),
  });

  return { ...result, equivalencesMissing: Boolean(equivalences.__missing) };
}

function printHuman(result) {
  const { failures, warnings, clean, registryOnly, tsOnly, equivalencesMissing } = result;
  console.log('\nregistry ↔ feature-registry.ts consistency');
  console.log('='.repeat(52));
  if (equivalencesMissing) {
    console.log('! memory/registry-equivalences.yml not found — treating every divergence as undeclared.');
  }
  console.log(`  clean file ownerships:     ${clean.length}`);
  console.log(`  declared divergences:      ${warnings.length} (WARN)`);
  console.log(`  UNDECLARED divergences:    ${failures.length} (FAIL)`);
  console.log(`  registry-only ids:         ${registryOnly.length} (WARN, visibility only)`);
  console.log(`  ts-only ids:               ${tsOnly.length} (WARN, visibility only)`);

  if (warnings.length > 0) {
    console.log('\nDeclared (tracked, not reconciled):');
    for (const w of warnings.slice(0, 20)) {
      console.log(`  ~ ${w.file}`);
      console.log(`      registry: ${JSON.stringify(w.registryOwner)}  runtime: ${JSON.stringify(w.runtimeOwner)}`);
      if (w.tracked) console.log(`      tracked: ${w.tracked.trim().split('\n')[0]}`);
    }
  }

  if (failures.length > 0) {
    console.log('\nUNDECLARED — FAIL:');
    for (const f of failures.slice(0, 20)) {
      console.log(`  ✗ ${f.file}`);
      console.log(`      registry: ${JSON.stringify(f.registryOwner)}  runtime: ${JSON.stringify(f.runtimeOwner)}`);
      console.log(
        `      fix: either update memory/registry.yml's action list, or add a ` +
          `file_divergences entry to memory/registry-equivalences.yml declaring why this is expected.`,
      );
    }
    if (failures.length > 20) console.log(`  ... and ${failures.length - 20} more`);
  }

  console.log(`\nRESULT: ${failures.length === 0 ? 'PASS' : `FAIL — ${failures.length} undeclared divergence(s)`}\n`);
}

async function main() {
  const opts = parseArgv(process.argv.slice(2));
  const result = await run(opts);
  if (opts.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    printHuman(result);
  }
  process.exit(result.failures.length === 0 ? 0 : 1);
}

// Only run as a script, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('check-registry-consistency crashed:', err?.stack ?? err);
    process.exit(2);
  });
}
