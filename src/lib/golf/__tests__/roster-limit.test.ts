import { describe, expect, it } from 'vitest';
import { countRoster, defaultRosterLimit, ncaaDivisionOf, readRosterLimit, rosterChip, rosterLimitLine, rosterOverText } from '../roster-limit';

/** A stand-in for the client as RLS answers it: golf_teams → organizations for the division, then the two F-05 tables. */
function fakeSb(opts: {
  division?: string | null;
  limit?: { enabled: boolean; max_players: number } | null;
  exempt?: Array<{ player_id: string; reason: string; note: string | null }>;
  code?: string;
  limitError?: string;
}) {
  const seen: string[] = [];
  const from = (table: string) => {
    seen.push(table);
    const q = {
      select: () => q,
      eq: () => q,
      maybeSingle: async () => {
        if (table === 'golf_teams') return { data: { organization_id: opts.division === undefined ? null : 'org-1' }, error: null };
        if (table === 'organizations') return { data: { division: opts.division ?? null }, error: null };
        if (opts.code) return { data: null, error: { code: opts.code, message: 'missing' } };
        if (opts.limitError) return { data: null, error: { code: 'XX000', message: opts.limitError } };
        return { data: opts.limit ?? null, error: null };
      },
      then: (res: (v: unknown) => unknown) =>
        res(opts.code ? { data: null, error: { code: opts.code, message: 'missing' } } : { data: opts.exempt ?? [], error: null }),
    };
    return q;
  };
  return { sb: { from } as never, seen };
}

describe('roster limit (F-05, NCAA DI Bylaw 17.2)', () => {
  it('reads the division as the hours log does, and starts Division I on at 9 and everyone else off', () => {
    expect(['D1', 'DI', 'NCAA Division I', 'Div. 1'].map(ncaaDivisionOf)).toEqual(['d1', 'd1', 'd1', 'd1']);
    expect(['D3', 'DIII', 'Division II', 'NAIA', 'NJCAA', null].map(ncaaDivisionOf)).toEqual(['d3', 'd3', 'd2', null, null, null]);
    expect(defaultRosterLimit('DI')).toEqual({ limit: { enabled: true, max: 9 }, from: 'division' });
    expect(defaultRosterLimit('DIII')).toEqual({ limit: { enabled: false, max: 9 }, from: 'division' });
    expect(defaultRosterLimit(null)).toEqual({ limit: { enabled: false, max: 9 }, from: 'default' });
  });

  it('30180 counts active players less the ones marked as not counting, and says how many over', () => {
    const ten = Array.from({ length: 10 }, (_, i) => `p${i}`);
    const over = countRoster(ten, {}, { enabled: true, max: 9 });
    expect(over).toEqual({ counted: 10, exempt: 0, over: 1, max: 9, enabled: true });
    expect(rosterLimitLine(over)).toBe('10 count toward the roster limit of 9: 1 over.');
    expect(rosterOverText(over)).toMatch(/^The roster is 1 player over its limit of 9\. Mark a player inactive, or mark one who doesn’t count/);
    expect(rosterChip(over)).toBe('Roster 10 of 9');

    const marked = countRoster(ten, { p0: { reason: 'designated', note: null } }, { enabled: true, max: 9 });
    expect(marked).toMatchObject({ counted: 9, exempt: 1, over: 0 });
    expect(rosterLimitLine(marked)).toBe('9 of 9 count toward the roster limit. 1 player doesn’t count.');

    const off = countRoster(ten, {}, { enabled: false, max: 9 });
    expect(off.over).toBe(0);
    expect(rosterLimitLine(off)).toBeNull();
    expect(rosterChip(off)).toBeNull();
  });

  it('answers with the division default and "missing" before the held migration, without throwing', async () => {
    const { sb } = fakeSb({ division: 'DI', code: '42P01' });
    const r = await readRosterLimit(sb, 'team-1', { withExemptions: true });
    expect(r).toEqual({ limit: { enabled: true, max: 9 }, from: 'division', exemptions: {}, missing: true, error: false });
  });

  it('reads a saved limit and the exemptions for a coach; a player read never asks for exemptions', async () => {
    const coach = fakeSb({
      division: 'DIII',
      limit: { enabled: true, max_players: 8 },
      exempt: [
        { player_id: 'a', reason: 'medical', note: null },
        { player_id: 'b', reason: 'bogus', note: null },
      ],
    });
    const r = await readRosterLimit(coach.sb, 'team-1', { withExemptions: true });
    expect(r.limit).toEqual({ enabled: true, max: 8 });
    expect(r.from).toBe('saved');
    expect(r.exemptions).toEqual({ a: { reason: 'medical', note: null } });

    const player = fakeSb({ division: 'DI', limit: null });
    await readRosterLimit(player.sb, 'team-1', { withExemptions: false });
    expect(player.seen).not.toContain('golf_roster_exemptions');
  });

  it('a failed read keeps the default and says so', async () => {
    const { sb } = fakeSb({ division: 'DI', limitError: 'boom' });
    const r = await readRosterLimit(sb, 'team-1', { withExemptions: true });
    expect(r).toMatchObject({ limit: { enabled: true, max: 9 }, error: true, missing: false });
  });
});
