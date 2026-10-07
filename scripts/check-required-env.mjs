import {
  PUBLISHABLE_KEY_ENV,
  LEGACY_ANON_KEY_ENV,
  SECRET_KEY_ENV,
  LEGACY_SERVICE_ROLE_KEY_ENV,
} from '../src/lib/supabase/keys.mjs';

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
