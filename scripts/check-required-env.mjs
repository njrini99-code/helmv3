import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFlagsFile } from './flags/lib.mjs';
import {
  PUBLISHABLE_KEY_ENV,
  LEGACY_ANON_KEY_ENV,
  SECRET_KEY_ENV,
  LEGACY_SERVICE_ROLE_KEY_ENV,
} from '../src/lib/supabase/keys.mjs';
import { helpOnly } from './lib/cli-guard.mjs';

helpOnly({
  name: 'scripts/check-required-env.mjs',
  summary:
    "Checks that the environment variables a production build needs are present, and fails the build when one is missing. Runs as the prebuild step; reads only the names and presence of variables.",
  secrets: "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY and the others it lists",
});

const REQUIRED_URL_ENV = 'NEXT_PUBLIC_SUPABASE_URL';

// One of each pair, new-format name first — mirrors the precedence in
// src/lib/supabase/keys.mjs (getPublishableKey()/getSecretKey()), which this
// plain-`node` build script cannot import as a runtime dependency the same
// way the TS clients do; it imports only the shared env-var NAME constants
// so the two never drift.
const REQUIRED_PUBLISHABLE_KEY_ENVS = [PUBLISHABLE_KEY_ENV, LEGACY_ANON_KEY_ENV];
const REQUIRED_SECRET_KEY_ENVS = [SECRET_KEY_ENV, LEGACY_SERVICE_ROLE_KEY_ENV];

function isSet(env, key) {
  return Boolean(env[key] && env[key].trim());
}

// Groups where ONE of the names must be set, as the code reads them
// (src/lib/auth/rate-limit.ts, src/lib/cache/index.ts: KV_* wins, UPSTASH_* is
// the fallback; src/instrumentation.ts: NEXT_PUBLIC_SENTRY_DSN, then SENTRY_DSN).
const PRODUCTION_ONE_OF = [
  ['KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL'],
  ['KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN'],
  ['NEXT_PUBLIC_SENTRY_DSN', 'SENTRY_DSN'],
];
// Always required in a production build. CRON_SECRET guards every /api/cron
// route; SENTRY_AUTH_TOKEN uploads source maps (next.config.mjs).
const PRODUCTION_REQUIRED = ['CRON_SECRET', 'SENTRY_AUTH_TOKEN'];
// Stripe is not live in production yet (neither key is set there), so presence
// is not required. The pair must not be half-configured: a secret key without
// the webhook secret takes payments it cannot reconcile.
const STRIPE_PAIR = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'];

const CLUBHOUSE_TEAMS_ENV = 'HELM_CLUBHOUSE_TEAMS';
const FLAGS_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'config', 'feature-flags.yml');

/** Ids of the active clubhouse flags that are on for this Vercel environment. */
export function clubhouseFlagsOn(vercelEnv, flags) {
  return flags
    .filter(
      (flag) =>
        typeof flag?.feature_id === 'string' &&
        flag.feature_id.includes('clubhouse') &&
        flag.status === 'active' &&
        flag.environment?.[vercelEnv] === true
    )
    .map((flag) => flag.feature_id);
}

function loadFlags() {
  try {
    return readFlagsFile(FLAGS_PATH);
  } catch (err) {
    // Without the registry the clubhouse rule cannot be evaluated. The flag
    // checker (npm run flags:check) owns a malformed registry; do not fail the
    // build here for it, but say so, so a skipped rule is visible in the log.
    process.stderr.write(
      `[check-required-env] could not read config/feature-flags.yml (${err instanceof Error ? err.message : err}); ` +
        `the ${CLUBHOUSE_TEAMS_ENV} rule was skipped\n`
    );
    return [];
  }
}

export function checkRequiredEnv(env = process.env, { flags, warn } = {}) {
  const vercelEnv = env['VERCEL_ENV'];
  if (vercelEnv !== 'production' && vercelEnv !== 'preview') return;

  if (!isSet(env, REQUIRED_URL_ENV)) {
    throw new Error(`Missing required env var: ${REQUIRED_URL_ENV}`);
  }

  if (!REQUIRED_PUBLISHABLE_KEY_ENVS.some((key) => isSet(env, key))) {
    throw new Error(
      `Missing required env var: one of ${REQUIRED_PUBLISHABLE_KEY_ENVS.join(', ')}`
    );
  }

  if (!REQUIRED_SECRET_KEY_ENVS.some((key) => isSet(env, key))) {
    throw new Error(`Missing required env var: one of ${REQUIRED_SECRET_KEY_ENVS.join(', ')}`);
  }

  if (/placeholder\.supabase\.co/i.test(env['NEXT_PUBLIC_SUPABASE_URL'])) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL contains placeholder.supabase.co — set a real Supabase URL'
    );
  }

  // The clubhouse canary. An unset HELM_CLUBHOUSE_TEAMS means EVERY team gets
  // Clubhouse (src/clubhouse/gate.ts), so while a clubhouse flag is on the
  // value has to be a deliberate choice: team ids, or * for everyone. A
  // production build fails without it; a preview build only warns, because a
  // preview that is missing it still works and blocking previews would stall
  // UI verification.
  const activeClubhouseFlags = clubhouseFlagsOn(vercelEnv, flags ?? loadFlags());
  const clubhouseMissing = activeClubhouseFlags.length > 0 && !isSet(env, CLUBHOUSE_TEAMS_ENV);

  if (vercelEnv !== 'production') {
    if (clubhouseMissing) {
      (warn ?? ((message) => process.stderr.write(`${message}\n`)))(
        `[check-required-env] ${CLUBHOUSE_TEAMS_ENV} is unset while ${activeClubhouseFlags.join(', ')} ` +
          `is on in preview, so every team gets Clubhouse. Set team ids, or * to mean everyone.`
      );
    }
    return;
  }

  // Production-only requirements. Every problem is reported in one message so a
  // failed deploy is fixed in one pass, not one variable per build.
  const problems = [];
  for (const key of PRODUCTION_REQUIRED) {
    if (!isSet(env, key)) problems.push(key);
  }
  for (const group of PRODUCTION_ONE_OF) {
    if (!group.some((key) => isSet(env, key))) problems.push(`one of ${group.join(', ')}`);
  }
  const stripeSet = STRIPE_PAIR.filter((key) => isSet(env, key));
  if (stripeSet.length > 0 && stripeSet.length < STRIPE_PAIR.length) {
    problems.push(`${STRIPE_PAIR.find((key) => !isSet(env, key))} (set together with ${stripeSet[0]})`);
  }
  if (clubhouseMissing) {
    problems.push(
      `${CLUBHOUSE_TEAMS_ENV} (${activeClubhouseFlags.join(', ')} is on in production; ` +
        `unset means every team gets Clubhouse — set team ids, or * to mean everyone)`
    );
  }
  if (problems.length > 0) {
    throw new Error(`Missing required env var for a production build: ${problems.join('; ')}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    checkRequiredEnv();
    process.stdout.write('[check-required-env] OK\n');
    process.exit(0);
  } catch (err) {
    process.stderr.write(err.message + '\n');
    process.exit(1);
  }
}
