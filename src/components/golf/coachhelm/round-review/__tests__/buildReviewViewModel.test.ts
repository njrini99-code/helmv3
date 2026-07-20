import { describe, it, expect } from 'vitest';
import {
  formatToPar,
  buildGrade,
  buildMixLine,
  synthesizeHoleNote,
  buildFilmstripHoles,
  buildNarrative,
  buildStrokesLostRows,
  buildFrontBackRows,
  buildPuttingRamp,
  buildMomentumTicker,
  buildDrivingPenaltyLines,
  buildShortGameRows,
  pickPracticePriority,
  formatReviewDate,
  buildCourseDateLine,
  formatHoleDetail,
  sanitizeNaN,
} from '../buildReviewViewModel';
import type { HoleBreakdown, HalfStats, StrokesToGainItem } from '@/app/golf/actions/round-review-system';

function hole(overrides: Partial<HoleBreakdown> = {}): HoleBreakdown {
  return {
    hole: 1,
    par: 4,
    score: 4,
    scoreToPar: 0,
    putts: 2,
    fairwayHit: true,
    gir: true,
    threePutt: false,
    onePutt: false,
    penalties: 0,
    scrambleAttempt: false,
    scrambleSuccess: false,
    sandSaveAttempt: false,
    sandSaveSuccess: false,
    driveClub: null,
    driveDist: null,
    driveMiss: null,
    firstPuttFeet: null,
    approachClub: null,
    approachDist: null,
    approachMiss: null,
    ...overrides,
  };
}

describe('formatToPar', () => {
  it('formats even as E', () => expect(formatToPar(0)).toBe('E'));
  it('formats over par with a leading +', () => expect(formatToPar(13)).toBe('+13'));
  it('formats under par with the native minus sign', () => expect(formatToPar(-2)).toBe('-2'));
});

describe('buildGrade (gradeDotsForDelta wiring)', () => {
  it('career day at -3 or better', () => {
    expect(buildGrade(-3)).toEqual({ score: 5, label: 'Career day' });
  });
  it('solid at even par', () => {
    expect(buildGrade(0)).toEqual({ score: 4, label: 'Sharp' });
  });
  it('rough day at +20', () => {
    expect(buildGrade(20)).toEqual({ score: 0, label: 'Rough day' });
  });
});

describe('buildMixLine', () => {
  it('matches the approved mockup line', () => {
    const line = buildMixLine({
      eagles: [],
      birdies: [3],
      pars: Array.from({ length: 9 }, (_, i) => i + 1),
      bogeys: [2, 5, 6, 7, 8],
      doublePlus: [1, 9, 12],
      holesPlayed: 18,
    });
    expect(line).toBe('1 birdie · 9 pars · 5 bogeys · 3 doubles+');
  });

  it('always renders pars even at zero, and skips zero-count buckets', () => {
    const line = buildMixLine({
      eagles: [],
      birdies: [],
      pars: [],
      bogeys: [],
      doublePlus: [],
      holesPlayed: 0,
    });
    expect(line).toBe('0 pars');
  });

  it('singularizes a single eagle/birdie/bogey/double', () => {
    const line = buildMixLine({
      eagles: [1],
      birdies: [2],
      pars: [3],
      bogeys: [4],
      doublePlus: [5],
      holesPlayed: 5,
    });
    expect(line).toBe('1 eagle · 1 birdie · 1 par · 1 bogey · 1 double+');
  });
});

