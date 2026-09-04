import { fixturePeople } from '../fixtures';

const roster = [fixturePeople.alex, fixturePeople.jordan, fixturePeople.taylor];

function result(data: unknown) {
  return Promise.resolve({ data, error: null });
}

export function createClient() {
  return {
    from(table: string) {
      if (table === 'golf_team_members') {
        return {
          select: () => ({ eq: () => result(roster.map((_, index) => ({ player_id: `player-${index + 1}` }))) }),
        };
      }
      if (table === 'golf_players') {
        const rows = roster.map((person, index) => ({
          id: `player-${index + 1}`,
          user_id: person.userId,
          first_name: person.name.split(' ')[0],
          last_name: person.name.split(' ')[1],
          graduation_year: 2027,
          avatar_url: person.avatar,
        }));
        const query = {
          in: () => query,
          or: () => query,
          limit: () => result(rows),
        };
        return { select: () => query };
      }
      return { select: () => ({ eq: () => result([]) }) };
    },
  };
}
