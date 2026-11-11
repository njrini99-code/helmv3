import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { CoachChatContext } from '../context';
import type { PlayerChatContext, ReadTool, ToolContext, ToolResult } from '../engine/tool';
import { nowIso, type Measurement, type ToolEnvelope } from '../provenance';
import { failed, fieldWords, inWords, plain, together, withText } from '../reader-kit';
import { toolsFor } from '../registry';
import type { ScreenLoaders, TournamentsLoad } from '../screen-loaders';
import { person, pgrst, type Tables } from './pgrst-double';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: (name: string) => name === 'golf_tournaments_v1' }));

/**
 * What the model reads it repeats. The Stats, Rounds and Qualifiers readers write their own lines; every other read
 * used to reach the model as the envelope's JSON, field names and all ("avg_score", "gir_pct", "team_n"). These tests
 * hold the reads that are read out field by field to the same wording as the hand-written ones.
 */
const BANNED: Array<[string, RegExp]> = [
  ['a sample as n=4, n: 4 or N-4', /\bn\s*[=:-]\s*\d/i],
  ['a bare count in brackets', /\(\s*\d[\d,]*\s*\)/],
  ['ft for feet', /\d\s?ft\b|\bft\b/],
  ['yd for yards', /\d\s?yds?\b|\byds?\b/],
  ['avg for average', /\bavg\b/i],
  ['pct for percent', /\bpct\b/i],
  ['L10 for the last 10 rounds', /\bL\d+\b/],
  ['SG for strokes gained', /\bSG\b/],
  ['GIR for greens in regulation', /\bGIR\b/],
  ['a hyphen for a minus sign before a figure', /(^|[\s:(|])-\d/m],
  ['a column or table name', /\b[a-z]+_[a-z_]+\b/],
  ['the envelope as JSON', /"(summary|measurements|coverage)"\s*:/],
];
/** What a later call must be handed back exactly stands in brackets at the end of a line ("[metric gir_pct]", "[ref team:…]"): an id, not words to repeat. */
const withoutIds = (line: string): string => line.replace(/ \[[a-z ]+ [^\]\s]+\]/g, '');
const faults = (text: string): string[] => text.split('\n').flatMap((line) => BANNED.filter(([, re]) => re.test(withoutIds(line))).map(([what]) => `${what}: ${line.slice(0, 160)}`));

const ELI = '00000000-0000-4000-8000-000000000001';
const MAYA = '00000000-0000-4000-8000-000000000002';
const EVENT = '00000000-0000-4000-8000-0000000000e1';
const GOAL = '00000000-0000-4000-8000-0000000000a1';
const FOCUS = '00000000-0000-4000-8000-0000000000f1';
const DRILL = '00000000-0000-4000-8000-0000000000d1';
const EVENT_T = '00000000-0000-4000-8000-0000000000c1';

const figure = (over: Partial<Measurement> = {}): Measurement => ({
  metric_id: 'sg_approach',
  metric_label: 'SG approach',
  unit: 'strokes',
  value: -0.31,
  entity: { kind: 'player', id: ELI, label: 'Eli Brandt' },
  window_start: null,
  window_end: null,
  sample_size: 9,
  sample_unit: 'rounds',
  as_of: nowIso(),
  coverage: 'complete',
  coverage_note: null,
  source: 'Stats page',
  method: 'mean',
  denominator: null,
  benchmark: null,
  direction: 'higher_better',
  ...over,
});
const envelope = (over: Partial<ToolEnvelope> = {}): ToolEnvelope => ({ summary: 'A read.', measurements: [], series: [], coverage: 'complete', coverage_note: null, as_of: nowIso(), ...over });

describe('a field name as words', () => {
  it('says the short forms out', () => {
    expect(fieldWords('avg_to_par')).toBe('average to par');
    expect(fieldWords('gir_pct')).toBe('greens in regulation percent');
    expect(fieldWords('sg_ott')).toBe('strokes gained off the tee');
    expect(fieldWords('team_n')).toBe('team sample');
    expect(fieldWords('pga_p75')).toBe('PGA 75th percentile');
    expect(fieldWords('vs_tour')).toBe('against Tour');
    expect(fieldWords('toPar')).toBe('to par');
    expect(fieldWords('putts_made_3_5ft_pct')).toBe('putts made 3 5 feet percent');
  });
});

