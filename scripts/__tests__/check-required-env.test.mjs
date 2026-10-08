// This previously ran under `node --test`, which nothing invokes, so it
// never executed. Promoted to vitest (issue #1194).
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { checkRequiredEnv, clubhouseFlagsOn } from '../check-required-env.mjs';

// What a production build needs on top of Supabase (2026-10-07): the cron
// secret, a KV/Upstash endpoint and token, a Sentry DSN and upload token.
// Stripe is deliberately absent: billing is not live and presence is not required.
const PROD_EXTRAS = {
  CRON_SECRET: 'cron-secret-value',
  KV_REST_API_URL: 'https://kv.example.upstash.io',
  KV_REST_API_TOKEN: 'kv-token-value',
  NEXT_PUBLIC_SENTRY_DSN: 'https://key@o1.ingest.sentry.io/1',
  SENTRY_AUTH_TOKEN: 'sentry-auth-token-value',
};

test('passes when all canonical Supabase vars set and URL is real', () => {
  assert.doesNotThrow(() =>
    checkRequiredEnv({
      VERCEL_ENV: 'production',
      ...PROD_EXTRAS,
      NEXT_PUBLIC_SUPABASE_URL: 'https://qmnssrrolpinvwjjnufo.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-value',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-value',
    })
  );
});

test('throws when URL contains placeholder.supabase.co in production', () => {
  assert.throws(
    () =>
      checkRequiredEnv({
        VERCEL_ENV: 'production',
        NEXT_PUBLIC_SUPABASE_URL: 'https://placeholder.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-value',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-value',
      }),
    /placeholder/i
  );
});

test('throws when NEXT_PUBLIC_SUPABASE_URL missing in preview', () => {
  assert.throws(
    () =>
      checkRequiredEnv({
        VERCEL_ENV: 'preview',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-value',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-value',
      }),
    /NEXT_PUBLIC_SUPABASE_URL/
  );
});

test('does not throw in non-Vercel local dev', () => {
  assert.doesNotThrow(() =>
    checkRequiredEnv({
      VERCEL_ENV: undefined,
      NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
    })
  );
});

test('throws when URL is whitespace-only in production', () => {
  assert.throws(
    () =>
      checkRequiredEnv({
        VERCEL_ENV: 'production',
        NEXT_PUBLIC_SUPABASE_URL: '   ',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-value',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-value',
      }),
    /NEXT_PUBLIC_SUPABASE_URL/
  );
});

test('throws when URL has uppercase PLACEHOLDER (case-insensitive)', () => {
  assert.throws(
    () =>
      checkRequiredEnv({
        VERCEL_ENV: 'production',
        NEXT_PUBLIC_SUPABASE_URL: 'https://PLACEHOLDER.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-value',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-value',
      }),
    /placeholder/i
  );
});

// Inngest was removed: INNGEST_* variables are no longer required or
// validated, and a stale one lingering in the environment must not fail a build.
test('does not throw on a lingering INNGEST_EVENT_KEY without a signing key (no longer validated)', () => {
  assert.doesNotThrow(() =>
    checkRequiredEnv({
      VERCEL_ENV: 'production',
      ...PROD_EXTRAS,
      NEXT_PUBLIC_SUPABASE_URL: 'https://qmnssrrolpinvwjjnufo.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-value',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-value',
      INNGEST_EVENT_KEY: 'a-real-looking-event-key-value',
    })
  );
});

// Phase 2 / P6: new-format Supabase API keys (sb_publishable_.../sb_secret_...)
// are accepted in place of the legacy JWT pair, so the owner can disable the
// legacy keys (one of which is leaked in git history) without a code change.

test('passes with ONLY the new-format publishable + secret keys set (no legacy vars)', () => {
  assert.doesNotThrow(() =>
    checkRequiredEnv({
      VERCEL_ENV: 'production',
      ...PROD_EXTRAS,
      NEXT_PUBLIC_SUPABASE_URL: 'https://qmnssrrolpinvwjjnufo.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc123',
      SUPABASE_SECRET_KEY: 'sb_secret_abc123',
    })
  );
});

test('passes with a mix — new-format publishable key, legacy service-role key', () => {
  assert.doesNotThrow(() =>
    checkRequiredEnv({
      VERCEL_ENV: 'production',
      ...PROD_EXTRAS,
      NEXT_PUBLIC_SUPABASE_URL: 'https://qmnssrrolpinvwjjnufo.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc123',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-value',
    })
  );
});

