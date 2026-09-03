#!/usr/bin/env node
/**
 * Generates `src/lib/flags/registry.generated.ts` from
 * `config/feature-flags.yml`.
 *
 * Refuses to write (or, in `--check` mode, reports drift for) a registry
 * containing a NEVER-GATE violation or a schema error — the generator is
 * where those rules are actually enforced; `scripts/check-feature-flags.mjs`
 * re-derives the same violations independently from the YAML so a
 * hand-edited generated file cannot bypass them.
 *
 * `--check`: non-mutating. Computes the expected file content and compares
 * byte-for-byte against what's on disk; exits 1 on drift or missing file.
 * Same pattern as `npm run docs:inventory-check` (scripts/regen-docs.mjs).
 * Without `--check`: writes the file.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFlagsFile, validateFlags, renderRegistryModule } from './lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const YAML_PATH = resolve(ROOT, 'config', 'feature-flags.yml');
const OUT_PATH = resolve(ROOT, 'src', 'lib', 'flags', 'registry.generated.ts');

function main() {
  const checkMode = process.argv.includes('--check');

  const flags = readFlagsFile(YAML_PATH);

  // Only NEVER-GATE + hard schema errors block generation — expiry
  // governance (expired-active, missing owner/cleanup_plan, temporary
  // migration past due) is `scripts/check-feature-flags.mjs`'s job, so a
  // flag that is merely due for cleanup does not also block the build.
  const blocking = new Set(['never_gate', 'schema', 'invalid_type', 'invalid_status', 'non_boolean_environment', 'missing_kill_switch_behavior', 'duplicate_feature_id']);
  const issues = validateFlags(flags).filter((i) => blocking.has(i.rule));

  if (issues.length > 0) {
    console.error(`flags:generate refused to write registry.generated.ts — ${issues.length} blocking issue(s):`);
    for (const issue of issues) {
      console.error(`  [${issue.rule}] ${issue.feature_id}: ${issue.detail}`);
    }
    process.exit(1);
  }

  const rendered = renderRegistryModule(flags);

  if (checkMode) {
    if (!existsSync(OUT_PATH)) {
      console.error(`flags:generate --check: ${OUT_PATH} does not exist. Run \`npm run flags:generate\`.`);
      process.exit(1);
    }
    const onDisk = readFileSync(OUT_PATH, 'utf8');
    if (onDisk !== rendered) {
      console.error('flags:generate --check: registry.generated.ts is stale relative to config/feature-flags.yml.');
      console.error('Run `npm run flags:generate` and commit the result.');
      process.exit(1);
    }
    console.log(`flags:generate --check: registry.generated.ts is current (${flags.length} flag(s)).`);
    return;
  }

  writeFileSync(OUT_PATH, rendered, 'utf8');
  console.log(`Wrote ${OUT_PATH} (${flags.length} flag(s)).`);
}

main();
