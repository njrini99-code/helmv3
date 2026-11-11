import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { modelToolFor } from '../model';
import { toolsFor } from '../../registry';
import type { ChatSurface } from '../tool';

/**
 * The real registry through the engine's own conversion: every tool of every surface must become a definition the API
 * accepts, or the first request of a deploy fails for every coach. Names are also what stored conversations and the
 * ledger hold, and the order is part of the cached prefix.
 */
const coach = { coach_id: 'c', user_id: 'u', team_id: 't', team_name: 'Team', timezone: 'America/New_York', roster: [{ id: 'p1', name: 'Avery Lane' }] } as never;
const player = { coach_id: '', user_id: 'u', team_id: 't', team_name: 'Team', timezone: 'America/New_York', roster: [{ id: 'p1', name: 'Avery Lane' }], player_id: 'p1' } as never;
const surfaces: Array<[ChatSurface, unknown]> = [['ask', coach], ['quick_chat', coach], ['practice_helper', coach], ['player', player]];

describe('the registry’s tools as the model is given them', () => {
  it.each(surfaces)('%s: every tool converts, with a valid unique name and an object schema', (surface, who) => {
    const tools = toolsFor(surface, who as never);
    expect(tools.length).toBeGreaterThan(0);
    const defs = tools.map((tool) => modelToolFor(tool));
    const names = defs.map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
    for (const def of defs) {
      expect(def.name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
      expect(def.description?.trim().length ?? 0).toBeGreaterThan(0);
      expect((def.input_schema as { type: string }).type).toBe('object');
      expect(() => JSON.stringify(def)).not.toThrow();
    }
  });

  it('the order is stable for a surface: the same call twice gives the same list', () => {
    for (const [surface, who] of surfaces) {
      expect(toolsFor(surface, who as never).map((t) => t.name)).toEqual(toolsFor(surface, who as never).map((t) => t.name));
    }
  });

  it('a player is offered no task', () => {
    expect(toolsFor('player', player).filter((t) => t.kind === 'task')).toEqual([]);
  });
});
