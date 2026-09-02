#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { classifyCredential, SHAPE_HINTS } from '../src/lib/admin/credential-shape.mjs';

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

/**
 * SHAPE, not length.
 *
 * Until 2026-09-01 this script accepted any value of >= 10 characters that did
 * not START with `your-`/`replace-`/`changeme`/`todo`/`example`. Every one of
 * the eight values in the local `.env.local` was exactly 11 characters, so the
 * script printed PASS over a wall of placeholders — and `sentry-api.ts`'s
 * identical `usableSecret()` treated the same 11-character Sentry token as
 * configured, which is why every local Sentry read failed soft and silently.
 *
 * The validators now live in ONE place, `src/lib/admin/credential-shape.mjs`,
 * shared with the runtime readers, so the deploy-time check and the code that
 * consumes the value cannot disagree about what "usable" means. Each check
 * names the SHAPE it expected; it never prints the value.
 *
 * @param {import('../src/lib/admin/credential-shape.mjs').CredentialKind} kind
 * @param {string[]} names  env var names, first usable wins
 */
function check(kind, names) {
  /** @type {import('../src/lib/admin/credential-shape.mjs').CredentialVerdict} */
  let worst = 'missing';
  for (const name of names) {
    const verdict = classifyCredential(kind, process.env[name]);
    if (verdict === 'ok') return { ok: true, verdict, name };
    // Report the most informative failure: malformed/placeholder beats missing.
    if (verdict !== 'missing') worst = verdict;
  }
  return { ok: false, verdict: worst, name: names[0] };
}

const checks = [
  {
    label: 'Sentry read token',
    ...check('sentry_auth_token', ['SENTRY_READ_TOKEN', 'SENTRY_AUTH_TOKEN']),
    kind: 'sentry_auth_token',
    required: 'SENTRY_READ_TOKEN preferred, SENTRY_AUTH_TOKEN fallback',
  },
  { label: 'Sentry org', ...check('sentry_slug', ['SENTRY_ORG']), kind: 'sentry_slug', required: 'SENTRY_ORG' },
  { label: 'Sentry project', ...check('sentry_slug', ['SENTRY_PROJECT']), kind: 'sentry_slug', required: 'SENTRY_PROJECT' },
  { label: 'Vercel API token', ...check('vercel_api_token', ['VERCEL_API_TOKEN']), kind: 'vercel_api_token', required: 'VERCEL_API_TOKEN' },
  { label: 'Vercel project id', ...check('vercel_project_id', ['VERCEL_PROJECT_ID']), kind: 'vercel_project_id', required: 'VERCEL_PROJECT_ID' },
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
    ...check('internal_log_key', ['INTERNAL_LOG_KEY']),
    kind: 'internal_log_key',
    required: 'INTERNAL_LOG_KEY',
  },
  {
    // Inngest was absent from this list entirely — not checked loosely,
    // not checked at all. `grep -rn INNGEST_SIGNING_KEY scripts/ package.json`
    // returned zero hits while production was rejecting every signed request
    // from Inngest Cloud, and every round submitted since 2026-07-30 logged
    // "Inngest API Error: 404 Event key not found".
    //
    // SAY WHAT THIS CANNOT DO: shape is not validity. A rotated key is
    // still well-formed and still passes here — which is exactly the failure
    // that happened. The real detector is the runtime diagnosis in
    // src/app/api/inngest/route.ts (mismatch) plus src/lib/inngest/credentials.ts
    // (missing/malformed, reported to the Bridge in production), and the
    // end-to-end proof is `node scripts/inngest-health-check.mjs`. This check
    // only closes the cheaper gap: a key that is missing or cannot be a key.
    label: 'Inngest signing key (shape only — cannot detect a stale key)',
    ...check('inngest_signing_key', ['INNGEST_SIGNING_KEY']),
    kind: 'inngest_signing_key',
    required: 'INNGEST_SIGNING_KEY',
  },
  {
    label: 'Inngest event key (shape only — cannot detect a stale key)',
    ...check('inngest_event_key', ['INNGEST_EVENT_KEY']),
    kind: 'inngest_event_key',
    required: 'INNGEST_EVENT_KEY',
  },
];

const failures = checks.filter((check) => !check.ok);

for (const check of checks) {
  const detail = check.ok ? '' : ` — ${SHAPE_HINTS[check.kind]}`;
  console.log(`${check.ok ? 'ok' : check.verdict} ${check.label} (${check.required})${detail}`);
}

// Advisory, never a hard check: CI's drift job does not carry a DSN, and
// adding it to `checks` would turn "some configured, one missing" into a
// permanent drift failure there. A DSN that is SET but cannot be a DSN is
// still worth a line — Sentry.init accepts it silently and reports nothing.
for (const name of ['NEXT_PUBLIC_SENTRY_DSN', 'SENTRY_DSN']) {
  const verdict = classifyCredential('sentry_dsn', process.env[name]);
  if (verdict !== 'missing' && verdict !== 'ok') {
    console.log(`warn ${name} is set but ${verdict} — ${SHAPE_HINTS.sentry_dsn}`);
  }
}

const teamVerdict = classifyCredential('vercel_team_id', process.env.VERCEL_TEAM_ID);
if (teamVerdict !== 'ok') {
  console.log(
    `warn Vercel team id is ${teamVerdict}; team deployments may be incomplete (VERCEL_TEAM_ID` +
      `${teamVerdict === 'missing' ? '' : ` — ${SHAPE_HINTS.vercel_team_id}`})`,
  );
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
 *
 * "Nothing configured" means nothing SET. A placeholder or malformed value is
 * set — it counts as provisioned-and-wrong, and fails.
 */
const driftMode = process.argv.includes('--drift');
const nothingSet = failures.length === checks.length && failures.every((f) => f.verdict === 'missing');

if (driftMode && nothingSet) {
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
      `Helm Bridge env DRIFT: ${checks.length - failures.length} of ${checks.length} values are usable, ` +
        `but ${failures.length} are missing, placeholder or malformed. A partially-configured Bridge ` +
        'silently degrades (blank panels, edge errors that never reach admin_events) ' +
        'rather than failing visibly, so this is treated as an error.',
    );
  } else {
    console.error(
      `Helm Bridge env check failed: ${failures.length} required value(s) missing, placeholder or malformed.`,
    );
  }
  process.exit(1);
}

console.log('Helm Bridge env check passed.');
