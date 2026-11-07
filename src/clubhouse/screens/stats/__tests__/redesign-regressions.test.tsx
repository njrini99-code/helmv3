import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn(), hapticScrub: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, useSearchParams: () => new URLSearchParams(), usePathname: () => '/x' }));
vi.mock('@/app/golf/actions/development', () => ({ createFocusArea: vi.fn(), acceptFocusArea: vi.fn(), declineFocusArea: vi.fn() }));
vi.mock('@/app/golf/actions/insight-delivery', () => ({}));
const goals = vi.hoisted(() => ({ active: [] as unknown[] }));
vi.mock('@/lib/coachhelm/v3/goals/loader', () => ({ loadActiveGoals: vi.fn(async () => goals.active), loadRecentlyAchievedGoals: vi.fn(async () => []) }));
import { PREVIEW_PLAYER_SHS_SELF } from '../../../preview/fixtures-stats-redesign';
import { PREVIEW_TEAM_STATS } from '../../../preview/fixtures-stats';
import { DIVE_SLOPE, FULL_INPUTS } from '../../../preview/fixtures-coachhelm-views';
import { toChInsight } from '../../../data/coachhelm-map';
import { toChDeepInsight } from '../../../data/coachhelm-dive-shape';
import { readPlans } from '../../../data/coachhelm-dive';
import { PREVIEW_TOUR } from '../../../preview/fixtures-coachhelm';
import { ThreadDatePill } from '../../messages/thread-v2';
import { StatsPlayer } from '../StatsPlayer';
import { StatsTeam } from '../StatsTeam';
import { asPhone, tree } from './_shs-harness';
afterEach(cleanup);
describe('redesign regressions', () => {
  it('BUG-1 player Try again works again after a retry that failed again', async () => {
    router.refresh.mockClear(); asPhone();
    const d = { ...PREVIEW_PLAYER_SHS_SELF, roundsError: true };
    const { rerender } = render(tree(<StatsPlayer data={d} coachId={null} />));
    await waitFor(() => expect(document.querySelector('[data-ch="stats-retry"]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-ch="stats-retry"]')!);
    rerender(tree(<StatsPlayer data={{ ...d }} coachId={null} />));
    fireEvent.click(document.querySelector('[data-ch="stats-retry"]')!);
    expect(router.refresh).toHaveBeenCalledTimes(2);
  });
  it('BUG-1b team Try again works again after a retry that failed again', async () => {
    router.refresh.mockClear(); asPhone();
    const t = { ...PREVIEW_TEAM_STATS, roundsError: true };
    const { rerender } = render(tree(<StatsTeam data={t} />));
    await waitFor(() => expect(document.querySelector('[data-ch="stats-retry"]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-ch="stats-retry"]')!);
    rerender(tree(<StatsTeam data={{ ...t }} />));
    fireEvent.click(document.querySelector('[data-ch="stats-retry"]')!);
    expect(router.refresh).toHaveBeenCalledTimes(2);
  });
  it('BUG-2 W-READ-1 a player gets no diagnosis for a likely cause', () => {
    const base = toChInsight(DIVE_SLOPE, { tour: PREVIEW_TOUR, viewer: { role: 'player' } });
    const deep = toChDeepInsight(DIVE_SLOPE, base, FULL_INPUTS, (s) => s, 'player');
    expect(deep.diagnosis).toBeNull();
  });
  it('BUG-3 W-LNS-1 readPlans drops a private player goal for a coach', async () => {
    goals.active = [{ id: 'g', player_id: 'p', creator_role: 'player', shared_with_coach: false, state: 'active' }];
    const q: Record<string, unknown> = {}; for (const m of ['select','eq','in']) q[m] = () => q; q.order = async () => ({ data: [], error: null });
    const res = await (readPlans as (...a: unknown[]) => Promise<{ goals: unknown[] }>)({ from: () => q }, 'p', { role: 'coach' });
    expect(res.goals).toEqual([]);
  });
  it('PROBE MSG-DATEPILL-02 no floating pill while the same day is in flow within 60px', async () => {
    function T() { const ref = useRef<HTMLDivElement | null>(null); return (<><div ref={(el) => { ref.current = el; if (el) el.getBoundingClientRect = () => ({ top: 100 }) as DOMRect; }}><div className="ch-ms-day" ref={(el) => { if (el) el.getBoundingClientRect = () => ({ top: 104, bottom: 124 }) as DOMRect; }}><span>Tue</span></div></div><ThreadDatePill scroller={ref} forced /></>); }
    render(<T />);
    await new Promise((r) => setTimeout(r, 20));
    expect(document.querySelector('.ch-msv-datepill.is-on')).toBeNull();
  });
});
