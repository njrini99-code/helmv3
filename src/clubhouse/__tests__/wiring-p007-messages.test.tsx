
import { LazyMotion, domAnimation } from 'motion/react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
/** The rail's three server-backed hooks and the open thread's typing channel, off the network (an unmocked channel opens a live socket). */
vi.mock('../screens/messages/use-conversation-pins', async () => {
  const { usePinned } = await import('../screens/messages/pinned');
  return { useConversationPins: (viewer: string, team: string, ids: readonly string[], enabled: boolean) => usePinned(viewer, team, ids, enabled) };
});
vi.mock('../screens/messages/use-row-mutes', () => ({ isMutedRow: () => false, useRowMutes: () => ({ muted: null, refresh: () => {} }) }));
vi.mock('../screens/messages/use-typing-by-conversation', () => ({ useTypingByConversation: () => new Map() }));
vi.mock('../screens/messages/typing-channel', async (orig) => ({ ...(await orig<object>()), usePrivateTyping: () => ({ typingUserIds: [], send: () => {} }) }));
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
    insertConfirmed: vi.fn(),
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
  responses: { rows: [] as unknown[], error: null as string | null, ready: true, pending: new Set<string>() as ReadonlySet<string>, refresh: vi.fn(async () => {}), vote: vi.fn(async (_messageId: string, _choice: string | null) => ({ ok: true as const })) },
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
import { Messages } from '../screens/messages/Messages';
import { groupLacksPlayer } from '../screens/messages/model';
import { ToastProvider } from '../ui/Toast';
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
  // jsdom has no Web Animations.
  HTMLElement.prototype.animate = (() => ({ cancel: () => {}, finish: () => {}, finished: Promise.resolve(), onfinish: null })) as never;
  HTMLElement.prototype.getAnimations = (() => []) as never;
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
  a.getGolfGroupAddCandidates.mockResolvedValue({ candidates: [] });
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

const code = (c: string) => [...document.querySelectorAll(`[data-ch-code="${c}"]`)].find((el) => el.tagName !== 'DIALOG' || el.hasAttribute('open')) ?? null;
async function expectCode(c: string, text?: RegExp) {
  await waitFor(() => expect(code(c)?.textContent ?? null).not.toBeNull());
  if (text) await waitFor(() => expect(code(c)?.textContent ?? '').toMatch(text));
}
const tree = (d: ChMessagesData) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <div className="ch-root" data-ui="clubhouse">
        <Messages data={d} />
      </div>
    </ToastProvider>
  </LazyMotion>
);
const show = (d: ChMessagesData = data) => render(tree(d));
type User = ReturnType<typeof userEvent.setup>;
const openDetails = (user: User) => user.click(screen.getByRole('button', { name: 'Details' }));
const dm = { id: 'dm', title: null, participant_ids: ['me', 'jonah'], participant_count: 2, unread_count: 0, other_participant: { id: 'jonah', name: 'Jonah Okafor' }, last_message: { content: 'See you at 6', created_at: '2026-10-14T17:00:00Z', sender_id: 'jonah' }, creator_id: 'me' };

describe('P007 wiring · deep links (70102)', () => {
  it('70102 a ?conversation= link that arrives while Messages is open (the bell, on this page) opens that thread, and again later', async () => {
    live.convs.conversations = [team, dm];
    const view = show();
    await screen.findByRole('textbox', { name: /Message Varsity team/ });
    params.current = new URLSearchParams('conversation=dm');
    view.rerender(tree(data));
    expect(await screen.findByRole('textbox', { name: /Message Jonah$/ })).toBeTruthy();
    expect(router.replace).toHaveBeenCalledWith('/golf/dashboard/messages', { scroll: false });
    // The address is cleaned; the same link tapped again later is taken again.
    params.current = new URLSearchParams();
    view.rerender(tree(data));
    await userEvent.setup().click(screen.getAllByRole('button', { name: /^(?!Actions for ).*Varsity team/ })[0]!);
    await screen.findByRole('textbox', { name: /Message Varsity team/ });
    params.current = new URLSearchParams('conversation=dm');
    view.rerender(tree(data));
    expect(await screen.findByRole('textbox', { name: /Message Jonah$/ })).toBeTruthy();
  });

  it('70102 a linked thread the list doesn’t hold yet is looked for once more, then opened, and nothing says it is gone', async () => {
    live.convs.conversations = [team];
    live.convs.refetch.mockImplementation(async () => {
      live.convs.conversations = [dm, team];
    });
    params.current = new URLSearchParams('conversation=dm');
    show();
    await waitFor(() => expect(live.convs.refetch).toHaveBeenCalledTimes(1));
    // Selecting it renders again, with the list the refetch brought.
    expect(await screen.findByRole('textbox', { name: /Message Jonah$/ })).toBeTruthy();
    expect(code('CH-7015')).toBeNull();
  });
});

