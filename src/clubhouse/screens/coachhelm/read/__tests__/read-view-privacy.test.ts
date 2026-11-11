import { describe, expect, it } from 'vitest';
import { readHref } from '../../../../data/coachhelm-views-shape';
import { assignStateOf, readCauseOf, toChReadDetail, toChReadView, whatProse, type ChReadDetail } from '../../../../data/coachhelm-read-view-shape';
import { rangeWords } from '../../../../data/coachhelm-engine-shape';
import { diveCounts, toChDeepInsight, type ChDeepDive } from '../../../../data/coachhelm-dive-shape';
import { toChInsight } from '../../../../data/coachhelm-map';
import { READ_CALLS } from '../../../../data/coachhelm-read-calls';
import type { ChInsight } from '../../../../data/coachhelm-shape';
import { HELM_PLAYERS, PREVIEW_TOUR, penalties, slope } from '../../../../preview/fixtures-coachhelm';
import { previewReadView } from '../../../../preview/fixtures-coachhelm-read';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';

/**
 * Coachhelm-read W-READ-2, W-READ-3, W-READ-7 and the CR0 fixture check, on a read that carries a likely cause: a coach sees the arms, the
 * verdict and the range; a player's payload holds none of their values (SHARED-11's near relation: what the engine only infers stays the coach's).
 */
const CAUSE = {
  state: 'inferred_hypothesis',
  alternatives: [{ label: 'From 175+ yards', arm_a: { n: 28, failures: 16 }, arm_b: { n: 40, failures: 10 }, lift: 2.3 }],
  checked: { holes_with_full_record: 18, of: 20, fields_missing: ['lie'] },
};
const CALLS = { ...READ_CALLS, teamPool: false };
const SUPPORT = { range_lo: 1.1, range_hi: 2.9, gap_unit: 'metric_unit', testable: true };
const RANGE = rangeWords(SUPPORT)!;
const raw = (cause: Record<string, unknown> | null = CAUSE): EvidenceInsight => {
  const r = slope(HELM_PLAYERS.priya.id, 'in-approach');
  return { ...r, evidence: { ...r.evidence, cause, ladder: 'likely', support: SUPPORT } as unknown as EvidenceInsight['evidence'] };
};

function detail(role: 'coach' | 'player', row = raw()): ChReadDetail {
  const viewer = role === 'coach' ? ({ role: 'coach', first: 'Priya' } as const) : ({ role: 'player' } as const);
  const base = toChInsight(row, { tour: PREVIEW_TOUR, viewer, engine: { flags: { support: true }, now: '2026-11-01T00:00:00.000Z' } as never });
  const deep = toChDeepInsight(row, base, { rounds: new Map(), focusAreas: [], goals: [], themes: null }, (s) => s, role);
  return toChReadDetail(row, deep, role, 'Priya', CALLS, {});
}

function valuesUnder(value: unknown, keys: ReadonlySet<string>, at = '$', out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v, i) => valuesUnder(v, keys, `${at}[${i}]`, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (keys.has(k) && v != null) out.push(`${at}.${k}`);
      valuesUnder(v, keys, `${at}.${k}`, out);
    }
  }
  return out;
}

describe('a likely cause, by viewer', () => {
  it('readCauseOf gives the coach the arms and verdict, with the range', () => {
    const c = readCauseOf(CAUSE, null, 'coach', '1.1 to 2.9');
    expect(c).toMatchObject({ state: 'likely', track: 1, range: '1.1 to 2.9' });
    expect(c?.state === 'likely' && c.arms).toEqual([
      { label: 'From 175+ yards', failures: 16, n: 28 },
      { label: 'All other holes', failures: 10, n: 40 },
    ]);
    expect(c?.state === 'likely' && c.verdict).toMatch(/2\.3 times as often/);
  });

  it('readCauseOf gives the player not traced: no arm, verdict or range is ever built', () => {
    const c = readCauseOf(CAUSE, null, 'player', '1.1 to 2.9')!;
    expect(c.state).toBe('not_traced');
    const json = JSON.stringify(c);
    for (const key of ['arms', 'verdict', 'range', 'failures']) expect(json).not.toContain(`${JSON.stringify(key)}`);
    expect(json).not.toContain('175+');
    expect(json).not.toContain('2.3');
  });

  it('a counted cause reaches both, in each one’s words', () => {
    const counted = { state: 'observed_sequence', path: ['Long approach', 'Short side'], occurrences: 6, denominator: 9, event_strokes: 1.4 };
    expect(readCauseOf(counted, null, 'player')).toMatchObject({ state: 'counted', count: '6 of 9' });
    expect(readCauseOf(counted, null, 'coach')).toMatchObject({ state: 'counted', count: '6 of 9' });
  });
});

