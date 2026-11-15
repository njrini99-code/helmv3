import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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

import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { AssembledThemes } from '@/lib/coachhelm/v3/themes/types';
import { closesFor } from '../../../../data/coachhelm-dive-shape';
import type { ChInsight } from '../../../../data/coachhelm-shape';
import { worthByRead, worthWords, type ChTeamBoardData, type ChTeamPlayer } from '../../../../data/coachhelm-team-shape';
import { PREVIEW_TEAM_BOARD } from '../../../../preview/fixtures-coachhelm-team';
import { ToastProvider } from '../../../../ui/Toast';
import { useFocusActions } from '../../parts';
import type { ChCoachHelmWrites } from '../../writes';
import { ReadPanel } from '../panels';
import { ReadRow, ReadWorthContext } from '../parts';
import { TeamBoard } from '../TeamBoard';

/**
 * One read, one worth (owner rule: one number, one source; coordinator, 10 Nov 2026). The Team board printed the engine's own
 * `strokes_impact` ("stakes") while the Player file and the Read page printed the cascade's figure, so one read could show two
 * numbers. All three now read `closesFor`. These tests fail if the board goes back to `stakes`, or any of the three stops calling it.
 */
const src = (file: string) => readFileSync(join(process.cwd(), 'src/clubhouse', file), 'utf8');

/** A cascade cause for read `i1`: worth 0.44 a round, anchored on the team (player, team and Tour values all known). */
const THEMES = { themes: [{ category: 'approach', causes: [{ insight_id: 'i1', counterfactualSuppressed: false, strokesSavedPerRound: 0.44, standingTeamAvgValue: 0.7, standingPlayerValue: 1.1, standingPgaValue: 0.3 }] }] } as unknown as AssembledThemes;
const RAW = { id: 'i1' } as EvidenceInsight;

const PLAYER = PREVIEW_TEAM_BOARD.players.list[0] as ChTeamPlayer;
// The engine's own figure is deliberately different (0.9), so a screen that prints it is caught.
const READ = { ...(PLAYER.reads.needs[0] as ChInsight), id: 'i1', stakes: '0.9' } as ChInsight;
const writes: ChCoachHelmWrites = { assign: vi.fn(async () => ({ success: true })), dismiss: vi.fn(async () => ({ success: true })), undo: vi.fn(async () => ({ success: true })) };
const Wrap = ({ children }: { children: ReactNode }) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>{children}</ToastProvider>
  </LazyMotion>
);
function Sheet() {
  const fa = useFocusActions(writes);
  return <ReadPanel read={READ} player={PLAYER} fa={fa} roster={[{ id: PLAYER.id }]} onClose={() => {}} />;
}

afterEach(cleanup);

describe('a read’s worth is one figure on the Team board, in the Player file and on the Read page', () => {
  const worth = closesFor(RAW, THEMES)!;

  it('the board’s figure is the cascade’s, by the function the file and the Read page use', () => {
    expect(worth).toEqual({ strokes: '0.4', anchor: 'team' });
    expect(worthByRead(['i1', 'other'], THEMES)).toEqual({ i1: worth });
    expect(worthWords(worth)).toBe('Worth 0.4 a round, to the team');
  });

  it('the row and the sheet print it, and never the engine’s own figure', () => {
    render(
      <ReadWorthContext.Provider value={{ byRead: worthByRead(['i1'], THEMES), pending: false }}>
        <ReadRow player={PLAYER} read={READ} onOpen={() => {}} />
        <Sheet />
      </ReadWorthContext.Provider>,
      { wrapper: Wrap },
    );
    expect(screen.getByText('0.4 a round')).toBeTruthy();
    expect(screen.getByText('Worth 0.4 a round, to the team')).toBeTruthy();
    expect(document.body.textContent).not.toContain('0.9 a round');
  });

  it('a read with no cascade figure prints no worth at all', () => {
    render(
      <ReadWorthContext.Provider value={{ byRead: {}, pending: false }}>
        <ReadRow player={PLAYER} read={READ} onOpen={() => {}} />
        <Sheet />
      </ReadWorthContext.Provider>,
      { wrapper: Wrap },
    );
    expect(document.body.textContent).not.toMatch(/a round, to|\d a round/);
    expect(document.querySelector('.ev__hold')).toBeNull();
  });

  it('while the figure is on its way its place is held, unseen and unspoken, and it lands in that place', async () => {
    let land: (v: NonNullable<ChTeamBoardData['worth']> extends Promise<infer P> | infer _Q ? P : never) => void = () => {};
    const pending = new Promise<{ status: 'ok'; value: Record<string, { strokes: string; anchor: 'team' | 'tour' }> }>((r) => {
      land = r as never;
    });
    const first = PREVIEW_TEAM_BOARD.players.list.flatMap((p) => p.reads.needs).find((r) => r.area === 'approach')!;
    render(<TeamBoard data={{ ...PREVIEW_TEAM_BOARD, worth: pending }} initialStation="approach" />, { wrapper: Wrap });
    const holds = document.querySelectorAll('.rd .ev__hold');
    expect(holds.length).toBeGreaterThan(0);
    for (const h of holds) expect(h.getAttribute('aria-hidden')).toBe('true');
    land({ status: 'ok', value: { [first.id]: { strokes: '0.4', anchor: 'tour' } } });
    await waitFor(() => expect(document.querySelector('.rd .ev__hold')).toBeNull());
    expect(screen.getByText('0.4 a round')).toBeTruthy();
  });

  it('every screen takes it from the one function', () => {
    // The Read page and the Player file: the deep read's `closes`, which is `closesFor`.
    expect(src('data/coachhelm-dive-shape.ts')).toMatch(/const closes = closesFor\(raw, inputs\.themes\);/);
    expect(src('data/coachhelm-read-view-shape.ts')).toMatch(/worth: deep\.closes \? \{ strokes: deep\.closes\.strokes/);
    expect(src('screens/coachhelm/file/cards.tsx')).toMatch(/\{d\.closes\.strokes\} strokes a round/);
    // The Team board: the same function over the themes it already reads, and no `stakes` on screen.
    expect(src('data/coachhelm-team-shape.ts')).toMatch(/closesFor\(\{ id \} as EvidenceInsight, themes\)/);
    expect(src('data/coachhelm-team.ts')).toMatch(/worthByRead\(/);
    expect(src('screens/coachhelm/team/panels.tsx')).not.toMatch(/read\.stakes/);
    expect(src('screens/coachhelm/team/parts.tsx')).not.toMatch(/read\.stakes/);
  });
});

describe('the read panel says the player’s name once (W12’s prefix)', () => {
  it('a title stored with the name: the heading drops it, and Ask’s question names the player once', () => {
    const stored = { ...READ, title: `${PLAYER.first}: Long approaches finish short-right` } as ChInsight;
    function Stored() {
      const fa = useFocusActions(writes);
      return <ReadPanel read={stored} player={PLAYER} fa={fa} roster={[{ id: PLAYER.id }]} onClose={() => {}} />;
    }
    render(
      <Wrap>
        <Stored />
      </Wrap>,
    );
    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('Long approaches finish short-right');
    const ask = decodeURIComponent(screen.getByRole('link', { name: /Ask about this/ }).getAttribute('href') ?? '');
    expect(ask).toContain(`Tell me about ${PLAYER.first}: Long approaches finish short-right`);
    expect(ask).not.toContain(`${PLAYER.first}: ${PLAYER.first}:`);
  });
});
