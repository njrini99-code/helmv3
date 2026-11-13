import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlanBodyV2 } from '@/lib/coachhelm/v3/practice-plan/model';

/** Both save paths send golf_practice_plan_save a body whose automatic-grid Stations blocks carry no grid (coach audit 13 Nov). */
const rpc = vi.fn(async () => ({ data: null, error: { message: 'stop here' } }));

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }));
vi.mock('@/lib/admin/observed-action', () => ({ withAdminObserved: (_n: string, _o: unknown, fn: unknown) => fn }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(), logServerEvent: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/coachhelm/v3/chat/context', () => ({ resolveCoachChatContext: vi.fn() }));
vi.mock('@/app/actions/messages', () => ({ sendMessage: vi.fn() }));

import { savePracticePlan } from '../practice-plans';
import { savePracticePlanDraft } from '../coachhelm-practice-plans';

const body: PlanBodyV2 = {
  v: 2,
  focus: '',
  notes: '',
  place: 'The Cardinal',
  arrivalBufferMin: 15,
  bring: [],
  players: ['p1', 'p2', 'p3'],
  groups: [
    { id: 'g1', name: 'A', players: ['p1'], savedGroupId: null },
    { id: 'g2', name: 'B', players: ['p2'], savedGroupId: null },
    { id: 'g3', name: 'C', players: ['p3'], savedGroupId: null },
  ],
  variants: {
    rain: null,
    main: {
      blocks: [
        {
          id: 's',
          kind: 'stations',
          title: 'Rotation',
          len: 60,
          coach: null,
          note: '',
          stations: ['Range', 'Chipping', 'Putting'].map((place, i) => ({ id: `s${i + 1}`, place, coach: null, drill: null, note: '' })),
          groupIds: ['g1', 'g2', 'g3'],
          turnMin: 20,
          moveMin: 0,
          turns: 3,
          grid: null,
        },
      ],
    },
  },
};
const sentStations = () => {
  const args = (rpc.mock.calls.at(-1) as unknown as [string, { p_body: PlanBodyV2 }])[1];
  return args.p_body.variants.main.blocks[0] as unknown as Record<string, unknown>;
};

describe('a Stations block on its automatic grid', () => {
  beforeEach(() => rpc.mockClear());

  it('is sent without a grid by savePracticePlan', async () => {
    await savePracticePlan({ planId: 'p', expectedVersion: 1, body });
    expect(rpc).toHaveBeenCalledWith('golf_practice_plan_save', expect.anything());
    expect('grid' in sentStations()).toBe(false);
  });

  it('is sent without a grid by savePracticePlanDraft', async () => {
    await savePracticePlanDraft({ eventId: null, planId: 'p', version: 1, title: 'Team practice', draft: { body, why: {}, version: 1 }, folder: 'Practice plans' });
    expect('grid' in sentStations()).toBe(false);
  });
});