describe('synthesizeHoleNote', () => {
  it('prioritizes penalties over everything else', () => {
    const h = hole({ penalties: 1, threePutt: true, fairwayHit: false, driveMiss: 'left' });
    expect(synthesizeHoleNote(h)).toBe('1 penalty stroke.');
  });

  it('pluralizes multiple penalty strokes', () => {
    expect(synthesizeHoleNote(hole({ penalties: 2 }))).toBe('2 penalty strokes.');
  });

  it('reports a 3-putt with distance when no penalty', () => {
    expect(synthesizeHoleNote(hole({ threePutt: true, firstPuttFeet: 42.4 }))).toBe(
      '3-putt from 42 ft.',
    );
  });

  it('reports a 3-putt with a fallback when distance is unknown', () => {
    expect(synthesizeHoleNote(hole({ threePutt: true, firstPuttFeet: null }))).toBe(
      '3-putt from range.',
    );
  });

  it('reports a missed fairway with direction when no penalty/3-putt', () => {
    const h = hole({ fairwayHit: false, driveMiss: 'right_rough' });
    expect(synthesizeHoleNote(h)).toBe('Missed fairway right.');
  });

  it('reports a missed green with direction when GIR missed', () => {
    const h = hole({ gir: false, approachMiss: 'short' });
    expect(synthesizeHoleNote(h)).toBe('Missed green short.');
  });

  it('reports a missed up-and-down when GIR missed with a failed scramble', () => {
    const h = hole({ gir: false, scrambleAttempt: true, scrambleSuccess: false });
    expect(synthesizeHoleNote(h)).toBe('Missed green, no up-and-down.');
  });

  it('returns undefined for a clean hole', () => {
    expect(synthesizeHoleNote(hole())).toBeUndefined();
  });
});

describe('buildFilmstripHoles', () => {
  it('maps hole/par/score and synthesizes the note per column', () => {
    const holes = [hole({ hole: 1 }), hole({ hole: 2, penalties: 1 })];
    const columns = buildFilmstripHoles(holes);
    expect(columns).toEqual([
      { n: 1, par: 4, score: 4, note: undefined },
      { n: 2, par: 4, score: 4, note: '1 penalty stroke.' },
    ]);
  });
});

describe('buildNarrative', () => {
  it('prefers the V2 composed-review body when present', () => {
    expect(buildNarrative('v1 summary', 'v2 body')).toBe('v2 body');
  });
  it('falls back to the V1 summary when V2 body is null and there is no persisted body', () => {
    expect(buildNarrative('v1 summary', null)).toBe('v1 summary');
  });
  it('falls back to the V1 summary when V2 body is empty/whitespace and there is no persisted body', () => {
    expect(buildNarrative('v1 summary', '   ')).toBe('v1 summary');
  });

  // FIX (Round Review V2-narrative blocker): a revisit — and the page's own
  // Refresh button — never re-runs useRoundReviewV2's generate(), so v2Body
  // stays null even though the composed body IS already persisted on the
  // stored review (`review.deepInsights[0].body`). The persisted body is the
  // SECOND tier: it must win over the V1 summary whenever there's no fresh
  // v2 generation.
  it('falls back to the persisted composed body when v2Body is null', () => {
    expect(buildNarrative('v1 summary', null, 'persisted composed body')).toBe('persisted composed body');
  });
  it('falls back to the persisted composed body when v2Body is empty/whitespace', () => {
    expect(buildNarrative('v1 summary', '  ', 'persisted composed body')).toBe('persisted composed body');
  });
  it('prefers a fresh v2Body over the persisted composed body', () => {
    expect(buildNarrative('v1 summary', 'fresh v2 body', 'persisted composed body')).toBe('fresh v2 body');
  });
  it('falls back past an empty/whitespace persisted body to the V1 summary', () => {
    expect(buildNarrative('v1 summary', null, '   ')).toBe('v1 summary');
  });
  it('sanitizes stale NaN artifacts in the persisted composed body', () => {
    expect(
      buildNarrative('v1 summary', null, 'Solid round. This occurs in NaN% of rounds with NaN% reliability.'),
    ).toBe('Solid round.');
  });
});