const members = [
  { conversationId: 'team', userId: 'me', name: 'Maya Reyes', subtitle: 'Head coach', avatar: null, type: 'coach' },
  { conversationId: 'team', userId: 'jonah', name: 'Jonah Okafor', subtitle: 'Sophomore', avatar: null, type: 'player' },
  { conversationId: 'team', userId: 'eli', name: 'Eli Brandt', subtitle: 'Junior', avatar: null, type: 'player' },
];

describe('P007 wiring · the group’s creator removes a member (removeGolfGroupMember, as Fairway allows)', () => {
  beforeEach(() => {
    a.getGolfConversationParticipantIdentities.mockResolvedValue({ participants: members });
  });

  it('CH-7504 removing a member asks first with the warning haptic, removes at once, then reads the group again and says so', async () => {
    const user = userEvent.setup();
    a.removeGolfGroupMember.mockResolvedValue({ success: true });
    show();
    await openDetails(user);
    expect(await screen.findByRole('button', { name: 'Remove Eli Brandt' })).toBeTruthy();
    // Never on the creator's own row.
    expect(screen.queryByRole('button', { name: 'Remove Maya Reyes' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Remove Eli Brandt' }));
    await expectCode('CH-7504', /Remove Eli from Varsity team\?/);
    expect(a.removeGolfGroupMember).not.toHaveBeenCalled();
    const dlg = within(code('CH-7504') as HTMLElement);
    hapticSpy.mockClear();
    await user.click(dlg.getByRole('button', { name: 'Remove' }));
    expect(hapticSpy).toHaveBeenCalledWith('warning');
    await waitFor(() => expect(a.removeGolfGroupMember).toHaveBeenCalledWith('team', 'eli'));
    expect(await screen.findByText(/Removed Eli from Varsity team/)).toBeTruthy();
    expect(hapticSpy).toHaveBeenCalledWith('success');
    expect(live.convs.refetch).toHaveBeenCalled();
    // The members are read again, without the skeleton coming back over the list.
    await waitFor(() => expect(a.getGolfConversationParticipantIdentities.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(code('CH-7405')).toBeNull();
  });

  it('CH-7024 a refused removal puts the row back and says why', async () => {
    const user = userEvent.setup();
    const answer: { resolve: (v: unknown) => void } = { resolve: () => {} };
    a.removeGolfGroupMember.mockReturnValue(new Promise((r) => (answer.resolve = r)));
    show();
    await openDetails(user);
    await user.click(await screen.findByRole('button', { name: 'Remove Eli Brandt' }));
    await user.click(within(code('CH-7504') as HTMLElement).getByRole('button', { name: 'Remove' }));
    // Optimistic: the row is gone while the server answers.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Remove Eli Brandt' })).toBeNull());
    await act(async () => answer.resolve({ error: 'Only the group creator can change members' }));
    await expectCode('CH-7024', /Couldn’t remove Eli/);
    expect(code('CH-7024')!.textContent).toContain('Only the group creator can change members');
    expect(await screen.findByRole('button', { name: 'Remove Eli Brandt' })).toBeTruthy();
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
