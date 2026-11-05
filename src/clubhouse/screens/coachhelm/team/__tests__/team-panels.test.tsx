import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard/coachhelm', useSearchParams: () => new URLSearchParams() }));
vi.mock('../../../../lib/use-phone', () => ({ useChPhone: () => false, CH_PHONE_QUERY: '(max-width: 820px)' }));
vi.mock('@/app/golf/actions/development', () => ({ acceptFocusArea: vi.fn(), createFocusAreaFromInsightV2: vi.fn(), declineFocusArea: vi.fn() }));
vi.mock('@/app/golf/actions/insights-feed', () => ({ dismissInsight: vi.fn(), reactivateInsight: vi.fn() }));
vi.mock('@/app/golf/actions/coachhelm-corrections', () => ({ recordCoachHelmCorrection: vi.fn(async () => ({ ok: true })) }));
vi.mock('@/app/golf/actions/insights-coachhelm', () => ({ refreshTeamAnalysisAsCoach: vi.fn() }));
vi.mock('@/app/golf/actions/coachhelm-course-plan', () => ({ getCoursePlan: vi.fn(), getMyCoursePlan: vi.fn(), listCoursePlanCourses: vi.fn(), listMyCoursePlanCourses: vi.fn() }));

import { ToastProvider } from '../../../../ui/Toast';
import type { ChInsight } from '../../../../data/coachhelm-shape';
import { useFocusActions } from '../../parts';
import type { ChCoachHelmWrites } from '../../writes';
import { ReadPanel } from '../panels';

/** W-TEAM-11, W-TEAM-12, W-LNS-12, AC-READ-07: the shared read sheet, by viewer. */

const PLAYER = { id: 'p1', name: 'Eli Stone', first: 'Eli', rounds: 8, early: false };
const writes: ChCoachHelmWrites = { assign: vi.fn(async () => ({ success: true })), dismiss: vi.fn(async () => ({ success: true })), undo: vi.fn(async () => ({ success: true })) };

const read = (over: Partial<ChInsight> = {}): ChInsight =>
  ({
    id: 'i1',
    title: 'Approach from 175',
    lede: 'Most misses come from long range.',
    kind: 'finding',
    area: 'approach',
    metric: 'sg_approach',
    stale: false,
    declined: false,
    evidence: { label: 'GIR', window: 'Last 10' },
    engine: { cause: { word: 'Likely' } },
    compare: { own: 40, team: 48, tour: 52, unit: '%', higherBetter: true },
    assignAs: { title: 't', description: 'd' },
    ...over,
  }) as unknown as ChInsight;

function Host(props: { role?: 'coach' | 'player'; ins?: ChInsight; readOn?: boolean; roster?: ReadonlyArray<{ id: string }>; fileHost?: boolean }) {
  const fa = useFocusActions(writes);
  return <ReadPanel read={props.ins ?? read()} player={PLAYER} fa={fa} readOn={props.readOn ?? false} roster={props.roster ?? [{ id: 'p1' }]} onClose={() => {}} role={props.role ?? 'coach'} fileHost={props.fileHost} />;
}
const Wrap = ({ children }: { children: ReactNode }) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>{children}</ToastProvider>
  </LazyMotion>
);
const show = (props: Parameters<typeof Host>[0] = {}) => render(<Host {...props} />, { wrapper: Wrap });

afterEach(() => cleanup());

describe('the comparison (W-TEAM-11)', () => {
  it('draws the team row only when the read carries a pool figure', () => {
    show();
    expect(screen.getByText('Team')).toBeTruthy();
    expect(screen.queryByText('Team: not measured for this read')).toBeNull();
  });

  it('with no pool it says so and draws no team figure', () => {
    show({ ins: read({ compare: { own: 40, team: null, tour: 52, unit: '%', higherBetter: true } as ChInsight['compare'] }) });
    expect(screen.queryByText('Team')).toBeNull();
    expect(screen.getByText('Team: not measured for this read')).toBeTruthy();
  });
});

describe('by viewer (W-LNS-12, AC-READ-07)', () => {
  it('a coach sees the cause word and Assign; the team sheet offers no Dismiss (W-TEAM-12)', () => {
    show();
    expect(screen.getByText('Cause: Likely')).toBeTruthy();
    expect(document.body.textContent).toContain('Eli Stone');
    expect(screen.getByRole('button', { name: 'Assign as focus' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Dismiss/ })).toBeNull();
  });

  it('a player gets no cause word, no Assign and no name, even when the host passes the writes', () => {
    show({ role: 'player' });
    expect(screen.getByText('Approach from 175')).toBeTruthy();
    expect(document.body.textContent).not.toContain('Cause:');
    expect(document.body.textContent).not.toContain('Eli Stone');
    expect(screen.queryByRole('button', { name: 'Assign as focus' })).toBeNull();
  });
});

describe('Open the full read (W-TEAM-12)', () => {
  const link = () => screen.queryByRole('link', { name: /Open the full read/ })?.getAttribute('href') ?? null;

  it('Read off: today Deep dive address', async () => {
    show();
    await waitFor(() => expect(link()).toBe('/golf/dashboard/coachhelm?view=deep-dive&player=p1&insight=i1'));
  });

  it('Read on: the read page, with the player', () => {
    show({ readOn: true });
    expect(link()).toBe('/golf/dashboard/coachhelm?view=read&player=p1&insight=i1');
  });

  it('a player not on the loaded roster gets no link', () => {
    show({ roster: [{ id: 'someone-else' }] });
    expect(link()).toBeNull();
  });

  it('the Lenses host leaves it out with Read off', () => {
    show({ fileHost: true });
    expect(link()).toBeNull();
  });
});
