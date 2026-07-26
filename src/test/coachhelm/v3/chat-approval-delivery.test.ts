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

/**
 * Capture the transport's request builder.
 *
 * `DefaultChatTransport` keeps its constructor options private, so the only way
 * to see the `client_turn_id` a request would carry is to stand in for the
 * class. Everything else from `ai` stays REAL — the approval-predicate tests
 * above assert against the SDK's own implementation, and mocking the module
 * wholesale would quietly turn those into tests of a stub.
 */
let capturedPrepare:
  | ((o: { messages: unknown[] }) => { body?: { client_turn_id?: string } })
  | undefined;

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    DefaultChatTransport: class {
      constructor(options: {
        prepareSendMessagesRequest?: (o: { messages: unknown[] }) => {
          body?: { client_turn_id?: string };
        };
      }) {
        capturedPrepare = options.prepareSendMessagesRequest;
      }
    },
  };
});

const useChatSpy = vi.fn();
const approvalResponseSpy = vi.fn();
const sendMessageSpy = vi.fn();
const regenerateSpy = vi.fn();

vi.mock('@ai-sdk/react', () => ({
  useChat: (config: Record<string, unknown>) => {
    useChatSpy(config);
    return {
      messages: [],
      status: 'ready',
      error: undefined,
      sendMessage: sendMessageSpy,
      regenerate: regenerateSpy,
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
    sendMessageSpy.mockClear();
    regenerateSpy.mockClear();
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

/**
 * Retry shipped to production as a re-SEND, and a coach pressing "Try again"
 * six times against a failing model left SIX identical copies of their question
 * in the conversation — each written to the database under its own
 * `client_turn_id`, none of them answered.
 *
 * Two things had to be true for that to happen, and both are pinned here: retry
 * must not append a user message, and it must carry the failed turn's key so
 * the server UPDATEs that row instead of inserting a new one.
 */
describe('CoachHelm chat — retry', () => {
  beforeEach(() => {
    useChatSpy.mockClear();
    sendMessageSpy.mockClear();
    regenerateSpy.mockClear();
  });

  it('regenerates the turn rather than sending the question again', async () => {
    const { useCoachHelmChat } = await import(
      '@/components/golf/coachhelm/chat/useCoachHelmChat'
    );
    const { result } = renderHook(() => useCoachHelmChat());

    result.current.send('how is the team putting?');
    sendMessageSpy.mockClear();

    result.current.retry();

    expect(regenerateSpy).toHaveBeenCalledTimes(1);
    // The duplicate-question bug in one assertion.
    expect(sendMessageSpy).not.toHaveBeenCalled();
  });

  it('retries under the question\'s own turn key, not a fresh one', async () => {
    const { useCoachHelmChat } = await import(
      '@/components/golf/coachhelm/chat/useCoachHelmChat'
    );
    const { result } = renderHook(() => useCoachHelmChat());

    const prepare = () => capturedPrepare?.({ messages: [] })?.body?.client_turn_id;

    result.current.send('how is the team putting?');
    const askedUnder = prepare();
    // Guard against a vacuous pass: if the transport does not expose the
    // request builder, `prepare()` is undefined on both sides and the
    // comparison below would succeed while testing nothing.
    expect(askedUnder).toEqual(expect.any(String));

    // The turn finishes (or fails) — the hook rotates its key for the next
    // question. A retry has to go back, or the server sees a new turn.
    (lastConfig().onFinish as ((o: Record<string, unknown>) => void) | undefined)?.({});
    result.current.retry();

    expect(prepare()).toBe(askedUnder);
  });
});
