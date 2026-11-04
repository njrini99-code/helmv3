import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: () => true }));

import { buildPlayerTools, PLAYER_INSTRUCTIONS } from '../player-tools';

const ctx = { coach_id: '', user_id: 'u', team_id: 't', team_name: 'Team', timezone: 'UTC', roster: [{ id: 'me', name: 'Me Myself' }] } as never;
const tools = buildPlayerTools({ sb: {} as never, ctx, playerId: 'me', writer: { write: () => {} } as never, collect: () => {} });

describe('player Ask tool set', () => {
  it('has no write, no ranking and no team read', () => {
    for (const k of Object.keys(tools)) {
      expect(k).not.toMatch(/^(create|set|add|draft|save|publish|request|send|update|delete)_/);
    }
    for (const banned of ['compare_players', 'get_team_metric_ranking', 'get_team_overview', 'get_team_rounds', 'get_team_patterns']) expect(tools[banned]).toBeUndefined();
  });
  it('tells the model never to name another player', () => {
    expect(PLAYER_INSTRUCTIONS('Me', 'Team', 'UTC')).toMatch(/Never name another player/);
  });
});