describe('a read in words', () => {
  it('reads a figure out with its unit, its sample and what it stands beside', () => {
    const lines = inWords(envelope({ measurements: [figure({ comparisons: [{ kind: 'team', label: 'Team average', value: 0.05, place_percent: null, place: 4, place_of: 8, note: null, missing_reason: null }, { kind: 'level', label: 'Division III average', value: null, place_percent: null, place: null, place_of: null, note: null, missing_reason: 'not set' }] })] }), 'against the Tour benchmark');
    expect(lines[0]).toBe('Eli Brandt, strokes gained approach: −0.31 strokes against the Tour benchmark, over 9 rounds | Team average: +0.05 strokes, placed 4 of 8 | Division III average: not set');
    expect(lines).toContain('Source: Stats page.');
  });

  it('names the benchmark a strokes-gained figure carries when the reader names none, and never one for another figure', () => {
    const withOwn = inWords(envelope({ measurements: [figure({ benchmark: { source: 'the Tour benchmark', version: '2026', value: 0, omitted_for_cohort: false } })] }));
    expect(withOwn[0]).toContain('−0.31 strokes against the Tour benchmark');
    const putts = inWords(envelope({ measurements: [figure({ metric_id: 'putts_per_round', metric_label: 'Putts per round', unit: 'count', value: 30.4 })] }), 'against the Tour benchmark');
    expect(putts[0]).toBe('Eli Brandt, putts per round: 30.4, over 9 rounds');
  });

  it('turns field names and the app’s own codes into words and keeps an id exact, in brackets', () => {
    const lines = inWords(envelope({ detail: { rounds_total: 3, per_player: [{ player_id: ELI, player: 'Eli Brandt', metric_id: 'scoring_average', target_metric: 'sg_putting', avg_score: 73.4, avg_to_par: 1.4, gir_pct: 61.1, status: 'in_progress', to_par: -2, checked_in: false, my_rsvp: null }], drills: [{ ref: `team:${DRILL}`, title: 'Gate drill', minutes: 15 }] } }));
    expect(lines).toEqual([
      'rounds total: 3',
      '  per player:',
      `    Eli Brandt: target metric: strokes gained putting; average score: 73.4; average to par: +1.4; greens in regulation percent: 61.1%; status: in progress; to par: 2 under par; checked in: no; my reply: none [player ${ELI}] [metric scoring_average]`,
      '  drills:',
      `    Gate drill: minutes: 15 [ref team:${DRILL}]`,
    ]);
  });

  it('passes stored words on exactly as they are written', () => {
    const note = 'Avg lag putt was 4 ft short vs last week -2';
    const text = plain(envelope({ summary: 'Notes.', detail: { notes: [{ player: 'Eli Brandt', body: note }] } })).model_text;
    expect(text).toContain(`Eli Brandt: body: ${note}`);
  });

  it('writes a band in words', () => {
    expect(inWords(envelope({ detail: { bands: [{ band: '150-175 yd', attempts: 12 }] } }))).toEqual(['bands:', '  band: 150 to 175 yards; attempts: 12']);
  });

  it('keeps the lines a reader wrote itself', () => {
    const own = withText(envelope({ summary: 'Mine.' }), ['One line of my own.']);
    expect(plain(own).model_text).toBe('Mine.\nOne line of my own.');
  });

  it('says what could not be read, in a sentence', () => {
    expect((failed('the schedule', 'This read is a player’s.') as ToolResult).model_text).toBe('Could not read the schedule.\nCoverage: unavailable. This read is a player’s.');
  });

  it('several reads answered as one keep each part under its label', () => {
    const both = together('', [['goals', envelope({ summary: '1 goal.', detail: { goals: [{ title: 'Putting', goal_id: GOAL }] } })], ['tasks', failed('tasks')]]);
    expect(both.model_text).toBe(['Goals:', '  1 goal.', '  goals:', `    Putting [goal ${GOAL}]`, 'Tasks:', '  Could not read tasks.', '  Coverage: unavailable. The read failed.'].join('\n'));
    expect(both.coverage).toBe('partial');
  });
});

