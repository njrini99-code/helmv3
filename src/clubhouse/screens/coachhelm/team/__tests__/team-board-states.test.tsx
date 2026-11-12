import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../../__tests__/dialog-polyfill';

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

import type { ChTeamBoardData } from '../../../../data/coachhelm-team-shape';
import { PREVIEW_TEAM_BOARD } from '../../../../preview/fixtures-coachhelm-team';
import { ToastProvider } from '../../../../ui/Toast';
import { SpotCard } from '../SpotCard';
import { TeamBoard } from '../TeamBoard';
import { PreviewCoachHelmTeam } from '../../../../preview/PreviewCoachHelmTeam';

/** W-TEAM-6, W-TEAM-14, W-TEAM-15: the spot's pattern line, the addresses that open a sheet, and a part that is off or failed. */

const BOARD = '/golf/dashboard/coachhelm';
const GONE = 'This read isn’t on the board anymore';
const ui = (props: Partial<Parameters<typeof TeamBoard>[0]> & { data?: ChTeamBoardData } = {}) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <TeamBoard data={PREVIEW_TEAM_BOARD} {...props} />
    </ToastProvider>
  </LazyMotion>
);

beforeEach(() => {
  window.history.replaceState(null, '', BOARD);
  // Reduce Motion skips the ball's flight, which measures an SVG path jsdom can't.
  vi.mocked(window.matchMedia).mockImplementation(
    (query: string) =>
      ({ matches: query.includes('prefers-reduced-motion'), media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }) as unknown as MediaQueryList,
  );
});
afterEach(() => cleanup());

describe('the spot pattern line (W-TEAM-6)', () => {
  const spot = (over: Partial<ChTeamBoardData>) =>
    render(
      <LazyMotion features={domAnimation}>
        <SpotCard data={{ ...PREVIEW_TEAM_BOARD, patterns: [], ...over } as ChTeamBoardData} station="approach" onRead={() => {}} onPlayer={() => {}} />
      </LazyMotion>,
    );
  const NONE = /No shared pattern here yet/;

  it('with no retry passed in, a failed board refreshes itself: the live route has no function to give it (FID-TEAM-1)', () => {
    render(ui({ data: { ...PREVIEW_TEAM_BOARD, players: { list: [], error: true } } }));
    screen.getByRole('button', { name: 'Try again' }).click();
    expect(router.refresh).toHaveBeenCalledOnce();
  });

  it('a failed read says it did not load, never that there is no pattern', () => {
    spot({ patternsStatus: 'failed' });
    expect(screen.getByText('Couldn’t load this part.')).toBeTruthy();
    expect(screen.queryByText(NONE)).toBeNull();
  });

  it('off draws nothing at all', () => {
    spot({ patternsStatus: 'off' });
    expect(screen.queryByText(NONE)).toBeNull();
    expect(screen.queryByText('Couldn’t load this part.')).toBeNull();
  });

  it('on with no row gives the needs-three line', () => {
    spot({ patternsStatus: 'ok' });
    expect(screen.getByText(NONE)).toBeTruthy();
  });
});

describe('addresses that open a sheet (W-TEAM-14)', () => {
  it('an insight not on the board opens the gone card, once, and the address is cleaned', async () => {
    window.history.replaceState(null, '', `${BOARD}?open=read&insight=nope`);
    const replace = vi.spyOn(window.history, 'replaceState');
    render(ui({ initialInsight: 'nope' }));
    expect(await screen.findByText(GONE)).toBeTruthy();
    expect(replace).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe('');
    replace.mockRestore();
  });

  it('a player not on the board leaves the plain board, with the address cleaned', async () => {
    window.history.replaceState(null, '', `${BOARD}?player=nope`);
    render(ui({ initialPlayer: 'nope' }));
    await waitFor(() => expect(window.location.search).toBe(''));
    expect(screen.queryByText(GONE)).toBeNull();
    expect(screen.queryByRole('link', { name: /’s page/ })).toBeNull();
  });

  it('a player on the board opens their sheet', async () => {
    const p = PREVIEW_TEAM_BOARD.players.list[0]!;
    window.history.replaceState(null, '', `${BOARD}?player=${p.id}`);
    render(ui({ initialPlayer: p.id }));
    expect(await screen.findByRole('link', { name: new RegExp(`Open ${p.first}’s page`) })).toBeTruthy();
  });

  it('the sheet is a peek: one line and the way into the file, with no bars or reads of its own', async () => {
    const p = PREVIEW_TEAM_BOARD.players.list.find((x) => x.rounds > 0)!;
    window.history.replaceState(null, '', `${BOARD}?player=${p.id}`);
    render(ui({ initialPlayer: p.id }));
    const open = await screen.findByRole('link', { name: new RegExp(`Open ${p.first}’s page`) });
    expect(open.getAttribute('href')).toContain(p.id);
    expect(screen.queryByText(`Where ${p.first} gains and loses`)).toBeNull();
    expect(screen.getByText(new RegExp(`${p.rounds} rounds? · .* a round to Tour`))).toBeTruthy();
  });
});

