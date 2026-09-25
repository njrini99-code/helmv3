// @vitest-environment jsdom
/**
 * Team roots → one player's root map (coach drill). The drill renders the
 * player's Where → What → Why map and the clicked cause's Why pre-opened, in
 * the coach's voice (the player's first name, never "you"/"your"), with one
 * primary action, a secondary "Open signal", and a back to Team roots.
 */
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildTeamRoots } from '@/lib/coachhelm/root-map/build-team-roots';
import { layoutRootMap, type BranchDetail } from '@/lib/coachhelm/root-map/build-root-map';
import type { CoachPlayerDrill } from '@/lib/coachhelm/root-map/coach-player-drill';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('view=team&player=p1&cause=putt'),
}));
vi.mock('@/app/golf/actions/development', () => ({ createFocusAreaFromInsightV2: vi.fn() }));
vi.mock('@/components/fairway/pages/coachhelm/FocusAreaModal', () => ({ FocusAreaModal: () => null }));
vi.mock('framer-motion', async () => {
  const R = await import('react');
  return {
    useReducedMotion: () => true,
    motion: new Proxy({}, { get: (_t, tag) => R.forwardRef<HTMLElement, Record<string, unknown>>((p, ref) => R.createElement(tag as string, { ref, className: p.className as string }, p.children as React.ReactNode)) }),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  };
});

import { TeamRootsView } from '../TeamRootsView';

function detail(id: string, over: Partial<BranchDetail> = {}): BranchDetail {
  return {
    id,
    title: id === 'putt' ? 'Short putts are leaking' : 'Greens from 175+',
    content: 'c',
    metricLabel: id === 'putt' ? '3–5 ft putts made' : 'Greens hit from 175+ yds',
    unit: 'percent',
    yourValue: 48,
    yourDisplay: '48%',
    comparisonValue: 91,
    comparisonLabel: 'Tour',
    secondaryValue: null,
    secondaryLabel: null,
    sampleN: 31,
    windowStart: null,
    windowEnd: null,
    confidence: 0.8,
    tier: 'solid',
    style: 'observed',
    causality: 'observed_sequence',
    symptom: null,
    rootCause: 'Reads the break short on downhill putts.',
    whySentence: null,
    recommendedAction: null,
    confidenceReason: null,
    driver: null,
    sequence: null,
    strokes: 0.6,
    projection: null,
    ...over,
  };
}

const model = layoutRootMap({
  areas: [
    { area: 'tee', sgPerRound: 0.4 },
    { area: 'approach', sgPerRound: -0.8 },
    { area: 'short_game', sgPerRound: -0.1 },
    { area: 'putting', sgPerRound: -1.2 },
  ],
  sized: [
    { id: 'putt', area: 'putting', title: 'Short putts', label: '3–5 ft putts', strokes: 0.6, style: 'observed', tier: 'solid', causality: 'observed_sequence', rootCause: 'Reads the break short', isNew: true },
  ],
  unsized: [{ id: 'far', area: 'approach', title: 'Greens from 175+', label: 'Greens hit from 175+ yd', style: 'likely', tier: 'solid', isNew: false }],
  other: [],
  newCount: 1,
});

const ready: CoachPlayerDrill = {
  status: 'ready',
  playerId: 'p1',
  playerName: 'Ava',
  causeId: 'putt',
  model,
  details: { putt: detail('putt'), far: detail('far', { style: 'likely', causality: 'inferred_hypothesis' }) },
  insights: [
    { id: 'putt', playerId: 'p1', category: 'putting' },
    { id: 'far', playerId: 'p1', category: 'approach' },
  ],
  headline: 'Putting gives back 1.20, 3–5 ft putts is where, seen in shots.',
  roundsRead: 18,
  throughDate: '2026-08-02',
  daysSinceThrough: 5,
  greenView: null,
  approachWhy: {},
};

const team = buildTeamRoots({
  players: [{ id: 'p1', name: 'Ava Stone', roundsPlayed: 18, sgTotal: -1.7, sg: { tee: 0.4, approach: -0.8, short_game: -0.1, putting: -1.2 } }],
  signals: [],
});

function hrefFor(u: { view?: string; player?: string | null; cause?: string | null; signal?: string | null }): string {
  const q = new URLSearchParams();
  q.set('view', u.view ?? 'team');
  if (u.player) q.set('player', u.player);
  if (u.cause) q.set('cause', u.cause);
  if (u.signal) q.set('signal', u.signal);
  return `/golf/dashboard/intelligence?${q.toString()}`;
}

function renderDrill(drill: CoachPlayerDrill, navigate = vi.fn()) {
  render(
    <TeamRootsView
      model={team}
      headline={null}
      trend={[]}
      slopes={[]}
      needsYou={[]}
      signalsFailed={false}
      drill={drill}
      drillOpen
      hrefFor={hrefFor}
      navigate={navigate}
    />,
  );
  return navigate;
}

