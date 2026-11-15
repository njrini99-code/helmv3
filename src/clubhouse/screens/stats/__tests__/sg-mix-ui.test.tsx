import { cleanup, render, waitFor } from '@testing-library/react';
import { LazyMotion, domAnimation } from 'motion/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn(), hapticScrub: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/golf/dashboard/stats' }));
vi.mock('@/app/golf/actions/development', () => ({ createFocusArea: vi.fn(), acceptFocusArea: vi.fn(), declineFocusArea: vi.fn() }));

import type { ChPlayerProfile } from '../../../data/stats-player';
import type { ChSgMix } from '../../../data/stats-sg-mix';
import { PREVIEW_PLAYER_SUGGESTED, PREVIEW_TEAM_STATS, PREVIEW_TEAM_STATS_SGEST, PREVIEW_TEAM_STATS_SGMIXED } from '../../../preview/fixtures-stats';
import { ToastProvider } from '../../../ui/Toast';
import { StatsPlayer } from '../StatsPlayer';
import { StatsTeam } from '../StatsTeam';

/**
 * Measured or estimated, on Stats (coordinator, 10 Nov 2026): where strokes gained is drawn, the page says how many of the rounds
 * were shot-tracked when some were not, marks the figure itself when none was, and adds nothing when all were.
 */
const shell = (node: ReactNode) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <div className="ch-root" data-ui="clubhouse">
        {node}
      </div>
    </ToastProvider>
  </LazyMotion>
);
const player = (sgMix: ChSgMix | null | undefined): ChPlayerProfile => ({ ...PREVIEW_PLAYER_SUGGESTED, viewer: 'player', sgMix });
const card = (go: string) => document.querySelector<HTMLElement>(`[data-ch="stats-card"][data-go="${go}"]`);
const MIXED: ChSgMix = { measured: 6, estimated: 4, estimatedCounted: true };
const ALL: ChSgMix = { measured: 0, estimated: 10, estimatedCounted: true };

beforeEach(() => {
  window.location.hash = '';
});
afterEach(cleanup);

describe('My stats: the strokes gained card', () => {
  it('every round shot-tracked: the card is as it was, no line and no mark', async () => {
    render(shell(<StatsPlayer data={player({ measured: 10, estimated: 0, estimatedCounted: true })} coachId={null} />));
    const sg = await waitFor(() => {
      const c = card('sg');
      if (!c) throw new Error('no strokes gained card yet');
      return c;
    });
    expect(sg.querySelector('[data-ch-sg-mix]')).toBeNull();
    expect(sg.querySelector('.ch-shs-bigv small')).toBeNull();
    expect(sg.textContent).not.toMatch(/estimate/i);
  });

  it('the split unread (a failed read, or data built without it): nothing is claimed', async () => {
    render(shell(<StatsPlayer data={player(null)} coachId={null} />));
    const sg = await waitFor(() => {
      const c = card('sg');
      if (!c) throw new Error('no strokes gained card yet');
      return c;
    });
    expect(sg.querySelector('[data-ch-sg-mix]')).toBeNull();
    expect(sg.textContent).not.toMatch(/estimate|shot-tracked/i);
  });

  it('mixed: one line under the figure says how many, and the figure is not marked', async () => {
    render(shell(<StatsPlayer data={player(MIXED)} coachId={null} />));
    const sg = await waitFor(() => {
      const c = card('sg');
      if (!c) throw new Error('no strokes gained card yet');
      return c;
    });
    expect(sg.querySelector('[data-ch-sg-mix]')?.textContent).toBe('6 of 10 rounds shot-tracked; 4 estimated from the scorecard');
    expect(sg.querySelector('.ch-shs-bigv small')).toBeNull();
  });

  it('all estimated: the figure carries "est.", the line says why, and a screen reader hears it', async () => {
    render(shell(<StatsPlayer data={player(ALL)} coachId={null} />));
    const sg = await waitFor(() => {
      const c = card('sg');
      if (!c) throw new Error('no strokes gained card yet');
      return c;
    });
    expect(sg.querySelector('.ch-shs-bigv small')?.textContent).toBe('est.');
    expect(sg.querySelector('[data-ch-sg-mix]')?.textContent).toBe('Estimated from the scorecard: no round shot-tracked');
    expect(sg.querySelector('[aria-label*="an estimate"]')).not.toBeNull();
  });
});

describe('Team stats: the team card and the player rows', () => {
  it('as drawn today (every round shot-tracked): nothing is added', async () => {
    render(shell(<StatsTeam data={PREVIEW_TEAM_STATS} />));
    const game = await waitFor(() => {
      const c = card('tgame');
      if (!c) throw new Error('no team strokes gained card yet');
      return c;
    });
    expect(game.querySelector('[data-ch-sg-mix]')).toBeNull();
    expect(document.body.textContent).not.toMatch(/ est\.|estimated from the scorecard/i);
  });

  it('mixed: the team card says how many of its rounds were shot-tracked', async () => {
    render(shell(<StatsTeam data={PREVIEW_TEAM_STATS_SGMIXED} />));
    const game = await waitFor(() => {
      const c = card('tgame');
      if (!c) throw new Error('no team strokes gained card yet');
      return c;
    });
    expect(game.querySelector('[data-ch-sg-mix]')?.textContent).toBe('44 of 50 rounds shot-tracked; 6 estimated from the scorecard');
    expect(game.querySelector('.ch-shs-bigv small')).toBeNull();
  });

  it('all estimated: the team figure is marked as an estimate', async () => {
    render(shell(<StatsTeam data={PREVIEW_TEAM_STATS_SGEST} />));
    const game = await waitFor(() => {
      const c = card('tgame');
      if (!c) throw new Error('no team strokes gained card yet');
      return c;
    });
    expect(game.querySelector('.ch-shs-bigv small')?.textContent).toBe('est.');
    expect(game.querySelector('[data-ch-sg-mix]')?.textContent).toBe('Estimated from the scorecard: no round shot-tracked');
  });
});