describe('a part off or failed (W-TEAM-15)', () => {
  it('off: the record card is absent, not empty', () => {
    render(ui({ data: { ...PREVIEW_TEAM_BOARD, record: undefined } as ChTeamBoardData }));
    expect(document.querySelector('[data-ch-team-card="work"]')).not.toBeNull();
    expect(screen.queryByText('Track record unavailable right now')).toBeNull();
  });

  it('failed: the record says so with no number, and the rest of the board draws', () => {
    render(ui({ data: { ...PREVIEW_TEAM_BOARD, record: { status: 'failed' } } as ChTeamBoardData }));
    expect(screen.getByText('Track record unavailable right now')).toBeTruthy();
    expect(document.querySelector('[data-ch-team-card="work"]')).not.toBeNull();
  });

  it('a failed brief says Working on did not load, and Try again calls back', async () => {
    const onRetry = vi.fn();
    render(ui({ data: { ...PREVIEW_TEAM_BOARD, brief: { status: 'failed' } } as ChTeamBoardData, onRetry }));
    const card = document.querySelector('[data-ch-team-card="work"]') as HTMLElement;
    expect(card.textContent).toContain('Couldn’t load this part');
    card.querySelector('button')?.click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('the board’s counts and windows say only what they are (one number, one source)', () => {
  it('rounds from last season still draw the hole, under words that never call them this season', () => {
    // 1 August: every counted round in the rolling year is from before the season, so the season's count is none.
    render(ui({ data: { ...PREVIEW_TEAM_BOARD, teamTotal: { ...PREVIEW_TEAM_BOARD.teamTotal, rounds: 40, seasonRounds: 0 }, course: { ...PREVIEW_TEAM_BOARD.course, history: null } } }));
    const text = document.body.textContent ?? '';
    // The head's words for this count are `boardRoundsWords` (one-team-figure.test.ts): "no rounds yet this season".
    expect(text).not.toMatch(/\d+ rounds this season/);
    // The hole is drawn (it reads each player's last ten, across seasons) and says that window.
    expect(text).toContain('Each player’s last 10');
    expect(document.querySelector('[data-ch-team-card="hole"]')).not.toBeNull();
  });

  it('Team against Tour says all time: it reads standing rows, not the season’s rounds', () => {
    render(ui({ initialStation: 'course' }));
    const text = document.body.textContent ?? '';
    expect(text).toContain('Team against Tour · all time');
    expect(text).not.toContain('Team against Tour · this season');
  });
});

describe('the preview’s crowded board, staging’s shape on the owner’s walk (W9 to W11, 11 Nov)', () => {
  it('folds Putting’s extra coins into "+3", draws one picture in three This week rows at their end, and one row for a shared focus', () => {
    render(
      <LazyMotion features={domAnimation}>
        <ToastProvider>
          <PreviewCoachHelmTeam state="crowded" />
        </ToastProvider>
      </LazyMotion>,
    );
    expect([...document.querySelectorAll('.scn.is-more')].map((g) => g.textContent)).toEqual(['+3']);
    const tiles = [...document.querySelectorAll<HTMLElement>('[data-ch-team-card="today"] .tile')];
    expect(tiles).toHaveLength(3);
    expect(tiles.map((t) => !!t.querySelector('.tv'))).toEqual([false, true, false]);
    for (const t of tiles) expect(t.firstElementChild?.classList.contains('tt')).toBe(true);
    const work = document.querySelector('[data-ch-team-card="work"]') as HTMLElement;
    // Ten focus areas and the fixture's one proposal, which has no target yet and so no ring.
    expect(work.querySelector('.meta')!.textContent).toBe('11 focus areas');
    expect(work.querySelectorAll('.wk.is-shared')).toHaveLength(1);
    expect(work.querySelectorAll('.ringc')).toHaveLength(2);
    // The stored "Eli: …" titles read without the name beside Eli's coin.
    expect(document.body.textContent).not.toMatch(/(\w+): \1: /);
  });
});
