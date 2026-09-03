import { describe, it, expect } from 'vitest';
import { buildDecisionInbox, parseHeldMigrations, type BuildDecisionInboxInput } from '../decisions';
import type { AttentionRow } from '@/lib/admin/incidents/attention';
import { NOW } from './fixtures';

// A literal excerpt of the real `supabase/migrations/HELD.md` table
// (copied, not read from disk, so this test is hermetic and immune to that
// file changing shape later) — two genuine open HOLD rows, one OBSOLETE row,
// and one row whose status cell ("VERIFIED APPLIED", two words) is exactly
// the kind of format drift the parser must tolerate by skipping the line
// rather than throwing or mis-classifying it as HOLD.
const REAL_HELD_MD_EXCERPT = `
## The register

| migration | status | why | decided |
|---|---|---|---|
| \`20260708141000_gate_secdef_ownership_and_redemption.sql\` | **HOLD** | Draft. Gates SECURITY DEFINER ownership + redemption; not finished and not reviewed. | pre-2026-08-19, recorded 2026-08-19 |
| \`20260715141727_baseball_legacy_stats_backfill.sql\` | **HOLD** | Legacy stats backfill, explicitly held across multiple sessions. | pre-2026-08-19, recorded 2026-08-19 |
| \`20260528011000_harden_coach_insights_update_grants.sql\` | **OBSOLETE** | Do **not** apply, and do **not** stamp. See below. | 2026-08-19 |
| \`20260821043500_single_flight_round_submit.sql\` | **VERIFIED APPLIED** | Read-only catalog check confirms production already carries this. | 2026-08-25 |
`;

function attentionRow(overrides: Partial<AttentionRow> = {}): AttentionRow {
  return {
    key: 'inc-1',
    reason: 'needs-evidence',
    state: 'NEEDS EVIDENCE',
    headline: 'Repair cannot proceed without more context',
    why: 'Automation could not safely proceed without a human supplying more context.',
    ageMs: 3_600_000,
    href: '/admin/errors/inc-1',
    tone: 'warning',
    ...overrides,
  };
}

describe('parseHeldMigrations', () => {
  it('parses genuine HOLD rows from a real HELD.md excerpt', () => {
    const rows = parseHeldMigrations(REAL_HELD_MD_EXCERPT);
    const holdRows = rows.filter((r) => r.status === 'HOLD');
    expect(holdRows).toHaveLength(2);
    const first = holdRows[0]!;
    expect(first.migration).toBe('20260708141000_gate_secdef_ownership_and_redemption.sql');
    expect(first.why).toMatch(/SECURITY DEFINER/);
  });

  it('captures the OBSOLETE row too, so a caller can distinguish it from HOLD', () => {
    const rows = parseHeldMigrations(REAL_HELD_MD_EXCERPT);
    const obsolete = rows.find((r) => r.migration.includes('harden_coach_insights'));
    expect(obsolete?.status).toBe('OBSOLETE');
  });

  it('a multi-word status cell (format drift) is skipped rather than mis-parsed as HOLD', () => {
    const rows = parseHeldMigrations(REAL_HELD_MD_EXCERPT);
    const drifted = rows.find((r) => r.migration.includes('single_flight_round_submit'));
    expect(drifted).toBeUndefined();
  });

  it('empty input parses to an empty array, not a throw', () => {
    expect(parseHeldMigrations('')).toEqual([]);
  });
});

function baseInput(overrides: Partial<BuildDecisionInboxInput> = {}): BuildDecisionInboxInput {
  return {
    attentionRows: [],
    heldMigrations: [],
    now: NOW,
    ...overrides,
  };
}

describe('buildDecisionInbox', () => {
  it('healthy: nothing needs evidence, no held migrations -> empty, readable', () => {
    const summary = buildDecisionInbox(baseInput());
    expect(summary.items).toHaveLength(0);
    expect(summary.readable).toBe(true);
  });

  it('blind source analog: HELD.md unreadable -> readable false, never silently empty', () => {
    const summary = buildDecisionInbox(baseInput({ heldMigrations: null }));
    expect(summary.readable).toBe(false);
  });

  it('regression analog: a needs-evidence attention row becomes a repair-needs-evidence decision item', () => {
    const row = attentionRow();
    const summary = buildDecisionInbox(baseInput({ attentionRows: [row] }));
    expect(summary.items).toHaveLength(1);
    const item = summary.items[0]!;
    expect(item.kind).toBe('repair-needs-evidence');
    expect(item.href).toBe('/admin/errors/inc-1');
  });

  it('decision waiting: a HOLD migration surfaces as a migration-hold item; OBSOLETE/APPLIED do not', () => {
    const rows = parseHeldMigrations(REAL_HELD_MD_EXCERPT);
    const summary = buildDecisionInbox(baseInput({ heldMigrations: rows }));
    expect(summary.total).toBe(2);
    expect(summary.items.every((i) => i.kind === 'migration-hold')).toBe(true);
    expect(summary.items.some((i) => i.title.includes('harden_coach_insights'))).toBe(false);
  });

  it('other attention reasons (e.g. regression, critical) never leak into the decision inbox', () => {
    const row = attentionRow({ reason: 'regression', headline: 'A regression', why: 'came back' });
    const summary = buildDecisionInbox(baseInput({ attentionRows: [row] }));
    expect(summary.items).toHaveLength(0);
  });

  it('all-unknown: no attention rows, HELD.md unreadable -> zero items but readable=false, never rendered as calm', () => {
    const summary = buildDecisionInbox(baseInput({ attentionRows: [], heldMigrations: null }));
    expect(summary.total).toBe(0);
    expect(summary.readable).toBe(false);
  });
});
