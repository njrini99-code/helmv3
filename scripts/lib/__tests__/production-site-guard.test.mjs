// The production guard for browser suites that sign in (scripts/lib/production-site-guard.mjs), and the four entry points
// that use it. Each entry point is loaded the way it runs, with a production target, and must refuse before a browser starts.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { isProductionDatabase, isProductionSite, productionAllowed, refuseProduction } from '../production-site-guard.mjs';

const PROD_DB = 'https://qmnssrrolpinvwjjnufo.supabase.co';
const STAGING_DB = 'https://ybmwektreyrwjscxlogv.supabase.co';

describe('isProductionSite', () => {
  it('is true for the apex, www and any subdomain', () => {
    for (const url of ['https://helmsportslabs.com', 'https://www.helmsportslabs.com/golf/login', 'http://app.helmsportslabs.com:443/x', 'https://HELMSPORTSLABS.COM.'])
      expect(isProductionSite(url), url).toBe(true);
  });
  it('is false for local, preview, look-alike and unparseable addresses', () => {
    for (const url of ['http://localhost:3000', 'http://127.0.0.1:3100', 'https://helmv3-abc-nick-rinis-projects.vercel.app', 'https://nothelmsportslabs.com', 'https://helmsportslabs.com.evil.test', '', undefined, 'not a url'])
      expect(isProductionSite(url), String(url)).toBe(false);
  });
});

describe('refuseProduction', () => {
  it('refuses a production site and a production database, naming each', () => {
    expect(() => refuseProduction({ what: 'x', baseUrl: 'https://helmsportslabs.com', env: {} })).toThrow(/production site/);
    expect(() => refuseProduction({ what: 'x', supabaseUrl: PROD_DB, env: {} })).toThrow(/production project/);
    expect(() => refuseProduction({ what: 'x', baseUrl: 'https://www.helmsportslabs.com', supabaseUrl: PROD_DB, env: {} })).toThrow(/site .* and .* project/);
  });
  it('lets local and staging targets through', () => {
    expect(refuseProduction({ what: 'x', baseUrl: 'http://localhost:3000', supabaseUrl: STAGING_DB, env: {} })).toEqual({ allowed: false });
    expect(refuseProduction({ what: 'x', env: {} })).toEqual({ allowed: false });
  });
  it('steps aside only for HELM_ALLOW_PRODUCTION=1', () => {
    expect(refuseProduction({ what: 'x', baseUrl: 'https://helmsportslabs.com', env: { HELM_ALLOW_PRODUCTION: '1' } })).toEqual({ allowed: true });
    for (const v of ['true', 'yes', '0', ''])
      expect(() => refuseProduction({ what: 'x', baseUrl: 'https://helmsportslabs.com', env: { HELM_ALLOW_PRODUCTION: v } })).toThrow();
    expect(productionAllowed({ HELM_ALLOW_PRODUCTION: '1' })).toBe(true);
  });
  it('knows the production project by its ref', () => {
    expect(isProductionDatabase(PROD_DB)).toBe(true);
    expect(isProductionDatabase(STAGING_DB)).toBe(false);
    expect(isProductionDatabase('http://127.0.0.1:54321')).toBe(false);
  });
});

/** Runs a command with a production target and returns its combined output and exit status. */
function attempt(cmd, args, env) {
  try {
    const out = execFileSync(cmd, args, { env: { ...process.env, CI: '', HELM_ALLOW_PRODUCTION: '', ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 });
    return { status: 0, out };
  } catch (e) {
    return { status: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

describe('entry points refuse production before a browser starts', () => {
  it('scripts/ui-smoke.mjs refuses SMOKE_BASE on the production site', () => {
    const r = attempt('node', ['scripts/ui-smoke.mjs'], { SMOKE_BASE: 'https://helmsportslabs.com' });
    expect(r.status).not.toBe(0);
    expect(r.out).toMatch(/ui-smoke\.mjs refuses to run: its base URL is the production site/);
  });
  it('the root Playwright suite refuses a production base URL', () => {
    const r = attempt('./node_modules/.bin/playwright', ['test', '--list', '--config', 'playwright.config.ts'], { PLAYWRIGHT_BASE_URL: 'https://helmsportslabs.com' });
    expect(r.status).not.toBe(0);
    expect(r.out).toMatch(/root Playwright suite .* refuses to run: its base URL is the production site/);
  }, 60_000);
  it('the root Playwright suite refuses a production Supabase on a local run', () => {
    const r = attempt('./node_modules/.bin/playwright', ['test', '--list', '--config', 'playwright.config.ts'], { NEXT_PUBLIC_SUPABASE_URL: PROD_DB, PLAYWRIGHT_BASE_URL: 'http://127.0.0.1:3999' });
    expect(r.status).not.toBe(0);
    expect(r.out).toMatch(/its Supabase URL is the production project/);
  }, 60_000);
  it('ui:auth refuses a production base URL', () => {
    const r = attempt('./node_modules/.bin/playwright', ['test', '--list', '--config', 'playwright/screenshots.config.ts'], { GOLFHELM_BASE_URL: 'https://helmsportslabs.com', NEXT_PUBLIC_SUPABASE_URL: STAGING_DB });
    expect(r.status).not.toBe(0);
    expect(r.out).toMatch(/ui:auth .* refuses to run/);
  }, 60_000);
});
