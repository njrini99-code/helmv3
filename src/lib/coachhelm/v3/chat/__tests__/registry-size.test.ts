import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { CoachChatContext } from '../context';
import type { ChatSurface, ChatTool, PlayerChatContext } from '../engine/tool';
import { policyBlock, rulesBlock } from '../instructions';
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

/** The tools another worker owns and TOOLS only registers (CONTEXT's, `context/**` and `tasks/**`). Their size is theirs; it counts toward the whole prefix. */
const REGISTERED_FOR_OTHERS = new Set(['find_in_app', 'save_note', 'remove_note', 'send_event_reminder', 'record_attendance', 'update_event', 'cancel_event', 'set_focus_area_status', 'set_goal_state', 'mark_signal_handled', 'set_qualifier_coach_pick', 'set_task_reminder', 'dismiss_signal', 'log_focus_progress', 'record_focus_outcome']);

function sizeOf(surface: ChatSurface, who: CoachChatContext | PlayerChatContext) {
  const tools = toolsFor(surface, who);
  const chars = (list: ChatTool[]) => list.reduce((n, t) => n + definition(t).length, 0);
  const toolChars = chars(tools);
  const ownChars = chars(tools.filter((t) => !REGISTERED_FOR_OTHERS.has(t.name)));
  const policyChars = policyBlock(surface).length;
  const rulesChars = rulesBlock(surface).length;
  return { tools: tools.length, toolTokens: tokens(toolChars), policyTokens: tokens(policyChars), total: tokens(toolChars + policyChars), rulesTokens: tokens(rulesChars), own: tokens(ownChars + rulesChars), largest: tools.map((t) => [t.name, tokens(definition(t).length)] as const).sort((a, b) => b[1] - a[1]).slice(0, 3) };
}

/**
 * The cached prefix is the tool definitions followed by the policy. Measured the same way (characters / 4, the engine's own schema
 * conversion) the previous stack was 26,063 with its 71 tools and tournaments on; the route's own note called it 39k in real tokens.
 *
 * Two ceilings. The tools this file's owner wrote, with the rules (`rulesBlock`), stay under the original 12,000: that is what keeps a new
 * tool or a long description from quietly undoing the work. Everything cached (those, the tools registered for CONTEXT, and the whole
 * policy with KNOWLEDGE's golf block and data map) stays under 21,000 (owner, 10 Nov: the model must know golf and where things are, and
 * a cached prefix is nearly free on this model).
 */
describe('the cached prefix: tool definitions and policy', () => {
  it.each([
    ['ask', coach],
    ['practice_helper', coach],
    ['quick_chat', coach],
    ['player', player],
  ] as const)('%s stays under 26,000 tokens, and its own tools and rules under 12,300', (surface, who) => {
    const size = sizeOf(surface, who);
    console.info(`prefix ${surface}: ${size.tools} tools, ${size.toolTokens} tokens of definitions + ${size.policyTokens} of policy (${size.rulesTokens} of rules, the rest golf and the data map) = ${size.total}; own tools and rules ${size.own}; largest ${size.largest.map(([n, t]) => `${n} ${t}`).join(', ')}`);
    // 12,300, the lead's allowance of 11 Nov 2026 (was 12,000, then 12,150), for the rules on how an answer is shaped, dates, bracketed
    // ids and "not tracked", and, after the first full eval run (44 of 99 answers broke a writing rule), the four-sentence limit, no
    // label or bold lead-in, no words before a read, and names as stored. Ask measures 12,233.
    expect(size.own).toBeLessThan(12_300);
    // 26,000 by the lead's decision of 10 Nov 2026 (was 21,000): the knowledge blocks carry what strokes gained means and the writing rules.
    expect(size.total).toBeLessThan(26_000);
  });

  it('holds with the tournaments flag on too (three more tools), and stays clear of 24,000, where the next step is deferring rarely used tasks behind tool search', () => {
    flags.tournaments = true;
    try {
      for (const surface of ['ask', 'quick_chat'] as const) {
        const size = sizeOf(surface, coach);
        console.info(`prefix ${surface}, tournaments on: ${size.tools} tools = ${size.total}; own tools and rules ${size.own}`);
        // The flag adds get_tournaments, set_lineup and lock_lineup (about 420 tokens): the same brake, moved by what they weigh.
        expect(size.own).toBeLessThan(12_720);
        expect(size.total).toBeLessThan(24_000);
      }
    } finally {
      flags.tournaments = false;
    }
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
