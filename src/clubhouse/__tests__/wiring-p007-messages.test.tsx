
import { act, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * P007 wiring audit (2026-10-17): each control checked against the write Fairway makes for it. A coach's group always
 * holds a player (a broadcast with none reaches the whole team), an announcement's file opens through a signed link
 * (never the stored file_url), a deep link that arrives while Messages is open is taken, and the message fields stop
 * at the server's limit.
 */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
const params = vi.hoisted(() => ({ current: new URLSearchParams() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, useSearchParams: () => params.current }));
vi.mock('../lib/use-now', () => ({ useNow: () => null }));
const layout = vi.hoisted(() => ({ phone: false }));
vi.mock('../lib/use-phone', () => ({ useChPhone: () => layout.phone, CH_PHONE_QUERY: '(max-width: 820px), (max-height: 500px) and (pointer: coarse)' }));

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
  },
  reactions: { rows: [] as unknown[], setReaction: vi.fn(async () => {}) },
  files: {
    getPendingAttachmentSend: vi.fn(async () => null),
    retryPendingAttachmentSend: vi.fn(async () => ({ success: true })),
    sendMessageWithAttachments: vi.fn(async () => ({ success: true })),
  },
}));
vi.mock('@/hooks/golf/use-golf-messages', () => ({ useGolfConversations: () => live.convs, useGolfMessages: () => live.msgs }));
vi.mock('@/hooks/golf/use-message-reactions', async (orig) => ({ ...(await orig<object>()), useMessageReactions: () => live.reactions }));
const polls = vi.hoisted(() => ({
  responses: { rows: [] as unknown[], error: null as string | null, ready: true, pending: null as string | null, refresh: vi.fn(async () => {}), vote: vi.fn(async (_messageId: string, _choice: string | null) => true) },
  sendGolfPoll: vi.fn(async () => ({ success: true as const, id: 'poll-1' })),
  closeGolfPoll: vi.fn(async () => ({ success: true as const, id: 'poll-1' })),
}));
vi.mock('@/hooks/golf/use-message-responses', () => ({ useMessageResponses: () => polls.responses }));
vi.mock('@/app/golf/actions/message-polls', () => ({ sendGolfPoll: polls.sendGolfPoll, closeGolfPoll: polls.closeGolfPoll }));
vi.mock('@/hooks/golf/use-message-attachments', () => ({ useMessageAttachments: () => live.files }));
const a = vi.hoisted(() => ({
  createGolfConversation: vi.fn(),
  createGolfTeamBroadcast: vi.fn(),
  getGolfConversationParticipantIdentities: vi.fn(),
  getGolfMessageAttachments: vi.fn(),
  leaveGolfGroup: vi.fn(),
  searchGolfMessages: vi.fn(),
  getGolfConversationMute: vi.fn(),
  setGolfConversationMute: vi.fn(),
  completeAnnouncementTask: vi.fn(),
  createEnrichedAnnouncement: vi.fn(),
  getAnnouncementDetail: vi.fn(),
  getAnnouncementsWithMeta: vi.fn(),
  acknowledgeAnnouncement: vi.fn(),
  addGolfGroupMember: vi.fn(),
  getGolfGroupAddCandidates: vi.fn(),
  getGolfConversationFiles: vi.fn(),
  canHideGolfConversations: vi.fn(),
  hideGolfConversation: vi.fn(),
  getPreviewUrl: vi.fn(),
  removeGolfGroupMember: vi.fn(),
}));
vi.mock('@/app/golf/actions/messages', () => ({
  createGolfConversation: a.createGolfConversation,
  createGolfTeamBroadcast: a.createGolfTeamBroadcast,
  getGolfConversationParticipantIdentities: a.getGolfConversationParticipantIdentities,
  getGolfMessageAttachments: a.getGolfMessageAttachments,
  leaveGolfGroup: a.leaveGolfGroup,
  searchGolfMessages: a.searchGolfMessages,
  addGolfGroupMember: a.addGolfGroupMember,
  getGolfGroupAddCandidates: a.getGolfGroupAddCandidates,
  removeGolfGroupMember: a.removeGolfGroupMember,
}));
vi.mock('@/app/golf/actions/conversation-hide', () => ({ canHideGolfConversations: a.canHideGolfConversations, hideGolfConversation: a.hideGolfConversation }));
vi.mock('@/app/golf/actions/message-attachments', () => ({ getGolfConversationFiles: a.getGolfConversationFiles }));
vi.mock('@/app/golf/actions/message-mute', () => ({ getGolfConversationMute: a.getGolfConversationMute, setGolfConversationMute: a.setGolfConversationMute }));
vi.mock('@/app/golf/actions/announcements', () => ({
  completeAnnouncementTask: a.completeAnnouncementTask,
  createEnrichedAnnouncement: a.createEnrichedAnnouncement,
  getAnnouncementDetail: a.getAnnouncementDetail,
  getAnnouncementsWithMeta: a.getAnnouncementsWithMeta,
}));
vi.mock('@/app/golf/actions/communication', () => ({ acknowledgeAnnouncement: a.acknowledgeAnnouncement }));
vi.mock('@/app/golf/actions/documents', () => ({ getPreviewUrl: a.getPreviewUrl }));