describe('the read payload', () => {
  const COACH_ONLY = new Set(['arms', 'range', 'rung']);

  it('the coach fixture carries what a player must not, so the player check below means something', () => {
    const d = detail('coach');
    expect(d.cause?.state).toBe('likely');
    expect(RANGE).toBeTruthy();
    expect(d.headline.foot.rung).toBe('Likely');
    expect(d.sure.rung).toEqual({ word: 'Likely', range: RANGE });
    expect(valuesUnder(d, COACH_ONLY).length).toBeGreaterThan(0);
  });

  it('a player’s payload holds no value under arms, range or rung, and no cause words', () => {
    const d = detail('player');
    expect(valuesUnder(d, COACH_ONLY)).toEqual([]);
    expect(d.cause?.state).toBe('not_traced');
    const json = JSON.stringify(d);
    expect(json).not.toContain('175+');
    expect(json).not.toContain('times as often');
    expect(json).not.toContain(RANGE);
  });

  it('the funnel reaches a player only when the lane’s call allows it', () => {
    const row = raw(null);
    const narrowing = { steps: [{ passed: true, label: 'Length', statement: '16 of 28 from 175+ yd' }], stopped_at: null };
    const withFunnel: EvidenceInsight = { ...row, evidence: { ...row.evidence, diagnosis: { ...row.evidence.diagnosis, basis: { narrowing } } } as unknown as EvidenceInsight['evidence'] };
    const base = toChInsight(withFunnel, { tour: PREVIEW_TOUR, viewer: { role: 'player' } });
    const deep = toChDeepInsight(withFunnel, base, { rounds: new Map(), focusAreas: [], goals: [], themes: null }, (s) => s, 'player');
    expect(toChReadDetail(withFunnel, deep, 'player', 'P', { ...CALLS, playerFunnel: false }, {}).funnel).toBeNull();
    expect(toChReadDetail(withFunnel, deep, 'player', 'P', { ...CALLS, playerFunnel: true }, {}).funnel).not.toBeNull();
    expect(toChReadDetail(withFunnel, deep, 'coach', 'P', { ...CALLS, playerFunnel: false }, {}).funnel).not.toBeNull();
  });

  it('a read the list no longer holds is null (W-READ-6), and another player’s id finds nothing', () => {
    const row = raw();
    const base = toChInsight(row, { tour: PREVIEW_TOUR, viewer: { role: 'player' } });
    const deep = toChDeepInsight(row, base, { rounds: new Map(), focusAreas: [], goals: [], themes: null }, (s) => s, 'player');
    const dive: ChDeepDive = { list: [deep], tour: 'Tour', rounds: null, themes: {}, roundsFailed: false, plansFailed: false, themesFailed: false, counts: diveCounts([deep]) };
    const head = { playerId: null, name: 'You', first: 'You' };
    const view = toChReadView(dive, new Map([[row.id, row]]), 'someone-elses-read', 'player', head, CALLS);
    expect(view.read).toBeNull();
    expect(view.head.playerId).toBeNull();
  });
});

describe('readHref (W-READ-3)', () => {
  it('the read view', () => {
    expect(readHref('p1', 'i1')).toBe('/golf/dashboard/coachhelm?view=read&player=p1&insight=i1');
    expect(readHref(null, 'i1')).toBe('/golf/dashboard/coachhelm?view=read&insight=i1');
  });
});

describe('assignStateOf (W-READ-7), the same gate as FocusActions', () => {
  const ins = (over: Partial<ChInsight> = {}) => ({ kind: 'read', stale: null, declined: false, ...over }) as unknown as ChInsight;
  const flags = { dismissed: false, assigned: false };
  it.each([
    ['open', ins(), flags],
    ['dismissed', ins({ kind: 'note' } as never), { ...flags, dismissed: true }],
    ['note', ins({ kind: 'note' } as never), { ...flags, assigned: true }],
    ['assigned', ins({ stale: { newestRound: 'x' } } as never), { ...flags, assigned: true }],
    ['unknown', ins(), { ...flags, missing: { assigned: true } as never }],
    ['unknown', ins(), { ...flags, missing: { declined: true } as never }],
    ['stale', ins({ stale: { newestRound: 'x' } } as never), flags],
    ['declined', ins({ declined: true } as never), flags],
  ])('%s', (want, i, f) => {
    expect(assignStateOf(i, f)).toBe(want);
  });
});

