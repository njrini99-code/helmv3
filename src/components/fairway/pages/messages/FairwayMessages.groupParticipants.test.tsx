/* eslint-disable helm/no-raw-button -- deliberately minimal component test doubles */
// @vitest-environment jsdom

import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type ParticipantResult = {
  data: Array<{ user_id: string }>;
  error: null;
};

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const participantRequests = vi.hoisted(
  () => new Map<string, Deferred<ParticipantResult>>(),
);
const requestedConversationIds = vi.hoisted(() => [] as string[]);
const conversations = vi.hoisted(() => [
  {
    id: 'group-a',
    is_group: true,
    participant_count: 3,
    title: 'Group A',
    unread_count: 0,
  },
  {
    id: 'group-b',
    is_group: true,
    participant_count: 3,
    title: 'Group B',
    unread_count: 0,
  },
]);
const hookFns = vi.hoisted(() => ({
  refetch: vi.fn(async () => undefined),
  refetchMessages: vi.fn(async () => undefined),
  sendMessage: vi.fn(async () => undefined),
  retryMessage: vi.fn(async () => undefined),
  editMessage: vi.fn(async () => undefined),
  removeMessage: vi.fn(async () => undefined),
  sendTypingStatus: vi.fn(),
  sendMessageWithAttachments: vi.fn(async () => ({ success: true })),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: () => null }),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock('@/lib/redesign/flag', () => ({ fairwayScope: (value: string) => value }));
vi.mock('@/components/ui/sonner', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock('@/lib/error-logging', () => ({ logError: vi.fn() }));
vi.mock('@/contexts/golf-user-context', () => ({
  useGolfUser: () => ({
    userId: 'coach-user',
    role: 'coach',
    teamId: 'team-1',
    teamName: 'Test Team',
  }),
}));
vi.mock('@/hooks/golf/use-golf-messages', () => ({
  useGolfConversations: () => ({
    conversations,
    loading: false,
    error: false,
    refetch: hookFns.refetch,
  }),
  useGolfMessages: () => ({
    messages: [],
    loading: false,
    error: false,
    refetch: hookFns.refetchMessages,
    sendMessage: hookFns.sendMessage,
    retryMessage: hookFns.retryMessage,
    typingUserIds: [],
    editMessage: hookFns.editMessage,
    removeMessage: hookFns.removeMessage,
    isOtherTyping: false,
    sendTypingStatus: hookFns.sendTypingStatus,
    currentUserId: 'coach-user',
  }),
}));
vi.mock('@/hooks/golf/use-message-attachments', () => ({
  useMessageAttachments: () => ({
    sendMessageWithAttachments: hookFns.sendMessageWithAttachments,
  }),
}));
vi.mock('@/app/golf/actions/messages', () => ({
  createGolfConversation: vi.fn(),
  getPlayerUserId: vi.fn(),
}));
vi.mock('@/hooks/use-immersive-surface', () => ({ useImmersiveSurface: vi.fn() }));
vi.mock('@/hooks/use-media-query', () => ({ useMediaQuery: () => true }));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: (_column: string, conversationId: string) => {
          requestedConversationIds.push(conversationId);
          const request = participantRequests.get(conversationId);
          if (!request) throw new Error(`Missing participant request for ${conversationId}`);
          return request.promise;
        },
        in: (_column: string, userIds: string[]) => Promise.resolve(
          table === 'golf_coaches'
            ? {
                data: userIds.map((userId) => ({
                  user_id: userId,
                  full_name: userId === 'alpha-user' ? 'Alpha Face' : 'Bravo Face',
                  avatar_url: `/${userId}.jpg`,
                })),
                error: null,
              }
            : { data: [], error: null },
        ),
      }),
    }),
  }),
}));

vi.mock('./MessageConversationRail', () => ({
  MessageConversationRail: ({ onSelect }: { onSelect: (id: string) => void }) => (
    <nav>
      <button type="button" onClick={() => onSelect('group-a')}>Group A</button>
      <button type="button" onClick={() => onSelect('group-b')}>Group B</button>
    </nav>
  ),
}));
vi.mock('./MessageThreadPane', () => ({
  MessageThreadPane: ({
    conversation,
    groupParticipants,
    children,
  }: {
    conversation: { id: string } | null;
    groupParticipants?: Map<string, { name: string; avatar: string | null }>;
    children?: ReactNode;
  }) => (
    <section data-testid="thread" data-conversation-id={conversation?.id ?? ''}>
      <output data-testid="participant-identities">
        {Array.from(groupParticipants?.values() ?? []).map((person) => person.name).join(',')}
      </output>
      {children}
    </section>
  ),
}));
vi.mock('./MessageComposer', () => ({ MessageComposer: () => null }));
vi.mock('./FairwayNewMessageSheet', () => ({ FairwayNewMessageSheet: () => null }));
vi.mock('./FairwayTeamBroadcastSheet', () => ({ FairwayTeamBroadcastSheet: () => null }));
vi.mock('@/components/golf/PullToRefresh', () => ({
  PullToRefresh: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/fairway/view-header', () => ({ ViewHeader: () => null }));

import { FairwayMessages } from './FairwayMessages';

const participantOutput = () => screen.getByTestId('participant-identities');

beforeEach(() => {
  participantRequests.clear();
  requestedConversationIds.length = 0;
  vi.clearAllMocks();
  participantRequests.set('group-a', deferred());
  participantRequests.set('group-b', deferred());
});

describe('FairwayMessages — conversation-scoped group identities', () => {
  it('clears Group A identities immediately when Group B becomes active', async () => {
    render(<FairwayMessages />);
    await waitFor(() => expect(requestedConversationIds).toContain('group-a'));

    await act(async () => {
      participantRequests.get('group-a')!.resolve({
        data: [{ user_id: 'alpha-user' }],
        error: null,
      });
    });
    await waitFor(() => expect(participantOutput()).toHaveTextContent('Alpha Face'));

    fireEvent.click(screen.getByRole('button', { name: 'Group B' }));
    await waitFor(() => expect(screen.getByTestId('thread')).toHaveAttribute('data-conversation-id', 'group-b'));
    expect(participantOutput()).toBeEmptyDOMElement();

    await act(async () => {
      participantRequests.get('group-b')!.resolve({
        data: [{ user_id: 'bravo-user' }],
        error: null,
      });
    });
  });

  it('ignores a stale Group A response that resolves after Group B', async () => {
    render(<FairwayMessages />);
    await waitFor(() => expect(requestedConversationIds).toContain('group-a'));

    fireEvent.click(screen.getByRole('button', { name: 'Group B' }));
    await waitFor(() => expect(requestedConversationIds).toContain('group-b'));

    await act(async () => {
      participantRequests.get('group-b')!.resolve({
        data: [{ user_id: 'bravo-user' }],
        error: null,
      });
    });
    await waitFor(() => expect(participantOutput()).toHaveTextContent('Bravo Face'));

    await act(async () => {
      participantRequests.get('group-a')!.resolve({
        data: [{ user_id: 'alpha-user' }],
        error: null,
      });
    });

    await waitFor(() => expect(participantOutput()).toHaveTextContent('Bravo Face'));
    expect(participantOutput()).not.toHaveTextContent('Alpha Face');
  });
});
