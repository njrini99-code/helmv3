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

export function checkRequiredEnv(env = process.env) {
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

  if (vercelEnv !== 'production') return;

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