/**
 * The whole payload, not the named fields: this row says its guess in the first sentence, the title, the action and the engine's checked
 * lines, so every string a player's client receives is searched. A filter on `why` alone passes the block above and fails here.
 */
describe('a likely cause told in the row’s own words', () => {
  const ARMS = { label: 'From 175+ yards', arm_a: { n: 28, failures: 16, rate: 0.57 }, arm_b: { n: 40, failures: 10, rate: 0.25 }, lift: 2.3 };
  const told = (state: 'inferred_hypothesis' | 'observed_sequence' = 'inferred_hypothesis'): EvidenceInsight => {
    const r = slope(HELM_PLAYERS.priya.id, 'in-told');
    return {
      ...r,
      title: 'Approach misses driven by long irons',
      // The first sentence is the guess (it would be the lede); the second names an arm with no causal word; the third is the measure.
      content: 'Your approach misses are driven by long irons. From 175+ yards you missed 16 of 28, against 10 of 40 otherwise. You hit 36% of greens from the fairway.',
      drills: [],
      evidence: {
        ...r.evidence,
        ladder: 'likely',
        support: SUPPORT,
        cause:
          state === 'inferred_hypothesis'
            ? { state, alternatives: [ARMS], checked: { holes_with_full_record: 18, of: 20, fields_missing: ['lie'] } }
            : { state, path: ['Long approach', 'Short side'], occurrences: 6, denominator: 9, population: 'misses', example_holes: [] },
        diagnosis: {
          symptom: 'Approach misses are driven by long irons',
          root_cause: 'Long irons from 175+ yards look like the cause',
          causality_level: state,
          drivers: [{ metric: 'cause_arm_a_rate', label: 'From 175+ yards', value: 57, unit: 'percent', sample_n: 28 }],
          recommended_action: 'Work on approaches from 175+ yards in the next practice block',
          confidence_reason: 'Likely from the totals',
          basis: { kind: 'hypothesis_policy', hypothesis_label: 'likely', checked: ['A5 family', 'length: 16 of 28 approaches', 'lie: 16 of 28 from 175+ yards'], narrowing: { path: ['All approaches', 'From 175+ yards'], stopped_at: null, steps: [{ passed: true, label: 'All approaches', statement: '26 of 68 approaches missed' }, { passed: true, label: 'From 175+ yards', statement: '16 of 28 approaches from 175+ yd missed' }] } },
        },
      } as unknown as EvidenceInsight['evidence'],
    };
  };
  const build = (role: 'coach' | 'player', row: EvidenceInsight) => {
    const viewer = role === 'coach' ? ({ role: 'coach', first: 'Priya' } as const) : ({ role: 'player' } as const);
    const base = toChInsight(row, { tour: PREVIEW_TOUR, viewer, engine: { flags: { support: true, cause: true, audit: true }, now: '2026-11-01T00:00:00.000Z', viewer } as never });
    const deep = toChDeepInsight(row, base, { rounds: new Map(), focusAreas: [], goals: [], themes: null }, (s) => s, role);
    return { base, deep, detail: toChReadDetail(row, deep, role, 'Priya', CALLS, {}) };
  };
  const LEAKS = ['driven by', '175+', '16 of 28', '10 of 40', 'look like', 'long irons', 'Long irons', '2.3'];
  const leaks = (json: string) => LEAKS.filter((w) => json.includes(w));

  it('no string on the player’s Read payload carries an arm or the guess', () => {
    const { detail: d, deep } = build('player', told());
    expect(leaks(JSON.stringify(d))).toEqual([]);
    expect(leaks(JSON.stringify(deep))).toEqual([]);
  });

  it('the Board’s card, which never passes the Deep dive, holds neither', () => {
    expect(leaks(JSON.stringify(build('player', told()).base))).toEqual([]);
  });

  it('the measure survives: the lede is the first sentence the player may read', () => {
    const { base, detail } = build('player', told());
    expect(base.lede).toBe('You hit 36% of greens from the fairway.');
    expect(detail.headline.lede).toBe(base.lede);
    expect(base.why).toBeNull();
    expect(base.title).toBeTruthy();
    // Call 2 keeps the observed funnel; the step that is an arm of the guess is not on the player's copy.
    expect(detail.funnel?.steps.map((s) => s.label)).toEqual(['All approaches']);
    // 7 Nov design: what CoachHelm checked is the coach's. A player's copy carries none of it, named or not.
    expect(detail.sure.checked).toEqual([]);
  });

  it('a coach still reads the row whole, and the arms', () => {
    const { base, detail } = build('coach', told());
    expect(base.lede).toContain('driven by long irons');
    expect(base.why).toContain('16 of 28');
    expect(detail.cause?.state).toBe('likely');
  });

  it('a focus area a coach assigns from the read is saved without the guess: the player reads it', () => {
    const { base } = build('coach', told());
    expect(leaks(JSON.stringify(base.assignAs))).toEqual([]);
    expect(base.assignAs.description).toBe('You hit 36% of greens from the fairway.');
  });

  it('a counted cause reaches the player whole', () => {
    const { base, detail } = build('player', told('observed_sequence'));
    expect(base.lede).toContain('driven by long irons');
    expect(detail.cause?.state).toBe('counted');
  });
});

