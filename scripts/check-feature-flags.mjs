#!/usr/bin/env node
/**
 * The feature-flag expiry / governance gate (`npm run flags:check`'s
 * governance half — see package.json; the other half is
 * `flags:generate -- --check`, which catches generated-file drift).
 *
 * Fails on, re-parsing `config/feature-flags.yml` directly (never trusting
 * `registry.generated.ts`):
 *   - an expired flag whose status is still "active"
 *   - a flag with no owner or no cleanup_plan
 *   - a temporary_migration flag with no expires_at, or past its expires_at
 *   - a NEVER-GATE violation (auth/RLS/tenancy/membership/persistence)
 *
 * Exit 0 = clean. Exit 1 = one or more violations, printed by feature_id
 * and rule. Exit 2 = the YAML itself could not be read/parsed — an
 * INFRASTRUCTURE_FAILURE, not a clean pass (mirrors the exit-code contract
 * `npm run guards` documents in .github/workflows/ci.yml: a check that did
 * not run is not a check that passed).
 */

import { readFlagsFile, validateFlags } from './flags/lib.mjs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const YAML_PATH = resolve(ROOT, 'config', 'feature-flags.yml');

const GOVERNANCE_RULES = new Set([
  'expired_active',
  'missing_owner',
  'missing_cleanup_plan',
  'temporary_migration_missing_expiry',
  'temporary_migration_expired',
  'never_gate',
]);

/**
 * Runs the governance checks over an already-parsed flag list. Exported for
 * `scripts/__tests__/check-feature-flags.test.mjs` (node:test) — the CLI
 * entry point below is a thin wrapper around this.
 */
export function checkFlags(flags, { now = new Date() } = {}) {
  return validateFlags(flags, { now }).filter((issue) => GOVERNANCE_RULES.has(issue.rule));
}

function formatIssue(issue) {
  return `  [${issue.rule}] ${issue.feature_id}: ${issue.detail}`;
}

export function run({ readFile = () => readFlagsFile(YAML_PATH), now = new Date(), log = console.log, error = console.error } = {}) {
  let flags;
  try {
    flags = readFile();
  } catch (err) {
    error(`flags:check could not read/parse config/feature-flags.yml: ${err instanceof Error ? err.message : String(err)}`);
    return 2;
  }

  const issues = checkFlags(flags, { now });
  if (issues.length > 0) {
    error(`flags:check found ${issues.length} governance violation(s):`);
    for (const issue of issues) error(formatIssue(issue));
    return 1;
  }

  log(`flags:check clean: ${flags.length} flag(s), no governance violations.`);
  return 0;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  process.exit(run());
}
