/**
 * The pulse says which of its reads failed (`ProgramPulse.failed`). Supabase answers a failed read as `{ data: null, error }` and
 * does not throw, so the old `safeRows` and `safeCount` read it as "no rows" and the pulse said "N players have no recorded rounds"
 * over a rounds read that never landed. The failure is now said on the result; `items` and the counts are what they always were
 * (Fairway reads them), and a page that must not state a gap as a fact reads `failed` first.
 */
import { describe, expect, it } from 'vitest';
import { getProgramPulse } from '@/lib/coachhelm/v3/chat/program-pulse';
import type { CoachChatContext } from '@/lib/coachhelm/v3/chat/context';

type Answer = { data?: unknown; error?: unknown; count?: number | null };

/** A Supabase double that answers each table once, whatever the chain; a thrown answer is a read that throws. */
function sbWith(tables: Record<string, Answer | (() => never)>) {
  const query = (table: string) => {
    const chain: object = new Proxy(
      {},
      {
        get(_, key: string) {
          if (key === 'then') {
            return (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => {
              try {
                const a = tables[table];
                const res = typeof a === 'function' ? a() : a;
                return Promise.resolve({ data: null, error: null, count: null, ...res }).then(ok, bad);
              } catch (e) {
                return Promise.reject(e).then(ok, bad);
              }
            };
          }
          return () => chain;
        },
      },
    );
    return chain;
  };
  return { from: query } as never;
}

const ctx: CoachChatContext = {
  coach_id: 'c1',
  user_id: 'u1',
  team_id: 't1',
  team_name: 'Finley',
  timezone: 'America/New_York',
  roster: [
    { id: 'p1', name: 'Jonah Okafor', first_name: 'Jonah', last_name: 'Okafor', graduation_year: 2027 },
    { id: 'p2', name: 'Eli Brandt', first_name: 'Eli', last_name: 'Brandt', graduation_year: 2028 },
  ],
};
const boom = { message: 'boom' };

describe('getProgramPulse, with a read failed', () => {
  it('every read landing: no `failed` at all (the result is what it always was)', async () => {
    const p = await getProgramPulse(sbWith({}), ctx);
    expect(p.failed).toBeUndefined();
  });

  it('a rounds read that errors is named, not read as "no rounds" (the counts it leaves are not facts)', async () => {
    const p = await getProgramPulse(sbWith({ golf_rounds: { error: boom } }), ctx);
    expect(p.failed).toEqual(['rounds']);
    // The numbers are made from no rounds at all: they stay as they were for the callers that read them, and say nothing.
    expect(p.players_without_rounds).toBe(2);
    expect(p.items.some((i) => i.id === 'coverage-no-rounds')).toBe(true);
  });

  it('each other read is named in turn: events, attendance, tasks, focus areas and the signals (rows or the count)', async () => {
    expect((await getProgramPulse(sbWith({ golf_events: { error: boom } }), ctx)).failed).toEqual(['events']);
    expect((await getProgramPulse(sbWith({ golf_event_attendance: { error: boom } }), ctx)).failed).toEqual(['attendance']);
    expect((await getProgramPulse(sbWith({ golf_tasks: { error: boom } }), ctx)).failed).toEqual(['tasks']);
    expect((await getProgramPulse(sbWith({ golf_player_focus_areas: { error: boom } }), ctx)).failed).toEqual(['focus']);
    expect((await getProgramPulse(sbWith({ golf_coach_insights: { error: boom } }), ctx)).failed).toEqual(['signals']);
  });

  it('a read that throws is a failed read as well, and several failures are all named', async () => {
    const p = await getProgramPulse(
      sbWith({
        golf_tasks: () => {
          throw new Error('network');
        },
        golf_rounds: { error: boom },
      }),
      ctx,
    );
    expect([...(p.failed ?? [])].sort()).toEqual(['rounds', 'tasks']);
  });

  it('an empty roster reads nothing, so nothing failed', async () => {
    const p = await getProgramPulse(sbWith({ golf_rounds: { error: boom } }), { ...ctx, roster: [] });
    expect(p.failed).toBeUndefined();
  });
});