/**
 * The hard rule of the 7 Nov read: a player's read never contains a likely cause, another player's figures or the team pool. The
 * payload is what `loadPlayerRead` hands the client page (`toChReadView`), so it is searched whole: a field added later that carries
 * one of these fails here, whatever it is called.
 */
describe('a player’s read never carries the team pool, a teammate or a coach-only field', () => {
  const POOL = { source: 'team_pool', label: 'Team pool', value: 0.7, n: 186, n_unit: 'rounds', n_noun: 'rounds', players: 9, unit: 'count' };
  const pooled = (): EvidenceInsight => {
    const r = penalties(HELM_PLAYERS.eli.id, 'in-pool');
    return {
      ...r,
      evidence: {
        ...r.evidence,
        comparison: { primary: POOL, lines: [POOL, { source: 'tour', label: 'Tour', value: 0.3 }] },
        ladder: 'likely',
        support: SUPPORT,
        cause: CAUSE,
        diagnosis: { ...r.evidence.diagnosis, basis: { checked: ['length: 16 of 28 approaches', 'Club off the tee'], narrowing: { steps: [{ passed: true, label: 'Off the tee', statement: '17 of 23 penalties came off the tee' }], stopped_at: null } } },
      } as unknown as EvidenceInsight['evidence'],
    };
  };
  const ON = { ...READ_CALLS, teamPool: true };
  const view = (role: 'coach' | 'player') => {
    const row = pooled();
    const viewer = role === 'coach' ? ({ role: 'coach', first: 'Eli' } as const) : ({ role: 'player' } as const);
    const base = toChInsight(row, { tour: PREVIEW_TOUR, viewer, engine: { flags: { support: true, cause: true }, now: '2026-11-01T00:00:00.000Z', viewer } as never });
    const deep = toChDeepInsight(row, base, { rounds: new Map(), focusAreas: [], goals: [], themes: null }, (s) => s, role);
    const dive: ChDeepDive = { list: [deep], tour: 'Tour', rounds: null, themes: {}, roundsFailed: false, plansFailed: false, themesFailed: false, counts: diveCounts([deep]) };
    const head = role === 'coach' ? { playerId: row.player_id, name: 'Eli Brandt', first: 'Eli' } : { playerId: null, name: 'You', first: 'You' };
    return toChReadView(dive, new Map([[row.id, row]]), row.id, role, head, ON);
  };
  /** Keys whose value is the coach's alone, wherever they sit in the payload. */
  const COACH_KEYS = new Set(['arms', 'range', 'rung', 'verdict', 'team']);
  const POOL_WORDS = ['Team pool', 'team pool', 'teammates', 'teammate', '186 rounds'];

  it('the coach’s copy of the same row carries all of it, so the player check means something', () => {
    const v = view('coach');
    const json = JSON.stringify(v);
    expect(v.read?.headline.ladder?.lines.map((l) => l.source)).toEqual(['team_pool', 'tour']);
    expect(v.read?.insight.compare?.team).toBe(0.7);
    expect(v.read?.four.what).toContain('Team pool 0.7 a round (186 rounds)');
    expect(v.read?.cause?.state).toBe('likely');
    expect(v.read?.sure.checked.length).toBeGreaterThan(0);
    expect(v.read?.sure.rung).not.toBeNull();
    expect(POOL_WORDS.filter((w) => json.includes(w)).length).toBeGreaterThan(0);
  });

  it('the player’s copy holds no pool line, pooled figure, teammate count, checked line, rung, arm or verdict', () => {
    const v = view('player');
    const json = JSON.stringify(v);
    expect(POOL_WORDS.filter((w) => json.includes(w))).toEqual([]);
    expect(valuesUnder(v, COACH_KEYS)).toEqual([]);
    expect(v.read?.headline.ladder?.lines.map((l) => l.source)).toEqual(['tour']);
    expect(v.read?.insight.compare?.team ?? null).toBeNull();
    expect(v.read?.four.what).toContain('Tour is 0.3.');
    expect(v.read?.four.what).not.toMatch(/pool/i);
    expect(v.read?.sure.checked).toEqual([]);
    expect(v.read?.sure.rung).toBeNull();
    expect(v.read?.cause?.state).toBe('not_traced');
    expect(json).not.toContain('times as often');
    expect(json).not.toContain('175+');
    expect(v.team).toBeUndefined();
    expect(v.head.playerId).toBeNull();
  });

  it('a row whose only comparison is the pool leaves a player with no ladder, never the pool alone', () => {
    const row = pooled();
    const only: EvidenceInsight = { ...row, evidence: { ...row.evidence, comparison: { primary: POOL, lines: [POOL] } } as unknown as EvidenceInsight['evidence'] };
    const base = toChInsight(only, { tour: PREVIEW_TOUR, viewer: { role: 'player' } });
    const deep = toChDeepInsight(only, base, { rounds: new Map(), focusAreas: [], goals: [], themes: null }, (s) => s, 'player');
    expect(toChReadDetail(only, deep, 'player', 'You', ON, {}).headline.ladder).toBeNull();
  });

  it('every preview read, as the player gets it, passes the same search (the preview runs with the pool call on)', () => {
    for (const q of ['penalties', 'putts', 'approach']) {
      const coach = JSON.stringify(previewReadView(q, 'coach'));
      const player = previewReadView(q, 'player');
      const json = JSON.stringify(player);
      expect(POOL_WORDS.filter((w) => json.includes(w)), q).toEqual([]);
      expect(valuesUnder(player, COACH_KEYS), q).toEqual([]);
      expect(json, q).not.toContain('Long par 4s');
      // No player's name: a player's copy speaks in the second person and names no one on the team.
      for (const name of ['Eli', 'Jonah', 'Priya', 'Theo']) expect(json.includes(name), `${q}: ${name}`).toBe(false);
      if (q !== 'putts') expect(coach).toContain('Team pool');
    }
  });
});

