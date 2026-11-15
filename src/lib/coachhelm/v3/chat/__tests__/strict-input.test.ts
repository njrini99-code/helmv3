import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { CoachChatContext } from '../context';
import type { ChatSurface, PlayerChatContext } from '../engine/tool';
import { toolsFor } from '../registry';
import { strictInput, strictProblems } from '../strict-input';

vi.mock('server-only', () => ({}));
const flags = vi.hoisted(() => ({ tournaments: true }));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: (name: string) => name === 'golf_tournaments_v1' && flags.tournaments }));

const coach: CoachChatContext = { coach_id: 'c1', user_id: 'u1', team_id: 't1', team_name: 'Rini University', timezone: 'America/New_York', roster: [] };
const player: PlayerChatContext = { ...coach, player_id: 'p1' };
const jsonOf = (schema: z.ZodType) => z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });

describe('strictInput', () => {
  const own = z.object({
    player_id: z.string().uuid(),
    window: z.enum(['last5', 'last10']).default('last10').describe('Which rounds.'),
    note: z.string().min(1).max(10).optional(),
    count: z.number().int().min(1).max(5),
    event_id: z.string().uuid().nullable(),
    bands: z.array(z.tuple([z.number(), z.number()])).max(2).optional(),
    nested: z.object({ a: z.string().optional(), b: z.boolean().default(false) }).optional(),
  });
  const strict = strictInput(own);
  const ID = '00000000-0000-4000-8000-000000000001';

  it('shows the model a closed object with every field required and no bounds', () => {
    const json = jsonOf(strict) as { properties: Record<string, unknown>; required: string[] };
    expect(strictProblems(json)).toEqual([]);
    expect(json.required).toEqual(['player_id', 'window', 'note', 'count', 'event_id', 'bands', 'nested']);
    expect(json.properties.player_id).toEqual({ type: 'string', format: 'uuid' });
    expect(json.properties.window).toEqual({ anyOf: [{ type: 'string', enum: ['last5', 'last10'], description: 'Which rounds.' }, { type: 'null' }] });
    expect(json.properties.count).toEqual({ type: 'integer' });
  });

  it('takes null for a field that is not given, and the tool\'s own schema applies its default', () => {
    expect(strict.parse({ player_id: ID, window: null, note: null, count: 3, event_id: null, bands: null, nested: null })).toEqual({ player_id: ID, window: 'last10', count: 3, event_id: null });
    expect(strict.parse({ player_id: ID, window: 'last5', note: 'hi', count: 3, event_id: ID, bands: [[50, 100]], nested: { a: null, b: null } })).toEqual({ player_id: ID, window: 'last5', note: 'hi', count: 3, event_id: ID, bands: [[50, 100]], nested: { b: false } });
  });

  it('still parses an input with optional fields left out, as a request without strict would send', () => {
    expect(strict.parse({ player_id: ID, count: 2, event_id: null })).toEqual({ player_id: ID, window: 'last10', count: 2, event_id: null });
  });

  it('keeps every bound the tool had: out of range, too long or malformed is still refused', () => {
    const ok = { player_id: ID, window: null, note: null, count: 3, event_id: null, bands: null, nested: null };
    expect(strict.safeParse({ ...ok, count: 9 }).success).toBe(false);
    expect(strict.safeParse({ ...ok, count: 2.5 }).success).toBe(false);
    expect(strict.safeParse({ ...ok, note: 'much too long a note' }).success).toBe(false);
    expect(strict.safeParse({ ...ok, player_id: 'not-an-id' }).success).toBe(false);
    expect(strict.safeParse({ ...ok, bands: [[1, 2, 3]] }).success).toBe(false);
    expect(strict.safeParse({ ...ok, window: 'last99' }).success).toBe(false);
    expect(strict.safeParse({ ...ok, extra: true }).success).toBe(false);
    // A required field is still required.
    expect(strict.safeParse({ window: null, note: null, count: 3, event_id: null, bands: null, nested: null }).success).toBe(false);
  });

  it('is built once: the same schema in, the same object out', () => {
    expect(strictInput(own)).toBe(strict);
  });
});

describe('every registered tool satisfies strict tool use', () => {
  it.each([
    ['ask', coach],
    ['quick_chat', coach],
    ['practice_helper', coach],
    ['player', player],
  ] as Array<[ChatSurface, CoachChatContext]>)('%s', (surface, who) => {
    const tools = toolsFor(surface, who);
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) expect(strictProblems(jsonOf(tool.input)), tool.name).toEqual([]);
  });

  it('a tool is the same object and the same definition on every request', () => {
    const first = toolsFor('ask', coach);
    const second = toolsFor('ask', coach);
    expect(second.map((t) => t.name)).toEqual(first.map((t) => t.name));
    second.forEach((t, i) => expect(t).toBe(first[i]));
    expect(JSON.stringify(second.map((t) => [t.description, jsonOf(t.input)]))).toBe(JSON.stringify(first.map((t) => [t.description, jsonOf(t.input)])));
  });

  it('no description carries a date or a count that moves', () => {
    for (const surface of ['ask', 'quick_chat'] as const) for (const tool of toolsFor(surface, coach)) expect(tool.description, tool.name).not.toMatch(/\b20\d\d\b|\btoday is\b/i);
  });
});
