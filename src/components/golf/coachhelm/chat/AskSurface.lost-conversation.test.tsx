// @vitest-environment jsdom
/**
 * ============================================================================
 * AskSurface — "Start a new chat" under a lost conversation
 * ----------------------------------------------------------------------------
 * `?c=<id>` names a conversation the route no longer finds (404). The notice
 * offers "Start a new chat". Resetting only the chat hook left `?c=` in the
 * address bar, so a reload opened the dead thread again and hit the same error.
 * The Ask page and the Intelligence tab both mount `AskSurface`, so it owns the
 * URL; the drawer never writes one and resets the hook alone (covered in
 * `CoachHelmChat.error.test.tsx`).
 *
 * Stubs only `useChat` (the network boundary) and `ChatThread` (the chart
 * library behind it), as `AskSurface.pending-question.test.tsx` does.
 * ========================================================================== */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useChatSpy = vi.fn();

const responseBody = JSON.stringify({ error: 'Conversation not found' });
const lostConversation = Object.assign(new Error(responseBody), { statusCode: 404, responseBody });

vi.mock('@ai-sdk/react', () => ({
  useChat: (config: Record<string, unknown>) => {
    useChatSpy(config);
    return {
      messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'How is the team putting?' }] }],
      status: 'error',
      error: lostConversation,
      sendMessage: vi.fn(),
      regenerate: vi.fn(),
      stop: vi.fn(),
      setMessages: vi.fn(),
      clearError: vi.fn(),
      addToolApprovalResponse: vi.fn(),
    };
  },
}));

vi.mock('./ChatThread', () => ({ ChatThread: () => null }));

async function importAskSurface() {
  const { AskSurface } = await import('./AskSurface');
  return AskSurface;
}

const baseProps = {
  teamName: 'Wildcats',
  players: [],
  suggestions: [],
  conversations: [],
  conversationId: 'conv-1' as string | null,
  initialMessages: [],
  pulseItems: [],
  asOfLabel: null,
  coverage: null,
  pendingQuestion: null,
};

const search = () => new URL(window.location.href).searchParams;

describe('AskSurface — Start a new chat', () => {
  beforeEach(() => {
    useChatSpy.mockClear();
    window.HTMLElement.prototype.scrollTo = vi.fn();
  });

  it('drops `c` from the address bar, so a reload does not reopen the lost conversation', async () => {
    window.history.pushState({}, '', '/golf/dashboard/coachhelm/chat?c=conv-1');
    const AskSurface = await importAskSurface();
    render(<AskSurface {...baseProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Start a new chat' }));

    expect(search().has('c')).toBe(false);
    expect(window.location.pathname).toBe('/golf/dashboard/coachhelm/chat');
  });

  it('mounts a fresh, empty thread', async () => {
    window.history.pushState({}, '', '/golf/dashboard/coachhelm/chat?c=conv-1');
    const AskSurface = await importAskSurface();
    render(<AskSurface {...baseProps} initialMessages={[{ id: 'old', role: 'user', parts: [] } as never]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Start a new chat' }));

    const config = useChatSpy.mock.calls.at(-1)![0] as { messages?: unknown[] };
    expect(config.messages).toEqual([]);
  });

  it('embedded in the Intelligence tab, keeps the tab and drops only the conversation', async () => {
    window.history.pushState({}, '', '/golf/dashboard/intelligence?view=chat&c=conv-1');
    const AskSurface = await importAskSurface();
    render(
      <AskSurface
        {...baseProps}
        embed={{
          offset: '0px',
          newHref: '/golf/dashboard/intelligence?view=chat',
          conversationHref: (id: string) => `/golf/dashboard/intelligence?view=chat&c=${id}`,
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Start a new chat' }));

    expect(search().has('c')).toBe(false);
    expect(search().get('view')).toBe('chat');
  });
});
