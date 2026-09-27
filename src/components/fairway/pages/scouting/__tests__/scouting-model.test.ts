import { describe, expect, it } from 'vitest';

import {
  buildClaim,
  buildVerdict,
  changedSinceSeen,
  evidenceSignature,
  formatCalendarDate,
  formatGap,
  formatAverageToPar,
  isFullRound,
  readLabel,
  readQuality,
  splitClaims,
} from '../scouting-model';
import { makeInsight, makeRound } from './fixtures';
import type { ThemeNode } from '@/lib/coachhelm/v3/themes/types';

describe('isFullRound', () => {
  it('drops partial rounds, including the "18 holes · 37" row', () => {
    expect(isFullRound(makeRound(0, 4))).toBe(true);
    expect(isFullRound(makeRound(1, 2, { holes_played: 9 }))).toBe(false);
    expect(isFullRound(makeRound(2, -35, { total_score: 37 }))).toBe(false);
    expect(isFullRound(makeRound(3, 0, { score_to_par: null }))).toBe(false);
  });
});

describe('buildVerdict', () => {
  it('refuses to call a trend on fewer than 3 full rounds', () => {
    const v = buildVerdict([makeRound(0, 4), makeRound(1, 3, { holes_played: 9 })], []);
    expect(v.sentence).toMatch(/Only 1 full round/);
    expect(v.tone).toBe('neutral');
  });

  it('states the average, the signed trend and the lever in one sentence', () => {
    const rounds = [2, 3, 1, 2, 6, 7, 5, 6].map((tp, i) => makeRound(i, tp));
    const theme = {
      category: 'putting',
      displayLabel: 'Putting',
      state: 'leak',
      themeStrokesPerRound: 1.2,
    } as unknown as ThemeNode;
    const v = buildVerdict(rounds, [theme]);
    expect(v.sentence).toBe(
      'Averaging +4.0 across 8 full rounds, 4.0 a round better over the last 4 than the 4 before. Putting is the biggest lever.',
    );
    expect(v.tone).toBe('good');
  });

  it('ignores the partial round when averaging', () => {
    const rounds = [makeRound(0, -35, { total_score: 37 }), ...[4, 4, 4].map((tp, i) => makeRound(i + 1, tp))];
    expect(buildVerdict(rounds, []).sentence).toMatch(/^Averaging \+4\.0 across 3 full rounds, holding steady\.$/);
  });
});

describe('formatting', () => {
  it('uses a real minus and "E" for even', () => {
    expect(formatAverageToPar(0)).toBe('E');
    expect(formatAverageToPar(-1.26)).toBe('−1.3');
    expect(formatGap(-27.7, 'percent')).toBe('−28 pts');
    expect(formatGap(7, 'feet')).toBe('+7 ft');
  });

  it('formats a calendar date without a timezone shift', () => {
    expect(formatCalendarDate('2026-09-01')).toBe('Sep 1');
  });
});

describe('read quality', () => {
  it('buckets by n, confidence and lifecycle, and never prints a percentage', () => {
    expect(readQuality(makeInsight())).toBe('solid');
    expect(readQuality(makeInsight({ evidence: { sample_n: 21 } }))).toBe('fair');
    expect(readQuality(makeInsight({ evidence: { sample_n: 4 } }))).toBe('thin');
    expect(readQuality(makeInsight({ lifecycle_state: 'tentative' }))).toBe('thin');
    expect(readLabel('thin', 4)).toBe('Early read · n=4');
    expect(readLabel('solid', 99)).not.toMatch(/%/);
  });
});

describe('buildClaim', () => {
  it('names the comparison from its source, not assuming team', () => {
    const c = buildClaim(makeInsight(), [], []);
    expect(c.comparison).toEqual({ name: 'Tour', valueText: '62%' });
    expect(c.visual?.kind).toBe('bar');
    if (c.visual?.kind === 'bar') {
      expect(c.visual.tone).toBe('warn'); // making fewer putts than Tour is worse
      expect(c.visual.gapText).toBe('−28 pts');
    }
    expect(c.sampleText).toBe('55 putts');
    expect(c.windowText).toBe('Jun 27–Sep 13');
  });

  it('reads direction from polarity so a lower-is-better gap is green when below', () => {
    const c = buildClaim(
      makeInsight({
        evidence: {
          metric: 'short_side_proximity',
          unit: 'feet',
          your_value: 8,
          your_value_display: '8 ft',
          comparison_value: 10,
          polarity: 'lower_better',
        },
      }),
      [],
      [],
    );
    expect(c.visual?.kind === 'bar' && c.visual.tone).toBe('good');
  });

  it('draws a before/after pair when the engine recorded movement', () => {
    const c = buildClaim(
      makeInsight({ metadata: { movement: { from: 17.6, to: 14.3, direction: 'down', percent_change: -0.19 } } }),
      [],
      [],
    );
    expect(c.visual?.kind).toBe('pair');
    expect(c.visual?.kind === 'pair' && c.visual.tone).toBe('warn');
    expect(c.movementText).toBe('was 18%');
  });

  it('shows weight only when the strokes impact is real', () => {
    expect(buildClaim(makeInsight({ evidence: { strokes_impact: 0 } }), [], []).weightText).toBeNull();
    expect(buildClaim(makeInsight(), [], []).weightText).toBe('~0.8 strokes/rd vs Tour');
  });

  it('links a claim to the plan and carries the server evidence-changed status', () => {
    const ins = makeInsight();
    const c = buildClaim(ins, [], [
      {
        id: 'fa-1',
        title: 'x',
        status: 'active',
        current_value: null,
        target_value: null,
        baseline_value: null,
        target_metric: null,
        created_at: '2026-09-01T00:00:00Z',
        from_insight_id: ins.id,
        evidence_revision_status: 'changed',
      },
    ]);
    expect(c.planAreaId).toBe('fa-1');
    expect(c.evidenceChangedInPlan).toBe(true);
  });
});

describe('splitClaims', () => {
  it('keeps rank order, caps "what matters" at 3, and routes thin or value-less rows to the watch list', () => {
    const rows = [
      makeInsight({ title: 'A' }),
      makeInsight({ title: 'thin', evidence: { sample_n: 4 } }),
      makeInsight({ title: 'B', evidence: { strokes_impact: 0 } }),
      makeInsight({ title: 'dash', evidence: { your_value_display: '—' } }),
      makeInsight({ title: 'C' }),
      makeInsight({ title: 'D' }),
    ];
    const s = splitClaims(rows, [], []);
    expect(s.matters.map((c) => c.title)).toEqual(['A', 'B', 'C']);
    expect(s.watch.map((c) => c.title)).toEqual(['thin', 'dash']);
    expect(s.alsoNoted.map((c) => c.title)).toEqual(['D']);
  });
});

describe('evidence seen', () => {
  it('flags only insights whose stored signature differs', () => {
    const a = makeInsight();
    const b = makeInsight();
    const seen = { [a.id]: evidenceSignature(a), [b.id]: 'old' };
    expect([...changedSinceSeen([a, b, makeInsight()], seen)]).toEqual([b.id]);
  });
});
