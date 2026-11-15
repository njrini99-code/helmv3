// This previously ran under `node --test`, which nothing invokes, so it
// never executed. Promoted to vitest (issue #1194).
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { checkRequiredEnv } from '../check-required-env.mjs';

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

test('a production build with only Supabase vars names every missing production var at once', () => {
  assert.throws(
    () => checkRequiredEnv(PROD_SUPABASE),
    (err) =>
      /CRON_SECRET/.test(err.message) &&
      /SENTRY_AUTH_TOKEN/.test(err.message) &&
      /KV_REST_API_URL, UPSTASH_REDIS_REST_URL/.test(err.message) &&
      /KV_REST_API_TOKEN, UPSTASH_REDIS_REST_TOKEN/.test(err.message) &&
      /NEXT_PUBLIC_SENTRY_DSN, SENTRY_DSN/.test(err.message)
  );
});

test('production passes with the full set', () => {
  assert.doesNotThrow(() => checkRequiredEnv({ ...PROD_SUPABASE, ...PROD_EXTRAS }));
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
  assert.doesNotThrow(() => checkRequiredEnv(env));
});

test('a whitespace-only CRON_SECRET counts as missing', () => {
  assert.throws(
    () => checkRequiredEnv({ ...PROD_SUPABASE, ...PROD_EXTRAS, CRON_SECRET: '   ' }),
    /CRON_SECRET/
  );
});

test('preview does not need the production-only vars', () => {
  assert.doesNotThrow(() =>
    checkRequiredEnv({ ...PROD_SUPABASE, VERCEL_ENV: 'preview' })
  );
});

test('Stripe is not required, but half of the pair is rejected', () => {
  const base = { ...PROD_SUPABASE, ...PROD_EXTRAS };
  assert.doesNotThrow(() => checkRequiredEnv(base));
  assert.doesNotThrow(() =>
    checkRequiredEnv({ ...base, STRIPE_SECRET_KEY: 'sk', STRIPE_WEBHOOK_SECRET: 'whsec' })
  );
  assert.throws(
    () => checkRequiredEnv({ ...base, STRIPE_SECRET_KEY: 'sk' }),
    /STRIPE_WEBHOOK_SECRET/
  );
  assert.throws(
    () => checkRequiredEnv({ ...base, STRIPE_WEBHOOK_SECRET: 'whsec' }),
    /STRIPE_SECRET_KEY/
  );
});

// HELM_CLUBHOUSE_TEAMS (plan phase 6, item 6.11) is gone: Clubhouse is the only coach and player UI for every team
// (Fairway retired, 2026-11-14), so no build reads or requires it.
test('no build asks for HELM_CLUBHOUSE_TEAMS any more', () => {
  assert.doesNotThrow(() => checkRequiredEnv({ ...PROD_SUPABASE, ...PROD_EXTRAS }));
  assert.doesNotThrow(() => checkRequiredEnv({ ...PROD_SUPABASE, VERCEL_ENV: 'preview' }));
});
