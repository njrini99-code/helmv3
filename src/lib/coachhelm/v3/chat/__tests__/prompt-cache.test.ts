import { describe, expect, it } from 'vitest';
import type { ModelMessage } from 'ai';
import { systemBlocks, systemCached, withTailBreakpoint } from '../prompt-cache';

const breakpointOf = (m: ModelMessage) => (m.providerOptions as { anthropic?: { cacheControl?: unknown } } | undefined)?.anthropic?.cacheControl;

describe('systemBlocks', () => {
  it('puts the one-hour breakpoint on the shared block and the short one on the team block, in that order', () => {
    const [stable, dynamic] = systemBlocks({ stable: 'policy', dynamic: 'team' });
    expect(stable).toMatchObject({ role: 'system', content: 'policy' });
    expect(dynamic).toMatchObject({ role: 'system', content: 'team' });
    // A longer TTL may not come after a shorter one: the API refuses the request.
    expect(breakpointOf(stable as unknown as ModelMessage)).toEqual({ type: 'ephemeral', ttl: '1h' });
    expect(breakpointOf(dynamic as unknown as ModelMessage)).toEqual({ type: 'ephemeral' });
  });

  it('a single cached block carries the short breakpoint', () => {
    expect(breakpointOf(systemCached('x') as unknown as ModelMessage)).toEqual({ type: 'ephemeral' });
  });
});

describe('withTailBreakpoint', () => {
  const user = (text: string): ModelMessage => ({ role: 'user', content: [{ type: 'text', text }] });
  const assistant: ModelMessage = { role: 'assistant', content: [{ type: 'text', text: 'ok' }] };

  it('marks the last message only', () => {
    const out = withTailBreakpoint([user('a'), assistant, user('b')]);
    expect(out.map(breakpointOf)).toEqual([undefined, undefined, { type: 'ephemeral' }]);
  });

  it('moves the breakpoint forward instead of adding one per step (a request may carry four)', () => {
    const step1 = withTailBreakpoint([user('a')]);
    const step2 = withTailBreakpoint([...step1, assistant, user('tool result')]);
    const step3 = withTailBreakpoint([...step2, assistant, user('more')]);
    expect(step3.filter((m) => breakpointOf(m) !== undefined)).toHaveLength(1);
    expect(breakpointOf(step3[step3.length - 1] as ModelMessage)).toEqual({ type: 'ephemeral' });
  });

  it('keeps every other provider option and does not mutate its input', () => {
    const input: ModelMessage[] = [{ ...user('a'), providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' }, other: 1 }, vendor: { x: 1 } } }, user('b')];
    const snapshot = JSON.stringify(input);
    const out = withTailBreakpoint(input);
    expect(JSON.stringify(input)).toBe(snapshot);
    expect(out[0]?.providerOptions).toEqual({ anthropic: { other: 1 }, vendor: { x: 1 } });
    expect(breakpointOf(out[1] as ModelMessage)).toEqual({ type: 'ephemeral' });
  });

  it('an empty list stays empty', () => {
    expect(withTailBreakpoint([])).toEqual([]);
  });
});
