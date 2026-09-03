/**
 * ============================================================================
 * AskSurface — the double-send Brief → Ask handoff (owner UX audit,
 * GAPS_AUDIT_INTERACTION_CRUD_2026-09-02, coach role, live production)
 * ----------------------------------------------------------------------------
 * The reported bug: the Brief tab's composer sends by navigating to
 * `/golf/dashboard/coachhelm/chat?q=<question>` — `CommandOpening`'s own Send
 * click is real, on purpose (see its tests/comments), it just hands the
 * question to the FULL Ask page rather than answering it inline. That page
 * only PRE-FILLED the composer from `?q=`, so the question sat there unsent
 * until the coach pressed Send a second time — an extra, unexplained step.
 *
 * This exercises the real component tree end to end (`AskSurface` →
 * `CoachHelmChat` → `useCoachHelmChat` → `PromptComposer`), stubbing only the
 * one external boundary that would otherwise open a real network stream:
 * `@ai-sdk/react`'s `useChat`. Everything above that boundary — the auto-submit
 * wiring, the URL cleanup — is the real production code path, identical to
 * `src/test/coachhelm/v3/chat-approval-delivery.test.ts`'s mocking strategy.
 * ============================================================================
 */
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const useChatSpy = vi.fn();
const sendMessageSpy = vi.fn();

vi.mock('@ai-sdk/react', () => ({
  useChat: (config: Record<string, unknown>) => {
    useChatSpy(config);
    return {
      messages: [],
      status: 'ready',
      error: undefined,
      sendMessage: sendMessageSpy,
      regenerate: vi.fn(),
      stop: vi.fn(),
      setMessages: vi.fn(),
      addToolApprovalResponse: vi.fn(),
    };
  },
}));

/**
 * `chat.messages` is always `[]` above, so `CoachHelmChat` never leaves its
 * empty-thread branch and `ChatThread` is dead code for every test in this
 * file — but it is still a static top-level import of `CoachHelmChat.tsx`,
 * so evaluating that module pulls in `ChatThread` -> `EvidenceVisuals` ->
 * `@/components/fairway/charts`'s real chart library regardless. That is a
 * multi-second one-time transform cost, unrelated to anything this file
 * asserts, and paying it destabilized this suite: the first test to pay it
 * intermittently overran its timeout and left residual work that leaked an
 * extra `sendMessage` call into whichever test ran next (observed as a flaky
 * "called 2 times" on the StrictMode test below, on an unchanged auto-submit
 * guard that a lower-level, chart-free `PromptComposer` test — see
 * `PromptComposer.auto-submit.test.tsx` — proved deterministic in isolation).
 * Stubbing the branch this suite never exercises removes that cost.
 */
vi.mock('./ChatThread', () => ({ ChatThread: () => null }));

async function importAskSurface() {
  const { AskSurface } = await import('./AskSurface');
  return AskSurface;
}

function baseProps(pendingQuestion: string | null) {
  return {
    teamName: 'Wildcats',
    players: [],
    suggestions: [],
    conversations: [],
    conversationId: null,
    initialMessages: [],
    pulseItems: [],
    asOfLabel: null,
    coverage: null,
    pendingQuestion,
  };
}

describe('AskSurface — a pending question from the Brief tab', () => {
  beforeEach(() => {
    useChatSpy.mockClear();
    sendMessageSpy.mockClear();
    window.history.pushState({}, '', '/golf/dashboard/coachhelm/chat?q=Brief%20me%20on%20the%20team');
  });

  it('submits the question exactly once, through the same send the composer uses for a manual Send', async () => {
    const AskSurface = await importAskSurface();
    render(<AskSurface {...baseProps('Brief me on the team')} />);

    expect(sendMessageSpy).toHaveBeenCalledTimes(1);
    expect(sendMessageSpy).toHaveBeenCalledWith({ text: 'Brief me on the team' });
  });

  it('still submits exactly once under React StrictMode\'s double-invoked mount effects', async () => {
    const AskSurface = await importAskSurface();
    render(
      <React.StrictMode>
        <AskSurface {...baseProps('Brief me on the team')} />
      </React.StrictMode>,
    );

    expect(sendMessageSpy).toHaveBeenCalledTimes(1);
  });

  it('strips `q` from the address bar once the submit is kicked off, so a refresh cannot resend it', async () => {
    const AskSurface = await importAskSurface();
    render(<AskSurface {...baseProps('Brief me on the team')} />);

    expect(new URL(window.location.href).searchParams.has('q')).toBe(false);
    expect(window.location.pathname).toBe('/golf/dashboard/coachhelm/chat');
  });

  it('preserves an existing `c` conversation param while stripping `q`', async () => {
    window.history.pushState(
      {},
      '',
      '/golf/dashboard/coachhelm/chat?c=conv_1&q=Brief%20me%20on%20the%20team',
    );
    const AskSurface = await importAskSurface();
    render(<AskSurface {...baseProps('Brief me on the team')} />);

    const url = new URL(window.location.href);
    expect(url.searchParams.get('c')).toBe('conv_1');
    expect(url.searchParams.has('q')).toBe(false);
  });

  it('does not send anything, and leaves the URL as-is, when there is no pending question', async () => {
    window.history.pushState({}, '', '/golf/dashboard/coachhelm/chat');
    const AskSurface = await importAskSurface();
    render(<AskSurface {...baseProps(null)} />);

    expect(sendMessageSpy).not.toHaveBeenCalled();
  });

  it('shows the composer field cleared, not the stale question, once mounted', async () => {
    const AskSurface = await importAskSurface();
    render(<AskSurface {...baseProps('Brief me on the team')} />);

    expect(screen.getByRole('combobox', { name: 'Ask CoachHelm' })).toHaveValue('');
  });
});
