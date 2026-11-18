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

import type { ChInsight } from '../../../../data/coachhelm-shape';
import type { ChTeamPlayer } from '../../../../data/coachhelm-team-shape';
import { PREVIEW_TEAM_BOARD } from '../../../../preview/fixtures-coachhelm-team';
import { ToastProvider } from '../../../../ui/Toast';
import { useFocusActions } from '../../parts';
import type { ChCoachHelmWrites } from '../../writes';
import { ReadPanel } from '../panels';

/**
 * The read sheet's comparison ladder (stats and charts audit 2026-11-15, CH-23): a signed figure such as strokes gained runs from a
 * zero rule, a loss to its left. Bars were `width: v / max`, so a negative value drew no bar at all.
 */
afterEach(cleanup);

const PLAYER = PREVIEW_TEAM_BOARD.players.list[0] as ChTeamPlayer;
const BASE = PLAYER.reads.needs[0] as ChInsight;
const writes: ChCoachHelmWrites = { assign: vi.fn(async () => ({ success: true })), dismiss: vi.fn(async () => ({ success: true })), undo: vi.fn(async () => ({ success: true })) };
const Wrap = ({ children }: { children: ReactNode }) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>{children}</ToastProvider>
  </LazyMotion>
);
function Sheet({ read }: { read: ChInsight }) {
  const fa = useFocusActions(writes);
  return <ReadPanel read={read} player={PLAYER} fa={fa} roster={[{ id: PLAYER.id }]} onClose={() => {}} />;
}

const ladder = (compare: NonNullable<ChInsight['compare']>) => {
  const { container } = render(
    <Wrap>
      <Sheet read={{ ...BASE, compare }} />
    </Wrap>,
  );
  const zero = container.querySelector('.ld .t b') as HTMLElement | null;
  const bars = [...container.querySelectorAll('.ld .t i')].map((i) => ({ left: parseFloat((i as HTMLElement).style.left), width: parseFloat((i as HTMLElement).style.width) }));
  return { zero: zero ? parseFloat(zero.style.left) : 0, bars };
};

describe('ReadPanel comparison · signed bars from a zero rule (CH-23)', () => {
  it('−0.8 draws a bar that ends at the zero rule from its left; +0.3 starts at it', () => {
    const { zero, bars } = ladder({ own: -0.8, team: null, tour: 0.3, higherBetter: true, unit: '' });
    expect(zero).toBeGreaterThan(0);
    const [you, tour] = bars;
    expect(you!.width).toBeGreaterThan(0);
    expect(you!.left).toBeLessThan(zero);
    expect(you!.left + you!.width).toBeCloseTo(zero, 1);
    expect(tour!.left).toBeCloseTo(zero, 1);
    expect(you!.width / tour!.width).toBeCloseTo(0.8 / 0.3, 1);
  });

  it('all at or over zero keeps plain bars from the left edge, with no rule', () => {
    const { zero, bars } = ladder({ own: 40, team: 50, tour: 60, higherBetter: true, unit: '%' });
    expect(zero).toBe(0);
    for (const b of bars) expect(b.left).toBe(0);
  });
});
