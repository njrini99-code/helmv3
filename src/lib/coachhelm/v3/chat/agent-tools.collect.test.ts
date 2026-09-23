import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CoachChatContext } from './context';
import type { ClaimResult } from './action-runs';

/**
 * #1997 review, MUST-1(b): `proposeGated`/`executeGated` (and
 * `create_recurring_practice`, which duplicates their shape instead of using
 * them — see `GatedAction`'s doc comment in agent-tools.ts) never called
 * `collect`. A proposal or receipt is prose the model itself wrote, and it is
 * entitled to restate its own numbers in the reply ("3 sessions of 90
 * minutes") — but with nothing registering those numbers as supported,
 * `auditNumericClaims` treated anything above 12 as a fabrication and
 * rejected the whole turn, hiding the Confirm card (live) or the receipt
 * (after execute already ran) behind an unrelated "ungrounded claim" note.
 *
 * This is a regression test at the unit level: it proves `collect` receives
 * an envelope carrying the proposal's/receipt's own numbers, not that the
 * numeric audit itself passes (that's `chat-provenance.test.ts` and the
 * route-level suite in `route.test.ts`).
 */

const recordProposal = vi.fn(async () => {});
const claimForExecution = vi.fn(async (): Promise<ClaimResult> => ({ kind: 'claimed', run_id: 'run-1' }));
const recordOutcome = vi.fn(async () => {});

vi.mock('./action-runs', () => ({
  recordProposal: (...args: unknown[]) => recordProposal(...(args as [])),
  claimForExecution: (...args: unknown[]) => claimForExecution(...(args as [])),
  recordOutcome: (...args: unknown[]) => recordOutcome(...(args as [])),
  recordDenial: vi.fn(async () => {}),
}));

const planTask = vi.fn();
const executeTask = vi.fn();
const planFocusArea = vi.fn();
const executeFocusArea = vi.fn();
const planAnnouncement = vi.fn();
const executeAnnouncement = vi.fn();

vi.mock('./action-planners', () => ({
  ActionPlanError: class ActionPlanError extends Error {},
  planFocusArea: (...args: unknown[]) => planFocusArea(...args),
  executeFocusArea: (...args: unknown[]) => executeFocusArea(...args),
  planTask: (...args: unknown[]) => planTask(...args),
  executeTask: (...args: unknown[]) => executeTask(...args),
  planAnnouncement: (...args: unknown[]) => planAnnouncement(...args),
  executeAnnouncement: (...args: unknown[]) => executeAnnouncement(...args),
}));

const planRecurringPractice = vi.fn();
const executeRecurringPractice = vi.fn();

vi.mock('./practice-planner', () => ({
  planRecurringPractice: (...args: unknown[]) => planRecurringPractice(...args),
  executeRecurringPractice: (...args: unknown[]) => executeRecurringPractice(...args),
  PracticePlanError: class PracticePlanError extends Error {},
}));

import { buildCoachTools } from './agent-tools';

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

function baseProposal(overrides: Record<string, unknown> = {}) {
  return {
    action: 'Create a task',
    summary: '3 sessions of 90 minutes',
    facts: [{ label: 'Duration', value: '90 minutes' }],
    affects: [],
    notifications: [],
    missing: [],
    idempotency_key: 'key-1',
    ...overrides,
  };
}

function baseReceipt(overrides: Record<string, unknown> = {}) {
  return {
    status: 'completed' as const,
    action: 'Create a task',
    summary: 'Assigned 90 minutes of extra reps',
    created: [{ kind: 'task', count: 1, label: '90 minutes of extra reps' }],
    notifications: [],
    partial_failures: [],
    retryable: true,
    at: '2026-09-23T00:00:00.000Z',
    ...overrides,
  };
}

