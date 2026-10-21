import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The roster's CoachHelm counts (P003, spec D build B) at the loader: counted from the Board's visible reads, and `failed` (never
 * counts) when the Tour baseline they are measured against does not load.
 */

const logServer = vi.hoisted(() => vi.fn());
vi.mock('../../lib/track-server', () => ({ chLogServer: logServer }));
const tables = vi.hoisted(() => ({ current: {} as import('../../__tests__/supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('../../__tests__/supabase-fake')).fakeServer(tables));
const gates = vi.hoisted(() => ({ coach: vi.fn() }));
vi.mock('@/lib/coachhelm/v2/gate', () => ({ isCoachHelmEnabledForCoach: gates.coach, isCoachHelmEnabledForPlayer: vi.fn() }));
vi.mock('@/app/golf/actions/insight-delivery', () => ({ getInsightsForCoach: vi.fn(), getInsightsForPlayer: vi.fn(), getTopInsightsForPlayers: vi.fn(), getThemesForCoach: vi.fn(), getThemesForPlayer: vi.fn() }));
vi.mock('@/lib/coachhelm/v3/chat/request-cache', () => ({ getCoachProgramPulse: vi.fn(), getCoachChatContext: async () => ({ roster: [] }) }));

import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { loadRoster } from '../roster';
import { penalties, PREVIEW_TOUR, slope } from '../../preview/fixtures-coachhelm';

const PID = '11111111-1111-4111-8111-111111111111';
const on = { effectivelyEnabled: true, disabledBy: null, disabledReason: null };
const reads = (): EvidenceInsight[] => [slope(PID), penalties(PID)];

function world(over: Record<string, unknown> = {}) {
  tables.current = {
    golf_team_members: { data: [{ status: 'active', jersey_number: null, joined_at: null, availability: 'available', availability_updated_at: null, player: { id: PID, first_name: 'Jonah', last_name: 'Okafor' } }] },
    golf_rounds: { data: [{ id: 'r1', player_id: PID, round_date: '2026-10-14', total_score: 74, front_nine: 37, back_nine: 37, holes_played: 18, total_putts: 31 }] },
    golf_teams: { data: { gender: 'mens' } },
    golf_pga_standards: { data: [...PREVIEW_TOUR.values].map(([metric_id, pga_tour_value]) => ({ metric_id, pga_tour_value })) },
    golf_coach_insights: { data: reads() },
    ...over,
  } as import('../../__tests__/supabase-fake').ChFakeTables;
}

beforeEach(() => {
  logServer.mockClear();
  gates.coach.mockReset().mockResolvedValue(on);
  world();
});

describe('loadRoster helm', () => {
  it('counts the player’s reads when the Tour baseline loads', async () => {
    const { helm } = await loadRoster({ teamId: 't1', coachId: 'c1' });
    if (helm.status !== 'on') throw new Error(helm.status);
    expect(helm.byPlayer[PID]).toBeDefined();
  });

  it('is failed, not wrong counts, when the Tour baseline does not load', async () => {
    world({ golf_pga_standards: { error: { message: 'boom' } } });
    const { helm } = await loadRoster({ teamId: 't1', coachId: 'c1' });
    expect(helm).toEqual({ status: 'failed' });
  });
});
