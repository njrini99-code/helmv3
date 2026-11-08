import type { ModelMessage, SystemModelMessage } from 'ai';

/**
 * Prompt-cache layout for an Ask turn (Anthropic orders the request tools, then system, then messages; a breakpoint caches everything before it).
 *
 * Three breakpoints, longest-lived first (a longer TTL may not come after a shorter one):
 *  1. the end of the STABLE system prompt, one hour. Tool definitions and policy are the same bytes for every team and coach, so one entry serves
 *     them all instead of every team paying its own write after five idle minutes. A write costs twice a plain input token, a read a tenth.
 *  2. the end of the DYNAMIC system block (team, roster, date, standing notes), five minutes. A second conversation of the same team reads it.
 *  3. the end of the last message, moved forward on every step ({@link withTailBreakpoint}), so a step pays only for what the step before it added
 *     and the next turn of the thread reads this turn's whole conversation.
 */
const STABLE_CACHE = { anthropic: { cacheControl: { type: 'ephemeral', ttl: '1h' } } } as const;
const SHORT_CACHE = { anthropic: { cacheControl: { type: 'ephemeral' } } } as const;

export function systemBlocks(blocks: { stable: string; dynamic: string }): SystemModelMessage[] {
  return [
    { role: 'system', content: blocks.stable, providerOptions: STABLE_CACHE },
    { role: 'system', content: blocks.dynamic, providerOptions: SHORT_CACHE },
  ];
}

/** One system block with a five-minute breakpoint, for a prompt that is the same bytes only within one person's session (the player's Ask). */
export function systemCached(content: string): SystemModelMessage {
  return { role: 'system', content, providerOptions: SHORT_CACHE };
}

/** True when a message already carries a cache breakpoint of ours. */
function hasBreakpoint(m: ModelMessage): boolean {
  const o = (m.providerOptions as { anthropic?: { cacheControl?: unknown } } | undefined)?.anthropic;
  return Boolean(o && 'cacheControl' in o);
}

function withoutBreakpoint(m: ModelMessage): ModelMessage {
  const options = m.providerOptions as { anthropic?: Record<string, unknown> } | undefined;
  if (!options?.anthropic || !('cacheControl' in options.anthropic)) return m;
  const { cacheControl: _drop, ...rest } = options.anthropic;
  const { anthropic: _a, ...others } = options;
  const providerOptions = { ...others, ...(Object.keys(rest).length ? { anthropic: rest } : {}) };
  return { ...m, providerOptions } as ModelMessage;
}

/**
 * The same messages with exactly one breakpoint, on the last. Breakpoints from an earlier step are cleared (a request may carry four), so a
 * long turn never runs out.
 */
export function withTailBreakpoint(messages: ModelMessage[]): ModelMessage[] {
  if (messages.length === 0) return messages;
  const cleared = messages.some(hasBreakpoint) ? messages.map(withoutBreakpoint) : [...messages];
  const last = cleared[cleared.length - 1] as ModelMessage;
  cleared[cleared.length - 1] = { ...last, providerOptions: { ...(last.providerOptions ?? {}), anthropic: { ...((last.providerOptions as { anthropic?: object } | undefined)?.anthropic ?? {}), cacheControl: { type: 'ephemeral' } } } } as ModelMessage;
  return cleared;
}
