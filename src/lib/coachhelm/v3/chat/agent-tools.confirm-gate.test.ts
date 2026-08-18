import { describe, it, expect, vi } from 'vitest';
import { buildCoachTools, isConfirmRequired } from './agent-tools';
import type { CoachChatContext } from './context';

/**
 * Every mutating chat tool must be confirmation-gated.
 *
 * `isConfirmRequired` is an allowlist of four names. It is correct today — the
 * agent exposes exactly four mutating tools and all four are listed — and it
 * had no test of any kind, which is the whole exposure: the list and the tool
 * set are two places that have to agree, and nothing made them.
 *
 * A fifth mutating tool added without a matching entry does not fail loudly. It
 * executes on the model's say-so, without the `action-proposal` part the coach
 * approves, and the first anyone knows is a task, announcement or recurring
 * practice appearing that nobody confirmed. Announcements in particular go out
 * to the whole roster.
 *
 * TO BE CLEAR ABOUT WHAT THIS IS: no such gap exists right now. This is a drift
 * guard, not a bug fix — it turns "someone has to remember" into a failing
 * test, on a safety property where the failure is silent and outward-facing.
 *
 * The naming convention is the contract being enforced. A mutating tool is
 * named `create_*` / `update_*` / `delete_*`; if a future mutation is named
 * something else, this test cannot see it, so the convention is asserted
 * explicitly below rather than left implicit.
 */

const READ_ONLY_PREFIXES = ['find_', 'get_', 'compare_'] as const;
const MUTATION_PREFIXES = ['create_', 'update_', 'delete_', 'remove_', 'send_'] as const;

function ctx(): CoachChatContext {
  return {
    coach_id: 'c1',
    user_id: 'u1',
    team_id: 'team-1',
    team_name: 'Rini University',
    timezone: 'America/New_York',
    roster: [],
  };
}

/** Tool names only — no handler is invoked, so the stubs never have to work. */
function toolNames(): string[] {
  const tools = buildCoachTools({
    sb: { from: vi.fn() } as never,
    ctx: ctx(),
    conversationId: null,
    writer: { write: vi.fn() } as never,
    collect: vi.fn(),
  });
  return Object.keys(tools);
}

describe('CoachChat tool confirmation gate', () => {
  it('gates every mutating tool behind an explicit approval', () => {
    const mutating = toolNames().filter((n) => MUTATION_PREFIXES.some((p) => n.startsWith(p)));

    // If this trips, the agent grew a mutation and the assertions below cannot
    // be trusted to mean anything.
    expect(mutating.length, 'expected the agent to expose mutating tools').toBeGreaterThan(0);

    const ungated = mutating.filter((n) => !isConfirmRequired(n));
    expect(
      ungated,
      `these mutating tools would execute without coach approval: ${ungated.join(', ')}`,
    ).toEqual([]);
  });

  it('never gates a read tool, which would make the agent ask permission to look something up', () => {
    const reads = toolNames().filter((n) => READ_ONLY_PREFIXES.some((p) => n.startsWith(p)));
    const gated = reads.filter((n) => isConfirmRequired(n));
    expect(gated, `read tools should not require confirmation: ${gated.join(', ')}`).toEqual([]);
  });

  it('every name on the confirm list is a tool that actually exists', () => {
    // A rename that misses the allowlist leaves a dead entry, and the real tool
    // silently ungated — the same failure as forgetting to add one.
    const names = toolNames();
    for (const n of names.filter(isConfirmRequired)) {
      expect(names).toContain(n);
    }
    const gatedCount = names.filter(isConfirmRequired).length;
    const mutatingCount = names.filter((n) => MUTATION_PREFIXES.some((p) => n.startsWith(p))).length;
    expect(gatedCount).toBe(mutatingCount);
  });

  it('classifies every exposed tool as either a read or a mutation', () => {
    // The prefix convention is what the first test relies on. A tool matching
    // neither set is invisible to this guard, so it fails here instead.
    const unclassified = toolNames().filter(
      (n) =>
        !READ_ONLY_PREFIXES.some((p) => n.startsWith(p)) &&
        !MUTATION_PREFIXES.some((p) => n.startsWith(p)),
    );
    expect(
      unclassified,
      `unclassified tool names are not covered by the confirmation guard: ${unclassified.join(', ')}`,
    ).toEqual([]);
  });
});
