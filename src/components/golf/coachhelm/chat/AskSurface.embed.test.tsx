/**
 * AskSurface hosted as the CoachHelm page's Chat tab
 * (`/golf/dashboard/intelligence?view=chat`).
 *
 * The page re-renders its server component after any `router.refresh()` (a
 * Lab action, a scan), and by then the URL carries the conversation this
 * surface minted. Remounting the thread on that id would throw away a reply
 * that is still streaming, so the minted conversation keeps its thread. A
 * history link still opens another conversation, and "New" still starts an
 * empty one, including when the host never saw the minted id as a prop.
 *
 * `CoachHelmChat` is stubbed to count mounts: what this file asserts is which
 * thread AskSurface mounts, not what a thread renders.
 */
import * as React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UIMessage } from 'ai';

const h = vi.hoisted(() => ({
  mounts: [] as Array<{ conversationId: string | null; messageCount: number }>,
  adopt: undefined as undefined | ((id: string) => void),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    onClick,
    children,
    ...rest
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a
      href={href}
      {...rest}
      onClick={(event) => {
        onClick?.(event);
        event.preventDefault();
      }}
    >
      {children}
    </a>
  ),
}));

vi.mock('./CoachHelmChat', () => ({
  CoachHelmChat: (props: {
    conversationId?: string | null;
    initialMessages?: unknown[];
    onConversationId?: (id: string) => void;
  }) => {
    h.adopt = props.onConversationId;
    React.useEffect(() => {
      h.mounts.push({ conversationId: props.conversationId ?? null, messageCount: props.initialMessages?.length ?? 0 });
      // Mount-only: the count of mounts is the assertion.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return <div data-testid="thread" />;
  },
}));

const CHAT = '/golf/dashboard/intelligence?view=chat';

const message: UIMessage = { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Who is losing strokes putting?' }] };

function props(conversationId: string | null, initialMessages: UIMessage[] = []) {
  return {
    teamName: 'Demo University',
    players: [],
    suggestions: [],
    conversations: [],
    conversationId,
    initialMessages,
    pulseItems: [],
    asOfLabel: null,
    coverage: null,
    embed: {
      offset: '0px',
      newHref: CHAT,
      conversationHref: (id: string) => `${CHAT}&c=${encodeURIComponent(id)}`,
    },
  };
}

async function importAskSurface() {
  const { AskSurface } = await import('./AskSurface');
  return AskSurface;
}

describe('AskSurface embedded in the Chat tab', () => {
  beforeEach(() => {
    h.mounts.length = 0;
    h.adopt = undefined;
    window.history.replaceState(null, '', CHAT);
  });

  it('keeps the thread it minted when the host re-renders with that conversation', async () => {
    const AskSurface = await importAskSurface();
    const { rerender } = render(<AskSurface {...props(null)} />);
    expect(h.mounts).toHaveLength(1);

    act(() => h.adopt?.('conv-1'));
    expect(new URLSearchParams(window.location.search).get('c')).toBe('conv-1');
    expect(new URLSearchParams(window.location.search).get('view')).toBe('chat');

    // A router.refresh() elsewhere on the page: the server now reads `c`.
    rerender(<AskSurface {...props('conv-1', [message])} />);
    expect(h.mounts).toHaveLength(1);
  });

  it('opens another conversation from the history rail', async () => {
    const AskSurface = await importAskSurface();
    const { rerender } = render(<AskSurface {...props(null)} />);
    act(() => h.adopt?.('conv-1'));

    rerender(<AskSurface {...props('conv-2', [message])} />);
    expect(h.mounts).toHaveLength(2);
    expect(h.mounts[1]).toEqual({ conversationId: 'conv-2', messageCount: 1 });
  });

  it('starts an empty thread on "New", even when the host never saw the minted id', async () => {
    const AskSurface = await importAskSurface();
    const { rerender } = render(<AskSurface {...props(null)} />);
    act(() => h.adopt?.('conv-1'));

    fireEvent.click(screen.getByRole('link', { name: 'New' }));
    expect(h.mounts).toHaveLength(2);
    expect(h.mounts[1]).toEqual({ conversationId: null, messageCount: 0 });

    // The navigation lands on an id-less URL: same prop, no second remount.
    rerender(<AskSurface {...props(null)} />);
    expect(h.mounts).toHaveLength(2);
  });

  it('starts an empty thread on "New" after the host re-rendered with a loaded conversation', async () => {
    const AskSurface = await importAskSurface();
    const { rerender } = render(<AskSurface {...props('conv-3', [message])} />);
    expect(h.mounts[0]).toEqual({ conversationId: 'conv-3', messageCount: 1 });

    fireEvent.click(screen.getByRole('link', { name: 'New' }));
    // Empty at once, not the old conversation's history under a "new" thread.
    expect(h.mounts.at(-1)).toEqual({ conversationId: null, messageCount: 0 });

    rerender(<AskSurface {...props(null)} />);
    expect(h.mounts.at(-1)).toEqual({ conversationId: null, messageCount: 0 });
  });

  it('leaves the thread alone when "New" is opened in another tab', async () => {
    const AskSurface = await importAskSurface();
    render(<AskSurface {...props(null)} />);
    act(() => h.adopt?.('conv-1'));

    fireEvent.click(screen.getByRole('link', { name: 'New' }), { metaKey: true });
    expect(h.mounts).toHaveLength(1);
  });

  it('points "New" and the history rail at the Chat tab, not the standalone page', async () => {
    const AskSurface = await importAskSurface();
    render(<AskSurface {...props(null)} />);
    expect(screen.getByRole('link', { name: 'New' })).toHaveAttribute('href', CHAT);
  });
});
