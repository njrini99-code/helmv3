import { describe, expect, it } from 'vitest';
import type { TeamPattern } from '@/lib/coachhelm/v3/team-pattern/pattern';
import { briefCountsLine, briefTeamLine, briefStrokes, computeMondayBrief, isEmptyBrief, MONDAY_BRIEF_MAX_ITEMS, type MondayBriefRead, type MondayBriefRound } from '../brief';
import { buildMondayBriefEmail } from '../email';

const NOW = new Date('2026-10-19T05:00:00Z');
const roster = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}` }));

const ev = (over: Record<string, unknown> = {}) => ({
  ladder: 'likely',
  strokes_impact: 0.5,
  strokes_impact_method: 'peer_delta',
  support: { direction: 'weakness' },
  ...over,
});
const read = (id: string, player: string, over: Record<string, unknown> = {}, extra: Partial<MondayBriefRead> = {}): MondayBriefRead => ({
  id,
  player_id: player,
  title: `Read ${id}`,
  created_at: '2026-10-01T00:00:00Z',
  evidence: ev(over),
  metadata: { last_refreshed_at: '2026-10-18T02:00:00Z' },
  ...extra,
});
const run = (reads: MondayBriefRead[], rounds: MondayBriefRound[] = [], teamPattern: TeamPattern | null = null) =>
  computeMondayBrief({ teamId: 't', roster, reads, rounds, teamPattern, withEnoughRounds: 6, now: NOW });

const pattern = (memberRead: string): TeamPattern => ({
  team_id: 't',
  family: 'f|m',
  base_family: 'f',
  metric: 'm',
  side: null,
  label: 'Wedges 50–125 yd',
  unit: 'percent',
  window_end: '2026-10-19',
  members: ['p0', 'p1', 'p2'],
  member_reads: [{ player_id: 'p0', insight_id: memberRead, ladder: 'likely', strokes: 0.3, value: 40 }],
  roster_with_reads: 6,
  roster_total: 8,
  strokes_sum: 1.1,
  common_next: 'Carry ladder.',
  computed_at: NOW.toISOString(),
});

describe('computeMondayBrief', () => {
  it('keeps reads at Likely or above, one per player, most strokes first', () => {
    const b = run([
      read('a', 'p0', { strokes_impact: 0.4 }),
      read('b', 'p0', { strokes_impact: 0.9, ladder: 'observed' }),
      read('c', 'p1', { strokes_impact: 0.6, ladder: 'seen_repeatedly' }),
    ]);
    expect(b.items.map((i) => (i.kind === 'read' ? i.insight_id : i.id))).toEqual(['b', 'c']);
  });

  it('leaves out strengths, Watching, Working hypothesis and reads with no direction', () => {
    const b = run([
      read('s', 'p0', { support: { direction: 'strength' } }),
      read('w', 'p1', { ladder: 'not_enough_yet' }),
      read('h', 'p2', { ladder: 'working_hypothesis' }),
      read('n', 'p3', { support: {} }),
      read('cat', 'p4', {}, { category: 'strength' }),
    ]);
    expect(b.items).toEqual([]);
  });

  it('fails closed on a missing field: no ladder, no strokes estimate, no title, no freshness day, no roster name', () => {
    const b = run([
      read('l', 'p0', { ladder: undefined }),
      read('s', 'p1', { strokes_impact_method: 'rough_estimate' }),
      read('t', 'p2', {}, { title: null }),
      read('f', 'p3', {}, { metadata: {} }),
      read('x', 'stranger'),
      read('bad', 'p4', {}, { evidence: 'not an object' as unknown }),
    ]);
    expect(b.items).toEqual([]);
  });

  it('S3: a read two rounds behind is out; one round behind stays and both count as out of date', () => {
    const rounds = [
      { player_id: 'p0', day: '2026-10-19' },
      { player_id: 'p1', day: '2026-10-19' },
      { player_id: 'p1', day: '2026-10-20' },
    ];
    const b = run([read('one', 'p0'), read('two', 'p1')], rounds);
    expect(b.items.map((i) => (i.kind === 'read' ? [i.insight_id, i.rounds_behind] : null))).toEqual([['one', 1]]);
    expect(b.counts.out_of_date).toBe(2);
  });

  it('caps at five items with the team pattern first and leaves its member read out', () => {
    const reads = roster.map((p, i) => read(`r${i}`, p.id, { strokes_impact: 1 + i / 10 }));
    const b = run(reads, [], pattern('r7'));
    expect(b.items).toHaveLength(MONDAY_BRIEF_MAX_ITEMS);
    expect(b.items[0]!.kind).toBe('team_pattern');
    expect(b.items.slice(1).map((i) => (i.kind === 'read' ? i.insight_id : ''))).toEqual(['r6', 'r5', 'r4', 'r3']);
  });

  it('counts the week: new, cleared, contradicted pairs once, and never shows a cleared, retired or under-review read', () => {
    const b = run([
      read('n', 'p0', {}, { created_at: '2026-10-15T00:00:00Z' }),
      read('c', 'p1', { recheck: { outcome: 'cleared', computed_at: '2026-10-16T00:00:00Z' } }),
      read('old', 'p2', { recheck: { outcome: 'cleared', computed_at: '2026-09-01T00:00:00Z' } }),
      read('w', 'p3', { conflict: { with_insight_id: 'r', role: 'winner', computed_at: '2026-10-17T00:00:00Z' } }),
      read('r', 'p4', { conflict: { with_insight_id: 'w', role: 'retired', computed_at: '2026-10-17T00:00:00Z' } }),
      read('u', 'p5', { under_review: { reason: 'wrong_cause', since: '2026-10-17' } }),
    ]);
    expect(b.counts).toEqual({ new: 1, cleared: 1, contradicted: 1, out_of_date: 0 });
    expect(b.cleared).toEqual([{ player_name: 'Player 1', title: 'Read c' }]);
    expect(b.items.map((i) => (i.kind === 'read' ? i.insight_id : ''))).toEqual(['n', 'w']);
  });

  it('reads the lifecycle block from metadata when a re-emit dropped it from the evidence', () => {
    const b = run([read('c', 'p1', {}, { metadata: { last_refreshed_at: '2026-10-18', coachhelm_lifecycle: { recheck: { outcome: 'cleared', computed_at: '2026-10-16T00:00:00Z' } } } })]);
    expect(b.items).toEqual([]);
    expect(b.counts.cleared).toBe(1);
  });

  it('is empty when nothing reached Likely (the engine fields are still empty), and the lines read in words', () => {
    const b = run([read('a', 'p0', { ladder: undefined })], [{ player_id: 'p0', day: '2026-10-14' }]);
    expect(isEmptyBrief(b)).toBe(true);
    expect(briefCountsLine(b.counts)).toBe('0 new · 0 cleared · 0 contradicted · 0 out of date');
    expect(briefTeamLine(b)).toBe('8 players · 6 with enough rounds · 1 countable round last week');
  });

  it('never throws on malformed input', () => {
    expect(() => run([{ id: 'x', player_id: 'p0', title: null, created_at: null, evidence: null, metadata: null }])).not.toThrow();
  });
});

describe('briefStrokes', () => {
  it('prints raw strokes for a real estimate only, unsigned, one decimal', () => {
    expect(briefStrokes({ strokes_impact: -0.84, strokes_impact_method: 'sg_baseline' })).toBe(0.8);
    expect(briefStrokes({ strokes_impact: 0.04, strokes_impact_method: 'peer_delta' })).toBeNull();
    expect(briefStrokes({ strokes_impact: 0.6, strokes_impact_method: 'rough_estimate' })).toBeNull();
  });
});

describe('buildMondayBriefEmail', () => {
  it('lists the rows and ends with the counts line and the link, escaping names', () => {
    const b = run([read('a', 'p0')], [], pattern('zz'));
    const mail = buildMondayBriefEmail({ brief: b, teamName: 'Varsity <Men>', coachFirstName: 'Sam', href: 'https://x.test/golf/dashboard/coachhelm?view=monday-brief' });
    expect(mail.subject).toBe('Varsity <Men> · Monday brief');
    expect(mail.html).toContain('Varsity &lt;Men&gt;');
    expect(mail.text).toContain('- Team pattern: Wedges 50–125 yd · 3 of 6 players with enough rounds · 1.1 strokes a round across the team');
    expect(mail.text).toContain('- Player 0 · Read a · Likely · 0.5 strokes a round');
    expect(mail.text).toContain('0 new · 0 cleared · 0 contradicted · 0 out of date');
    expect(mail.text).not.toMatch(/%/);
  });
});
