// This previously ran under `node --test`, which nothing invokes, so it
// never executed. Promoted to vitest (issue #1194).
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { checkRequiredEnv } from '../check-required-env.mjs';

test('passes when all canonical Supabase vars set and URL is real', () => {
  assert.doesNotThrow(() =>
    checkRequiredEnv({
      VERCEL_ENV: 'production',
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

// F127 (2026-09-05): INNGEST_EVENT_KEY set without INNGEST_SIGNING_KEY put
// Inngest into "cloud mode" with no signing key, producing 10 production
// runtime errors on /api/inngest over 2026-09-01/02 with no build-time signal.

test('throws in production when INNGEST_EVENT_KEY is set but INNGEST_SIGNING_KEY is missing', () => {
  assert.throws(
    () =>
      checkRequiredEnv({
        VERCEL_ENV: 'production',
        NEXT_PUBLIC_SUPABASE_URL: 'https://qmnssrrolpinvwjjnufo.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-value',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-value',
        INNGEST_EVENT_KEY: 'a-real-looking-event-key-value',
      }),
    /INNGEST_SIGNING_KEY/
  );
});

test('throws in preview when INNGEST_EVENT_KEY is set but INNGEST_SIGNING_KEY is blank', () => {
  assert.throws(
    () =>
      checkRequiredEnv({
        VERCEL_ENV: 'preview',
        NEXT_PUBLIC_SUPABASE_URL: 'https://qmnssrrolpinvwjjnufo.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-value',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-value',
        INNGEST_EVENT_KEY: 'a-real-looking-event-key-value',
        INNGEST_SIGNING_KEY: '   ',
      }),
    /INNGEST_SIGNING_KEY/
  );
});

test('does not throw when both INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY are set', () => {
  assert.doesNotThrow(() =>
    checkRequiredEnv({
      VERCEL_ENV: 'production',
      NEXT_PUBLIC_SUPABASE_URL: 'https://qmnssrrolpinvwjjnufo.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-value',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-value',
      INNGEST_EVENT_KEY: 'a-real-looking-event-key-value',
      INNGEST_SIGNING_KEY: 'signkey-prod-abc123',
    })
  );
});

test('does not throw when neither Inngest var is set (Inngest not in use)', () => {
  assert.doesNotThrow(() =>
    checkRequiredEnv({
      VERCEL_ENV: 'production',
      NEXT_PUBLIC_SUPABASE_URL: 'https://qmnssrrolpinvwjjnufo.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-value',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-value',
    })
  );
});
