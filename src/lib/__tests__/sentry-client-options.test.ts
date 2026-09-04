import { describe, it, expect } from 'vitest';
import {
  buildClientSentryOptions,
  parseSampleRateEnv,
  CLIENT_IGNORE_ERRORS,
  type ClientSentryOptionsEnv,
} from '@/lib/sentry-client-options';

const PROD_ENV: ClientSentryOptionsEnv = {
  NODE_ENV: 'production',
  VERCEL: '1',
  VERCEL_ENV: 'production',
};

const DEV_ENV: ClientSentryOptionsEnv = {
  NODE_ENV: 'development',
};

describe('parseSampleRateEnv', () => {
  it('falls back on undefined', () => {
    expect(parseSampleRateEnv(undefined, 0.05)).toBe(0.05);
  });

  it('falls back on blank string', () => {
    expect(parseSampleRateEnv('', 0.05)).toBe(0.05);
    expect(parseSampleRateEnv('   ', 0.05)).toBe(0.05);
  });

  it('falls back on non-numeric / NaN input', () => {
    expect(parseSampleRateEnv('not-a-number', 0.05)).toBe(0.05);
    expect(parseSampleRateEnv('NaN', 0.05)).toBe(0.05);
  });

  it('parses a valid in-range value', () => {
    expect(parseSampleRateEnv('0.3', 0.05)).toBe(0.3);
    expect(parseSampleRateEnv('0', 0.05)).toBe(0);
    expect(parseSampleRateEnv('1', 0.05)).toBe(1);
  });

  it('clamps above 1 down to 1', () => {
    expect(parseSampleRateEnv('5', 0.05)).toBe(1);
  });

  it('clamps below 0 up to 0', () => {
    expect(parseSampleRateEnv('-2', 0.05)).toBe(0);
  });
});

describe('buildClientSentryOptions — profiling sample rate defaults', () => {
  it('defaults to 0.05 in production when unset', () => {
    expect(buildClientSentryOptions(PROD_ENV).profileSessionSampleRate).toBe(0.05);
  });

  it('defaults to 0 in development when unset', () => {
    expect(buildClientSentryOptions(DEV_ENV).profileSessionSampleRate).toBe(0);
  });

  it('reads NEXT_PUBLIC_SENTRY_PROFILES_SAMPLE_RATE as an override', () => {
    const opts = buildClientSentryOptions({
      ...PROD_ENV,
      NEXT_PUBLIC_SENTRY_PROFILES_SAMPLE_RATE: '0.5',
    });
    expect(opts.profileSessionSampleRate).toBe(0.5);
  });

  it('clamps an out-of-range override into [0, 1]', () => {
    expect(
      buildClientSentryOptions({
        ...PROD_ENV,
        NEXT_PUBLIC_SENTRY_PROFILES_SAMPLE_RATE: '3',
      }).profileSessionSampleRate,
    ).toBe(1);
  });

  it('falls back to the environment default on a NaN override', () => {
    expect(
      buildClientSentryOptions({
        ...PROD_ENV,
        NEXT_PUBLIC_SENTRY_PROFILES_SAMPLE_RATE: 'garbage',
      }).profileSessionSampleRate,
    ).toBe(0.05);
  });

  it('never sets the deprecated, functionally-dead profilesSampleRate field', () => {
    const opts = buildClientSentryOptions(PROD_ENV) as unknown as Record<string, unknown>;
    expect(opts.profilesSampleRate).toBeUndefined();
  });

  it('sets profileLifecycle to trace so the profiler starts automatically', () => {
    expect(buildClientSentryOptions(PROD_ENV).profileLifecycle).toBe('trace');
    expect(buildClientSentryOptions(DEV_ENV).profileLifecycle).toBe('trace');
  });
});

describe('buildClientSentryOptions — replay session sample rate', () => {
  it('keeps the existing production/development defaults (0.1 / 0) when unset', () => {
    expect(buildClientSentryOptions(PROD_ENV).replaysSessionSampleRate).toBe(0.1);
    expect(buildClientSentryOptions(DEV_ENV).replaysSessionSampleRate).toBe(0);
  });

  it('reads NEXT_PUBLIC_SENTRY_REPLAY_SESSION_SAMPLE_RATE as an override', () => {
    expect(
      buildClientSentryOptions({
        ...PROD_ENV,
        NEXT_PUBLIC_SENTRY_REPLAY_SESSION_SAMPLE_RATE: '0.25',
      }).replaysSessionSampleRate,
    ).toBe(0.25);
  });

  it('never changes replaysOnErrorSampleRate — always 1.0, not env-configurable', () => {
    expect(buildClientSentryOptions(PROD_ENV).replaysOnErrorSampleRate).toBe(1.0);
    expect(
      buildClientSentryOptions({
        ...PROD_ENV,
        NEXT_PUBLIC_SENTRY_REPLAY_SESSION_SAMPLE_RATE: '0.9',
      }).replaysOnErrorSampleRate,
    ).toBe(1.0);
  });
});

