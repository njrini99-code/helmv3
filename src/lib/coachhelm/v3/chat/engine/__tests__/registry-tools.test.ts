import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { buildModelRequest, chatFeatures, modelToolFor, modelToolsFor, plainFeatures, profileFor, STRICT_LIMITS, STRICT_TOOLS, strictCostOf, strictToolNames } from '../model';
import { instructionBlocks } from '../../instructions';
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

  const prefix = (surface: ChatSurface, who: unknown, features = chatFeatures(surface)) => {
    const blocks = instructionBlocks(surface, who as never);
    const request = buildModelRequest({ tools: toolsFor(surface, who as never), system: { stable: blocks.policy, team: blocks.team }, messages: [{ role: 'user', content: 'x' }], features });
    return { request, cached: JSON.stringify(request.tools) + JSON.stringify(request.system) };
  };

  it.each(surfaces)('%s: the cached prefix (tools, policy with the golf block and the data map, team) is the same bytes on every request', (surface, who) => {
    const first = prefix(surface, who);
    expect(prefix(surface, who).cached).toBe(first.cached);
    // Nothing that changes with the day is in it: built again three weeks later, it is the same bytes.
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-12-01T15:00:00Z'));
      expect(prefix(surface, who).cached).toBe(first.cached);
    } finally {
      vi.useRealTimers();
    }
    // The fallback request's prefix is stable too, so a deployment the API has pushed onto plain requests still caches.
    expect(prefix(surface, who, plainFeatures(chatFeatures(surface))).cached).toBe(prefix(surface, who, plainFeatures(chatFeatures(surface))).cached);
  });

  it.each(surfaces.filter(([surface]) => surface !== 'player'))('%s: with the model’s code on, every read may be called from code and is not strict, every task is direct-only, and the code tool is last', (surface, who) => {
    const registry = toolsFor(surface, who as never);
    const tools = prefix(surface, who).request.tools as Array<{ name: string; type?: string; strict?: boolean; allowed_callers?: string[] }>;
    expect(tools.at(-1)).toEqual({ type: 'code_execution_20260120', name: 'code_execution' });
    expect(tools.slice(0, -1).map((t) => t.name)).toEqual(registry.map((t) => t.name));
    for (const tool of registry) {
      const sent = tools.find((t) => t.name === tool.name)!;
      // A read that writes (`direct_only`: the coach's two note tools, CONTRACT_NOTES E19) is sent as a task is: not callable from the model's code.
      if (tool.kind === 'read' && !tool.direct_only) {
        expect(sent.allowed_callers).toEqual(['direct', 'code_execution_20260120']);
        expect(sent).not.toHaveProperty('strict');
      } else {
        expect(sent).not.toHaveProperty('allowed_callers');
      }
    }
    expect(registry.filter((t) => t.kind === 'read' && t.direct_only).map((t) => t.name)).toEqual(['save_note', 'remove_note']);
  });

  // The first live requests (10 Nov 2026) were all rejected: every tool was sent `strict`, 33 strict tools and 72 union parameters
  // on a coach's request and 56 union parameters on a player's, against the API's 20, 24 and 16 for one request. Cut to those
  // counts, the next (11 Nov 2026) was rejected with "The compiled grammar is too large". So no tool is sent strict.
  it.each(surfaces)('%s: no tool of the real registry is sent strict, and nothing is dropped from the request', (surface, who) => {
    const registry = toolsFor(surface, who as never);
    const tools = prefix(surface, who).request.tools as Array<{ name: string; strict?: boolean }>;
    expect(chatFeatures(surface).strictTools).toBe(false);
    expect([...STRICT_TOOLS]).toEqual([]);
    expect(tools.filter((t) => 'strict' in t)).toEqual([]);
    expect([...strictToolNames(registry, chatFeatures(surface))]).toEqual([]);
    expect(tools.filter((t) => t.name !== 'code_execution').map((t) => t.name)).toEqual(registry.map((t) => t.name));
    // The engine is the gate on every input instead: each tool has its own zod schema to check against.
    for (const tool of registry) expect(typeof tool.input.safeParse).toBe('function');
  });

  it.each(surfaces)('%s: every request of a turn carries the same tools and system, byte for byte, whatever the step', (surface, who) => {
    const blocks = instructionBlocks(surface, who as never);
    const build = (extra: Partial<Parameters<typeof buildModelRequest>[0]>) =>
      buildModelRequest({ tools: toolsFor(surface, who as never), system: { stable: blocks.policy, team: blocks.team }, messages: [{ role: 'user', content: 'x' }], profile: profileFor(surface), ...extra });
    const first = build({});
    const second = build({ messages: [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'Reading.' }, { role: 'user', content: 'y' }] });
    const waiting = build({ container: 'container_1' });
    const last = build({ answerOnly: true });
    for (const later of [second, waiting, last]) {
      expect(JSON.stringify(later.tools)).toBe(JSON.stringify(first.tools));
      expect(JSON.stringify(later.system)).toBe(JSON.stringify(first.system));
    }
  });

  it.each(surfaces)('%s: if strict came back for every tool, the budget alone would keep one request within the API’s counts', (surface, who) => {
    // Kept for the day a list of names is tried: the counts are necessary, and were not sufficient.
    const registry = toolsFor(surface, who as never);
    const on = { ...chatFeatures(surface), strictTools: true };
    const tools = modelToolsFor(registry, on, 'any') as Array<{ name: string; strict?: boolean; input_schema?: unknown }>;
    const strict = tools.filter((t) => t.strict === true);
    const spent = strict.map((t) => strictCostOf(t.input_schema)).reduce((sum, c) => ({ optional: sum.optional + c.optional, unions: sum.unions + c.unions }), { optional: 0, unions: 0 });
    expect(strict.length).toBeGreaterThan(0);
    expect(strict.length).toBeLessThanOrEqual(STRICT_LIMITS.tools);
    expect(spent.optional).toBeLessThanOrEqual(STRICT_LIMITS.optional);
    expect(spent.unions).toBeLessThanOrEqual(STRICT_LIMITS.unions);
    expect(strict.map((t) => t.name).sort()).toEqual([...strictToolNames(registry, on, 'any')].sort());
    // No read a coach's code may call is ever strict (the API does not take the two together).
    for (const tool of registry) if (on.programmaticReads && tool.kind === 'read' && !tool.direct_only) expect(strict.some((t) => t.name === tool.name)).toBe(false);
    expect(tools.map((t) => t.name)).toEqual(registry.map((t) => t.name));
  });

  it('a player’s request has no code tool and no tool the code may call', () => {
    const sent = prefix('player', player).request.tools as Array<{ name: string; strict?: boolean; allowed_callers?: string[] }>;
    expect(sent.some((t) => t.name === 'code_execution')).toBe(false);
    expect(sent.every((t) => t.allowed_callers === undefined)).toBe(true);
  });

  it('the prefix as sent (the JSON of tools and system, characters / 4) stays near what was measured with the model’s code on', () => {
    // Measured 10 Nov 2026, tournaments flag off: Ask and the practice helper 21,251, quick chat 20,739, player 8,118. With the code
    // tool off the coach surfaces are about 380 smaller (no `allowed_callers` on each read, no code tool). Anthropic adds the code
    // tool's own instructions on its side; they are not in this count.
    const sizes = Object.fromEntries(surfaces.map(([surface, who]) => [surface, Math.round(prefix(surface, who).cached.length / 4)]));
    for (const [surface] of surfaces) expect(sizes[surface]!).toBeLessThan(surface === 'player' ? 9_500 : 23_000);
    const off = Math.round(prefix('ask', coach, { ...chatFeatures('ask'), programmaticReads: false }).cached.length / 4);
    expect(sizes.ask! - off).toBeLessThan(600);
  });
});
