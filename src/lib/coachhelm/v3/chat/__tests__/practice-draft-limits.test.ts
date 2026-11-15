import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/golf/actions/practice-publish', () => ({ publishPracticePlan: vi.fn() }));
vi.mock('@/app/actions/messages', () => ({ sendMessage: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('../../practice-plan/flag', () => ({ isPracticeTabEnabled: () => true, isPracticePlansEnabled: () => true }));

import { PracticeDraftInput, practiceDraft } from '../practice-draft';
import type { CoachChatContext } from '../context';

/** The draft's limits match `golf_practice_plan_check_body`, so the model hears about a bad plan while it can fix it, not the coach on Save. */
const write = vi.fn();
const tool = {
  inputSchema: PracticeDraftInput,
  execute: async (i: unknown, _o: unknown) => {
    const built = await practiceDraft({ roster: [], team_id: 't1', team_name: 'Team', timezone: 'UTC' } as unknown as CoachChatContext, PracticeDraftInput.parse(i), new Map());
    if (built.ok) write(built.card);
    return { status: built.ok ? 'shown' : 'refused', message: built.message };
  },
};

const block = (over: Record<string, unknown> = {}) => ({ id: 'b', kind: 'team', title: 'Warm-up', len: 30, place: 'Range', note: '', aim: '', because: null, routine: true, sources: [], alternatives: [], ...over });
const input = (blocks: unknown[], minutes = 30) => ({ event_id: null, title: 'Plan', focus: '', place: '', minutes_asked: minutes, groups: [], players: [], bring: [], blocks });

describe('draft_practice_plan limits', () => {
  it('takes a block the save would take', () => {
    expect(tool.inputSchema.safeParse(input([block()])).success).toBe(true);
  });
  it('refuses a length that isn’t in 5 minute steps', () => {
    expect(tool.inputSchema.safeParse(input([block({ len: 33 })], 33)).success).toBe(false);
  });
  it('refuses a place over 40 characters', () => {
    expect(tool.inputSchema.safeParse(input([block({ place: 'x'.repeat(41) })])).success).toBe(false);
  });
  it('refuses a station with no place, and a turn off the 5 minute steps', () => {
    const station = { id: 's', place: '', note: '', alternatives: [] };
    expect(tool.inputSchema.safeParse(input([block({ kind: 'stations', stations: [station] })])).success).toBe(false);
    expect(tool.inputSchema.safeParse(input([block({ kind: 'stations', stations: [{ ...station, place: 'Back' }], turn_min: 12 })])).success).toBe(false);
  });
  it('refuses stations whose moves break the 5 minute steps, and a stations block with none', async () => {
    const stations = [{ id: 's1', place: 'Back', note: '', alternatives: [] }, { id: 's2', place: 'Front', note: '', alternatives: [] }];
    const res = await tool.execute(input([block({ kind: 'stations', stations, turn_min: 20, move_min: 3, len: 45 })], 45), {});
    expect(res.status).toBe('refused');
    expect(write).not.toHaveBeenCalled();
    expect((await tool.execute(input([block({ kind: 'stations', stations: [] })]), {})).status).toBe('refused');
  });
});
