import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parsePlanBody, parseVersionBody, validatePlan } from '@/lib/coachhelm/v3/practice-plan/model';
import { DEMO_TEAM_ID } from '@/lib/demo/config';
import { generateDemoTeam, DEMO_TABLES, rowKey, type DemoDataset, type DemoRow, type GenerateInput } from '../generate';
import { checkDemoCoverage, formatCoverage } from '../coverage';
import { summarizeDataset } from '../summary';
import { DEMO_ROSTER, DEMO_VENUES, YARDS_FOR_PAR } from '../story';

const COACH = '00000000-0000-4000-8000-0000000000c1';
const COACH_ROW = '00000000-0000-4000-8000-0000000000c3';
const CHANNEL = '00000000-0000-4000-8000-0000000000c2';
const base: GenerateInput = { teamId: DEMO_TEAM_ID, today: '2026-11-15', timeZone: 'America/New_York', coachUserId: COACH, coachId: COACH_ROW, teamChannelId: CHANNEL };

const cache = new Map<string, DemoDataset>();
function gen(over: Partial<GenerateInput> = {}): DemoDataset {
  const input = { ...base, ...over };
  const k = JSON.stringify(input);
  const hit = cache.get(k);
  if (hit) return hit;
  const d = generateDemoTeam(input);
  cache.set(k, d);
  return d;
}

const hash = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const ids = (rows: DemoRow[], k = 'id') => new Set(rows.map((r) => String(r[k])));
const name = (d: DemoDataset, key: string) => {
  const s = DEMO_ROSTER.find((p) => p.key === key)!;
  return d.tables.golf_players.find((p) => p.first_name === s.firstName && p.last_name === s.lastName)!;
};

