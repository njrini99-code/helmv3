import { test } from 'node:test';
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
