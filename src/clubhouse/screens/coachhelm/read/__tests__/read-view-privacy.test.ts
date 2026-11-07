import { describe, expect, it } from 'vitest';
import { readHref } from '../../../../data/coachhelm-views-shape';
import { assignStateOf, readCauseOf, toChReadDetail, toChReadView, type ChReadDetail } from '../../../../data/coachhelm-read-view-shape';
import { rangeWords } from '../../../../data/coachhelm-engine-shape';
import { diveCounts, toChDeepInsight, type ChDeepDive } from '../../../../data/coachhelm-dive-shape';
import { toChInsight } from '../../../../data/coachhelm-map';
import { READ_CALLS } from '../../../../data/coachhelm-read-calls';
import type { ChInsight } from '../../../../data/coachhelm-shape';
import { HELM_PLAYERS, PREVIEW_TOUR, slope } from '../../../../preview/fixtures-coachhelm';
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
    expect(detail.sure.checked).toEqual(['Length of the approach']);
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
