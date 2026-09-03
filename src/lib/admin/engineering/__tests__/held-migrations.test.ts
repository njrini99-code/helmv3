import { describe, it, expect } from 'vitest';
import { parseHeldMigrations } from '@/lib/admin/engineering/held-migrations';

const HEADER = '| migration | status | why | decided |\n|---|---|---|---|\n';

describe('parseHeldMigrations', () => {
  it('extracts a HOLD row', () => {
    const md =
      HEADER +
      '| `20260708141000_gate_secdef_ownership_and_redemption.sql` | **HOLD** | Draft, not reviewed. | pre-2026-08-19, recorded 2026-08-19 |\n';
    const rows = parseHeldMigrations(md);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.migrationFile).toBe('20260708141000_gate_secdef_ownership_and_redemption.sql');
    expect(rows[0]?.status).toBe('HOLD');
    expect(rows[0]?.reasonExcerpt).toContain('Draft, not reviewed.');
    expect(rows[0]?.decided).toBe('pre-2026-08-19, recorded 2026-08-19');
  });

  it('excludes APPLIED, OBSOLETE and VERIFIED rows — those are historical record, not decision material', () => {
    const md =
      HEADER +
      '| `20260528011000_x.sql` | **OBSOLETE** | Do not apply. | 2026-08-19 |\n' +
      '| `20260821043500_y.sql` | **VERIFIED APPLIED** | Already live. | 2026-08-25 |\n' +
      '| `20260825200811_z.sql` | **APPLIED 2026-08-26 — R3 — hold discharged** | Shipped. | 2026-08-26 |\n';
    expect(parseHeldMigrations(md)).toHaveLength(0);
  });

  it('matches a HOLD status that carries extra qualifier text (e.g. "HOLD — R3, not yet reviewed")', () => {
    const md = HEADER + '| `20260903150000_helm_debug_agent_runs.sql` | **HOLD — R3, not yet reviewed** | Prepared for Phase 5. | 2026-09-03 |\n';
    const rows = parseHeldMigrations(md);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('HOLD — R3, not yet reviewed');
  });

  it('truncates a long reason to a bounded excerpt rather than returning the whole paragraph', () => {
    const longWhy = 'x'.repeat(1000);
    const md = HEADER + `| \`20260101000000_a.sql\` | **HOLD** | ${longWhy} | 2026-01-01 |\n`;
    const rows = parseHeldMigrations(md);
    expect(rows[0]?.reasonExcerpt.length).toBeLessThan(300);
  });

  it('parses correctly against the real supabase/migrations/HELD.md register (regression guard)', async () => {
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const md = await readFile(join(process.cwd(), 'supabase/migrations/HELD.md'), 'utf-8');
    const rows = parseHeldMigrations(md);
    // At minimum the two long-standing HOLD rows plus this PR's own new row.
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows.map((r) => r.migrationFile)).toContain('20260903150000_helm_debug_agent_runs.sql');
    for (const row of rows) {
      expect(row.status.toUpperCase().startsWith('HOLD')).toBe(true);
    }
  });

  it('returns an empty list for markdown with no table rows', () => {
    expect(parseHeldMigrations('# Just a heading\n\nSome prose.\n')).toEqual([]);
  });
});