describe('Team roots player drill', () => {
  it("shows the player's map with the clicked cause's Why open, in the coach's voice", () => {
    renderDrill(ready);
    expect(screen.getByRole('heading', { level: 2, name: 'Ava' })).toBeInTheDocument();
    expect(screen.getByRole('figure', { name: "Ava's root map" })).toBeInTheDocument();
    // the clicked cause's Why is pre-opened
    expect(screen.getByRole('heading', { name: 'Short putts are leaking' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Seen in shots' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /3–5 ft putts made: Ava 48%/ })).toBeInTheDocument();
    // one primary action + secondary open-signal + back
    expect(screen.getByRole('button', { name: 'Propose as a focus for Ava' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open signal' })).toHaveAttribute(
      'href',
      '/golf/dashboard/intelligence?view=signals&signal=putt',
    );
    expect(screen.getByRole('link', { name: 'Team roots' })).toHaveAttribute('href', '/golf/dashboard/intelligence?view=team');
    // never the player's voice
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/\byour\b|\bYou\b/);
    const labels = [...document.querySelectorAll('[aria-label]')].map((el) => el.getAttribute('aria-label') ?? '');
    expect(labels.filter((l) => /\byour?\b/i.test(l))).toEqual([]);
  });

  it('picking another branch swaps the Why in place and keeps ?cause= in step', () => {
    const navigate = renderDrill(ready);
    // The phone ladder's segment is the tap target (the chip list is gone).
    const ladder = document.querySelector('[data-slot="leak-ladder"]') as HTMLElement;
    fireEvent.click(within(ladder).getByRole('button', { name: /Greens hit from 175\+ yd/ }));
    expect(navigate).toHaveBeenCalledWith({ cause: 'far' });
    expect(screen.getByRole('heading', { name: 'Greens from 175+' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'The likely root' })).toBeInTheDocument();
  });

  it("quotes the stored read's richer text as the Why, keeping the inferred label", () => {
    renderDrill({
      ...ready,
      details: {
        ...ready.details,
        putt: detail('putt', {
          style: 'likely',
          causality: 'inferred_hypothesis',
          whySentence: 'Gets it close from 6 ft but misses the comebacker.',
        }),
      },
    } as CoachPlayerDrill);
    expect(screen.getByText('Gets it close from 6 ft but misses the comebacker.').tagName).toBe('BLOCKQUOTE');
    expect(screen.getByText('From the read as Ava sees it.')).toBeInTheDocument();
    expect(screen.getByText('Likely, not yet seen in shot sequences')).toBeInTheDocument();
  });

  it('keeps the drill top in view while the Brief above it settles, until the coach scrolls', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const orig = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = spy;
    try {
      renderDrill(ready);
      expect(spy).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(350);
      expect(spy).toHaveBeenCalledTimes(3);
      window.dispatchEvent(new Event('wheel'));
      vi.advanceTimersByTime(2000);
      expect(spy).toHaveBeenCalledTimes(3);
    } finally {
      HTMLElement.prototype.scrollIntoView = orig;
      vi.useRealTimers();
    }
  });

  it('calls out a last round more than 30 days old', () => {
    renderDrill({ ...ready, throughDate: '2026-07-10', daysSinceThrough: 77 } as CoachPlayerDrill);
    expect(screen.getByText('Last round Jul 10 — 11 weeks ago')).toBeInTheDocument();
  });

  it('keeps a recent last round in the quiet read line', () => {
    renderDrill(ready);
    expect(screen.queryByText(/Last round/)).not.toBeInTheDocument();
    expect(screen.getByText(/through Aug 2/)).toBeInTheDocument();
  });

  it('back to Team roots navigates in place without the player', () => {
    const navigate = renderDrill(ready);
    fireEvent.click(screen.getByRole('link', { name: 'Team roots' }));
    expect(navigate).toHaveBeenCalledWith({ view: 'team', player: null, cause: null });
  });

  it('says the read failed instead of drawing an empty map', () => {
    renderDrill({ status: 'failed', playerId: 'p1', playerName: 'Ava', causeId: 'putt' });
    expect(screen.getByText("Ava's root map did not load")).toBeInTheDocument();
    expect(screen.queryByRole('figure')).not.toBeInTheDocument();
  });

  it('shows the team, not a stale drill, once the URL no longer names the player', () => {
    render(
      <TeamRootsView
        model={team}
        headline={null}
        trend={[]}
        slopes={[]}
        needsYou={[]}
        signalsFailed={false}
        drill={ready}
        drillOpen={false}
        hrefFor={hrefFor}
        navigate={() => {}}
      />,
    );
    expect(screen.getByRole('heading', { level: 2, name: /Team roots/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Ava' })).not.toBeInTheDocument();
  });
});
