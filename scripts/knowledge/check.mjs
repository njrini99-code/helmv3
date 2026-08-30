#!/usr/bin/env node
/**
 * knowledge:check — the STATIC integrity of the semantic knowledge system.
 *
 * Static means: no network, no database, no connector, no GitHub. Everything
 * here is provable from the working tree alone, which is why CI can require it
 * on every PR and why it never reports UNKNOWN. Runtime capability truth lives
 * in `npm run control-plane:verify`, and that separation is deliberate — a
 * check that sometimes cannot answer teaches people to ignore a red result.
 *
 * The stages, in the order a failure is most useful:
 *
 *   check-doc-coverage        every mapped feature has the docs it claims
 *   stale-doc-check           feature code changed without its docs moving
 *   check-ledger-integrity    incidents, repair units, ledgers, gaps and
 *                             decisions all refer to things that exist
 *   check-feature-registry    the semantic router and the runtime observability
 *                             vocabulary still agree about who owns what
 *   gen-feature-map --check   the generated feature map still matches its sources
 *
 * Until 2026-08-30 this ran only the first two. Together they establish that
 * *some* doc changed alongside *some* feature code — not that the two feature
 * maps agree, which is the thing that had actually drifted.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);

execFileSync(process.execPath, ['scripts/knowledge/check-doc-coverage.mjs', ...args], {
  stdio: 'inherit',
});
execFileSync(process.execPath, ['scripts/knowledge/stale-doc-check.mjs', ...args], {
  stdio: 'inherit',
});
execFileSync(process.execPath, ['scripts/knowledge/check-ledger-integrity.mjs', ...args], {
  stdio: 'inherit',
});

// The registry checker is TypeScript on purpose: FEATURE_KEYS is a Set derived
// from FEATURE_REGISTRY, not an array literal, so it has to be IMPORTED. A
// regex over the source would be the substring-is-not-a-mechanism error this
// repo keeps paying for.
const tsx = resolve(ROOT, 'node_modules/.bin/tsx');
if (!existsSync(tsx)) {
  // Loud, and a failure: silently skipping a required stage is how a check
  // starts passing for the wrong reason.
  console.error(
    'knowledge:check: node_modules/.bin/tsx is missing, so the feature-registry\n' +
      'reconciliation could NOT run. Install dependencies and re-run; this is a\n' +
      'failure rather than a skip, because a skipped stage reads as a pass.',
  );
  process.exit(2);
}
execFileSync(tsx, ['scripts/knowledge/check-feature-registry.ts', ...args], {
  stdio: 'inherit',
  cwd: ROOT,
});

// The generated feature map is a PROJECTION. --check re-renders and diffs
// without writing, so a stale map fails here instead of quietly describing a
// registry that has moved.
execFileSync(tsx, ['scripts/knowledge/gen-feature-map.ts', '--check'], {
  stdio: 'inherit',
  cwd: ROOT,
});
