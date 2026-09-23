#!/usr/bin/env node
/**
 * lint-supabase-ratchet.mjs — combined entry point for the two Supabase
 * lint ratchets D8.3 requires:
 *
 *   (a) helm/no-unchunked-in-filter  -> scripts/supabase-chunk-audit.mjs
 *   (b) helm/no-unchecked-supabase-error -> scripts/supabase-error-audit.mjs
 *       (this rule and its ratchet predate D8; wired in here so
 *       `npm run lint:supabase:ratchet` is the one command that gates both)
 *
 * Runs both, forwards --update to both, fails if either fails.
 *
 *   npm run lint:supabase:ratchet             # check both (exit 1 on any regression)
 *   npm run lint:supabase:ratchet -- --update  # re-baseline both
 */
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const extraArgs = process.argv.slice(2);

const scripts = ['scripts/supabase-chunk-audit.mjs', 'scripts/supabase-error-audit.mjs'];

let failed = false;
for (const script of scripts) {
  console.log(`\n=== ${script} ${extraArgs.join(' ')} ===`);
  const result = spawnSync('node', [script, ...extraArgs], { cwd: ROOT, stdio: 'inherit' });
  if (result.status !== 0) failed = true;
}

process.exit(failed ? 1 : 0);
