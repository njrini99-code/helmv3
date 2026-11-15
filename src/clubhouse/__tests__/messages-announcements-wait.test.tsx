import { LazyMotion, domAnimation } from 'motion/react';
import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * GAP-S-11: the inbox no longer waits on the announcements read. Conversations draw as soon as they arrive; the
 * announcements, folded under them, wait in their own section (CH-7490), say "Still loading…" after 4 seconds, and after
 * 15 seconds give up into their failed notice (CH-7206) with its Try again. An answer that lands later still shows.
 */

vi.mock('@/clubhouse/lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('@/clubhouse/lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, useSearchParams: () => new URLSearchParams() }));
vi.mock('@/clubhouse/lib/use-now', () => ({ useNow: () => null }));
vi.mock('@/clubhouse/screens/messages/use-conversation-pins', async () => {
  const { usePinned } = await import('../screens/messages/pinned');
  return { useConversationPins: (viewer: string, team: string, ids: readonly string[], enabled: boolean) => usePinned(viewer, team, ids, enabled) };
});
vi.mock('@/clubhouse/screens/messages/use-row-mutes', () => ({ isMutedRow: () => false, useRowMutes: () => ({ muted: null, refresh: () => {} }) }));
vi.mock('@/clubhouse/screens/messages/use-typing-by-conversation', () => ({ useTypingByConversation: () => new Map() }));
vi.mock('@/clubhouse/screens/messages/typing-channel', async (orig) => ({ ...(await orig<object>()), usePrivateTyping: () => ({ typingUserIds: [], send: () => {} }) }));
vi.mock('@/clubhouse/lib/use-phone', () => ({ useChPhone: () => false, CH_PHONE_QUERY: '(max-width: 820px), (max-height: 500px) and (pointer: coarse)' }));

const live = vi.hoisted(() => ({
  convs: { conversations: [] as unknown[], loading: false, error: null as unknown, refetch: vi.fn(async () => {}) },
  msgs: {
    messages: [] as unknown[],
    loading: false,
    error: null as unknown,
    currentUserId: 'me',
    refetch: vi.fn(async () => {}),
    sendMessage: vi.fn(async () => {}),
    retryMessage: vi.fn(),
    discardFailedMessage: vi.fn(),
    editMessage: vi.fn(async () => {}),
    removeMessage: vi.fn(async () => {}),
    markRead: vi.fn(async () => {}),
    isOtherTyping: false,
    sendTypingStatus: vi.fn(),
    insertConfirmed: vi.fn(),
  },
  reactions: { rows: [] as unknown[], setReaction: vi.fn(async () => {}) },
  files: { getPendingAttachmentSend: vi.fn(async () => null), retryPendingAttachmentSend: vi.fn(async () => ({ success: true })), sendMessageWithAttachments: vi.fn(async () => ({ success: true })) },
}));
vi.mock('@/hooks/golf/use-golf-messages', () => ({ useGolfConversations: () => live.convs, useGolfMessages: () => live.msgs }));
vi.mock('@/hooks/golf/use-message-reactions', async (orig) => ({ ...(await orig<object>()), useMessageReactions: () => live.reactions }));
vi.mock('@/hooks/golf/use-message-responses', () => ({
  useMessageResponses: () => ({ rows: [], error: null, ready: true, pending: new Set<string>(), refresh: vi.fn(async () => {}), vote: vi.fn(async () => ({ ok: true })) }),
}));
vi.mock('@/app/golf/actions/message-polls', () => ({ sendGolfPoll: vi.fn(), closeGolfPoll: vi.fn() }));
vi.mock('@/hooks/golf/use-message-attachments', () => ({ useMessageAttachments: () => live.files }));
const a = vi.hoisted(() => ({ getAnnouncementsWithMeta: vi.fn(), getAnnouncementDetail: vi.fn() }));
vi.mock('@/app/golf/actions/messages', () => ({
  markGolfMessagesAsRead: vi.fn(),
  createGolfConversation: vi.fn(),
  createGolfTeamBroadcast: vi.fn(),
  getGolfConversationParticipantIdentities: vi.fn(async () => ({ participants: [] })),
  getGolfMessageAttachments: vi.fn(),
  leaveGolfGroup: vi.fn(),
  searchGolfMessages: vi.fn(async () => ({ results: [] })),
  addGolfGroupMember: vi.fn(),
  getGolfGroupAddCandidates: vi.fn(async () => ({ candidates: [] })),
}));
vi.mock('@/app/golf/actions/conversation-hide', () => ({ canHideGolfConversations: vi.fn(async () => false), hideGolfConversation: vi.fn() }));
vi.mock('@/app/golf/actions/message-attachments', () => ({ getGolfConversationFiles: vi.fn(async () => ({ files: [] })) }));
vi.mock('@/app/golf/actions/message-mute', () => ({ getGolfConversationMute: vi.fn(async () => ({ success: true, data: { muted: false, until: null } })), setGolfConversationMute: vi.fn() }));
vi.mock('@/app/golf/actions/announcements', () => ({
  completeAnnouncementTask: vi.fn(),
  createEnrichedAnnouncement: vi.fn(),
  getAnnouncementDetail: a.getAnnouncementDetail,
  getAnnouncementsWithMeta: a.getAnnouncementsWithMeta,
}));
vi.mock('@/app/golf/actions/communication', () => ({ acknowledgeAnnouncement: vi.fn() }));

