import { describe, it, expect, vi, afterEach } from 'vitest';

import { shouldPersistAdminTables } from '@/lib/telemetry-gate';

describe('shouldPersistAdminTables', () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it('persists when ADMIN_EVENTS_FORCE_CAPTURE=1 regardless of environment', () => {
    vi.stubEnv('ADMIN_EVENTS_FORCE_CAPTURE', '1');
    vi.stubEnv('VERCEL_ENV', 'preview');
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
});
