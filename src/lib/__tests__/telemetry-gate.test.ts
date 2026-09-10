import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

import { shouldPersistAdminTables, getRuntimeEnv } from '@/lib/telemetry-gate';

// These suites assert behavior for specific environments, but the test
// process itself runs under GitHub Actions where CI/GITHUB_ACTIONS are set
// globally and would leak into every non-CI scenario. Neutralize them per
// test; CI-specific tests re-stub them explicitly.
const clearAmbientCi = () => {
  vi.stubEnv('CI', '');
  vi.stubEnv('GITHUB_ACTIONS', '');
  // Every Vercel deployment — production AND preview — runs the app under
  // NODE_ENV=production, because `next build`/`next start` set it. Vitest
  // sets NODE_ENV='test', which would otherwise trip the dev-machine guard
  // in every scenario below and make the deployment cases untestable. Tests
  // that model a developer's laptop override this explicitly.
  vi.stubEnv('NODE_ENV', 'production');
};

describe('shouldPersistAdminTables', () => {
  beforeEach(clearAmbientCi);
  afterEach(() => { vi.unstubAllEnvs(); });

  it('persists when ADMIN_EVENTS_FORCE_CAPTURE=1 regardless of environment', () => {
    vi.stubEnv('ADMIN_EVENTS_FORCE_CAPTURE', '1');
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(shouldPersistAdminTables()).toBe(true);
  });

  it('persists when ADMIN_EVENTS_FORCE_CAPTURE=1 even under CI/GITHUB_ACTIONS', () => {
    vi.stubEnv('ADMIN_EVENTS_FORCE_CAPTURE', '1');
    vi.stubEnv('CI', 'true');
    vi.stubEnv('GITHUB_ACTIONS', 'true');
    expect(shouldPersistAdminTables()).toBe(true);
  });

  it('never persists during the production build phase', () => {
    vi.stubEnv('NEXT_PHASE', 'phase-production-build');
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(shouldPersistAdminTables()).toBe(false);
  });

  it('persists on the live production deployment', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(shouldPersistAdminTables()).toBe(true);
  });

  it('does not persist from preview, CI, or local dev', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(shouldPersistAdminTables()).toBe(false);
    vi.stubEnv('VERCEL_ENV', '');
    expect(shouldPersistAdminTables()).toBe(false);
  });

  it('never persists when CI=true, even without VERCEL_ENV set', () => {
    vi.stubEnv('CI', 'true');
    expect(shouldPersistAdminTables()).toBe(false);
  });

  it('never persists when GITHUB_ACTIONS=true, even without VERCEL_ENV set', () => {
    vi.stubEnv('GITHUB_ACTIONS', 'true');
    expect(shouldPersistAdminTables()).toBe(false);
  });

  it('never persists from a developer machine, even with VERCEL_ENV=production in .env.local', () => {
    // Regression guard for the 2026-09-09 flood: `vercel env pull` writes
    // VERCEL_ENV="production" (and VERCEL="1") verbatim into .env.local and
    // .env.production.local, so `npm run dev` on the owner's machine cleared
    // the old VERCEL_ENV check and wrote 287 of 1626 rows in a 72h window
    // into the production admin_events table. NODE_ENV is the one signal a
    // local env file cannot forge: Next's CLI sets it before any .env* file
    // is read, and dotenv never overwrites an already-set key.
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(shouldPersistAdminTables()).toBe(false);
  });

  it('still honours ADMIN_EVENTS_FORCE_CAPTURE from a developer machine', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ADMIN_EVENTS_FORCE_CAPTURE', '1');
    expect(shouldPersistAdminTables()).toBe(true);
  });

  it('never persists from CI/GITHUB_ACTIONS even if VERCEL_ENV is spoofed to production', () => {
    // Regression guard: the Playwright workflow boots `npm run dev` and
    // `npm run build`/`next start` with real prod Supabase secrets, and a
    // local .env.production.local can hardcode VERCEL_ENV=production. The
    // CI/GITHUB_ACTIONS check must win regardless of VERCEL_ENV's value.
    vi.stubEnv('CI', 'true');
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(shouldPersistAdminTables()).toBe(false);

    vi.stubEnv('CI', '');
    vi.stubEnv('GITHUB_ACTIONS', 'true');
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(shouldPersistAdminTables()).toBe(false);
  });
});

describe('getRuntimeEnv', () => {
  beforeEach(clearAmbientCi);
  afterEach(() => { vi.unstubAllEnvs(); });

  it('tags CI/GITHUB_ACTIONS runs as ci, even with a production-looking VERCEL_ENV', () => {
    vi.stubEnv('CI', 'true');
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(getRuntimeEnv()).toBe('ci');

    vi.stubEnv('CI', '');
    vi.stubEnv('GITHUB_ACTIONS', 'true');
    expect(getRuntimeEnv()).toBe('ci');
  });

  it('tags the live production deployment as production', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(getRuntimeEnv()).toBe('production');
  });

  it('tags any other VERCEL_ENV value as preview', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(getRuntimeEnv()).toBe('preview');
  });

  it('tags local dev (no VERCEL_ENV, no CI) as dev', () => {
    vi.stubEnv('VERCEL_ENV', '');
    expect(getRuntimeEnv()).toBe('dev');
  });

  it('tags a developer machine as dev even with VERCEL_ENV=production in .env.local', () => {
    // Without this, a row forced through by ADMIN_EVENTS_FORCE_CAPTURE from a
    // laptop would be *tagged* runtimeEnv:'production' and be indistinguishable
    // from a real prod incident in the Bridge.
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(getRuntimeEnv()).toBe('dev');
  });
});