test('passes with a mix — legacy anon key, new-format secret key', () => {
  assert.doesNotThrow(() =>
    checkRequiredEnv({
      VERCEL_ENV: 'preview',
      NEXT_PUBLIC_SUPABASE_URL: 'https://qmnssrrolpinvwjjnufo.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-value',
      SUPABASE_SECRET_KEY: 'sb_secret_abc123',
    })
  );
});

test('throws naming BOTH publishable-key env vars when neither is set', () => {
  assert.throws(
    () =>
      checkRequiredEnv({
        VERCEL_ENV: 'production',
        NEXT_PUBLIC_SUPABASE_URL: 'https://qmnssrrolpinvwjjnufo.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-value',
      }),
    /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.*NEXT_PUBLIC_SUPABASE_ANON_KEY/
  );
});

test('throws naming BOTH secret-key env vars when neither is set', () => {
  assert.throws(
    () =>
      checkRequiredEnv({
        VERCEL_ENV: 'production',
        NEXT_PUBLIC_SUPABASE_URL: 'https://qmnssrrolpinvwjjnufo.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-value',
      }),
    /SUPABASE_SECRET_KEY.*SUPABASE_SERVICE_ROLE_KEY/
  );
});

test('a blank new-format value does not satisfy the requirement — legacy fallback still checked', () => {
  assert.doesNotThrow(() =>
    checkRequiredEnv({
      VERCEL_ENV: 'production',
      ...PROD_EXTRAS,
      NEXT_PUBLIC_SUPABASE_URL: 'https://qmnssrrolpinvwjjnufo.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '   ',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-value',
      SUPABASE_SECRET_KEY: '   ',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-value',
    })
  );
});

// --- Production-only requirements (plan phase 6, item 6.12) -----------------

const PROD_SUPABASE = {
  VERCEL_ENV: 'production',
  NEXT_PUBLIC_SUPABASE_URL: 'https://qmnssrrolpinvwjjnufo.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-value',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-value',
};
const NO_FLAGS = [];

test('a production build with only Supabase vars names every missing production var at once', () => {
  assert.throws(
    () => checkRequiredEnv(PROD_SUPABASE, { flags: NO_FLAGS }),
    (err) =>
      /CRON_SECRET/.test(err.message) &&
      /SENTRY_AUTH_TOKEN/.test(err.message) &&
      /KV_REST_API_URL, UPSTASH_REDIS_REST_URL/.test(err.message) &&
      /KV_REST_API_TOKEN, UPSTASH_REDIS_REST_TOKEN/.test(err.message) &&
      /NEXT_PUBLIC_SENTRY_DSN, SENTRY_DSN/.test(err.message)
  );
});

test('production passes with the full set', () => {
  assert.doesNotThrow(() => checkRequiredEnv({ ...PROD_SUPABASE, ...PROD_EXTRAS }, { flags: NO_FLAGS }));
});

test('production accepts the UPSTASH_* names and the server-side SENTRY_DSN instead of the first choices', () => {
  const env = {
    ...PROD_SUPABASE,
    CRON_SECRET: 'c',
    SENTRY_AUTH_TOKEN: 't',
    UPSTASH_REDIS_REST_URL: 'https://u.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'u-token',
    SENTRY_DSN: 'https://key@o1.ingest.sentry.io/1',
  };
  assert.doesNotThrow(() => checkRequiredEnv(env, { flags: NO_FLAGS }));
});

test('a whitespace-only CRON_SECRET counts as missing', () => {
  assert.throws(
    () => checkRequiredEnv({ ...PROD_SUPABASE, ...PROD_EXTRAS, CRON_SECRET: '   ' }, { flags: NO_FLAGS }),
    /CRON_SECRET/
  );
});

test('preview does not need the production-only vars', () => {
  assert.doesNotThrow(() =>
    checkRequiredEnv({ ...PROD_SUPABASE, VERCEL_ENV: 'preview' }, { flags: NO_FLAGS })
  );
});