describe('buildStrokesLostRows (strokesToGain single-home)', () => {
  const items: StrokesToGainItem[] = [
    { category: 'Putting', potentialStrokes: 2.5, description: 'x' },
    { category: 'Approach Shots', potentialStrokes: 1.8, description: 'y' },
    { category: 'Course Management', potentialStrokes: 0.9, description: 'z' },
  ];

  it('ranks biggest-first, scales pct to the leader, dims non-leaders', () => {
    const rows = buildStrokesLostRows(items);
    expect(rows).toEqual([
      { label: 'Putting', pct: 100, value: '~2.5', dim: false },
      { label: 'Approach Shots', pct: 72, value: '~1.8', dim: true },
      { label: 'Course Management', pct: 36, value: '~0.9', dim: true },
    ]);
  });

  it('drops zero/negative-opportunity items and caps at 4', () => {
    const rows = buildStrokesLostRows([
      ...items,
      { category: 'Short Game', potentialStrokes: 0.5, description: 'w' },
      { category: 'Nothing', potentialStrokes: 0, description: 'skip' },
    ]);
    expect(rows).toHaveLength(4);
    expect(rows.some((r) => r.label === 'Nothing')).toBe(false);
  });

  it('returns an empty list when there is nothing to gain', () => {
    expect(buildStrokesLostRows([])).toEqual([]);
  });
});

describe('buildFrontBackRows', () => {
  it('maps front/back HalfStats to display rows', () => {
    const front: HalfStats = { score: 40, putts: 16, gir: 5, girTotal: 9, fairways: 4, fairwayTotal: 7 };
    const back: HalfStats = { score: 45, putts: 18, gir: 3, girTotal: 9, fairways: 3, fairwayTotal: 7 };
    expect(buildFrontBackRows({ front, back })).toEqual([
      { label: 'Front 9', score: 40, putts: 16, gir: '5/9', fairways: '4/7' },
      { label: 'Back 9', score: 45, putts: 18, gir: '3/9', fairways: '3/7' },
    ]);
  });

  it('renders an em dash for fairways when the half had no fairway-eligible holes', () => {
    const half: HalfStats = { score: 27, putts: 9, gir: 3, girTotal: 3, fairways: 0, fairwayTotal: 0 };
    const [row] = buildFrontBackRows({ front: half, back: half });
    expect(row!.fairways).toBe('—');
  });
});

describe('buildPuttingRamp', () => {
  it('bands make% at 25/50/75 and carries n= attempts', () => {
    const { cols, cells } = buildPuttingRamp({
      ranges: [
        { label: '0-5 ft', attempts: 4, made: 4, pct: 100 },
        { label: '5-15 ft', attempts: 6, made: 2, pct: 33 },
        { label: '15-25 ft', attempts: 0, made: 0, pct: 0 },
      ],
      avgFirstPuttDist: 10,
      threePuttHoles: [],
      onePuttCount: 4,
      totalPutts: 30,
    });
    expect(cols).toEqual(['0-5 ft', '5-15 ft', '15-25 ft']);
    expect(cells).toEqual([
      { value: '100%', n: '4/4', band: 4 },
      { value: '33%', n: '2/6', band: 2 },
      { value: '—', n: undefined, band: 0 },
    ]);
  });
});

describe('buildMomentumTicker', () => {
  it('scales to the round-worst swing and marks it emphasis', () => {
    const items = buildMomentumTicker([
      { hole: 1, rollingScoreToPar: 1 },
      { hole: 2, rollingScoreToPar: 4 },
      { hole: 3, rollingScoreToPar: 2 },
    ]);
    expect(items).toEqual([
      { label: '1', heightPct: 25, emphasis: false },
      { label: '2', heightPct: 100, emphasis: true },
      { label: '3', heightPct: 50, emphasis: false },
    ]);
  });

  it('returns an empty list for an empty round', () => {
    expect(buildMomentumTicker([])).toEqual([]);
  });
});