describe('generateDemoTeam', () => {
  it('is a pure function of its input', () => {
    const a = generateDemoTeam(base);
    const b = generateDemoTeam(base);
    expect(hash(a.tables)).toBe(hash(b.tables));
  });

  it('never changes a past row when a day passes (DD-04)', () => {
    const before = gen();
    const after = gen({ today: '2026-11-16' });
    for (const table of ['golf_rounds', 'golf_holes', 'golf_shots', 'golf_qualifier_round_courses'] as const) {
      const next = new Map(after.tables[table].map((r) => [rowKey(table, r), hash(r)]));
      for (const r of before.tables[table]) expect(next.get(rowKey(table, r)), `${table} ${rowKey(table, r)}`).toBe(hash(r));
    }
    // and the day adds what was played on the 15th: nothing (a Sunday), so the round count holds
    expect(after.tables.golf_rounds.length).toBe(before.tables.golf_rounds.length);
  });

  it('adds the qualifier round played on Monday the next day', () => {
    const tue = gen({ today: '2026-11-17' });
    const mon = tue.tables.golf_rounds.filter((r) => r.round_date === '2026-11-16');
    expect(mon.length).toBeGreaterThanOrEqual(4);
    expect(mon.every((r) => r.round_type === 'qualifier')).toBe(true);
  });

  it('writes only the team it was given, with unique keys and whole references', () => {
    const d = gen();
    for (const table of DEMO_TABLES) {
      const keys = d.tables[table].map((r) => rowKey(table, r));
      expect(new Set(keys).size, table).toBe(keys.length);
      for (const r of d.tables[table]) if ('team_id' in r) expect(r.team_id, table).toBe(DEMO_TEAM_ID);
    }
    const t = d.tables;
    const players = ids(t.golf_players);
    const events = ids(t.golf_events);
    const rounds = ids(t.golf_rounds);
    const holes = ids(t.golf_holes);
    const qualifiers = ids(t.golf_qualifiers);
    const tournaments = ids(t.golf_tournaments);
    const plans = ids(t.golf_practice_plans);
    const tasks = ids(t.golf_tasks);
    const fieldTeams = ids(t.golf_tournament_field_teams);
    const roundEvents = ids(t.golf_tournament_rounds, 'round_event_id');
    const within = (rows: DemoRow[], k: string, set: Set<string>) => rows.filter((r) => r[k] !== null && r[k] !== undefined && !set.has(String(r[k])));
    expect(within(t.golf_team_members, 'player_id', players)).toEqual([]);
    expect(within(t.golf_rounds, 'player_id', players)).toEqual([]);
    expect(within(t.golf_rounds, 'qualifier_id', qualifiers)).toEqual([]);
    expect(within(t.golf_holes, 'round_id', rounds)).toEqual([]);
    expect(within(t.golf_shots, 'hole_id', holes)).toEqual([]);
    expect(within(t.golf_shots, 'round_id', rounds)).toEqual([]);
    expect(within(t.golf_event_attendance, 'event_id', events)).toEqual([]);
    expect(within(t.golf_event_attendance, 'player_id', players)).toEqual([]);
    expect(within(t.golf_tournament_rounds, 'round_event_id', events)).toEqual([]);
    expect(within(t.golf_tournament_rounds, 'tournament_id', tournaments)).toEqual([]);
    expect(within(t.golf_tournament_entries, 'tournament_id', tournaments)).toEqual([]);
    expect(within(t.golf_tournament_round_lineups, 'round_event_id', roundEvents)).toEqual([]);
    expect(within(t.golf_tournament_player_rounds, 'round_event_id', roundEvents)).toEqual([]);
    expect(within(t.golf_tournament_player_rounds, 'round_id', rounds)).toEqual([]);
    expect(within(t.golf_tournament_field_teams, 'tournament_id', tournaments)).toEqual([]);
    expect(within(t.golf_tournament_field_scores, 'field_team_id', fieldTeams)).toEqual([]);
    expect(within(t.golf_qualifier_round_courses, 'qualifier_id', qualifiers)).toEqual([]);
    expect(within(t.golf_qualifier_entries, 'qualifier_id', qualifiers)).toEqual([]);
    expect(within(t.golf_qualifier_entries, 'round_id', rounds)).toEqual([]);
    expect(within(t.golf_qualifier_selections, 'qualifier_id', qualifiers)).toEqual([]);
    expect(within(t.golf_qualifiers, 'target_tournament_id', events)).toEqual([]);
    // ... and that event is round 1 of a tournament (the app's link, 20261025040000).
    const roundOnes = new Set(t.golf_tournament_rounds.filter((r) => r.round_number === 1).map((r) => String(r.round_event_id)));
    expect(t.golf_qualifiers.filter((q) => !roundOnes.has(String(q.target_tournament_id)))).toEqual([]);
    expect(within(t.golf_practice_plans, 'event_id', events)).toEqual([]);
    expect(within(t.golf_practice_plan_versions, 'plan_id', plans)).toEqual([]);
    expect(within(t.golf_task_assignments, 'task_id', tasks)).toEqual([]);
    expect(within(t.golf_travel_itineraries, 'event_id', events)).toEqual([]);
  });

  it('keeps every value inside the database constraints', () => {
    const t = gen().tables;
    const allIn = (rows: DemoRow[], k: string, allowed: readonly unknown[]) => rows.filter((r) => r[k] !== null && r[k] !== undefined && !allowed.includes(r[k])).map((r) => r[k]);
    expect(allIn(t.golf_rounds, 'round_type', ['practice', 'qualifier', 'tournament'])).toEqual([]);
    expect(allIn(t.golf_rounds, 'status', ['completed'])).toEqual([]);
    expect(allIn(t.golf_events, 'event_type', ['practice', 'qualifier', 'tournament', 'meeting', 'travel', 'other'])).toEqual([]);
    expect(allIn(t.golf_event_attendance, 'status', ['pending', 'accepted', 'declined', 'tentative', 'attending', 'not_attending', 'maybe', 'excused', 'unexcused'])).toEqual([]);
    expect(allIn(t.golf_event_attendance, 'attendance_status', ['present', 'late', 'no_show'])).toEqual([]);
    expect(allIn(t.golf_qualifiers, 'status', ['upcoming', 'in_progress', 'completed'])).toEqual([]);
    expect(allIn(t.golf_qualifiers, 'selection_state', ['open', 'scoring', 'closed', 'selected'])).toEqual([]);
    expect(allIn(t.golf_qualifier_entries, 'status', ['entered', 'completed'])).toEqual([]);
    expect(allIn(t.golf_shots, 'result', ['fairway', 'rough', 'deep_rough', 'sand', 'green', 'hole', 'other', 'penalty', 'recovery'])).toEqual([]);
    expect(allIn(t.golf_shots, 'lie_before', ['tee', 'fairway', 'rough', 'sand', 'green', 'other', 'penalty'])).toEqual([]);
    expect(allIn(t.golf_shots, 'lie_after', ['tee', 'fairway', 'rough', 'sand', 'green', 'other', 'penalty'])).toEqual([]);
    expect(allIn(t.golf_shots, 'club_type', ['driver', 'non_driver', 'putter'])).toEqual([]);
    expect(allIn(t.golf_tournament_entries, 'role', ['lineup', 'alternate', 'individual'])).toEqual([]);
    expect(t.golf_tournament_entries.filter((e) => (e.role === 'lineup') !== (e.slot !== null))).toEqual([]);
    expect(t.golf_tournament_round_lineups.filter((e) => (e.role === 'lineup') !== (e.slot !== null))).toEqual([]);
    expect(t.golf_tournament_player_rounds.filter((r) => (r.round_id === null) === (r.entered_total === null))).toEqual([]);
    expect(t.golf_tournament_field_scores.filter((s) => Number(s.total) < 60 || Number(s.total) > 800 || Number(s.thru) < 0 || Number(s.thru) > 18)).toEqual([]);
    expect(t.golf_tournaments.filter((x) => Number(x.field_size) > 40)).toEqual([]);
    expect(t.golf_practice_plans.filter((p) => p.status === 'published' && (p.published_version === null || p.published_at === null))).toEqual([]);
    expect(t.golf_messages.filter((m) => m.kind !== 'text' || m.payload !== null)).toEqual([]);
    expect(t.golf_team_seasons.filter((s) => !/^\d{4}-\d{2}$/.test(String(s.season)))).toEqual([]);
    expect(allIn(t.golf_tasks, 'status', ['pending', 'completed'])).toEqual([]);
  });

  it('writes plan bodies the practice screens can read', () => {
    const t = gen().tables;
    expect(t.golf_practice_plans.length).toBeGreaterThan(0);
    for (const p of t.golf_practice_plans) {
      const body = parsePlanBody(p.body);
      expect(body, String(p.id)).not.toBeNull();
      expect(validatePlan(body!).errors).toEqual([]);
    }
    for (const v of t.golf_practice_plan_versions) {
      expect(v.is_live).toBe(true);
      expect(parseVersionBody(v.body)?.variants.main.blocks.length).toBeGreaterThan(0);
    }
  });

  it('writes no notes, no seed tags and no test rows (DD-02, DD-13)', () => {
    const t = gen().tables;
    expect(t.golf_rounds.filter((r) => r.notes !== null)).toEqual([]);
    const text = JSON.stringify(t);
    expect(text).not.toMatch(/seed-from|\[seed/i);
    expect(text).not.toMatch(/momentic|qa audit|testplayer/i);
    for (const table of DEMO_TABLES) for (const r of t[table]) if ('is_test' in r) expect(r.is_test, table).toBe(false);
  });

  it('uses only the invented roster', () => {
    const t = gen().tables;
    const invented = new Set(DEMO_ROSTER.map((p) => `${p.firstName} ${p.lastName}`));
    for (const p of t.golf_players) expect(invented.has(`${p.first_name} ${p.last_name}`)).toBe(true);
    expect(t.golf_players.every((p) => p.user_id === null && p.email === null)).toBe(true);
  });

  it('passes the coverage check on every kind of day, for several seeds', () => {
    // 19 and 20 Nov and 29 and 30 Apr are the end-of-term taper, when fewer than three events remain.
    const days = ['2026-08-01', '2026-08-26', '2026-10-10', '2026-11-15', '2026-11-19', '2026-11-20', '2026-12-24', '2027-01-20', '2027-02-10', '2027-03-17', '2027-04-29', '2027-04-30', '2027-05-15', '2027-11-15'];
    for (const seed of [undefined, 'seed-a', 'seed-b']) {
      for (const today of days) {
        const report = checkDemoCoverage({ today, tables: gen({ today, seed }).tables });
        expect(report.ok, `${seed ?? 'default'} ${today}\n${formatCoverage(report)}`).toBe(true);
      }
    }
  }, 120_000);
});

describe('the invented courses', () => {
  // A hole's yardage must read as its par on a scorecard: five of six venues once
  // paired a 571-yard hole with par 3 and a 177-yard hole with par 5.
  it.each(DEMO_VENUES.map((v) => [v.key, v] as const))('%s is a par 72 whose every hole fits its par', (_key, v) => {
    expect(v.holes).toHaveLength(18);
    expect(v.holes.reduce((t, h) => t + h.par, 0)).toBe(72);
    expect(v.holes.filter((h) => h.par === 3)).toHaveLength(4);
    expect(v.holes.filter((h) => h.par === 5)).toHaveLength(4);
    for (const [i, h] of v.holes.entries()) {
      const [min, max] = YARDS_FOR_PAR[h.par];
      expect(h.yards, `hole ${i + 1}, par ${h.par}`).toBeGreaterThanOrEqual(min);
      expect(h.yards, `hole ${i + 1}, par ${h.par}`).toBeLessThanOrEqual(max);
    }
  });

  it('plays about as long as the real teams\' courses (par 3s 186, par 4s 406, par 5s 528 yards)', () => {
    const holes = DEMO_VENUES.flatMap((v) => v.holes);
    const avg = (par: number) => holes.filter((h) => h.par === par).reduce((t, h) => t + h.yards, 0) / holes.filter((h) => h.par === par).length;
    expect(avg(3)).toBeGreaterThan(176);
    expect(avg(3)).toBeLessThan(196);
    expect(avg(4)).toBeGreaterThan(396);
    expect(avg(4)).toBeLessThan(426);
    expect(avg(5)).toBeGreaterThan(513);
    expect(avg(5)).toBeLessThan(543);
  });
});

describe('the demo story on 15 Nov 2026 (default seed)', () => {
  const d = gen();
  const t = d.tables;
  const seasonScoring = (key: string) => t.golf_rounds.filter((r) => r.player_id === name(d, key).id && r.round_type !== 'practice' && String(r.round_date) >= '2026-08-01');
  const avg = (rs: DemoRow[]) => rs.reduce((s, r) => s + Number(r.total_score), 0) / rs.length;

  it('has the live qualifier, with the spring opener lineup three of five set', () => {
    const q = t.golf_qualifiers.find((x) => x.status === 'in_progress');
    expect(q?.name).toBe('Spring opener qualifier');
    const openerId = t.golf_tournament_rounds.find((r) => r.round_event_id === q!.target_tournament_id)!.tournament_id;
    const opener = t.golf_tournaments.find((x) => x.id === openerId)!;
    expect(opener.start_date).toBe('2027-02-08');
    expect(t.golf_tournament_entries.filter((e) => e.tournament_id === opener.id && e.role === 'lineup')).toHaveLength(3);
  });

  it('has five fall tournaments, all final by mid-November', () => {
    const fall = t.golf_tournaments.filter((x) => String(x.start_date) < '2026-12-31');
    expect(fall).toHaveLength(5);
    expect(fall.filter((x) => x.official_at !== null)).toHaveLength(5);
  });

  it('gives each full-season player 18 to 28 season rounds, about 70% with shots', () => {
    for (const p of d.players.filter((x) => !['transfer', 'injured'].includes(x.key))) {
      expect(p.seasonScoringRounds, p.key).toBeGreaterThanOrEqual(18);
      expect(p.seasonScoringRounds, p.key).toBeLessThanOrEqual(28);
      expect(p.withShots / p.rounds, p.key).toBeGreaterThan(0.6);
      expect(p.withShots / p.rounds, p.key).toBeLessThan(0.8);
    }
  });

  it('tells each player story', () => {
    const by = new Map(d.players.map((p) => [p.key, p]));
    // the transfer has three rounds; the injured player none since 10 Oct
    expect(by.get('transfer')!.rounds).toBe(3);
    expect(by.get('injured')!.last! < '2026-10-10').toBe(true);
    // the steady senior has the lowest average, the boom-or-bust junior the most penalties, the putter the fewest putts
    const full = d.players.filter((p) => p.seasonScoringRounds >= 10);
    expect([...full].sort((a, b) => a.seasonToPar! - b.seasonToPar!)[0]!.key).toBe('steady_senior');
    expect([...full].sort((a, b) => b.penaltiesPerRound! - a.penaltiesPerRound!)[0]!.key).toBe('boom_or_bust');
    expect([...full].sort((a, b) => a.puttsPerRound! - b.puttsPerRound!)[0]!.key).toBe('strong_putter');
    // the freshman is better now than in September; the slumping senior worse since October
    const fr = seasonScoring('improving_freshman');
    expect(avg(fr.filter((r) => String(r.round_date) >= '2026-10-15')) - avg(fr.filter((r) => String(r.round_date) < '2026-09-25'))).toBeLessThan(-3);
    const sl = seasonScoring('slumping_senior');
    expect(avg(sl.filter((r) => String(r.round_date) >= '2026-10-15')) - avg(sl.filter((r) => String(r.round_date) < '2026-10-05'))).toBeGreaterThan(2);
    // the walk-on has never been in a lineup
    expect(t.golf_tournament_entries.filter((e) => e.player_id === name(d, 'walk_on').id && e.role === 'lineup')).toEqual([]);
  });

  it('puts the bubble player on the line in the live qualifier', () => {
    const q = t.golf_qualifiers.find((x) => x.status === 'in_progress')!;
    const board = t.golf_qualifier_entries.filter((e) => e.qualifier_id === q.id && e.position !== null && e.position !== undefined);
    const bubble = board.find((e) => e.player_id === name(d, 'bubble').id)!;
    expect(bubble.position).toBe(2);
    expect(bubble.is_tied).toBe(true);
  });

  it('settles the spring opener lineup once the qualifier ends, with the bubble player in it', () => {
    const later = gen({ today: '2026-11-21' });
    const opener = later.tables.golf_tournaments.find((x) => x.start_date === '2027-02-08')!;
    const lineup = later.tables.golf_tournament_entries.filter((e) => e.tournament_id === opener.id && e.role === 'lineup');
    expect(lineup).toHaveLength(5);
    expect(lineup.some((e) => e.player_id === name(later, 'bubble').id)).toBe(true);
  });

  it('summarises what it would write', () => {
    const text = summarizeDataset(d);
    expect(text).toContain('Demo team as of 2026-11-15');
    expect(text).toContain('Spring opener qualifier');
    for (const p of DEMO_ROSTER) expect(text).toContain(`${p.firstName} ${p.lastName}`);
  });
});
