// @vitest-environment jsdom
/**
 * LeakList (redesign 2026-09-25, replaces the RootMap ribbon / ladder):
 * every losing area is a row, largest first; every spot is named with a
 * signed per-round value and is a button; the part no spot explains is its
 * own row, labelled for how the spots were read; nothing folds away or hides
 * behind a hover; one footnote carries the benchmark and the source.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildRootMap } from '@/lib/coachhelm/root-map/build-player-root-map';
import type { MeasuredArea } from '@/lib/coachhelm/root-map/measured-what';
import type { CauseBranch, RootMapModel } from '@/lib/coachhelm/root-map/build-root-map';
import { teamAreaTrend, type TeamTrendWeek } from '@/lib/coachhelm/root-map/area-trends';
import {
  AreaBreakdown,
  SpotList,
  TrendText,
  breakdownFootnote,
  carriersText,
  formatPerRound,
  rankedSpots,
  sampleText,
} from '../LeakList';
import { RootSummary } from '../RootSummary';

const approachMeasured: MeasuredArea = {
  area: 'approach',
  mode: 'measured',
  rounds: 12,
  stored: -2.0,
  recomputed: -1.9,
  scale: 1,
  reason: null,
  keys: [
    { key: '125_175', sg: -1.2, n: 90, rounds: 12 },
    { key: '175_plus', sg: -0.6, n: 80, rounds: 12 },
    { key: 'penalty', sg: -0.1, n: 10, rounds: 6 },
  ],
};

const model = buildRootMap({
  areas: [
    { area: 'tee', sgPerRound: 0.2 },
    { area: 'approach', sgPerRound: -2.0 },
    { area: 'short_game', sgPerRound: null },
    { area: 'putting', sgPerRound: -0.3 },
  ],
  insights: [],
  measured: { approach: approachMeasured },
});

const many = buildRootMap({
  areas: [{ area: 'putting', sgPerRound: -2.4 }],
  insights: [],
  measured: {
    putting: {
      area: 'putting',
      mode: 'measured',
      rounds: 12,
      stored: -2.4,
      recomputed: -2.4,
      scale: 1,
      reason: null,
      keys: [
        { key: '0_3', sg: -0.2, n: 40, rounds: 12 },
        { key: '3_5', sg: -0.25, n: 40, rounds: 12 },
        { key: '5_10', sg: -0.6, n: 40, rounds: 12 },
        { key: '10_15', sg: -0.5, n: 40, rounds: 12 },
        { key: '15_25', sg: -0.45, n: 40, rounds: 12 },
        { key: '25_plus', sg: -0.4, n: 40, rounds: 12 },
      ],
    },
  },
});

describe('formatPerRound', () => {
  it('prints one decimal, signed on request, and never a bare 0.0', () => {
    expect(formatPerRound(-2.34, { signed: true })).toBe('−2.3');
    expect(formatPerRound(0.73, { signed: true })).toBe('+0.7');
    expect(formatPerRound(1.2)).toBe('1.2');
    expect(formatPerRound(-0.04, { signed: true })).toBe('under 0.1');
  });
});

describe('carriersText', () => {
  const c = (name: string, strokes: number | null) => ({ playerId: name, name, strokes });
  it('names the top two by first name and counts the rest from `players`', () => {
    expect(carriersText([c('Mia Park', 0.8), c('Jake Lee', 0.5), c('Ava Cho', 0.2), c('Sam Roy', 0.1)], 4)).toBe('Mia, Jake +2');
    expect(carriersText([c('Mia Park', 0.8)], 1)).toBe('Mia');
    // a shared first name would be ambiguous: full names instead
    expect(carriersText([c('Jake Lee', 0.8), c('Jake Ruiz', 0.5), c('Ava Cho', 0.2)], 3)).toBe('Jake Lee, Jake Ruiz +1');
  });
  it('falls back to a count when no names are known', () => {
    expect(carriersText(undefined, 3)).toBe('3 players');
    expect(carriersText(undefined, 0)).toBeNull();
  });
});

describe('AreaBreakdown', () => {
  it('lists every losing area largest first, then the gaining areas', () => {
    render(<AreaBreakdown model={model} audience="player" />);
    const rows = [...document.querySelectorAll('[data-slot="area-row"]')].map((r) => r.getAttribute('data-area'));
    expect(rows).toEqual(['approach', 'putting']);
    const gains = document.querySelector('[data-slot="area-gains"]') as HTMLElement;
    expect(within(gains).getByText('Off the tee')).toBeInTheDocument();
    expect(within(gains).getByText('+0.2')).toBeInTheDocument();
  });

  it('names every spot with a signed value and its sample, each a button', () => {
    const onSelect = vi.fn();
    render(<AreaBreakdown model={model} audience="player" onSelect={onSelect} />);
    const approach = document.querySelector('[data-area="approach"]') as HTMLElement;
    const spots = approach.querySelectorAll('[data-slot="leak-spot"]');
    expect(spots).toHaveLength(3);
    const first = within(approach).getByRole('button', { name: /125–175 yd.*−1\.2 strokes a round vs Tour average.*90 shots · 12 rounds/ });
    fireEvent.click(first);
    expect(onSelect).toHaveBeenCalledWith('measured:approach:125_175');
  });

  it('labels the rest for how the spots were read: "Not tracked by shot" vs "Not explained yet"', () => {
    render(<AreaBreakdown model={model} audience="player" />);
    const approachRest = document.querySelector('[data-area="approach"] [data-slot="area-remainder"]') as HTMLElement;
    expect(approachRest.textContent).toBe('Not tracked by shot−0.1');
    const puttingRest = document.querySelector('[data-area="putting"] [data-slot="area-remainder"]') as HTMLElement;
    expect(puttingRest.textContent).toBe('Not explained yet−0.3');
  });

  it('shows every spot: nothing folds behind "+N more" or a hover', () => {
    render(<AreaBreakdown model={many} audience="player" />);
    const names = [...document.querySelectorAll('[data-slot="leak-spot"]')].map(
      (el) => el.querySelector('.font-medium')?.textContent,
    );
    expect(names).toEqual(['5–10 ft putts', '10–15 ft putts', '15–25 ft putts', '25+ ft putts', '3–5 ft putts', '0–3 ft putts']);
  });

  it('says why when the spots add to more than the area total', () => {
    const scaled: RootMapModel = {
      ...model,
      losses: model.losses.map((a) => (a.area === 'approach' ? { ...a, scaledToFit: true, remainder: null } : a)),
    };
    render(<AreaBreakdown model={scaled} audience="player" />);
    expect(document.querySelector('[data-area="approach"] [data-slot="area-overlap"]')?.textContent).toMatch(
      /add to more than the 2\.0 total/,
    );
  });

  it('prints an area trend only when one is handed in', () => {
    render(
      <AreaBreakdown
        model={model}
        audience="player"
        trends={{ approach: { direction: 'improving', delta: 0.42, window: 'the last 5 rounds vs the 5 before' } }}
      />,
    );
    const trend = document.querySelector('[data-area="approach"] [data-slot="area-trend"]') as HTMLElement;
    expect(trend.textContent).toMatch(/▲ 0\.4 better/);
    expect(document.querySelector('[data-area="putting"] [data-slot="area-trend"]')).toBeNull();
  });
});

describe('SpotList', () => {
  const withCarriers = (c: CauseBranch): CauseBranch => ({
    ...c,
    players: 3,
    carriers: [
      { playerId: 'p1', name: 'Mia Park', strokes: 0.9 },
      { playerId: 'p2', name: 'Jake Lee', strokes: 0.4 },
      { playerId: 'p3', name: 'Ava Cho', strokes: 0.1 },
    ],
  });

  it('coach rows name who carries the spot; player rows never do', () => {
    const spots = rankedSpots(model).slice(0, 1).map(withCarriers);
    const { unmount } = render(<SpotList spots={spots} audience="coach" />);
    expect(screen.getByText(/Mia, Jake \+1/)).toBeInTheDocument();
    unmount();
    render(<SpotList spots={spots} audience="player" />);
    expect(screen.queryByText(/Mia/)).toBeNull();
    expect(screen.getByText('Approach · 90 shots · 12 rounds')).toBeInTheDocument();
  });
});

describe('sampleText + footnote', () => {
  it('reads putting samples as putts and says where each area comes from', () => {
    const spot = rankedSpots(many)[0]!;
    expect(sampleText(spot)).toBe('40 putts · 12 rounds');
    expect(breakdownFootnote(model, 'player')).toBe(
      'Strokes a round vs Tour average. Spots come from your recorded shots. Putting spots come from stored reads, not shots.',
    );
  });
});

describe('teamAreaTrend', () => {
  const week = (i: number, approach: number | null, players = 3): TeamTrendWeek => ({
    weekStart: `2026-08-${String(3 + i * 7).padStart(2, '0')}`,
    values: { tee: null, approach, short_game: null, putting: null },
    players,
    rounds: players,
    firstRound: '',
    lastRound: '',
  });

  it('compares the last 4 counted weeks with the 4 before', () => {
    const weeks = [week(0, -2), week(1, -2), week(2, -2), week(3, -2), week(4, -1.5), week(5, -1.5), week(6, -1.5), week(7, -1.5)];
    const t = teamAreaTrend(weeks, 'approach');
    expect(t?.direction).toBe('improving');
    expect(t?.delta).toBeCloseTo(0.5);
    expect(t?.window).toBe('the last 4 weeks vs the 4 before');
  });

  it('prints nothing when either window is thin or the weeks are one player', () => {
    expect(teamAreaTrend([week(0, -2), week(1, -1)], 'approach')).toBeNull();
    const solo = [0, 1, 2, 3, 4, 5].map((i) => week(i, -1, 1));
    expect(teamAreaTrend(solo, 'approach')).toBeNull();
  });

  it('calls a small change steady, never "no change" without data', () => {
    const weeks = [week(0, -1), week(1, -1), week(2, -1.05), week(3, -1.05), week(4, -1.05), week(5, -1.05)];
    expect(teamAreaTrend(weeks, 'approach')?.direction).toBe('steady');
    render(<TrendText note={teamAreaTrend(weeks, 'approach')} />);
    expect(screen.getByText('Steady')).toBeInTheDocument();
  });
});

describe('RootSummary headline card', () => {
  it('player: names the biggest leak, its size and sample, and the strength', () => {
    render(<RootSummary model={model} />);
    expect(document.querySelector('[data-slot="summary-title"]')?.textContent).toBe('Your biggest leak: 125–175 yd (approach).');
    expect(document.querySelector('[data-slot="summary-sub"]')?.textContent).toBe(
      '1.2 strokes a round vs Tour average, from 90 shots · 12 rounds.',
    );
    expect(document.querySelector('[data-slot="summary-strength"]')?.textContent).toMatch(/Your strength: Off the tee \+0\.2 a round/);
  });

  it('coach on one player: third person, never "you"', () => {
    render(<RootSummary model={model} audience="coach" subjectName="Mia Park" />);
    expect(document.querySelector('[data-slot="summary-title"]')?.textContent).toBe('Mia’s biggest leak: 125–175 yd (approach).');
    expect(document.querySelector('[data-slot="summary-strength"]')?.textContent).toMatch(/Mia’s strength/);
    expect(document.body.textContent).not.toMatch(/\byou(r)?\b/i);
  });

  it('coach on the team: the worst area, the biggest spot and who carries it', () => {
    const team: RootMapModel = {
      ...model,
      losses: model.losses.map((a) => ({
        ...a,
        causes: a.causes.map((c) => ({ ...c, players: 2, carriers: [{ playerId: 'p1', name: 'Mia Park', strokes: 1.5 }, { playerId: 'p2', name: 'Jake Lee', strokes: 0.9 }] })),
      })),
    };
    render(<RootSummary model={team} audience="coach" />);
    expect(document.querySelector('[data-slot="summary-title"]')?.textContent).toBe(
      'Approach is the team’s biggest leak: 2.0 strokes a round vs Tour average.',
    );
    expect(document.querySelector('[data-slot="summary-sub"]')?.textContent).toBe('Biggest single spot: 125–175 yd, 1.2 a round · Mia, Jake.');
    expect(document.querySelector('[data-slot="summary-strength"]')?.textContent).toMatch(/Team strength: Off the tee \+0\.2/);
  });
});