describe('buildDrivingPenaltyLines', () => {
  it('omits lines for null/zero facts and includes the rest', () => {
    const lines = buildDrivingPenaltyLines(
      { avgDistance: 265, longestDrive: { distance: 301, hole: 9 }, fairwayPct: 57, missPattern: { left: 3, right: 1, total: 4 } },
      { total: 2, holes: [{ hole: 1, count: 1 }, { hole: 7, count: 1 }], strokesLost: 2 },
    );
    expect(lines).toEqual([
      'Avg drive 265y · 57% fairways.',
      'Longest drive 301y on #9.',
      'Missed 4 fairways, mostly left.',
      '2 penalty strokes on #1, #7.',
    ]);
  });

  it('renders nothing when every fact is absent', () => {
    const lines = buildDrivingPenaltyLines(
      { avgDistance: null, longestDrive: null, fairwayPct: null, missPattern: { left: 0, right: 0, total: 0 } },
      { total: 0, holes: [], strokesLost: 0 },
    );
    expect(lines).toEqual([]);
  });
});

describe('buildShortGameRows', () => {
  it('includes scramble/sand only when attempted', () => {
    expect(
      buildShortGameRows({
        scramblePct: 60,
        scrambleAttempts: 5,
        scrambleSuccesses: 3,
        sandSavePct: null,
        sandAttempts: 0,
        sandSuccesses: 0,
        upAndDownDetails: [],
      }),
    ).toEqual([{ label: 'Scramble', pct: 60, value: '3/5' }]);
  });
});

describe('formatReviewDate', () => {
  it('formats without a timezone shift', () => {
    expect(formatReviewDate('2026-06-06')).toBe('Sat, Jun 6');
  });
  it('returns empty string for missing input', () => {
    expect(formatReviewDate(null)).toBe('');
    expect(formatReviewDate(undefined)).toBe('');
  });
});

describe('buildCourseDateLine', () => {
  it('joins course + date with a middot', () => {
    expect(buildCourseDateLine('Poplar Grove', '2026-06-06')).toBe('Poplar Grove · Sat, Jun 6');
  });
  it('omits the separator when the course name is unknown', () => {
    expect(buildCourseDateLine('', '2026-06-06')).toBe('Sat, Jun 6');
  });
});

describe('formatHoleDetail', () => {
  it('formats the header with an over-par tag and falls back to "Clean hole."', () => {
    const { header, body } = formatHoleDetail({ n: 7, par: 4, score: 7 });
    expect(header).toBe('#7 · Par 4 · 7 (+3)');
    expect(body).toBe('Clean hole.');
  });
  it('formats an even-par header as (E) and surfaces the note', () => {
    const { header, body } = formatHoleDetail({ n: 2, par: 4, score: 4, note: '3-putt from 38 ft.' });
    expect(header).toBe('#2 · Par 4 · 4 (E)');
    expect(body).toBe('3-putt from 38 ft.');
  });
  it('formats an under-par header with the native minus sign', () => {
    const { header } = formatHoleDetail({ n: 12, par: 3, score: 2 });
    expect(header).toBe('#12 · Par 3 · 2 (-1)');
  });
});

describe('sanitizeNaN', () => {
  it('strips the NaN%-reliability sentence and stray NaN tokens', () => {
    expect(sanitizeNaN('Solid round.  This occurs in NaN% of rounds with NaN% reliability. Nice work NaN')).toBe(
      'Solid round. Nice work',
    );
  });
  it('is a no-op on clean text', () => {
    expect(sanitizeNaN('Solid round.')).toBe('Solid round.');
  });
});

describe('pickPracticePriority', () => {
  it('prefers the V2 practice priority', () => {
    expect(pickPracticePriority('work the wedges', { summary: '', primaryTakeaway: '', practicePriority: 'v1', focusAreas: [], tone: 'neutral', confidence: 0.5 })).toBe(
      'work the wedges',
    );
  });
  it('falls back to the V1 coachHelm overlay', () => {
    expect(pickPracticePriority(null, { summary: '', primaryTakeaway: '', practicePriority: 'v1 priority', focusAreas: [], tone: 'neutral', confidence: 0.5 })).toBe(
      'v1 priority',
    );
  });
  it('returns null when neither source has content', () => {
    expect(pickPracticePriority(undefined, undefined)).toBeNull();
  });
});