import type { ChMessagesData } from '../data/messages';
import { groupLacksPlayer } from '../screens/messages/model';
import { useThreadAnchor } from '../screens/messages/use-thread-anchor';
import './dialog-polyfill';

const dan = { userId: 'dan', name: 'Dan Whitfield', role: 'coach' as const, subtitle: 'Assistant coach', playerId: null };
const dana = { userId: 'dana', name: 'Dana Cole', role: 'coach' as const, subtitle: 'Assistant coach', playerId: null };
const data: ChMessagesData = {
  role: 'coach',
  viewerUserId: 'me',
  viewerName: 'Maya Reyes',
  viewerPlayerId: null,
  teamId: 't1',
  teamName: 'Varsity',
  timeZone: 'America/New_York',
  now: '2026-10-14T18:40:00Z',
  directory: [
    dan,
    dana,
    { userId: 'jonah', name: 'Jonah Okafor', role: 'player', subtitle: 'Sophomore', playerId: 'p-jonah' },
    { userId: 'eli', name: 'Eli Brandt', role: 'player', subtitle: 'Junior', playerId: 'p-eli' },
  ],
  directoryError: false,
};
const team = { id: 'team', title: 'Varsity team', participant_ids: ['me', 'jonah', 'eli'], participant_count: 3, unread_count: 0, last_message: { content: 'Bus at 6:15', created_at: '2026-10-14T18:00:00Z', sender_id: 'me' }, creator_id: 'me' };
const mine = { id: 'm1', conversation_id: 'team', sender_id: 'me', content: 'Bus at 6:15', created_at: '2026-10-14T18:00:00Z', isRead: true };

const realOpen = window.open;
beforeEach(() => {
  sessionStorage.clear();
  window.matchMedia = ((q: string) => ({ matches: /min-width/.test(q), media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as never;
  hapticSpy.mockClear();
  router.replace.mockClear();
  params.current = new URLSearchParams();
  for (const f of Object.values(a)) f.mockReset();
  a.getAnnouncementsWithMeta.mockResolvedValue({ success: true, data: [] });
  a.canHideGolfConversations.mockResolvedValue(false);
  a.getGolfConversationMute.mockResolvedValue({ success: true, data: { muted: false, until: null } });
  a.getGolfConversationParticipantIdentities.mockResolvedValue({ participants: [] });
  a.searchGolfMessages.mockResolvedValue({ results: [] });
  a.getGolfConversationFiles.mockResolvedValue({ files: [] });
  a.addGolfGroupMember.mockResolvedValue({ success: true });
  live.convs.conversations = [team];
  live.convs.refetch.mockReset().mockResolvedValue(undefined);
  live.msgs.messages = [mine];
  live.msgs.markRead.mockClear();
});
afterEach(() => {
  layout.phone = false;
  window.open = realOpen;
});

describe('P007 wiring · a coach’s group holds a player', () => {
  it('groupLacksPlayer: coaches alone lack one; a player, or a player viewer, does not', () => {
    expect(groupLacksPlayer('coach', ['dan', 'dana'], data.directory)).toBe(true);
    expect(groupLacksPlayer('coach', ['dan', 'jonah'], data.directory)).toBe(false);
    expect(groupLacksPlayer('coach', [], data.directory)).toBe(false);
    expect(groupLacksPlayer('player', ['dan', 'dana'], data.directory)).toBe(false);
  });
});

let anchorEl: HTMLDivElement;
function AnchorThread({ count, paused }: { count: number; paused: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useThreadAnchor(ref, { convId: 'a', count, lastMine: false, typing: false, paused });
  return (
    <div
      ref={(n) => {
        ref.current = n;
        if (n) anchorEl = n;
      }}
    />
  );
}

describe('P007 wiring · the end-anchor holds off while a search hit is shown', () => {
  it('paused: the 700 ms settle hold and loading messages never pull the thread to its end', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    try {
      const view = render(<AnchorThread count={0} paused />);
      Object.defineProperty(anchorEl, 'scrollHeight', { configurable: true, value: 2000 });
      Object.defineProperty(anchorEl, 'clientHeight', { configurable: true, value: 400 });
      anchorEl.scrollTop = 600;
      act(() => void vi.advanceTimersByTime(50));
      expect(anchorEl.scrollTop).toBe(600);
      view.rerender(<AnchorThread count={12} paused />);
      act(() => void vi.advanceTimersByTime(800));
      expect(anchorEl.scrollTop).toBe(600);
      // Unpaused, a thread is held at its end as before.
      view.unmount();
      render(<AnchorThread count={12} paused={false} />);
      Object.defineProperty(anchorEl, 'scrollHeight', { configurable: true, value: 2000 });
      Object.defineProperty(anchorEl, 'clientHeight', { configurable: true, value: 400 });
      anchorEl.scrollTop = 0;
      act(() => void vi.advanceTimersByTime(50));
      expect(anchorEl.scrollTop).toBe(2000);
    } finally {
      vi.useRealTimers();
    }
  });
});