/** A2: the What line is a sentence a coach would say, from the fields the read already carries and no new figure. */
describe('the What line as prose', () => {
  const base = { subject: 'Penalties per round', value: '1.1 a round', sample: '21 rounds', benchmark: 'Compared with Tour 0.3', worth: null };

  it('opens with the generator’s own sentence when it states the figure, then the comparison by name', () => {
    expect(whatProse({ ...base, lede: 'Across all 21 rounds on file Eli is averaging 1.1 penalty strokes per round.' })).toBe('Across all 21 rounds on file Eli is averaging 1.1 penalty strokes per round. Tour is 0.3.');
  });

  it('says the sample only when the sentence did not, and what closing the gap is worth only when the row estimates it', () => {
    const said = whatProse({ lede: 'From 4–6 ft, Jonah is making 58% of downhill putts vs 81% of level putts, a 23-point gap.', subject: 'Make rate', value: '23 pts gap', sample: '75 putts', benchmark: null, worth: 'Closing the gap to the Tour is worth about 0.4 strokes a round.' });
    expect(said).toBe('From 4–6 ft, Jonah is making 58% of downhill putts vs 81% of level putts, a 23-point gap. Over 75 putts. Closing the gap to the Tour is worth about 0.4 strokes a round.');
  });

  it('falls back to the label and the figure when the sentence does not carry the figure, and never doubles a full stop', () => {
    expect(whatProse({ ...base, lede: 'Penalties are costing strokes.' })).toBe('Penalties per round: 1.1 a round over 21 rounds. Tour is 0.3.');
    expect(whatProse({ ...base, lede: '' })).toBe('Penalties per round: 1.1 a round over 21 rounds. Tour is 0.3.');
  });

  it('a comparison in other words is said as written; a coach’s team line keeps its count', () => {
    expect(whatProse({ ...base, lede: '', benchmark: 'Team pool 0.7 a round (186 rounds)' })).toContain('Team pool 0.7 a round (186 rounds).');
    expect(whatProse({ ...base, lede: '', benchmark: 'Compared with your right-to-left make % (same band) 51%' })).toContain('Your right-to-left make % (same band) is 51%.');
  });

  it('each preview read, for each viewer: a sentence, in their voice, with no log punctuation and no confidence word', () => {
    for (const q of ['penalties', 'putts', 'approach']) {
      const coach = previewReadView(q, 'coach').read!.four.what;
      const player = previewReadView(q, 'player').read!.four.what;
      for (const what of [coach, player]) {
        expect(what, q).not.toMatch(/\(\d+ (rounds|putts|approaches)\)/);
        expect(what, q).not.toMatch(/Solid read|Early read|Thin read/);
        expect(what, q).not.toMatch(/\.\./);
      }
      expect(player, q).toMatch(/\byou\b|\byou’re\b|\byour\b/i);
      expect(player, q).not.toMatch(/pool|Eli|Jonah|Priya/);
    }
    expect(previewReadView('penalties', 'coach').read!.four.what).toBe('Across all 21 rounds on file Eli is averaging 1.1 penalty strokes per round. Tour is 0.3.');
    expect(previewReadView('approach', 'player').read!.four.what).toBe('From 175+ yd you’re hitting 43% of greens over 28 approaches. Tour is 52%.');
  });
});