test('Stripe is not required, but half of the pair is rejected', () => {
  const base = { ...PROD_SUPABASE, ...PROD_EXTRAS };
  assert.doesNotThrow(() => checkRequiredEnv(base, { flags: NO_FLAGS }));
  assert.doesNotThrow(() =>
    checkRequiredEnv({ ...base, STRIPE_SECRET_KEY: 'sk', STRIPE_WEBHOOK_SECRET: 'whsec' }, { flags: NO_FLAGS })
  );
  assert.throws(
    () => checkRequiredEnv({ ...base, STRIPE_SECRET_KEY: 'sk' }, { flags: NO_FLAGS }),
    /STRIPE_WEBHOOK_SECRET/
  );
  assert.throws(
    () => checkRequiredEnv({ ...base, STRIPE_WEBHOOK_SECRET: 'whsec' }, { flags: NO_FLAGS }),
    /STRIPE_SECRET_KEY/
  );
});

// --- HELM_CLUBHOUSE_TEAMS (plan phase 6, item 6.11) -------------------------

const clubhouseOnInProduction = [
  { feature_id: 'golf_clubhouse_ui', status: 'active', environment: { production: true, preview: true, development: true } },
];
const clubhouseOnlyInPreview = [
  { feature_id: 'golf_clubhouse_ui', status: 'active', environment: { production: false, preview: true, development: true } },
];

test('clubhouseFlagsOn reads only active clubhouse flags that are on for the environment', () => {
  const flags = [
    ...clubhouseOnlyInPreview,
    { feature_id: 'golf_clubhouse_front_door', status: 'archived', environment: { preview: true } },
    { feature_id: 'golf_other_flag', status: 'active', environment: { preview: true } },
  ];
  assert.deepEqual(clubhouseFlagsOn('preview', flags), ['golf_clubhouse_ui']);
  assert.deepEqual(clubhouseFlagsOn('production', flags), []);
});

test('production fails when a clubhouse flag is on and HELM_CLUBHOUSE_TEAMS is unset', () => {
  assert.throws(
    () => checkRequiredEnv({ ...PROD_SUPABASE, ...PROD_EXTRAS }, { flags: clubhouseOnInProduction }),
    /HELM_CLUBHOUSE_TEAMS.*every team/
  );
  assert.throws(
    () =>
      checkRequiredEnv({ ...PROD_SUPABASE, ...PROD_EXTRAS, HELM_CLUBHOUSE_TEAMS: '  ' }, { flags: clubhouseOnInProduction }),
    /HELM_CLUBHOUSE_TEAMS/
  );
});

test('production passes with team ids or * once a clubhouse flag is on', () => {
  for (const value of ['6e0b0a5c-1111-4222-8333-444455556666', 'a,b', '*']) {
    assert.doesNotThrow(() =>
      checkRequiredEnv(
        { ...PROD_SUPABASE, ...PROD_EXTRAS, HELM_CLUBHOUSE_TEAMS: value },
        { flags: clubhouseOnInProduction }
      )
    );
  }
});

test('production does not need HELM_CLUBHOUSE_TEAMS while every clubhouse flag is off there', () => {
  assert.doesNotThrow(() =>
    checkRequiredEnv({ ...PROD_SUPABASE, ...PROD_EXTRAS }, { flags: clubhouseOnlyInPreview })
  );
});

test('preview only warns when a clubhouse flag is on and HELM_CLUBHOUSE_TEAMS is unset', () => {
  const warnings = [];
  assert.doesNotThrow(() =>
    checkRequiredEnv(
      { ...PROD_SUPABASE, VERCEL_ENV: 'preview' },
      { flags: clubhouseOnlyInPreview, warn: (m) => warnings.push(m) }
    )
  );
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /HELM_CLUBHOUSE_TEAMS/);

  const quiet = [];
  checkRequiredEnv(
    { ...PROD_SUPABASE, VERCEL_ENV: 'preview', HELM_CLUBHOUSE_TEAMS: '*' },
    { flags: clubhouseOnlyInPreview, warn: (m) => quiet.push(m) }
  );
  assert.equal(quiet.length, 0);
});

test('the real flag registry loads and drives the default', () => {
  // No injected flags: this reads config/feature-flags.yml. Clubhouse is off in
  // production there, so a complete production env passes.
  assert.doesNotThrow(() => checkRequiredEnv({ ...PROD_SUPABASE, ...PROD_EXTRAS }));
});
