import { describe, it, expect, vi } from 'vitest';
import { loadActiveRoster, requireRosterPlayer, resolveRosterPlayerByName, CoachContextError } from '@/lib/coachhelm/v3/chat/context';
import { getTeamOverview } from '@/lib/coachhelm/v3/chat/read-tools';
import type { CoachChatContext } from '@/lib/coachhelm/v3/chat/context';

/**
 * The bug this file exists for: a seven-player roster reporting six.
 *
 * The old `get_team_overview` embedded `golf_players` into the membership query
 * and `.filter()`ed out any row whose join came back null, then counted what
 * survived. One unreadable profile silently shrank the team, and the model
 * wrote "all six of your players" in perfect confidence.
 */

/** Minimal Supabase double: two tables, scripted responses. */
function sbWith(responses: Record<string, { data: unknown; error?: unknown }>) {
  const builder = (table: string) => {
    const result = responses[table] ?? { data: [], error: null };
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'order', 'gte', 'lte', 'neq', 'limit']) {
      chain[method] = vi.fn(() => chain);
    }
    chain.maybeSingle = vi.fn(async () => result);
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
    return chain;
  };
  return { from: vi.fn((table: string) => builder(table)) } as never;
}

describe('loadActiveRoster', () => {
  it('keeps a member whose profile could not be read', () => {
    // Three memberships, two readable profiles. The third member is on the
    // team; we just cannot read their name. Dropping them is the bug.
    const sb = sbWith({
      golf_team_members: {
        data: [{ player_id: 'p1' }, { player_id: 'p2' }, { player_id: 'p3' }],
      },
      golf_players: {
        data: [
          { id: 'p1', first_name: 'Nick', last_name: 'Rini', graduation_year: 2027 },
          { id: 'p2', first_name: 'Sam', last_name: 'Fox', graduation_year: 2028 },
        ],
      },
    });

    return loadActiveRoster(sb, 'team-1').then((roster) => {
      expect(roster).toHaveLength(3);
      expect(roster.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
      // Surfaced under a neutral placeholder, never invented and never dropped.
      expect(roster[2]?.name).toBe('Unnamed player');
      expect(roster[2]?.first_name).toBeNull();
    });
  });

  it('returns nothing for an empty roster rather than failing', () => {
    const sb = sbWith({ golf_team_members: { data: [] } });
    return loadActiveRoster(sb, 'team-1').then((roster) => expect(roster).toEqual([]));
  });
});

const ctx = (roster: CoachChatContext['roster']): CoachChatContext => ({
  coach_id: 'c1',
  user_id: 'u1',
  team_id: 'team-1',
  team_name: 'Rini University',
  timezone: 'America/New_York',
  roster,
});

const player = (id: string, first: string | null, last: string | null) => ({
  id,
  name: `${first ?? ''} ${last ?? ''}`.trim() || 'Unnamed player',
  first_name: first,
  last_name: last,
  graduation_year: null,
});

describe('getTeamOverview', () => {
  it('reports the AUTHORITATIVE roster count, not the number of readable joins', async () => {
    const roster = [
      player('p1', 'Nick', 'Rini'),
      player('p2', 'Sam', 'Fox'),
      player('p3', null, null),
    ];
    const sb = sbWith({
      golf_rounds: {
        data: [
          { player_id: 'p1', score_to_par: 2, total_score: 74, round_date: '2026-07-20' },
          { player_id: 'p2', score_to_par: 5, total_score: 77, round_date: '2026-07-19' },
        ],
      },
    });

    const envelope = await getTeamOverview(sb, ctx(roster));
    const detail = envelope.detail as { active_roster_count: number; profiles_resolved: number };

    expect(detail.active_roster_count).toBe(3);
    expect(detail.profiles_resolved).toBe(2);
    expect(envelope.summary).toContain('3 active players');
    // The gap is REPORTED, so the answer degrades honestly instead of shrinking.
    expect(envelope.coverage).toBe('partial');
    expect(envelope.coverage_note).toMatch(/no readable profile/);
  });

  it('names the players with no recorded rounds instead of omitting them', async () => {
    const roster = [player('p1', 'Nick', 'Rini'), player('p2', 'Sam', 'Fox')];
    const sb = sbWith({
      golf_rounds: {
        data: [{ player_id: 'p1', score_to_par: 2, total_score: 74, round_date: '2026-07-20' }],
      },
    });

    const envelope = await getTeamOverview(sb, ctx(roster));
    expect(envelope.coverage).toBe('partial');
    expect(envelope.coverage_note).toContain('Sam Fox');
    const detail = envelope.detail as { players: { player_id: string }[] };
    // Sam is still in the payload — "no rounds" is not "not on the team".
    expect(detail.players.map((p) => p.player_id)).toEqual(['p1', 'p2']);
  });

  it('does not read a failed query as "no rounds"', async () => {
    const sb = sbWith({ golf_rounds: { data: null, error: { message: 'boom' } } });
    const envelope = await getTeamOverview(sb, ctx([player('p1', 'Nick', 'Rini')]));
    expect(envelope.coverage).toBe('unavailable');
    expect(envelope.coverage).not.toBe('empty');
  });

  it('reports a genuinely empty roster as empty', async () => {
    const envelope = await getTeamOverview(sbWith({}), ctx([]));
    expect(envelope.coverage).toBe('empty');
  });
});

/**
 * Authorization is not the model's job. A player id that did not come from the
 * coach's own roster must never reach a query.
 */
describe('requireRosterPlayer', () => {
  const c = ctx([player('p1', 'Nick', 'Rini')]);

  it('rejects a player from another team', () => {
    expect(() => requireRosterPlayer(c, 'someone-elses-player')).toThrow(CoachContextError);
  });

  it('returns the roster entry for one of your own', () => {
    expect(requireRosterPlayer(c, 'p1').name).toBe('Nick Rini');
  });
});

describe('resolveRosterPlayerByName', () => {
  const c = ctx([
    player('p1', 'Nick', 'Rini'),
    player('p2', 'Nick', 'Farrow'),
    player('p3', 'Sam', 'Fox'),
  ]);

  it('refuses to guess between two players with the same first name', () => {
    // Silently picking one of two Nicks is the worst available outcome.
    expect(resolveRosterPlayerByName(c, 'Nick')).toBeNull();
  });

  it('resolves an unambiguous full name', () => {
    expect(resolveRosterPlayerByName(c, 'Nick Rini')?.id).toBe('p1');
  });

  it('resolves an unambiguous first name', () => {
    expect(resolveRosterPlayerByName(c, 'Sam')?.id).toBe('p3');
  });

  it('returns nothing for someone not on the roster', () => {
    expect(resolveRosterPlayerByName(c, 'Rory')).toBeNull();
  });
});
