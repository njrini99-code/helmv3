#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const ROOT = process.cwd();
const ENV_FILES = [
  '.env.local',
  '.env.production.local',
  path.join('.vercel', '.env.production.local'),
];

for (const file of ENV_FILES) {
  const fullPath = path.join(ROOT, file);
  if (fs.existsSync(fullPath)) {
    dotenv.config({ path: fullPath, override: false, quiet: true });
  }
}

function isPlaceholder(value) {
  return /^(your-|replace-|changeme|todo|example)/i.test(String(value).trim());
}

function hasUsableSecret(name) {
  const value = process.env[name]?.trim();
  return Boolean(value && value.length >= 10 && !isPlaceholder(value));
}

function hasUsableValue(name) {
  const value = process.env[name]?.trim();
  return Boolean(value && !isPlaceholder(value));
}

const checks = [
  {
    label: 'Sentry read token',
    ok: hasUsableSecret('SENTRY_READ_TOKEN') || hasUsableSecret('SENTRY_AUTH_TOKEN'),
    required: 'SENTRY_READ_TOKEN preferred, SENTRY_AUTH_TOKEN fallback',
  },
  { label: 'Sentry org', ok: hasUsableValue('SENTRY_ORG'), required: 'SENTRY_ORG' },
  { label: 'Sentry project', ok: hasUsableValue('SENTRY_PROJECT'), required: 'SENTRY_PROJECT' },
  { label: 'Vercel API token', ok: hasUsableSecret('VERCEL_API_TOKEN'), required: 'VERCEL_API_TOKEN' },
  { label: 'Vercel project id', ok: hasUsableValue('VERCEL_PROJECT_ID'), required: 'VERCEL_PROJECT_ID' },
  {
    // Shared secret the EDGE-side error paths use to post into the Bridge:
    // instrumentation.ts:280, proxy.ts:119, and middleware.ts:342/656 each
    // do `const key = process.env.INTERNAL_LOG_KEY; if (!key) return;`.
    // That bail-out is deliberate (fail-soft), but it is also TOTALLY
    // SILENT — with the var unset, every edge-origin error stops reaching
    // admin_events across all four sites and the Bridge simply shows fewer
    // errors, which is indistinguishable from things going well. Checking
    // it here means the failure surfaces at deploy time instead of being
    // discovered retroactively during an actual edge incident.
    label: 'Internal log key (edge → Bridge error path)',
    ok: hasUsableSecret('INTERNAL_LOG_KEY'),
    required: 'INTERNAL_LOG_KEY',
  },
];

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'missing'} ${check.label} (${check.required})`);
}

if (!hasUsableValue('VERCEL_TEAM_ID')) {
  console.log('warn Vercel team id is not set; team deployments may be incomplete (VERCEL_TEAM_ID)');
}

/**
 * DRIFT MODE (`--drift`, used by CI).
 *
 * CI has none of these secrets, so running the plain check there would fail
 * on every single PR — a second permanently-red check nobody reads, which is
 * worse than no check at all.
 *
 * The distinction that actually carries signal:
 *
 *   - NOTHING configured  → this environment simply does not provision Bridge
 *                           integrations (exactly CI's situation). Report and
 *                           exit 0. Not a finding.
 *   - SOME configured     → this environment DOES provision them and one has
 *                           gone missing or been left as a placeholder. That
 *                           is real drift — a rotated token, a dropped var —
 *                           and it fails.
 *
 * So the job stays green until the secrets are actually wired into CI, and
 * from that moment on it starts catching regressions automatically with no
 * follow-up edit. Removing a var that IS set still fails loudly.
 */
const driftMode = process.argv.includes('--drift');

if (driftMode && failures.length === checks.length) {
  console.log(
    'skip No Helm Bridge integration env is provisioned here (0 of ' +
      `${checks.length} set) — nothing to drift-check. This is expected in CI ` +
      'until the secrets are wired in; once any one of them is set, a missing ' +
      'sibling becomes a hard failure.',
  );
  process.exit(0);
}

if (failures.length > 0) {
  if (driftMode) {
    console.error(
      `Helm Bridge env DRIFT: ${checks.length - failures.length} of ${checks.length} values are set, ` +
        `but ${failures.length} are missing or placeholder. A partially-configured Bridge ` +
        'silently degrades (blank panels, edge errors that never reach admin_events) ' +
        'rather than failing visibly, so this is treated as an error.',
    );
  } else {
    console.error(`Helm Bridge env check failed: ${failures.length} required value(s) missing or placeholder.`);
  }
  process.exit(1);
}

console.log('Helm Bridge env check passed.');