/** B1, B4, B5, B6: what the page reads beside the read is the player's own rounds, for either viewer, and nothing of anyone else. */
describe('the trend, the round notes and the hole scores', () => {
  it('Eli’s penalties, round by round: the last eight and the season agree with the read’s own 23 over 21', () => {
    const d = previewReadView('penalties', 'coach').read!;
    expect(d.trend?.last.values).toEqual([2, 1, 3, 0, 1, 0, 3, 2]);
    expect(d.trend?.last.said).toBe('1.5 a round over the last 8 rounds');
    expect(d.trend?.season?.values.length).toBe(10);
    expect(d.trend?.ref).toEqual({ label: 'Tour', value: 0.3, display: '0.3' });
    expect(d.trend?.lowerBetter).toBe(true);
    expect(d.rounds.list.map((r) => r.note ?? null)).toEqual(['2 penalties', '3 penalties', null, '1 penalty', null, '3 penalties', '1 penalty', '2 penalties']);
    expect(d.cause?.state === 'counted' && d.cause.holes.map((h) => h.toPar)).toEqual(['+1', '+2', '+1', '+1', '+1']);
  });

  it('a metric with no per-round source has no trend and no notes: the registry’s word, not a guess', () => {
    for (const q of ['putts', 'approach']) {
      const d = previewReadView(q, 'coach').read!;
      expect(d.trend, q).toBeNull();
      expect(d.rounds.list.every((r) => !r.note), q).toBe(true);
    }
  });

  it('a stale read counts the rounds played since it was made; a current one counts none', () => {
    expect(previewReadView('penalties', 'coach', false, 'stale').read!.headline.newer).toBe(2);
    expect(previewReadView('penalties', 'coach').read!.headline.newer).toBeNull();
  });

  it('a player gets the same trend from their own rounds, and still no pool, teammate or coach-only field', () => {
    const v = previewReadView('penalties', 'player');
    expect(v.read?.trend?.last.values).toEqual([2, 1, 3, 0, 1, 0, 3, 2]);
    const json = JSON.stringify(v);
    expect(json).not.toMatch(/Team pool|teammate/);
    // The one name on a player's page is their own coach's, for Message Coach Reyes.
    expect(v.coach).toEqual({ name: 'Coach Reyes', userId: 'user-coach-reyes' });
    expect(previewReadView('penalties', 'coach').coach).toBeUndefined();
  });
});
