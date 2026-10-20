/**
 * The pulse's RSVP item speaks of replies in the words Home and the calendar use ("haven’t replied", "N of M replied"),
 * where it said "have not responded for" beside a Home card that said "5 of 6 going" (wave-3 design review, item 3).
 */
import { describe, expect, it } from 'vitest';
import { getProgramPulse } from '@/lib/coachhelm/v3/chat/program-pulse';
import type { CoachChatContext } from '@/lib/coachhelm/v3/chat/context';

/** A Supabase double that answers each table with its rows, whatever the chain. */
function sbWith(tables: Record<string, unknown[]>) {
  const query = (table: string) => {
    const chain: object = new Proxy(
      {},
      {
        get(_, key: string) {
          if (key === 'then') {
            return (ok: (v: unknown) => unknown) => Promise.resolve({ data: tables[table] ?? [], error: null, count: null }).then(ok);
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
    { id: 'p3', name: 'Priya Natarajan', first_name: 'Priya', last_name: 'Natarajan', graduation_year: 2027 },
  ],
};
const event = (id: string, title: string) => ({ id, title, start_time: '2026-10-22T22:30:00Z', event_type: 'meeting', requires_rsvp: true, status: 'confirmed' });

describe('getProgramPulse, the RSVP item', () => {
  it('counts the players who haven’t replied, and the replies in, in one word', async () => {
    const p = await getProgramPulse(
      sbWith({
        golf_events: [event('e1', 'Team dinner'), event('e2', 'Film session')],
        golf_event_attendance: [
          { event_id: 'e1', player_id: 'p1', status: 'accepted' },
          { event_id: 'e1', player_id: 'p2', status: 'pending' },
          { event_id: 'e1', player_id: 'p3', status: 'pending' },
          { event_id: 'e2', player_id: 'p1', status: 'declined' },
          { event_id: 'e2', player_id: 'p2', status: 'accepted' },
          { event_id: 'e2', player_id: 'p3', status: 'pending' },
        ],
      }),
      ctx,
    );
    const dinner = p.items.find((i) => i.id === 'rsvp-e1')!;
    expect(dinner.headline).toBe('2 players haven’t replied to Team dinner');
    expect(dinner.evidence).toMatch(/ · 1 of 3 replied$/);
    const film = p.items.find((i) => i.id === 'rsvp-e2')!;
    expect(film.headline).toBe('1 player hasn’t replied to Film session');
    expect(film.evidence).toMatch(/ · 2 of 3 replied$/);
    expect(p.items.some((i) => /responded/.test(`${i.headline} ${i.evidence}`))).toBe(false);
  });
});
