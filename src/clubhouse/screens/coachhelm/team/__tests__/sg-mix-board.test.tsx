import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard/coachhelm', useSearchParams: () => new URLSearchParams() }));
vi.mock('../../../../lib/use-phone', () => ({ useChPhone: () => false, CH_PHONE_QUERY: '(max-width: 820px), (max-height: 500px) and (pointer: coarse)' }));
vi.mock('@/app/golf/actions/development', () => ({ acceptFocusArea: vi.fn(), createFocusAreaFromInsightV2: vi.fn(), declineFocusArea: vi.fn() }));
vi.mock('@/app/golf/actions/insights-feed', () => ({ dismissInsight: vi.fn(), reactivateInsight: vi.fn() }));
vi.mock('@/app/golf/actions/coachhelm-corrections', () => ({ recordCoachHelmCorrection: vi.fn(async () => ({ ok: true })) }));
vi.mock('@/app/golf/actions/insights-coachhelm', () => ({ refreshTeamAnalysisAsCoach: vi.fn() }));
vi.mock('@/app/golf/actions/coachhelm-course-plan', () => ({ getCoursePlan: vi.fn(), getMyCoursePlan: vi.fn(), listCoursePlanCourses: vi.fn(), listMyCoursePlanCourses: vi.fn() }));

import type { ChSgMix } from '../../../../data/stats-sg-mix';
import type { ChFileSg } from '../../../../data/coachhelm-file-shape';
import type { ChTeamBoardData } from '../../../../data/coachhelm-team-shape';
import { PREVIEW_TEAM_BOARD } from '../../../../preview/fixtures-coachhelm-team';
import { previewPlayerFile } from '../../../../preview/fixtures-coachhelm-player-file';
import { ToastProvider } from '../../../../ui/Toast';
import { SgCard } from '../../file/cards';
import { TeamBoard } from '../TeamBoard';

/**
 * Measured or estimated, on CoachHelm Team and in the Player file (coordinator, 10 Nov 2026): the hole's hero and the file's
 * "Where the strokes go" say how many of their rounds were shot-tracked when some were not, mark the figure when none was, and add
 * nothing when all were.
 */
const Wrap = ({ children }: { children: ReactNode }) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>{children}</ToastProvider>
  </LazyMotion>
);
const board = (sgMix: ChSgMix | null | undefined, estimatedPlayer?: number): ChTeamBoardData => ({
  ...PREVIEW_TEAM_BOARD,
  teamTotal: { ...PREVIEW_TEAM_BOARD.teamTotal, sgMix },
  players: { ...PREVIEW_TEAM_BOARD.players, list: PREVIEW_TEAM_BOARD.players.list.map((p, i) => (i === estimatedPlayer ? { ...p, sgMix: { measured: 0, estimated: Math.min(10, p.rounds), estimatedCounted: true } } : p)) },
});
const hero = () => document.querySelector<HTMLElement>('.feat .hn');

afterEach(cleanup);

describe('the hole’s hero', () => {
  it('every round shot-tracked, or the split unread: two lines under the figure, as before', () => {
    render(<TeamBoard data={board({ measured: 50, estimated: 0, estimatedCounted: true })} initialStation="approach" />, { wrapper: Wrap });
    expect(hero()!.querySelector('[data-ch-sg-mix]')).toBeNull();
    expect(hero()!.querySelector('b small')).toBeNull();
    cleanup();
    render(<TeamBoard data={board(null)} initialStation="approach" />, { wrapper: Wrap });
    expect(hero()!.querySelector('[data-ch-sg-mix]')).toBeNull();
    expect(hero()!.textContent).not.toMatch(/estimate|shot-tracked/i);
  });

  it('mixed: a third line says how many were shot-tracked; the label says it in full', () => {
    render(<TeamBoard data={board({ measured: 44, estimated: 6, estimatedCounted: true })} initialStation="approach" />, { wrapper: Wrap });
    expect(hero()!.querySelector('[data-ch-sg-mix]')?.textContent).toBe('44 of 50 shot-tracked');
    expect(hero()!.querySelector('b small')).toBeNull();
    expect(hero()!.getAttribute('aria-label')).toMatch(/44 of 50 rounds shot-tracked; 6 estimated from the scorecard$/);
  });

  it('all estimated: the figure carries "est." and the line says where it came from', () => {
    render(<TeamBoard data={board({ measured: 0, estimated: 50, estimatedCounted: true })} initialStation="approach" />, { wrapper: Wrap });
    expect(hero()!.querySelector('b small')?.textContent).toBe('est.');
    expect(hero()!.querySelector('[data-ch-sg-mix]')?.textContent).toBe('Estimated from the scorecard');
  });

  it('a player whose own figure is all estimate is marked on their row', () => {
    render(<TeamBoard data={board({ measured: 44, estimated: 6, estimatedCounted: true }, 1)} initialStation="approach" />, { wrapper: Wrap });
    const marked = [...document.querySelectorAll('.m')].filter((m) => /· estimated/.test(m.textContent ?? ''));
    expect(marked).toHaveLength(1);
  });
});

describe('the file’s Where the strokes go', () => {
  const sg = (state: string) => previewPlayerFile(state).cards.sg as ChFileSg;
  const note = () => document.querySelector('.card__n')!.textContent ?? '';
  const meta = () => document.querySelector('[data-ch-anchor="sg"]')!.textContent ?? '';

  it('every round shot-tracked: the note and the head are as before', () => {
    render(<SgCard sg={sg('accepted')} who="Eli" standingHref={null} />, { wrapper: Wrap });
    expect(document.querySelector('[data-ch-sg-mix]')).toBeNull();
    expect(meta()).not.toMatch(/estimate/i);
  });

  it('mixed: the note says how many of the rounds it read were shot-tracked', () => {
    render(<SgCard sg={sg('sgmixed')} who="Eli" standingHref={null} />, { wrapper: Wrap });
    expect(note()).toMatch(/6 of 10 rounds shot-tracked; 4 estimated from the scorecard\./);
    expect(meta()).not.toMatch(/· estimate/);
  });

  it('all estimated: the head marks the figures as an estimate', () => {
    render(<SgCard sg={sg('sgest')} who="Eli" standingHref={null} />, { wrapper: Wrap });
    expect(meta()).toMatch(/Eli vs Tour and team · estimate/);
    expect(note()).toMatch(/Estimated from the scorecard: no round shot-tracked\./);
  });
});
