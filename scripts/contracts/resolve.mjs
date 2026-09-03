#!/usr/bin/env node
/**
 * resolve.mjs — the Active Contract Compiler.
 *
 * `npm run contract:resolve -- --feature <id>` resolves a feature's CURRENT
 * contract from verified sources, in authority order: generated artifacts
 * (src/lib/admin/feature-registry.ts, src/lib/types/database.ts) > code
 * (memory/registry.yml's routes/components/actions/services, existence-
 * checked against git) > migrations/schema > tests > the feature doc
 * (memory/features/<id>.md) > ADRs/decisions (memory/decisions/ADR-*.md) >
 * ledgers/history (memory/ledgers/changes/<id>.md,
 * memory/ledgers/tests/<id>.md) — per
 * docs/ai-system/CONTROL_PLANE_IMPLEMENTATION_PLAN_2026-09-03.md §7 K.4.3.
 *
 * It prints the current contract, every SUPERSEDED claim with the evidence
 * that supersedes it and where it still appears, and file:line provenance
 * per claim. It never fails on a contradiction — those are the findings this
 * tool exists to surface. It exits non-zero on exactly one thing: an unknown
 * `--feature` id.
 *
 * Usage:
 *   npm run contract:resolve -- --feature <id> [--json] [--out <path>]
 *
 * See scripts/contracts/lib/*.mjs for the extraction/supersession logic —
 * this file is orchestration only.
 */
import { writeFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { loadRegistry, resolveFeatureId, UnknownFeatureError } from './lib/registry.mjs';
import { gatherSources, gitTrackedFiles, gitHeadSha } from './lib/sources.mjs';
import {
  resetClaimCounter,
  claimsFromRegistry,
  claimsFromFeatureRegistry,
  claimsFromFeatureDoc,
  claimsFromLedger,
  claimsFromAdrs,
  claimsFromMigrations,
} from './lib/claims.mjs';
import {
  checkPathExistence,
  checkSchemaExistence,
  checkLedgerCorrections,
  checkAdrSupersedes,
  partition,
} from './lib/supersede.mjs';
import { renderMarkdown, renderJson } from './lib/render.mjs';

export function parseArgs(argv) {
  const args = { feature: null, json: false, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--feature') args.feature = argv[++i];
    else if (a === '--json') args.json = true;
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

/**
 * Compile the contract for one feature. `overrides` (trackedFiles, headSha,
 * readFile) let tests run this against a fixture without a real git repo —
 * see gatherSources' own header for why. Returns the contract object; throws
 * UnknownFeatureError for the one hard-failure case.
 */
export function resolveContract(repoRoot, requestedId, overrides = {}) {
  const log = overrides.log ?? (() => {});
  const { registry, rawText } = loadRegistry(repoRoot);
  const { canonicalId, via, note } = resolveFeatureId(requestedId, registry);
  const entry = registry.features[canonicalId];

  resetClaimCounter();

  const trackedFiles = overrides.trackedFiles ?? gitTrackedFiles(repoRoot);
  const headSha = overrides.headSha ?? gitHeadSha(repoRoot);
  const sources = gatherSources(repoRoot, canonicalId, entry, { ...overrides, trackedFiles, headSha });

  const registryClaims = claimsFromRegistry(canonicalId, entry, rawText);
  const featureRegistryClaims = claimsFromFeatureRegistry(sources);
  const featureDocClaims = claimsFromFeatureDoc(sources, log);
  const ledgerChangesClaims = claimsFromLedger(sources.ledgerChangesPath, sources.ledgerChangesText, 'ledger_changes');
  const ledgerTestsClaims = claimsFromLedger(sources.ledgerTestsPath, sources.ledgerTestsText, 'ledger_tests');
  const { claims: adrClaims, relevantAdrFiles } = claimsFromAdrs(sources, canonicalId, sources.featureDocPath);
  const migrationClaims = claimsFromMigrations(sources);

  const allClaims = [
    ...registryClaims,
    ...featureRegistryClaims,
    ...featureDocClaims,
    ...ledgerChangesClaims,
    ...ledgerTestsClaims,
    ...adrClaims,
    ...migrationClaims,
  ];

  const registryFeatureIds = new Set(Object.keys(registry.features ?? {}));
  checkPathExistence(allClaims, trackedFiles, headSha, log);
  checkSchemaExistence(allClaims, sources, registryFeatureIds, log);
  checkLedgerCorrections(ledgerChangesClaims);
  checkLedgerCorrections(ledgerTestsClaims);
  checkAdrSupersedes(adrClaims, relevantAdrFiles);

  const { current, superseded } = partition(allClaims);

  const sourcesConsulted = [{ path: 'memory/registry.yml', kind: 'registry' }];
  if (sources.featureDocPath && sources.featureDocText) {
    sourcesConsulted.push({ path: sources.featureDocPath, kind: 'feature_doc' });
  }
  if (sources.ledgerChangesText) sourcesConsulted.push({ path: sources.ledgerChangesPath, kind: 'ledger_changes' });
  if (sources.ledgerTestsText) sourcesConsulted.push({ path: sources.ledgerTestsPath, kind: 'ledger_tests' });
  if (sources.featureKeys.length > 0 && sources.featureRegistryText) {
    sourcesConsulted.push({ path: sources.featureRegistryPath, kind: 'feature_registry_ts' });
  }
  if (sources.databaseTypesText) sourcesConsulted.push({ path: sources.databaseTypesPath, kind: 'database_types' });
  for (const f of relevantAdrFiles) sourcesConsulted.push({ path: f.path, kind: 'adr' });
  for (const f of sources.migrationFiles) sourcesConsulted.push({ path: f.path, kind: 'migration' });

  return {
    tool: 'contract:resolve',
    requested_id: requestedId,
    feature_id: canonicalId,
    resolution: { via, note },
    anchor_sha: headSha,
    current_contract: current,
    superseded_claims: superseded,
    sources_consulted: sourcesConsulted,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.feature) {
    console.log('Usage: npm run contract:resolve -- --feature <id> [--json] [--out <path>]');
    process.exitCode = args.help ? 0 : 2;
    return;
  }

  const repoRoot = process.cwd();
  let contract;
  try {
    contract = resolveContract(repoRoot, args.feature, {
      log: (msg) => console.error(`[contract:resolve] ${msg}`),
    });
  } catch (err) {
    if (err instanceof UnknownFeatureError) {
      console.error(`[contract:resolve] ${err.message}`);
      process.exitCode = 2;
      return;
    }
    throw err;
  }

  const content = args.json ? renderJson(contract) : renderMarkdown(contract);
  if (args.out) {
    writeFileSync(resolvePath(repoRoot, args.out), content, 'utf-8');
    console.log(`Wrote ${args.out}`);
  } else {
    console.log(content);
  }
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
