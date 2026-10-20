/**
 * The movement rows say which way the scores went in words and give each mover's change a unit (wave 6 review): "scoring higher
 * than their previous three rounds · Jonah +2.1" read a decline as a gain and left the number unnamed. A higher score is worse.
 */
import { describe, expect, it } from 'vitest';
import { getProgramPulse } from '@/lib/coachhelm/v3/chat/program-pulse';
import type { CoachChatContext } from '@/lib/coachhelm/v3/chat/context';

/** A Supabase double that answers each table once, whatever the chain (program-pulse-failed-reads.test.ts's). */
function sbWith(tables: Record<string, { data?: unknown }>) {
  const query = (table: string) => {
    const chain: object = new Proxy(
      {},
      {
        get(_, key: string) {
          if (key === 'then') return (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null, count: null, ...tables[table] }).then(ok);
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

/** Six completed 18-hole rounds, newest first: the last three at `recent` over par, the three before at `prior`. */
const six = (player: string, recent: number, prior: number) =>
  [recent, recent, recent, prior, prior, prior].map((toPar, i) => ({
    player_id: player,
    round_date: `2026-09-${String(28 - i).padStart(2, '0')}`,
    score_to_par: toPar,
    holes_played: 18,
    total_score: 72 + toPar,
    front_nine: 36,
    back_nine: 36 + toPar,
    total_putts: 31,
  }));

const movement = async (rounds: unknown[]) => (await getProgramPulse(sbWith({ golf_rounds: { data: rounds } }), ctx)).items.find((i) => i.id.startsWith('movement-'));

describe('getProgramPulse, the movement rows', () => {
  it('a decline is "scoring worse", and each mover is in strokes', async () => {
    const m = await movement([...six('p1', 6, 4), ...six('p2', 5, 4)]);
    expect(m).toMatchObject({ id: 'movement-decline', headline: '2 players are scoring worse over their last three rounds', evidence: 'Jonah Okafor +2.0 strokes · Eli Brandt +1.0 strokes' });
  });

  it('an improvement is "scoring better", with a true minus', async () => {
    const m = await movement([...six('p1', 2, 4), ...six('p2', 3, 5)]);
    expect(m).toMatchObject({ id: 'movement-improve', headline: '2 players are scoring better over their last three rounds', evidence: 'Jonah Okafor −2.0 strokes · Eli Brandt −2.0 strokes' });
  });
});
