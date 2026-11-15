import { describe, expect, it } from 'vitest';
import { DEMO_TEAM_ID } from '@/lib/demo/config';
import { generateDemoTeam, type DemoRow } from '../generate';
import { checkDemoCoverage, inTerm, wrongWeekdays, type DemoSnapshot } from '../coverage';

const today = '2026-11-15';
const clean = generateDemoTeam({ teamId: DEMO_TEAM_ID, today, timeZone: 'America/New_York', coachUserId: '00000000-0000-4000-8000-0000000000c1', teamChannelId: '00000000-0000-4000-8000-0000000000c2' });

/** A copy of the clean snapshot with one table changed. */
function tamper(table: keyof DemoSnapshot['tables'], change: (rows: DemoRow[]) => DemoRow[]): DemoSnapshot {
  const tables = structuredClone(clean.tables) as DemoSnapshot['tables'];
  tables[table] = change(tables[table] ?? []);
  return { today, tables };
}
const failing = (snap: DemoSnapshot) => checkDemoCoverage(snap).checks.filter((c) => !c.ok).map((c) => c.id);

describe('checkDemoCoverage', () => {
  it('passes the generated team', () => {
    expect(failing({ today, tables: clean.tables })).toEqual([]);
  });

  it('catches a round header that contradicts its holes (DD-11)', () => {
    const snap = tamper('golf_rounds', (rs) => rs.map((r, i) => (i === 0 ? { ...r, total_score: Number(r.total_score) - 3 } : r)));
    expect(failing(snap)).toContain('header-matches-holes');
  });

  it('catches two players carrying the same scorecard (DD-16)', () => {
    const [a, b] = clean.tables.golf_rounds;
    const snap = tamper('golf_holes', (hs) => {
      const fromA = new Map(hs.filter((h) => h.round_id === a!.id).map((h) => [h.hole_number, h]));
      return hs.map((h) => (h.round_id === b!.id ? { ...h, score: fromA.get(h.hole_number)!.score, putts: fromA.get(h.hole_number)!.putts } : h));
    });
    expect(failing(snap)).toContain('unique-scorecards');
  });

  it('catches a seed tag in round notes (DD-02)', () => {
    const snap = tamper('golf_rounds', (rs) => rs.map((r, i) => (i === 3 ? { ...r, notes: '[seed-from-someone]' } : r)));
    expect(failing(snap)).toContain('no-seed-tags');
  });

  it('catches test players and QA messages (DD-13)', () => {
    const players = tamper('golf_players', (ps) => ps.map((p, i) => (i === 0 ? { ...p, is_test: true } : p)));
    expect(failing(players)).toContain('no-test-players');
    const messages = tamper('golf_messages', (ms) => [...ms, { ...ms[0]!, id: 'x', content: 'Momentic DM check 1785116949158' }]);
    expect(failing(messages)).toContain('no-test-copy');
  });

  it('catches a qualifier left open after its last day (DD-08)', () => {
    const snap = tamper('golf_qualifiers', (qs) => qs.map((q) => (q.status === 'completed' ? { ...q, status: 'in_progress' } : q)));
    expect(failing(snap)).toContain('qualifiers-closed');
  });

  it('catches a missing season row (DATA-04) and a perfect attendance record (DD-10)', () => {
    expect(failing(tamper('golf_team_seasons', () => []))).toContain('season-row');
    const perfect = tamper('golf_event_attendance', (as) => as.map((a) => ({ ...a, attendance_status: 'present' })));
    expect(failing(perfect)).toContain('attendance');
  });

  it('catches a stale team: no round for weeks in term (DD-03)', () => {
    const snap = tamper('golf_rounds', (rs) => rs.filter((r) => String(r.round_date) < '2026-10-01'));
    expect(failing(snap)).toContain('fresh-rounds');
  });
});

describe('wrongWeekdays (DD-18)', () => {
  it('passes a weekday that matches its date', () => {
    expect(wrongWeekdays('Practice Thursday 12 Nov at 2:30.', '2026-11-10')).toEqual([]);
  });
  it('flags one that does not, picking the year nearest the message', () => {
    expect(wrongWeekdays('Practice Thursday 14 Nov at 2:30.', '2026-11-10')).toEqual(['Thursday 14 Nov (is a Saturday)']);
    expect(wrongWeekdays('Vans leave Sunday 3 Jan.', '2026-12-28')).toEqual([]);
  });
});

describe('inTerm', () => {
  it('knows term from break', () => {
    expect(inTerm('2026-11-15')).toBe(true);
    expect(inTerm('2026-12-20')).toBe(false);
    expect(inTerm('2027-07-01')).toBe(false);
  });
});
