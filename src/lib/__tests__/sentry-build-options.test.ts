import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// Plain .mjs on purpose: next.config.mjs runs outside the TS pipeline and has
// to import the same module, so the merged-options logic cannot live in a
// .ts file. Same pattern as src/lib/security/local-supabase-csp.mjs.
import { buildSentryBuildOptions } from '../sentry-build-options.mjs';

/**
 * `withSentryConfig(nextConfig, sentryBuildOptions)` — the installed
 * @sentry/nextjs@10.71.0 signature has exactly two parameters. A stale
 * three-argument call silently dropped six real options (widenClientFileUpload,
 * tunnelRoute, hideSourceMaps, disableLogger, automaticVercelMonitors,
 * reactComponentAnnotation) because JS never binds an extra positional
 * argument to anything. See docs/observability/SENTRY_PHASE_A_FINDINGS.md §(h).
 *
 * THE INVARIANT WORTH GUARDING: every option that used to live in the
 * discarded third argument must now be a top-level key of the single object
 * this module returns — and `hideSourceMaps` (not a real 10.71.0 option at
 * all) must be gone, replaced by `sourcemaps.deleteSourcemapsAfterUpload`.
 */

const asFn = buildSentryBuildOptions as (params: {
  org: string | undefined;
  project: string | undefined;
  authToken: string | undefined;
  release: {
    name: string | undefined;
    setCommits: { auto: boolean; ignoreMissing: boolean; ignoreEmpty: boolean };
    deploy: { env: string };
  };
}) => Record<string, unknown>;

const baseParams = {
  org: 'helm-xs',
  project: 'helmv3-web',
  authToken: 'test-token',
  release: {
    name: 'abc123',
    setCommits: { auto: true, ignoreMissing: true, ignoreEmpty: true },
    deploy: { env: 'production' },
  },
};

describe('buildSentryBuildOptions — a single merged options object', () => {
  it('carries every formerly-discarded-third-argument option at the top level', () => {
    const opts = asFn(baseParams);
    expect(opts.widenClientFileUpload).toBe(true);
    expect(opts.tunnelRoute).toBe('/monitoring');
    expect(opts.disableLogger).toBe(true);
    expect(opts.reactComponentAnnotation).toEqual({ enabled: true });
  });

  it('sets automaticVercelMonitors to false — cron-monitors.ts is the single Cron Monitor authority', () => {
    // Deliberately false, not a leftover default: the installed SDK's own
    // build-time source (vercelCronsMonitoring.js /
    // getFinalConfigObjectUtils.js) shows `true` here would build-time-inject
    // a SECOND, independent Cron Monitor mechanism (raw-path monitor slugs,
    // a hardcoded 12h maxRuntime) running alongside the per-job
    // captureCheckIn calls recordJobRun already makes — the same
    // duplicate-capture shape the rest of this mission's Phase A findings
    // (#4-#6) exist to eliminate, not recreate. See this module's own header
    // comment and docs/observability/SENTRY_CRON_MONITORS.md §2.
    const opts = asFn(baseParams);
    expect(opts.automaticVercelMonitors).toBe(false);
  });

  it('does NOT set hideSourceMaps — not a real 10.71.0 option', () => {
    const opts = asFn(baseParams);
    expect(opts).not.toHaveProperty('hideSourceMaps');
  });

  it('sets sourcemaps.deleteSourcemapsAfterUpload as the hideSourceMaps replacement', () => {
    const opts = asFn(baseParams);
    expect(opts.sourcemaps).toEqual({ deleteSourcemapsAfterUpload: true });
  });

  it('sets applicationKey for the third-party error filter integration', () => {
    expect(asFn(baseParams).applicationKey).toBe('helm-web');
  });

  it('passes org/project/authToken/release through unchanged', () => {
    const opts = asFn(baseParams);
    expect(opts.org).toBe('helm-xs');
    expect(opts.project).toBe('helmv3-web');
    expect(opts.authToken).toBe('test-token');
    expect(opts.release).toBe(baseParams.release);
  });

  it('keeps silent:true and telemetry:false from the original second argument', () => {
    const opts = asFn(baseParams);
    expect(opts.silent).toBe(true);
    expect(opts.telemetry).toBe(false);
  });

  it('tolerates undefined org/project/authToken (local/CI builds without Sentry creds)', () => {
    const opts = asFn({ ...baseParams, org: undefined, project: undefined, authToken: undefined });
    expect(opts.org).toBeUndefined();
    expect(opts.project).toBeUndefined();
    expect(opts.authToken).toBeUndefined();
    // The build-time options should still be set regardless of creds.
    expect(opts.tunnelRoute).toBe('/monitoring');
  });

  it('returns exactly one object with no nested "third argument" shape', () => {
    // Regression guard for the actual bug: everything must be reachable as a
    // single flat withSentryConfig(nextConfig, THIS) call, not split across
    // two objects the runtime would merge incorrectly.
    const opts = asFn(baseParams);
    expect(typeof opts).toBe('object');
    expect(Array.isArray(opts)).toBe(false);
  });
});

describe('next.config.mjs actually uses the extracted helper', () => {
  const config = readFileSync(join(process.cwd(), 'next.config.mjs'), 'utf8');

  it('imports buildSentryBuildOptions from the shared module', () => {
    expect(config).toMatch(/from '\.\/src\/lib\/sentry-build-options\.mjs'/);
  });

  it('calls withSentryConfig with exactly two arguments', () => {
    const start = config.indexOf('withSentryConfig(');
    expect(start).toBeGreaterThan(-1);
    // Walk balanced parens from the call site to find the full argument list,
    // then count top-level (depth-1) commas -> arg count = commas + 1.
    let depth = 0;
    let i = start + 'withSentryConfig('.length - 1; // at the opening '('
    let topLevelCommas = 0;
    for (; i < config.length; i += 1) {
      const ch = config[i];
      if (ch === '(') depth += 1;
      else if (ch === ')') {
        depth -= 1;
        if (depth === 0) break;
      } else if (ch === ',' && depth === 1) {
        topLevelCommas += 1;
      }
    }
    expect(topLevelCommas).toBe(1); // two arguments: nextConfig, sentryBuildOptions
  });

  it('does not set hideSourceMaps anywhere in the config file', () => {
    expect(config).not.toMatch(/hideSourceMaps/);
  });
});