describe('agent-tools — gated-action numbers reach the claim audit', () => {
  beforeEach(() => {
    recordProposal.mockClear();
    claimForExecution.mockReset().mockResolvedValue({ kind: 'claimed', run_id: 'run-1' });
    recordOutcome.mockClear();
    planTask.mockReset();
    executeTask.mockReset();
    planRecurringPractice.mockReset();
    executeRecurringPractice.mockReset();
  });

  it('routes a proposeGated proposal through collect before the Confirm card is written', async () => {
    planTask.mockReturnValue({ plan: { title: 'Extra reps' }, proposal: baseProposal() });
    const collect = vi.fn();
    const writer = { write: vi.fn() };
    const tools = buildCoachTools({
      sb: {} as never,
      ctx: ctx(),
      conversationId: 'conv-1',
      writer: writer as never,
      collect,
    });

    await tools.create_task!.onInputAvailable!({ input: {} } as never);

    expect(collect).toHaveBeenCalledTimes(1);
    const envelope = collect.mock.calls[0]![0] as {
      summary?: string;
      detail?: { facts?: { label: string; value: string }[] };
    };
    // Scoped to the proposal's own `summary`/`facts` — the card's actual
    // user-facing content (#1997 re-review, should-fix) — never the whole
    // `{plan, proposal}` object.
    expect(envelope.summary).toBe('3 sessions of 90 minutes');
    expect(envelope.detail?.facts).toEqual([{ label: 'Duration', value: '90 minutes' }]);
    // collect must run BEFORE the Confirm card itself is streamed — a coach
    // approving off a stale numeric-audit state is the exact bug this closes.
    // (`writer.write` also fires earlier, for the `data-progress` part —
    // that one doesn't matter here, only the proposal write does.)
    const proposalWriteOrder = writer.write.mock.invocationCallOrder[
      writer.write.mock.calls.findIndex((c) => (c[0] as { type?: string }).type === 'data-action-proposal')
    ];
    expect(collect.mock.invocationCallOrder[0]).toBeLessThan(proposalWriteOrder!);
  });

  it('routes an executeGated receipt through collect, scoped to created/notifications, including on the already-completed replay path', async () => {
    planTask.mockReturnValue({ plan: { title: 'Extra reps' }, proposal: baseProposal({ idempotency_key: 'key-2' }) });
    executeTask.mockResolvedValue(baseReceipt());
    const collect = vi.fn();
    const tools = buildCoachTools({
      sb: {} as never,
      ctx: ctx(),
      conversationId: 'conv-1',
      writer: { write: vi.fn() } as never,
      collect,
    });

    await tools.create_task!.execute!({} as never, {} as never);

    const call = collect.mock.calls.find(
      (c) => (c[0] as { summary?: string }).summary === 'Assigned 90 minutes of extra reps',
    );
    expect(call).toBeDefined();
    const envelope = call![0] as { detail: { created: unknown; notifications: unknown } };
    expect(envelope.detail.created).toEqual([
      { kind: 'task', count: 1, label: '90 minutes of extra reps' },
    ]);
    expect(envelope.detail.notifications).toEqual([]);
    // Never the whole receipt object (which also carries `status`/`at`/
    // `retryable` — none of that is what the coach reads as a number).
    expect(envelope.detail).not.toHaveProperty('status');
  });

  it('also routes an already-completed replay receipt through collect (not just a fresh run)', async () => {
    planTask.mockReturnValue({ plan: { title: 'Extra reps' }, proposal: baseProposal({ idempotency_key: 'key-3' }) });
    claimForExecution.mockResolvedValue({
      kind: 'already_completed',
      receipt: baseReceipt({ summary: 'Already assigned 90 minutes of extra reps' }),
    });
    const collect = vi.fn();
    const tools = buildCoachTools({
      sb: {} as never,
      ctx: ctx(),
      conversationId: 'conv-1',
      writer: { write: vi.fn() } as never,
      collect,
    });

    await tools.create_task!.execute!({} as never, {} as never);

    expect(collect).toHaveBeenCalledWith(
      expect.objectContaining({ summary: 'Already assigned 90 minutes of extra reps' }),
    );
  });

  it('routes create_recurring_practice — which duplicates proposeGated/executeGated instead of using them — through collect too', async () => {
    planRecurringPractice.mockReturnValue({
      plan: { occurrence_count: 8, occurrence_dates: [] },
      proposal: baseProposal({
        action: 'Create a recurring practice',
        summary: '8 practices, every Tuesday at 90 minutes each',
        facts: [{ label: 'Occurrences', value: '8' }],
        idempotency_key: 'key-4',
      }),
    });
    const collect = vi.fn();
    const tools = buildCoachTools({
      sb: {} as never,
      ctx: ctx(),
      conversationId: 'conv-1',
      writer: { write: vi.fn() } as never,
      collect,
    });

    await tools.create_recurring_practice!.onInputAvailable!({ input: {} } as never);

    expect(collect).toHaveBeenCalledTimes(1);
    const envelope = collect.mock.calls[0]![0] as { summary?: string };
    expect(envelope.summary).toBe('8 practices, every Tuesday at 90 minutes each');
  });

  /**
   * #1997 re-review, should-fix: the first version of this fix passed the
   * whole `{plan, proposal}`/`{plan, receipt}` object to `collect`, so an
   * internal-only numeric field on `plan` — never rendered on the card,
   * never in `facts`/`created`/`notifications` — would still land in the
   * turn's supported-number pool. A FABRICATED stat elsewhere in the same
   * prose that happened to equal that internal number would then be wrongly
   * treated as grounded. Scoping `collectActionNumbers` to only
   * `summary`/`facts` (proposal) or `summary`/`created`/`notifications`
   * (receipt) closes this: the internal field must not appear anywhere in
   * what `collect` receives.
   */
  it('a fabricated stat matching an internal-only plan field is not silently supported — the plan is never passed to collect', async () => {
    planTask.mockReturnValue({
      // `internal_batch_size` is realistic-shaped internal bookkeeping: never
      // surfaced in `facts`, `summary`, or anywhere else the coach can read.
      plan: { title: 'Extra reps', internal_batch_size: 47 },
      proposal: baseProposal({ facts: [{ label: 'Duration', value: '90 minutes' }] }),
    });
    const collect = vi.fn();
    const tools = buildCoachTools({
      sb: {} as never,
      ctx: ctx(),
      conversationId: 'conv-1',
      writer: { write: vi.fn() } as never,
      collect,
    });

    await tools.create_task!.onInputAvailable!({ input: {} } as never);

    expect(collect).toHaveBeenCalledTimes(1);
    const envelope = collect.mock.calls[0]![0] as Record<string, unknown>;
    // The internal field must not appear anywhere collect() sees — not as a
    // top-level field, not nested in `detail`. Scoped to `detail` (rather
    // than the whole envelope) so this doesn't false-positive on `as_of`'s
    // own timestamp digits incidentally containing "47".
    expect(JSON.stringify(envelope.detail)).not.toContain('internal_batch_size');
    expect(JSON.stringify(envelope.detail)).not.toContain('47');
  });
});
