/**
 * The Miss Compass's drawer is asked for by `get_shots` only for a coach whose team the flag lists: never for a player's own
 * Ask, never with the flag off (miss-compass-flag.ts). Without it the read is made exactly as before.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const pattern = vi.fn(async (_sb: unknown, _who: unknown, _input: Record<string, unknown>) => ({ summary: 's', measurements: [], series: [], detail: { kind: 'miss_pattern' }, coverage: 'complete', coverage_note: null, as_of: 'now' }));
vi.mock('../shot-reads', async (orig) => ({ ...(await orig<typeof import('../shot-reads')>()), getShotPattern: (...a: Parameters<typeof pattern>) => pattern(...a) }));
const enabled = vi.fn((_team: string | null | undefined) => true);
vi.mock('../visuals/miss-compass-flag', () => ({ missCompassEnabled: (t: string | null | undefined) => enabled(t) }));

import type { ToolContext } from '../engine/tool';
import { getShots } from '../readers-direct';

afterEach(() => {
  pattern.mockClear();
  enabled.mockClear();
});

const coach = { who: { coach_id: 'c1', user_id: 'u1', team_id: 'team-1', team_name: 'Finley University', timezone: 'America/New_York', roster: [] }, sb: {} } as unknown as ToolContext;
const player = { who: { player_id: 'p1', user_id: 'u2', team_id: 'team-1', team_name: 'Finley University', timezone: 'America/New_York', roster: [{ id: 'p1', name: 'Jonah Okafor' }] }, sb: {} } as unknown as ToolContext;
const input = { since_days: 60 };

describe('get_shots asks for the drawer only for a flagged coach team', () => {
  it('a coach on a listed team: drawer on, checked against the team', async () => {
    await getShots.run(coach, input as never);
    expect(enabled).toHaveBeenCalledWith('team-1');
    expect(pattern.mock.calls[0]![2]).toMatchObject({ drawer: true, mode: 'approach' });
  });

  it('the flag off: the read is asked for exactly as before, with no drawer key', async () => {
    enabled.mockReturnValueOnce(false);
    await getShots.run(coach, input as never);
    expect(Object.keys(pattern.mock.calls[0]![2])).not.toContain('drawer');
  });

  it('a player’s own Ask never gets it, whatever the flag says', async () => {
    await getShots.run(player, input as never);
    expect(Object.keys(pattern.mock.calls[0]![2])).not.toContain('drawer');
  });
});
