import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

/**
 * The failure this guards against, concretely:
 *
 *   coach asks for a focus area → CoachHelm proposes it and suspends for
 *   approval → coach presses Confirm → NOTHING HAPPENS.
 *
 * Not an error, not a toast, not a spinner. `addToolApprovalResponse` writes the
 * answer into local message state and returns; if no `sendAutomaticallyWhen`
 * predicate is configured, the thread is never resubmitted, so the suspended
 * tool call is never resumed and the action never runs.
 *
 * It shipped to production and stayed invisible for hours precisely because it
 * is silent. The only trace was in `golf_coachhelm_action_runs`: rows sitting at
 * `status='proposed'` with `decided_at` NULL and `error_message` NULL — the
 * signature of a decision that was taken but never delivered.
 *
 * Two tools, three hours apart, both stuck the same way. Nothing in the suite
 * caught it, because every existing chat test exercises the layers BELOW the
 * transport — the tool bodies, the idempotency claim, the receipts — all of
 * which were correct. The break was that nothing ever called them.
 *
 * So this test asserts the one thing that was missing: that approving is wired
 * to a resubmit, and that the predicate governing it is the approval-specific
 * one.
 */

const useChatSpy = vi.fn();
const approvalResponseSpy = vi.fn();

vi.mock('@ai-sdk/react', () => ({
  useChat: (config: Record<string, unknown>) => {
    useChatSpy(config);
    return {
      messages: [],
      status: 'ready',
      error: undefined,
      sendMessage: vi.fn(),
      stop: vi.fn(),
      setMessages: vi.fn(),
      addToolApprovalResponse: approvalResponseSpy,
    };
  },
}));

type Predicate = (options: { messages: unknown[] }) => boolean;

/** The config object the hook handed to `useChat` on its last render. */
function lastConfig(): Record<string, unknown> {
  const call = useChatSpy.mock.calls.at(-1);
  if (!call) throw new Error('useChat was never called');
  return call[0] as Record<string, unknown>;
}

/**
 * An assistant message whose tool call is waiting on the coach, in the shape the
 * SDK produces between the proposal and the answer.
 */
function pendingApproval() {
  return {
    id: 'm1',
    role: 'assistant' as const,
    parts: [
      {
        type: 'tool-create_focus_area',
        toolCallId: 'call_1',
        state: 'approval-requested',
        approval: { id: 'appr_1', state: 'requested' },
      },
    ],
  };
}

/** The same message once Confirm has been pressed. */
function answeredApproval() {
  return {
    id: 'm1',
    role: 'assistant' as const,
    parts: [
      {
        type: 'tool-create_focus_area',
        toolCallId: 'call_1',
        state: 'approval-responded',
        approval: { id: 'appr_1', state: 'responded', approved: true },
      },
    ],
  };
}

describe('CoachHelm chat — approval delivery', () => {
  beforeEach(() => {
    useChatSpy.mockClear();
    approvalResponseSpy.mockClear();
  });

  it('configures a resubmit trigger, so Confirm reaches the server', async () => {
    const { useCoachHelmChat } = await import(
      '@/components/golf/coachhelm/chat/useCoachHelmChat'
    );
    renderHook(() => useCoachHelmChat());

    // The whole bug in one assertion: without this key, approving is inert.
    expect(lastConfig().sendAutomaticallyWhen).toBeTypeOf('function');
  });

  it('does not resubmit while an approval is still unanswered', async () => {
    const { useCoachHelmChat } = await import(
      '@/components/golf/coachhelm/chat/useCoachHelmChat'
    );
    renderHook(() => useCoachHelmChat());

    const predicate = lastConfig().sendAutomaticallyWhen as Predicate;
    expect(predicate({ messages: [pendingApproval()] })).toBe(false);
  });

  it('resubmits once every approval in the step has an answer', async () => {
    const { useCoachHelmChat } = await import(
      '@/components/golf/coachhelm/chat/useCoachHelmChat'
    );
    renderHook(() => useCoachHelmChat());

    const predicate = lastConfig().sendAutomaticallyWhen as Predicate;
    expect(predicate({ messages: [answeredApproval()] })).toBe(true);
  });

  /**
   * The second half of the same outage, and the harder one to see.
   *
   * `addToolApprovalResponse` keys on `id` — the approval's own id. It was
   * called with `{ toolCallId }`, so `id` arrived undefined, no pending approval
   * matched, and the call did nothing. TypeScript did not object: `ai-shim.d.ts`
   * shadows the real `ai` types, `@ai-sdk/react` resolves `AbstractChat` through
   * that shim, and the `chat` object degrades to a loosely-typed surface where
   * any argument shape passes. These two assertions are the type-check the
   * compiler cannot perform.
   */
  it('answers an approval by its approval id, not the tool-call id', async () => {
    const { useCoachHelmChat } = await import(
      '@/components/golf/coachhelm/chat/useCoachHelmChat'
    );
    const { result } = renderHook(() => useCoachHelmChat());

    result.current.approve('appr_1');

    expect(approvalResponseSpy).toHaveBeenCalledWith({ id: 'appr_1', approved: true });
    expect(approvalResponseSpy.mock.calls[0]?.[0]).not.toHaveProperty('toolCallId');
  });

  it('denies by approval id too', async () => {
    const { useCoachHelmChat } = await import(
      '@/components/golf/coachhelm/chat/useCoachHelmChat'
    );
    const { result } = renderHook(() => useCoachHelmChat());

    result.current.deny('appr_1');

    expect(approvalResponseSpy).toHaveBeenCalledWith({ id: 'appr_1', approved: false });
  });
});