describe('every field name a read can hand over', () => {
  const HERE = join(process.cwd(), 'src/lib/coachhelm/v3/chat');
  const SOURCES = ['ask-reads.ts', 'engine-reads.ts', 'practice-reads.ts', 'read-tools.ts', 'player-reads.ts', 'team-reads.ts', 'benchmark-reads.ts', 'shot-reads.ts', 'readers.ts', 'readers-direct.ts'];
  it('is said in words, with no abbreviation and no underscore', () => {
    const names = new Set(SOURCES.flatMap((f) => [...readFileSync(join(HERE, f), 'utf8').matchAll(/\b([a-z][a-z0-9]*(?:_[a-z0-9]+)*)\s*:/g)].map((m) => m[1]!)));
    expect(names.size).toBeGreaterThan(200);
    const bad = [...names].map((n) => [n, fieldWords(n)] as const).filter(([, words]) => /_|\b(avg|pct|n|sg|ott|gir|ft|yds?|vs|hs|std|rsvp|iso|p\d\d|d\d|div\d)\b/.test(words));
    expect(bad).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The readers themselves, over a team with something in every table they read
// ---------------------------------------------------------------------------------------------------------------------

const coach: CoachChatContext = { coach_id: 'c1', user_id: 'u1', team_id: 'team-1', team_name: 'Rini University', timezone: 'America/New_York', gender: 'mens', roster: [person(ELI, 'Eli Brandt'), person(MAYA, 'Maya Ortiz')] } as CoachChatContext;
const maya = { ...coach, roster: [person(MAYA, 'Maya Ortiz')], player_id: MAYA } as PlayerChatContext;
const soon = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

const standard = (metric: string, v: Record<string, number>) => ({ tour: 'pga', metric_id: metric, season: '2024', display_label: metric, pga_tour_value: null, korn_ferry_value: null, div1_avg_value: null, div2_avg_value: null, div3_avg_value: null, hs_avg_value: null, pga_p25: null, pga_p50: null, pga_p75: null, source: 'Published Tour statistics', ...v });

const TABLES: Tables = {
  golf_events: { rows: [{ id: EVENT, team_id: 'team-1', title: 'Tuesday range', event_type: 'practice', start_time: soon(1), end_time: soon(1.1), location: 'Range', status: 'scheduled', requires_rsvp: true, rsvp_deadline: soon(0.5) }] },
  golf_event_attendance: { rows: [{ event_id: EVENT, player_id: ELI, status: 'accepted', checked_in: true }, { event_id: EVENT, player_id: MAYA, status: null, checked_in: false }] },
  golf_attendance_summary: { rows: [{ player_id: ELI, team_id: 'team-1', period_start_date: '2026-09-01', period_end_date: '2026-10-01', total_events: 20, attended_count: 18, excused_count: 1, absent_count: 1, attendance_percentage: 90 }] },
  golf_goals: { rows: [{ id: GOAL, player_id: ELI, title: 'Gain on the greens', category: 'putting', metric_id: 'sg_putting', state: 'active', origin: 'coach', baseline_value: -0.4, current_value: -0.1, target_value: 0.2, started_at: '2026-09-01T00:00:00Z', ends_at: soon(20), window_days: 90 }] },
  golf_player_focus_areas: { rows: [{ id: FOCUS, player_id: ELI, team_id: 'team-1', title: 'Lag putting', status: 'active', area_type: 'putting', target_metric: 'sg_putting', created_at: '2026-10-01T00:00:00Z' }] },
  golf_focus_area_practice_sessions: { rows: [{ focus_area_id: FOCUS, player_id: ELI, practiced_at: new Date().toISOString(), reps: 30 }] },
  golf_focus_area_criteria: { rows: [{ focus_area_id: FOCUS, player_id: ELI, label: 'Three-putts under 2', met: true }] },
  golf_tasks: { rows: [{ id: '00000000-0000-4000-8000-0000000000b1', team_id: 'team-1', title: 'Send the travel form', status: 'open', due_date: '2026-11-01', priority: 'high', assigned_to: ELI, player_id: ELI }] },
  golf_practice_sessions: { rows: [{ player_id: ELI, team_id: 'team-1', session_date: new Date().toISOString().slice(0, 10) }] },
  golf_practice_plans: { rows: [{ id: '00000000-0000-4000-8000-0000000000b2', team_id: 'team-1', event_id: EVENT, title: 'Range day', step: 'ready', status: 'draft', version: 1, published_version: null, updated_at: '2026-11-02T10:00:00Z' }] },
  golf_team_drills: { rows: [{ id: DRILL, team_id: 'team-1', name: 'Gate drill', area: 'putting', kind: 'block', minutes: 15, archived_at: null }] },
  golf_drills: { rows: [{ id: 'ladder', title: 'Distance ladder', category: 'short_game', duration_min: 20 }] },
  golf_documents: { rows: [{ id: '00000000-0000-4000-8000-0000000000b3', team_id: 'team-1', title: 'Travel plan', folder: 'November', category: 'other', is_public: false, updated_at: '2026-11-03T12:00:00Z' }] },
  golf_team_seasons: { rows: [{ team_id: 'team-1', season: '2026', conference: 'ODAC', division: 'D3', official_rank: 12, official_rank_at: '2026-10-01' }] },
  golf_team_terms: { rows: [{ team_id: 'team-1', label: 'Fall 2026', classes_start: '2026-08-24', classes_end: '2026-12-04', exams_end: '2026-12-12', time_zone: 'America/New_York' }] },
  golf_team_settings: { rows: [{ team_id: 'team-1', scoring_format: 'stroke', handicap_system: 'usga', default_tees: 'blue', sg_baseline: 'pga', sg_benchmark_level: 'd3', timezone: 'America/New_York' }] },
  golf_teams: { rows: [{ id: 'team-1', gender: 'mens', organization_id: 'org-1' }] },
  organizations: { rows: [{ id: 'org-1', division: null }] },
  golf_pga_standards: { rows: [standard('gir_pct', { pga_tour_value: 66, div3_avg_value: 50, pga_p25: 62, pga_p50: 66, pga_p75: 72 }), standard('sg_putting', { pga_tour_value: 0, pga_p25: -0.3, pga_p50: 0, pga_p75: 0.4 })] },
  golf_metrics: {
    rows: [
      { metric_id: 'gir_pct', display_label: 'GIR %', category: 'approach', unit: 'percent', direction: 'higher_better', description: 'Greens hit in regulation.', active: true },
      { metric_id: 'sg_putting', display_label: 'SG: Putting', category: 'putting', unit: 'strokes', direction: 'higher_better', description: 'Strokes gained on the greens.', active: true },
      { metric_id: 'putts_made_3_5ft_pct', display_label: 'Putts Made 3-5 ft', category: 'putting', unit: 'percent', direction: 'higher_better', description: 'Make percentage from 3 to 5 feet.', active: true },
    ],
  },
  golf_player_standing: { rows: [{ player_id: ELI, metric_id: 'gir_pct', player_value: 58.123, level_avg: 61.5, level_n: 70, level_pct: 30.4, team_avg: 57.2, team_n: 9, team_pct: 55.5, basis: null, computed_at: '2026-11-07T02:20:00+00:00' }] },
  golf_player_stats_cache: { rows: [{ player_id: ELI, rounds_played: 12, gir_percentage: 58.3, greens_hit: 117, greens_total: 200, updated_at: '2026-11-07T00:00:00Z' }] },
  golf_tournaments: { rows: [{ id: EVENT_T, team_id: 'team-1', name: 'Invitational', start_date: '2026-10-10', end_date: '2026-10-12', event_kind: 'tournament', rounds_count: 3 }] },
  golf_tournament_reviews: { rows: [{ tournament_id: EVENT_T, team_id: 'team-1', observation: 'We lost shots on the back nine.', hypothesis: 'Tired legs.', updated_at: '2026-10-13T00:00:00Z' }] },
  golf_tournament_reflections: { rows: [{ tournament_id: EVENT_T, team_id: 'team-1', player_id: ELI, body: 'Putted well.', updated_at: '2026-10-13T00:00:00Z' }] },
  golf_tournament_player_notes: { rows: [{ tournament_id: EVENT_T, team_id: 'team-1', player_id: MAYA, decision: 'Laid up on 14', next_focus: 'Wedges', shot_of_day: '8-iron on 9', shared_at: null }] },
};

const tournaments: TournamentsLoad = {
  kind: 'ready',
  data: {
    errors: {},
    players: [{ id: ELI, name: 'Eli Brandt' }],
    events: [{ id: EVENT_T, name: 'Invitational', startDate: '2026-10-10', endDate: '2026-10-12', kind: 'tournament', format: 'stroke', status: 'completed', cancelled: false, legacy: false, lineup: { status: 'locked', set: 5, of: 5 }, finish: { place: 3, of: 12 }, rounds: [{ roundNumber: 1 }], playerRounds: [{ playerId: ELI, roundNumber: 1, total: 72, toPar: 0, status: 'final' }] }],
  },
} as unknown as TournamentsLoad;

function ctxFor(who: CoachChatContext | PlayerChatContext): ToolContext {
  const db = pgrst(TABLES);
  const classDay = { on: '2026-11-04', team_time_zone: 'America/New_York', players: [{ player_id: ELI, tracked: true, holds: true, blocks: [{ starts_at: soon(1), ends_at: soon(1.05), label: 'STAT 201', kind: 'class', source: 'pattern' }] }] };
  Object.assign(db.sb as object, { rpc: async () => ({ data: classDay, error: null }) });
  const loaders: ScreenLoaders = { tournaments: async () => tournaments };
  return { sb: db.sb, who, conversationId: 'conv-1', surface: 'player_id' in who ? 'player' : 'ask', loaders, signal: new AbortController().signal, reads: new Map() };
}
const run = async (who: CoachChatContext | PlayerChatContext, name: string, input: unknown): Promise<ToolResult> => {
  const tool = toolsFor('player_id' in who ? 'player' : 'ask', who).find((t) => t.name === name) as ReadTool<unknown>;
  return tool.run(ctxFor(who), tool.input.parse(input));
};

const ASKED: Array<[who: 'coach' | 'player', tool: string, input: unknown]> = [
  ['coach', 'get_schedule', { include: ['travel', 'classes', 'attendance'] }],
  ['coach', 'get_coachhelm', { what: ['signals', 'causes', 'patterns', 'focus_areas', 'focus_practice', 'goals', 'tasks'], player_id: ELI }],
  ['coach', 'get_coachhelm', { what: ['signals'] }],
  ['coach', 'get_practice', { what: ['activity', 'drill_bank', 'plan_format'] }],
  ['coach', 'get_tournaments', { notes: true }],
  ['coach', 'get_shots', {}],
  ['coach', 'get_shots', { bands: [[100, 150]] }],
  ['coach', 'get_season', { compare_last_season: true }],
  ['coach', 'get_reference', { topic: 'metric_definitions', metric_ids: ['sg_putting', 'gir_pct'] }],
  ['coach', 'get_reference', { topic: 'standards', metric_ids: ['sg_putting', 'gir_pct'], player_id: ELI }],
  ['coach', 'get_reference', { topic: 'standards' }],
  ['coach', 'get_reference', { topic: 'course' }],
  ['coach', 'get_reference', { topic: 'documents' }],
  ['coach', 'get_reference', { topic: 'team_settings' }],
  ['player', 'get_schedule', {}],
  ['player', 'get_coachhelm', { what: ['reads', 'focus_areas'] }],
  ['player', 'get_reference', { topic: 'metric_definitions', category: 'putting' }],
];

describe('the reads that are read out field by field', () => {
  it.each(ASKED)('%s %s %j: lines in words, never the envelope as JSON', async (who, tool, input) => {
    const result = await run(who === 'coach' ? coach : maya, tool, input);
    const text = (result as ToolResult & { model_text?: string }).model_text;
    expect(typeof text === 'string' && text.trim().length > 0).toBe(true);
    expect(faults(text as string)).toEqual([]);
  });

  const textOf = async (who: CoachChatContext | PlayerChatContext, tool: string, input: unknown) => ((await run(who, tool, input)) as ToolResult & { model_text: string }).model_text.split('\n').map((l) => l.trim());

  it('a row leads with who it is about and ends with the id a later call needs', async () => {
    expect(await textOf(coach, 'get_schedule', { include: ['attendance'] })).toContain(`Eli Brandt: period start: 2026-09-01; period end: 2026-10-01; events: 20; attended: 18; excused: 1; absent: 1; attendance percentage: 90% [player ${ELI}]`);
    expect(await textOf(coach, 'get_practice', { what: ['drill_bank'] })).toContain(`Gate drill: category: putting; minutes: 15; kind: block [ref team:${DRILL}]`);
    expect(await textOf(maya, 'get_schedule', {})).toContainEqual(expect.stringMatching(/^Tuesday range: event type: practice; .*my reply: no reply \[event /));
  });

  it('a metric is named by its label in words, with its id exact in brackets for the next call', async () => {
    const lines = await textOf(coach, 'get_reference', { topic: 'metric_definitions', metric_ids: ['sg_putting', 'gir_pct'] });
    expect(lines).toContain('strokes gained putting: kind: definition; category: putting; unit: strokes; direction: higher better; description: Strokes gained on the greens. [metric sg_putting]');
    expect(lines).toContain('greens in regulation %: kind: definition; category: approach; unit: percent; direction: higher better; description: Greens hit in regulation. [metric gir_pct]');
  });

  it('a goal on strokes gained reads in words, with a real minus sign', async () => {
    const lines = await textOf(coach, 'get_coachhelm', { what: ['goals'], player_id: ELI });
    expect(lines).toContainEqual(expect.stringMatching(/^Eli Brandt: title: Gain on the greens; category: putting; state: active; set by: coach; baseline value: \u22120\.4; current value: \u22120\.1; target value: 0\.2; progress percent: 50%; .* \[goal [0-9a-f-]+\] \[player [0-9a-f-]+\] \[metric sg_putting\]$/));
  });

  it('a part that could not be read says so beside the parts that were', async () => {
    const lines = await textOf(coach, 'get_coachhelm', { what: ['signals', 'tasks'] });
    expect(lines).toEqual(expect.arrayContaining(['Signals:', 'Could not read signals.', 'Coverage: unavailable. This part is about one player: say which.', 'Tasks:']));
  });
});