import type { ChMessagesData } from '@/clubhouse/data/messages';
import { Messages } from '../screens/messages/Messages';
import { CH_ANN_GIVE_UP_AFTER, CH_ANN_SLOW_AFTER, useAnnouncementsRead } from '../screens/messages/use-announcements-read';
import type { ChAnnouncement } from '../screens/messages/model';
import { ToastProvider } from '@/clubhouse/ui/Toast';
import '@/clubhouse/__tests__/dialog-polyfill';

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);

const data: ChMessagesData = {
  role: 'coach',
  viewerUserId: 'me',
  viewerName: 'Maya Reyes',
  viewerPlayerId: null,
  teamId: 't1',
  teamName: 'Varsity',
  timeZone: 'America/New_York',
  now: '2026-10-14T18:40:00Z',
  directory: [{ userId: 'jonah', name: 'Jonah Okafor', role: 'player', subtitle: 'Sophomore', playerId: 'p-jonah' }],
  directoryError: false,
};
const team = { id: 'team', title: 'Varsity team', participant_ids: ['me', 'jonah'], participant_count: 2, unread_count: 0, last_message: { content: 'Bus at 6:15', created_at: '2026-10-14T18:00:00Z', sender_id: 'me' }, creator_id: 'me' };
const annRow = { id: 'a1', title: 'Pairings posted', body: 'See the board.', urgency: 'normal', published_at: '2026-10-14T17:00:00Z', created_at: '2026-10-14T17:00:00Z', requires_acknowledgement: false, acknowledged_count: 0, total_recipients: 2, has_player_acknowledged: false, task_count: 0, completed_task_count: 0, document_count: 0 };

function show() {
  return render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <Messages data={data} />
        </div>
      </ToastProvider>
    </LazyMotion>,
  );
}

