/**
 * Bridge audit 2026-08-21 — System tab was fabricating "healthy" state from
 * data it never measured: 0ms API latency rendered green ("fast") instead of
 * "never measured," three external services always read "Operational" with
 * no live check, a job tile claimed a nonexistent process ran, and a
 * hardcoded 8 GB storage ceiling rendered as a real capacity bar. These are
 * source-text guards (matching the existing convention in
 * src/test/lib/admin/team-error-counts.test.ts for this same class of
 * dashboard-fabrication bug) rather than full render tests, because the
 * fixes are conditional-rendering changes with no extracted pure function to
 * unit-test directly.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ADMIN_COMPONENTS_DIR = path.join(process.cwd(), 'src/app/golf/admin/components');
const ADMIN_ACTIONS_DIR = path.join(process.cwd(), 'src/app/golf/actions');

function readComponent(file: string): string {
  return fs.readFileSync(path.join(ADMIN_COMPONENTS_DIR, file), 'utf8');
}

/** Strip comments before asserting a bad pattern is ABSENT — this file's own
 *  explanatory prose names the exact strings it forbids (matching the
 *  convention in team-error-counts.test.ts), so an unstripped check would
 *  false-positive on a comment describing the fix rather than the code. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

describe('API latency renders "Not measured" instead of a fabricated 0ms', () => {
  it.each(['SystemTab.tsx', 'InfraHealthCard.tsx', 'PlatformHealthCard.tsx'])(
    '%s gates the latency display on infraHealth.totals.measured',
    (file) => {
      const src = readComponent(file);
      expect(src).toContain('measured');
      expect(src).toMatch(/Not measured/);
    },
  );

  it('admin-data.ts computes measured from real apiPerf call counts, not a stub', () => {
    const src = fs.readFileSync(path.join(ADMIN_ACTIONS_DIR, 'admin-data.ts'), 'utf8');
    expect(src).toMatch(/measured:\s*totalCallsFromPerf > 0/);
  });

  it('the golf/admin sidebar "Data Fetch" tile also honors measured (not just System tab)', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src/app/golf/admin/page.tsx'), 'utf8');
    expect(src).toMatch(/data\.infraHealth\?\.totals\?\.measured/);
  });
});

describe('External Services no longer hardcodes "operational"', () => {
  it('SERVICES has no status field, and nothing renders a literal "Operational" claim', () => {
    const code = stripComments(readComponent('SystemTab.tsx'));
    expect(code).not.toMatch(/status:\s*'operational'/);
    expect(code).not.toMatch(/>\s*Operational\s*</);
    expect(code).toContain('Not checked');
  });
});

describe('Web analytics surfaces a broken integration instead of fake zero traffic', () => {
  it('admin-data.ts delegates to the shared fail-soft fetchVercelWebInsights, not a local duplicate', () => {
    const src = fs.readFileSync(path.join(ADMIN_ACTIONS_DIR, 'admin-data.ts'), 'utf8');
    // The duplicate used to inline this exact endpoint string and map
    // `!res.ok` to a bare `0`. It must now come from vercel-api.ts instead.
    expect(src).not.toContain('https://api.vercel.com/v1/web/insights/stats');
    expect(src).toContain('fetchVercelWebInsights');
  });

  it('BusinessIntelligenceTab renders a distinct unavailable state, not the visitor numbers, on failure', () => {
    const src = readComponent('BusinessIntelligenceTab.tsx');
    expect(src).toMatch(/status === 'unavailable'/);
    expect(src).toMatch(/unavailable/i);
  });
});

describe('The fabricated "Platform Metrics Snapshot" job tile is gone', () => {
  it('SYSTEM_JOBS no longer names a nonexistent job', () => {
    const code = stripComments(readComponent('SystemTab.tsx'));
    expect(code).not.toContain('Platform Metrics Snapshot');
  });
});

describe('Storage Quota no longer presents an unverified 8 GB ceiling as real capacity', () => {
  it('SystemTab.tsx has no hardcoded quotaGb constant', () => {
    const src = readComponent('SystemTab.tsx');
    expect(src).not.toMatch(/quotaGb\s*=\s*8/);
  });
});
