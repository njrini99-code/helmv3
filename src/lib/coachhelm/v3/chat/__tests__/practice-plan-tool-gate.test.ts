import { describe, expect, it, vi } from 'vitest';

vi.mock('../../practice-plan/flag', () => ({ isPracticeTabEnabled: () => true, isPracticePlansEnabled: () => true }));

import { buildCoachTools, isConfirmRequired } from '../agent-tools';
import type { CoachChatContext } from '../context';

/** W-PP-3, W-PP-1: publishing a plan needs the coach's confirm; drafting and asking the brief do not, and all of it is off without the flag. */

const ctx: CoachChatContext = { coach_id: 'c1', user_id: 'u1', team_id: 'team-1', team_name: 'Rini University', timezone: 'America/New_York', roster: [] };

const write = vi.fn();
const names = (opts: { teamTools?: boolean; practicePlans?: boolean; askV2?: boolean; sb?: unknown }) =>
  buildCoachTools({ sb: (opts.sb ?? { from: vi.fn() }) as never, ctx, conversationId: null, writer: { write } as never, collect: vi.fn(), teamTools: opts.teamTools, practicePlans: opts.practicePlans, askV2: opts.askV2 });

describe('the practice plan tools', () => {
  it('flag on: publish is offered and gated; draft and brief are offered and not', () => {
    const tools = Object.keys(names({ teamTools: true, practicePlans: true, askV2: true }));
    expect(tools).toEqual(expect.arrayContaining(['publish_practice_plan', 'draft_practice_plan', 'ask_practice_brief']));
    expect(isConfirmRequired('publish_practice_plan')).toBe(true);
    expect(isConfirmRequired('draft_practice_plan')).toBe(false);
    expect(isConfirmRequired('ask_practice_brief')).toBe(false);
  });

  it('flag off: none of them is in the tool list', () => {
    const tools = Object.keys(names({ teamTools: true, practicePlans: false }));
    for (const t of ['publish_practice_plan', 'draft_practice_plan', 'ask_practice_brief', 'get_class_times']) expect(tools).not.toContain(t);
  });

  it('a Fairway team never lists them, whatever the flag says', () => {
    const tools = Object.keys(names({ teamTools: false, practicePlans: true }));
    expect(tools).not.toContain('publish_practice_plan');
    expect(tools).not.toContain('draft_practice_plan');
  });

  it('ask_practice_brief writes nothing: any database call would throw', async () => {
    const boom = () => {
      throw new Error('the brief must not touch the database');
    };
    const tools = names({ teamTools: true, practicePlans: true, askV2: true, sb: { from: boom, rpc: boom } }) as unknown as Record<string, { execute: (i: unknown, o: unknown) => Promise<{ status: string }> }>;
    write.mockClear();
    await expect(tools.ask_practice_brief!.execute({ questions: [] }, { toolCallId: 't1' })).resolves.toMatchObject({ status: 'shown' });
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]?.[0]).toMatchObject({ type: 'data-brief' });
  });
});
