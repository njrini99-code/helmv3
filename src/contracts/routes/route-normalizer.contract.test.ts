import { describe, expect, it } from 'vitest';
import {
  classifyArea,
  classifyProduct,
  normalizeAppFile,
  routeExistsInInventory,
} from '../../../scripts/route-hygiene/route-normalizer.mjs';

describe('route normalizer contract', () => {
  it('removes route groups and normalizes golf auth login', () => {
    const row = normalizeAppFile('src/app/golf/(auth)/login/page.tsx');
    expect(row?.canonicalPath).toBe('/golf/login');
    expect(row?.routeGroupSegments).toContain('(auth)');
    expect(row?.dynamic).toBe(false);
  });

  it('removes dashboard route group', () => {
    const row = normalizeAppFile('src/app/golf/(dashboard)/dashboard/stats/page.tsx');
    expect(row?.canonicalPath).toBe('/golf/dashboard/stats');
  });

  it('normalizes baseball player timeline', () => {
    const row = normalizeAppFile('src/app/baseball/(player-dashboard)/player/timeline/page.tsx');
    expect(row?.canonicalPath).toBe('/baseball/player/timeline');
  });

  it('normalizes dynamic token segments', () => {
    const row = normalizeAppFile('src/app/baseball/(public)/packet/[token]/page.tsx');
    expect(row?.canonicalPath).toBe('/baseball/packet/:token');
    expect(row?.dynamicParams).toEqual(['token']);
    expect(row?.dynamic).toBe(true);
  });

  it('normalizes API route handlers', () => {
    const row = normalizeAppFile('src/app/api/coachhelm/report/route.ts');
    expect(row?.canonicalPath).toBe('/api/coachhelm/report');
    expect(row?.fileType).toBe('route-handler');
  });

  it('ignores private underscore folders', () => {
    const row = normalizeAppFile('src/app/golf/(dashboard)/dashboard/_components/foo/page.tsx');
    expect(row?.canonicalPath).toBe('/golf/dashboard/foo');
  });

  it('classifies product prefixes', () => {
    expect(classifyProduct('/golf/login')).toBe('golf');
    expect(classifyProduct('/baseball/dashboard')).toBe('baseball');
    expect(classifyProduct('/api/coachhelm/v3/chat')).toBe('coachhelm');
    expect(classifyProduct('/api/health')).toBe('api');
  });

  it('classifies auth area from route groups', () => {
    expect(classifyArea('/golf/login', ['(auth)'])).toBe('auth');
    expect(classifyArea('/golf/dashboard/stats', ['(dashboard)'])).toBe('dashboard');
  });

  it('matches dynamic inventory paths for static href checks', () => {
    const staticRoutes = new Set(['/golf/dashboard']);
    const dynamicRoutes = [{ canonicalPath: '/baseball/packet/:token' }];
    expect(routeExistsInInventory('/golf/dashboard', staticRoutes, dynamicRoutes)).toBe(true);
    expect(routeExistsInInventory('/baseball/packet/abc123', staticRoutes, dynamicRoutes)).toBe(true);
    expect(routeExistsInInventory('/baseball/packet', staticRoutes, dynamicRoutes)).toBe(false);
  });
});
