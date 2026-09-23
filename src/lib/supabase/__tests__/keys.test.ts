import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getPublishableKey,
  getSecretKey,
  tryGetPublishableKey,
  tryGetSecretKey,
  PUBLISHABLE_KEY_ENV,
  LEGACY_ANON_KEY_ENV,
  SECRET_KEY_ENV,
  LEGACY_SERVICE_ROLE_KEY_ENV,
} from '../keys.mjs';

/**
 * Pins the precedence Phase 2 / P6 exists to establish: the new-format
 * Supabase API keys (`sb_publishable_…` / `sb_secret_…`) are checked FIRST,
 * the legacy JWT pair (`NEXT_PUBLIC_SUPABASE_ANON_KEY` /
 * `SUPABASE_SERVICE_ROLE_KEY`) is the fallback — so the owner can disable
 * the legacy keys (one of which is leaked in git history) without changing
 * the JWT signing secret or logging anyone out.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getPublishableKey', () => {
  it('prefers the new-format publishable key when both are set', () => {
    vi.stubEnv(PUBLISHABLE_KEY_ENV, 'sb_publishable_new');
    vi.stubEnv(LEGACY_ANON_KEY_ENV, 'legacy.anon.jwt');
    expect(getPublishableKey()).toBe('sb_publishable_new');
  });

  it('falls back to the legacy anon key when the new one is unset', () => {
    vi.stubEnv(PUBLISHABLE_KEY_ENV, undefined);
    vi.stubEnv(LEGACY_ANON_KEY_ENV, 'legacy.anon.jwt');
    expect(getPublishableKey()).toBe('legacy.anon.jwt');
  });

  it('trims whitespace on both the new and legacy value', () => {
    vi.stubEnv(PUBLISHABLE_KEY_ENV, '  sb_publishable_new  ');
    expect(getPublishableKey()).toBe('sb_publishable_new');

    vi.stubEnv(PUBLISHABLE_KEY_ENV, undefined);
    vi.stubEnv(LEGACY_ANON_KEY_ENV, '  legacy.anon.jwt  ');
    expect(getPublishableKey()).toBe('legacy.anon.jwt');
  });

  it('ignores a blank/whitespace-only new-format value and falls back', () => {
    vi.stubEnv(PUBLISHABLE_KEY_ENV, '   ');
    vi.stubEnv(LEGACY_ANON_KEY_ENV, 'legacy.anon.jwt');
    expect(getPublishableKey()).toBe('legacy.anon.jwt');
  });

  it('throws naming BOTH env names when neither is set', () => {
    vi.stubEnv(PUBLISHABLE_KEY_ENV, undefined);
    vi.stubEnv(LEGACY_ANON_KEY_ENV, undefined);
    expect(() => getPublishableKey()).toThrow(
      new RegExp(`${PUBLISHABLE_KEY_ENV}.*${LEGACY_ANON_KEY_ENV}`)
    );
  });
});

describe('getSecretKey', () => {
  it('prefers the new-format secret key when both are set', () => {
    vi.stubEnv(SECRET_KEY_ENV, 'sb_secret_new');
    vi.stubEnv(LEGACY_SERVICE_ROLE_KEY_ENV, 'legacy.service.jwt');
    expect(getSecretKey()).toBe('sb_secret_new');
  });

  it('falls back to the legacy service-role key when the new one is unset', () => {
    vi.stubEnv(SECRET_KEY_ENV, undefined);
    vi.stubEnv(LEGACY_SERVICE_ROLE_KEY_ENV, 'legacy.service.jwt');
    expect(getSecretKey()).toBe('legacy.service.jwt');
  });

  it('trims whitespace', () => {
    vi.stubEnv(SECRET_KEY_ENV, '  sb_secret_new  ');
    expect(getSecretKey()).toBe('sb_secret_new');
  });

  it('throws naming BOTH env names when neither is set', () => {
    vi.stubEnv(SECRET_KEY_ENV, undefined);
    vi.stubEnv(LEGACY_SERVICE_ROLE_KEY_ENV, undefined);
    expect(() => getSecretKey()).toThrow(
      new RegExp(`${SECRET_KEY_ENV}.*${LEGACY_SERVICE_ROLE_KEY_ENV}`)
    );
  });
});

describe('tryGetPublishableKey (non-throwing)', () => {
  it('returns the resolved key with a null "missing" when set', () => {
    vi.stubEnv(PUBLISHABLE_KEY_ENV, undefined);
    vi.stubEnv(LEGACY_ANON_KEY_ENV, 'legacy.anon.jwt');
    expect(tryGetPublishableKey()).toEqual({ key: 'legacy.anon.jwt', missing: null });
  });

  it('returns a null key and names both env vars in "missing" when unset', () => {
    vi.stubEnv(PUBLISHABLE_KEY_ENV, undefined);
    vi.stubEnv(LEGACY_ANON_KEY_ENV, undefined);
    const result = tryGetPublishableKey();
    expect(result.key).toBeNull();
    expect(result.missing).toContain(PUBLISHABLE_KEY_ENV);
    expect(result.missing).toContain(LEGACY_ANON_KEY_ENV);
  });
});

describe('tryGetSecretKey (non-throwing)', () => {
  it('returns the resolved key with a null "missing" when set', () => {
    vi.stubEnv(SECRET_KEY_ENV, 'sb_secret_new');
    expect(tryGetSecretKey()).toEqual({ key: 'sb_secret_new', missing: null });
  });

  it('returns a null key and names both env vars in "missing" when unset', () => {
    vi.stubEnv(SECRET_KEY_ENV, undefined);
    vi.stubEnv(LEGACY_SERVICE_ROLE_KEY_ENV, undefined);
    const result = tryGetSecretKey();
    expect(result.key).toBeNull();
    expect(result.missing).toContain(SECRET_KEY_ENV);
    expect(result.missing).toContain(LEGACY_SERVICE_ROLE_KEY_ENV);
  });

  it('does not throw — the login rate limiter depends on this to treat a', () => {
    // missing store as a deploy/config fault rather than an attack (NEW-1,
    // src/lib/auth/supabase-rate-limit.ts).
    vi.stubEnv(SECRET_KEY_ENV, undefined);
    vi.stubEnv(LEGACY_SERVICE_ROLE_KEY_ENV, undefined);
    expect(() => tryGetSecretKey()).not.toThrow();
  });
});
