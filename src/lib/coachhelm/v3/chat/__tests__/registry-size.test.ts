import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { CoachChatContext } from '../context';
import type { ChatSurface, ChatTool, PlayerChatContext } from '../engine/tool';
import { policyBlock } from '../instructions';
import { toolsFor } from '../registry';

vi.mock('server-only', () => ({}));
// Production has golf_tournaments_v1 off (config/feature-flags.yml); the flag adds get_tournaments, set_lineup and lock_lineup.
const flags = vi.hoisted(() => ({ tournaments: false }));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: (name: string) => name === 'golf_tournaments_v1' && flags.tournaments }));

const coach: CoachChatContext = { coach_id: 'c1', user_id: 'u1', team_id: 't1', team_name: 'Rini University', timezone: 'America/New_York', roster: [] };
const player: PlayerChatContext = { ...coach, player_id: 'p1' };

/** A tool as the model is sent it: name, description and the JSON Schema of its input (the engine's own conversion, engine/model.ts). */
const definition = (t: ChatTool) => JSON.stringify({ name: t.name, description: t.description, input_schema: z.toJSONSchema(t.input, { io: 'input', unrepresentable: 'any' }) });
const tokens = (chars: number) => Math.round(chars / 4);

function sizeOf(surface: ChatSurface, who: CoachChatContext | PlayerChatContext) {
  const tools = toolsFor(surface, who);
  const toolChars = tools.reduce((n, t) => n + definition(t).length, 0);
  const policyChars = policyBlock(surface).length;
  return { tools: tools.length, toolTokens: tokens(toolChars), policyTokens: tokens(policyChars), total: tokens(toolChars + policyChars), largest: tools.map((t) => [t.name, tokens(definition(t).length)] as const).sort((a, b) => b[1] - a[1]).slice(0, 3) };
}

/**
 * The cached prefix is the tool definitions followed by the policy. Measured the same way (characters / 4, the engine's own schema
 * conversion) the previous stack was 26,063 with its 71 tools and tournaments on; the route's own note called it 39k in real tokens.
 * The target is under 12,000. This test is the measurement, and the ceiling keeps a new tool or a long description from quietly undoing it.
 */
describe('the cached prefix: tool definitions and policy', () => {
  it.each([
    ['ask', coach],
    ['practice_helper', coach],
    ['quick_chat', coach],
    ['player', player],
  ] as const)('%s stays under 12,000 tokens', (surface, who) => {
    const size = sizeOf(surface, who);
    console.info(`prefix ${surface}: ${size.tools} tools, ${size.toolTokens} tokens of definitions + ${size.policyTokens} of policy = ${size.total}; largest ${size.largest.map(([n, t]) => `${n} ${t}`).join(', ')}`);
    expect(size.total).toBeLessThan(12_000);
  });

  it('the Ask tab and the practice helper send the same definitions, so they share one cache entry', () => {
    expect(toolsFor('ask', coach).map(definition)).toEqual(toolsFor('practice_helper', coach).map(definition));
    expect(policyBlock('ask')).toBe(policyBlock('practice_helper'));
    expect(policyBlock('ask')).toBe(policyBlock('quick_chat'));
  });

  it('the list is in the same order on every call', () => {
    expect(toolsFor('ask', coach).map((t) => t.name)).toEqual(toolsFor('ask', coach).map((t) => t.name));
  });
});