describe('buildClientSentryOptions — tracesSampleRate is pinned, not part of this task', () => {
  it('production stays at 0.2', () => {
    expect(buildClientSentryOptions(PROD_ENV).tracesSampleRate).toBe(0.2);
  });

  it('development stays at 0.1', () => {
    expect(buildClientSentryOptions(DEV_ENV).tracesSampleRate).toBe(0.1);
  });
});

describe('buildClientSentryOptions — dsn/release/environment/tracePropagationTargets', () => {
  it('prefers NEXT_PUBLIC_SENTRY_DSN over SENTRY_DSN', () => {
    expect(
      buildClientSentryOptions({
        ...PROD_ENV,
        NEXT_PUBLIC_SENTRY_DSN: 'https://public@sentry.example/1',
        SENTRY_DSN: 'https://server@sentry.example/2',
      }).dsn,
    ).toBe('https://public@sentry.example/1');
  });

  it('falls back to SENTRY_DSN when NEXT_PUBLIC_SENTRY_DSN is unset', () => {
    expect(
      buildClientSentryOptions({ ...PROD_ENV, SENTRY_DSN: 'https://server@sentry.example/2' }).dsn,
    ).toBe('https://server@sentry.example/2');
  });

  it('prefers NEXT_PUBLIC_SENTRY_RELEASE over VERCEL_GIT_COMMIT_SHA', () => {
    expect(
      buildClientSentryOptions({
        ...PROD_ENV,
        NEXT_PUBLIC_SENTRY_RELEASE: 'release-a',
        VERCEL_GIT_COMMIT_SHA: 'sha-b',
      }).release,
    ).toBe('release-a');
  });

  it('resolves environment via resolveClientEnvironment (delegates, does not duplicate)', () => {
    expect(buildClientSentryOptions(PROD_ENV, 'helmsportslabs.com').environment).toBe('production');
    // A locally-optimized build claiming production, viewed from localhost,
    // must downgrade — same rule sentry-environment.test.ts already pins.
    expect(
      buildClientSentryOptions({ NODE_ENV: 'production' }, 'localhost').environment,
    ).not.toBe('production');
  });

  it('always includes localhost and the leading-slash pattern in tracePropagationTargets', () => {
    const targets = buildClientSentryOptions(PROD_ENV).tracePropagationTargets;
    expect(targets).toContain('localhost');
    expect(targets.some((t) => t instanceof RegExp && t.source === '^\\/')).toBe(true);
  });

  it('adds the Supabase origin to tracePropagationTargets when the URL is valid', () => {
    const targets = buildClientSentryOptions({
      ...PROD_ENV,
      NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co/rest/v1',
    }).tracePropagationTargets;
    expect(targets).toContain('https://project.supabase.co');
  });

  it('omits the Supabase origin when the URL is missing or invalid', () => {
    const targets = buildClientSentryOptions(PROD_ENV).tracePropagationTargets;
    expect(targets).toHaveLength(2);
  });
});

describe('buildClientSentryOptions — static options untouched by this task', () => {
  it('debug is always false', () => {
    expect(buildClientSentryOptions(PROD_ENV).debug).toBe(false);
  });

  it('propagateTraceparent is always true', () => {
    expect(buildClientSentryOptions(PROD_ENV).propagateTraceparent).toBe(true);
  });

  it('enableLogs is always true', () => {
    expect(buildClientSentryOptions(PROD_ENV).enableLogs).toBe(true);
  });

  it('carries the full, unmodified ignoreErrors list', () => {
    expect(buildClientSentryOptions(PROD_ENV).ignoreErrors).toBe(CLIENT_IGNORE_ERRORS);
    expect(CLIENT_IGNORE_ERRORS).toContain('Failed to fetch');
    expect(CLIENT_IGNORE_ERRORS.some((p) => p instanceof RegExp && p.source.includes('ChunkLoadError'))).toBe(
      true,
    );
    expect(CLIENT_IGNORE_ERRORS).toContain('AuthRefreshDiscardedError');
  });

  // Sentry filters on `getPossibleEventMessages` (@sentry/core
  // utils/eventUtils.js), which pushes BOTH the exception `value` and
  // `${type}: ${value}` — and `stringMatchesSomePattern` treats a string
  // pattern as a SUBSTRING test. The bare type name in the list above is
  // therefore only correct if it matches the rendered title. Pin that here
  // rather than trusting the reading: an entry that matches nothing is a
  // filter that silently does not filter.
  it('the AuthRefreshDiscardedError entry matches the shape Sentry actually tests against', () => {
    const type = 'AuthRefreshDiscardedError';
    const value = 'Refresh result discarded: session state changed mid-flight (e.g., concurrent signOut)';
    const candidates = [value, `${type}: ${value}`];

    const matches = candidates.filter((candidate) =>
      CLIENT_IGNORE_ERRORS.some((pattern) =>
        typeof pattern === 'string' ? candidate.includes(pattern) : pattern.test(candidate),
      ),
    );

    // `${type}: ${value}` is the one that must match — the bare `value` never
    // names the error type, so it is expected NOT to.
    expect(matches).toEqual([`${type}: ${value}`]);
  });
});