beforeEach(() => {
  sessionStorage.clear();
  HTMLElement.prototype.animate = (() => ({ cancel: () => {}, finish: () => {}, finished: Promise.resolve(), onfinish: null })) as never;
  HTMLElement.prototype.getAnimations = (() => []) as never;
  window.matchMedia = ((q: string) => ({ matches: /min-width/.test(q), media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as never;
  a.getAnnouncementsWithMeta.mockReset();
  live.convs.conversations = [team];
  live.convs.loading = false;
  live.convs.error = null;
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => vi.useRealTimers());

describe('Messages · announcements do not hold the inbox (GAP-S-11)', () => {
  it('conversations draw while the announcements read is still out, and the section waits on its own (CH-7490)', async () => {
    a.getAnnouncementsWithMeta.mockReturnValue(new Promise(() => {}));
    show();
    // The conversation is on screen at once, not behind the inbox skeleton (CH-7402).
    await waitFor(() => expect(document.querySelector('.ch-ms-rail button.ch-ms-row')).not.toBeNull());
    expect(code('CH-7402')).toBeNull();
    const wait = code('CH-7490')!;
    expect(wait.getAttribute('aria-busy')).toBe('true');
    expect(wait.textContent).not.toMatch(/Still loading/);
    await act(async () => void vi.advanceTimersByTime(CH_ANN_SLOW_AFTER + 10));
    expect(code('CH-7490')!.textContent).toMatch(/Announcements · Still loading…/);
    await act(async () => void vi.advanceTimersByTime(CH_ANN_GIVE_UP_AFTER - CH_ANN_SLOW_AFTER));
    expect(code('CH-7490')).toBeNull();
    expect(code('CH-7206')!.textContent).toMatch(/Announcements didn’t load/);
    // The conversation stayed through all of it.
    expect(document.querySelector('.ch-ms-rail button.ch-ms-row')).not.toBeNull();
    // Its Try again reads again, and an answer that lands is drawn.
    a.getAnnouncementsWithMeta.mockResolvedValue({ success: true, data: [annRow] });
    await act(async () => within(code('CH-7206') as HTMLElement).getByRole('button', { name: 'Try again' }).click());
    await waitFor(() => expect(code('CH-7206')).toBeNull());
    expect(screen.getByRole('button', { name: /^Announcements/ }).textContent).toMatch(/Pairings posted/);
  });

  it('with no conversations the inbox still waits for the announcements, so it never flashes the first run', async () => {
    live.convs.conversations = [];
    a.getAnnouncementsWithMeta.mockReturnValue(new Promise(() => {}));
    show();
    await waitFor(() => expect(code('CH-7402')).not.toBeNull());
    expect(document.querySelector('.ch-ms-rail__ctx')?.textContent).toBe('Loading conversations');
  });
});

describe('useAnnouncementsRead (GAP-S-11)', () => {
  const rows: ChAnnouncement[] = [];
  it('a read that answers in time is never slow', async () => {
    const read = vi.fn(async () => rows);
    const { result } = renderHook(() => useAnnouncementsRead(read, undefined));
    await waitFor(() => expect(result.current.annLoaded).toBe(true));
    await act(async () => void vi.advanceTimersByTime(CH_ANN_GIVE_UP_AFTER * 2));
    expect(result.current.annSlow).toBe(false);
    expect(result.current.annError).toBe(false);
  });

  it('a read that gives up and then answers late is drawn, the notice gone', async () => {
    let answer: (v: ChAnnouncement[]) => void = () => {};
    const read = vi.fn(() => new Promise<ChAnnouncement[]>((r) => (answer = r)));
    const { result } = renderHook(() => useAnnouncementsRead(read, undefined));
    await act(async () => void vi.advanceTimersByTime(CH_ANN_SLOW_AFTER + 10));
    expect(result.current.annSlow).toBe(true);
    expect(result.current.annLoaded).toBe(false);
    await act(async () => void vi.advanceTimersByTime(CH_ANN_GIVE_UP_AFTER));
    expect(result.current).toMatchObject({ annError: true, annLoaded: true, annSlow: false });
    const late = [{ id: 'a9' } as ChAnnouncement];
    await act(async () => answer(late));
    expect(result.current).toMatchObject({ annError: false, anns: late });
  });

  it('read with the page, it does not read again on mount', () => {
    const read = vi.fn(async () => rows);
    const { result } = renderHook(() => useAnnouncementsRead(read, rows));
    expect(read).not.toHaveBeenCalled();
    expect(result.current.annLoaded).toBe(true);
  });
});
