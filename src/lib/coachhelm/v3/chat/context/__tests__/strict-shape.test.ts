import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('server-only', () => ({}));
vi.mock('@/app/golf/actions/coachhelm-ask', () => ({ saveCoachFact: vi.fn(), deleteCoachFact: vi.fn() }));
vi.mock('@/app/golf/actions/calendar-events', () => ({ sendEventReminderToPlayers: vi.fn() }));
vi.mock('@/app/golf/actions/attendance', () => ({ markAttendance: vi.fn() }));
vi.mock('@/lib/calendar/availability', () => ({ resolveTeamTimeZone: async () => 'UTC' }));

import { strictInput, strictProblems } from '../../strict-input';
import { eventTaskTools } from '../../tasks/event-tasks';
import { findInApp, findInAppForPlayer } from '../find-in-app';
import { removeNote, saveNote } from '../notes';

/**
 * The registry passes every tool's input through `strictInput` before the model sees it (CONTRACT_NOTES, TOOLS 7).
 * These are the tools this folder and `../tasks` add, taken through the same wrapper: the schema the model is shown
 * must have no strict-mode problem, and an input in that shape must still reach the tool as its own schema reads it.
 */
const ID = '00000000-0000-4000-8000-000000000001';
const tools = [
  [findInApp, { query: 'join requests', player_id: null }],
  [findInAppForPlayer, { query: 'post a round' }],
  [saveNote, { text: 'Lead with the number.' }],
  [removeNote, { note: 'lead with the number' }],
  [eventTaskTools()[0]!, { event_id: ID, recipients: 'not_replied', player_ids: [] }],
  [eventTaskTools()[1]!, { event_id: ID, present: [ID], late: [], no_show: [] }],
] as const;

describe('the tools CONTEXT adds, as strict tools', () => {
  it.each(tools.map(([tool, sample]) => [tool.name, tool, sample] as const))('%s has no strict-mode problem and takes an input in that shape', (_name, tool, sample) => {
    const strict = strictInput(tool.input as z.ZodType<unknown>);
    expect(strictProblems(z.toJSONSchema(strict, { io: 'input', unrepresentable: 'any' }))).toEqual([]);
    expect(strict.parse(sample)).toEqual(sample);
    // And as written, without the wrapper, for a request sent without `strict`.
    expect((tool.input as z.ZodType<unknown>).parse(sample)).toEqual(sample);
  });

  it('refuses a choice outside the enum and an id that is not one', () => {
    const reminder = eventTaskTools()[0]!.input as z.ZodType<unknown>;
    expect(reminder.safeParse({ event_id: ID, recipients: 'everyone in the school', player_ids: [] }).success).toBe(false);
    expect(reminder.safeParse({ event_id: 'thursday', recipients: 'invited', player_ids: [] }).success).toBe(false);
    expect((findInApp.input as z.ZodType<unknown>).safeParse({ query: 'stats', player_id: 'Avery' }).success).toBe(false);
  });

  it('stays small: the prefix is paid for on every turn', () => {
    const size = (t: { name: string; description: string; input: unknown }) => Math.ceil((t.name.length + t.description.length + JSON.stringify(z.toJSONSchema(strictInput(t.input as z.ZodType<unknown>), { io: 'input', unrepresentable: 'any' })).length) / 4);
    const coach = [findInApp, saveNote, removeNote, ...eventTaskTools()].map(size).reduce((a, b) => a + b, 0);
    const player = size(findInAppForPlayer);
    // Characters / 4, as registry-size.test.ts measures. Five tools for a coach (1,166 when written), one for a player (147).
    expect(coach).toBeLessThan(1400);
    expect(player).toBeLessThan(200);
  });
});
