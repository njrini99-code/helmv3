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
const layout = vi.hoisted(() => ({ phone: false }));
vi.mock('../lib/use-phone', () => ({ useChPhone: () => layout.phone, CH_PHONE_QUERY: '(max-width: 820px)' }));

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
import { Messages } from '../screens/messages/Messages';
import { groupLacksPlayer, MESSAGE_MAX } from '../screens/messages/model';
import { messagesPrefillHref } from '../screens/messages/prefill';
import { FOUND_FOR_MS } from '../screens/messages/use-focus-message';
import { useThreadAnchor } from '../screens/messages/use-thread-anchor';
import { ToastProvider } from '../ui/Toast';
import { PhoneChromeProvider, usePhoneChromeState } from '../shell/phone-chrome';
import './dialog-polyfill';

const code = (c: string) => [...document.querySelectorAll(`[data-ch-code="${c}"]`)].find((el) => el.tagName !== 'DIALOG' || el.hasAttribute('open')) ?? null;
async function expectCode(c: string, text?: RegExp) {
  await waitFor(() => expect(code(c)).not.toBeNull());
  if (text) expect(code(c)!.textContent).toMatch(text);
}

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
const player: ChMessagesData = { ...data, role: 'player', viewerName: 'Jonah Okafor', viewerPlayerId: 'p-me' };
const team = { id: 'team', title: 'Varsity team', participant_ids: ['me', 'jonah', 'eli'], participant_count: 3, unread_count: 0, last_message: { content: 'Bus at 6:15', created_at: '2026-10-14T18:00:00Z', sender_id: 'me' }, creator_id: 'me' };
const dm = { id: 'dm', title: null, participant_ids: ['me', 'jonah'], participant_count: 2, unread_count: 1, other_participant: { id: 'jonah', name: 'Jonah Okafor' }, last_message: { content: 'See you at 6', created_at: '2026-10-14T17:00:00Z', sender_id: 'jonah' }, creator_id: 'me' };
const mine = { id: 'm1', conversation_id: 'team', sender_id: 'me', content: 'Bus at 6:15', created_at: '2026-10-14T18:00:00Z', isRead: true };
const annRow = { id: 'a1', title: 'Bus times', body: 'Bus leaves at 6:15.', urgency: 'normal', published_at: '2026-10-14T17:00:00Z', created_at: '2026-10-14T17:00:00Z', requires_acknowledgement: false, acknowledged_count: 0, total_recipients: 2, has_player_acknowledged: false, task_count: 0, completed_task_count: 0, document_count: 1 };
const annDetail = {
  success: true,
  data: {
    id: 'a1',
    acknowledgements: [],
    recipients: [],
    tasks: [],
    // The stored file_url points at the private bucket (Fairway #1259): it must never be what opens.
    documents: [{ document_id: 'doc1', document: { id: 'doc1', title: 'Itinerary.pdf', file_url: 'https://x.test/object/public/documents/itinerary.pdf', file_size: 84000 } }],
  },
};

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
function SlotHost() {
  const { setSlot } = usePhoneChromeState();
  return <div ref={setSlot} data-testid="phone-top" />;
}
const phoneTree = (d: ChMessagesData) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <PhoneChromeProvider>
        <div className="ch-root" data-ui="clubhouse">
          <SlotHost />
          <Messages data={d} />
        </div>
      </PhoneChromeProvider>
    </ToastProvider>
  </LazyMotion>
);
function showPhone(d: ChMessagesData = data) {
  layout.phone = true;
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as never;
  return render(phoneTree(d));
}
type User = ReturnType<typeof userEvent.setup>;
const newMessage = async (user: User, kind: RegExp) => {
  await user.click(screen.getAllByRole('button', { name: 'New message' })[0]!);
  const dlg = within(screen.getByRole('heading', { name: 'New message' }).closest('dialog') as HTMLElement);
  await user.click(dlg.getByRole('radio', { name: kind }));
  return dlg;
};
const openAnnouncement = async (user: User) => {
  await user.click(await screen.findByRole('button', { name: /^Announcements/, expanded: false }));
  await user.click(screen.getByRole('button', { name: /^Bus times/ }));
};

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

  it('desktop: a group of coaches alone is stopped before the broadcast (which would add the whole team)', async () => {
    const user = userEvent.setup();
    show();
    const dlg = await newMessage(user, /Group/);
    await user.type(dlg.getByRole('textbox', { name: 'Group name' }), 'Staff');
    await user.click(dlg.getByRole('option', { name: /Dan Whitfield/ }));
    await user.click(dlg.getByRole('button', { name: 'Create group' }));
    await expectCode('CH-7105', /Choose at least one player/);
    expect(hapticSpy).toHaveBeenCalledWith('warning');
    expect(a.createGolfTeamBroadcast).not.toHaveBeenCalled();
    // A player in it: the broadcast takes that player alone, and the coach joins after (D-45).
    a.createGolfTeamBroadcast.mockResolvedValue({ conversationId: 'g1' });
    await user.click(dlg.getByRole('option', { name: /Eli Brandt/ }));
    await user.click(dlg.getByRole('button', { name: 'Create group' }));
    await waitFor(() => expect(a.createGolfTeamBroadcast).toHaveBeenCalledWith({ teamId: 't1', title: 'Staff', selectedPlayerIds: ['p-eli'] }));
    await waitFor(() => expect(a.addGolfGroupMember).toHaveBeenCalledWith('g1', 'dan'));
  });

  it('a chosen player with no player id is stopped too: an empty list never reaches the broadcast', async () => {
    // createGolfTeamBroadcast refuses an empty list (it once meant the whole team); every chosen player here has no
    // player id, so the list would be empty. The group is stopped before any write.
    const user = userEvent.setup();
    const noIds: ChMessagesData = { ...data, directory: data.directory.map((p) => (p.role === 'player' ? { ...p, playerId: null } : p)) };
    show(noIds);
    const dlg = await newMessage(user, /Group/);
    await user.type(dlg.getByRole('textbox', { name: 'Group name' }), 'Travel');
    await user.click(dlg.getByRole('option', { name: /Eli Brandt/ }));
    await user.click(dlg.getByRole('button', { name: 'Create group' }));
    await expectCode('CH-7105', /Choose at least one player/);
    expect(a.createGolfTeamBroadcast).not.toHaveBeenCalled();
  });

  it('phone: two coaches picked make a group that is stopped the same way', async () => {
    const user = userEvent.setup();
    showPhone();
    await user.click(await screen.findByRole('button', { name: 'New message' }));
    const newMsg = await screen.findByRole('region', { name: 'New message' });
    await user.click(within(newMsg).getByRole('option', { name: /Dan Whitfield/ }));
    await user.click(within(newMsg).getByRole('option', { name: /Dana Cole/ }));
    await user.type(newMsg.querySelector('input[placeholder="Group name"]') as HTMLInputElement, 'Staff');
    await user.click(within(newMsg).getByRole('button', { name: 'Create group' }));
    await expectCode('CH-7105', /Choose at least one player/);
    expect(a.createGolfTeamBroadcast).not.toHaveBeenCalled();
  });
});

describe('P007 wiring · an announcement’s file opens through a signed link', () => {
  it('asks getPreviewUrl at the tap and fills the tab it opened with the signed link, never the stored file_url', async () => {
    const user = userEvent.setup();
    const win = { location: { href: '' }, close: vi.fn() };
    window.open = vi.fn(() => win) as never;
    a.getAnnouncementsWithMeta.mockResolvedValue({ success: true, data: [annRow] });
    a.getAnnouncementDetail.mockResolvedValue(annDetail);
    a.getPreviewUrl.mockResolvedValue({ data: { url: 'https://x.test/signed/itinerary.pdf?token=t', mimeType: 'application/pdf' }, error: null });
    show(player);
    await openAnnouncement(user);
    await user.click(await screen.findByRole('button', { name: 'Open Itinerary.pdf' }));
    await waitFor(() => expect(win.location.href).toBe('https://x.test/signed/itinerary.pdf?token=t'));
    expect(a.getPreviewUrl).toHaveBeenCalledWith('doc1');
    expect(window.open).toHaveBeenCalledWith('', '_blank');
    expect(document.querySelector('a[href*="object/public"]')).toBeNull();
  });

  it('a link that can’t be had closes the tab and says so (CH-7021), naming a file with no stored copy', async () => {
    const user = userEvent.setup();
    const win = { location: { href: '' }, close: vi.fn() };
    window.open = vi.fn(() => win) as never;
    a.getAnnouncementsWithMeta.mockResolvedValue({ success: true, data: [annRow] });
    a.getAnnouncementDetail.mockResolvedValue(annDetail);
    a.getPreviewUrl.mockResolvedValue({ data: null, error: 'Document has no stored file', noContent: true });
    show(player);
    await openAnnouncement(user);
    await user.click(await screen.findByRole('button', { name: 'Open Itinerary.pdf' }));
    await expectCode('CH-7021', /Couldn’t open Itinerary\.pdf.*no stored copy/);
    expect(win.close).toHaveBeenCalled();
    expect(hapticSpy).toHaveBeenCalledWith('error');
  });
});

describe('P007 wiring · deep links (70102)', () => {
  it('a ?conversation= link that arrives while Messages is open (the bell, on this page) opens that thread', async () => {
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

  it('a thread the list doesn’t hold yet is looked for once more, then opened', async () => {
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

describe('P007 wiring · message fields stop at the server’s limit', () => {
  it(`the composer and Edit take at most ${MESSAGE_MAX} characters, as sendMessageSchema and Fairway’s field do`, async () => {
    show();
    const box = (await screen.findByRole('textbox', { name: /Message Varsity team/ })) as HTMLTextAreaElement;
    expect(box.maxLength).toBe(5000);
    expect(MESSAGE_MAX).toBe(5000);
  });
});

const members = [
  { conversationId: 'team', userId: 'me', name: 'Maya Reyes', subtitle: 'Head coach', avatar: null, type: 'coach' },
  { conversationId: 'team', userId: 'jonah', name: 'Jonah Okafor', subtitle: 'Sophomore', avatar: null, type: 'player' },
  { conversationId: 'team', userId: 'eli', name: 'Eli Brandt', subtitle: 'Junior', avatar: null, type: 'player' },
];
const openDetails = (user: User) => user.click(screen.getByRole('button', { name: 'Details' }));

describe('P007 wiring · the group’s creator removes a member (removeGolfGroupMember, as Fairway allows)', () => {
  beforeEach(() => {
    a.getGolfConversationParticipantIdentities.mockResolvedValue({ participants: members });
  });

  it('asks first with the warning haptic, removes at once, then reads the group again and says so', async () => {
    const user = userEvent.setup();
    a.removeGolfGroupMember.mockResolvedValue({ success: true });
    show();
    await openDetails(user);
    expect(await screen.findByRole('button', { name: 'Remove Eli Brandt' })).toBeTruthy();
    // Never on the creator's own row: theirs is Leave group (hidden for the creator, D-47).
    expect(screen.queryByRole('button', { name: 'Remove Maya Reyes' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Remove Eli Brandt' }));
    await expectCode('CH-7504', /Remove Eli from Varsity team\?/);
    const dlg = within(code('CH-7504') as HTMLElement);
    hapticSpy.mockClear();
    await user.click(dlg.getByRole('button', { name: 'Remove' }));
    expect(hapticSpy).toHaveBeenCalledWith('warning');
    await waitFor(() => expect(a.removeGolfGroupMember).toHaveBeenCalledWith('team', 'eli'));
    expect(await screen.findByText(/Removed Eli from Varsity team/)).toBeTruthy();
    expect(hapticSpy).toHaveBeenCalledWith('success');
    expect(live.convs.refetch).toHaveBeenCalled();
    // The members are read again, without the skeleton coming back over the list.
    await waitFor(() => expect(a.getGolfConversationParticipantIdentities).toHaveBeenCalledTimes(2));
    expect(code('CH-7405')).toBeNull();
  });

  it('a refusal puts the row back and says why (CH-7024)', async () => {
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
    expect(await screen.findByRole('button', { name: 'Remove Eli Brandt' })).toBeTruthy();
  });

  it('someone who didn’t create the group has no Remove', async () => {
    const user = userEvent.setup();
    live.convs.conversations = [{ ...team, creator_id: 'jonah' }];
    show();
    await openDetails(user);
    await screen.findByText('Eli Brandt');
    expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull();
  });

  it('phone: the creator removes from the member row, after the same confirm', async () => {
    const user = userEvent.setup();
    a.removeGolfGroupMember.mockResolvedValue({ success: true });
    showPhone();
    await user.click(await screen.findByRole('button', { name: /^(?!Actions for ).*Varsity team/ }));
    const thread = await screen.findByRole('region', { name: /Varsity team/ });
    await user.click(within(thread).getByRole('button', { name: 'Details' }));
    await user.click(await screen.findByRole('button', { name: 'Remove Jonah Okafor' }));
    await user.click(within(code('CH-7504') as HTMLElement).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(a.removeGolfGroupMember).toHaveBeenCalledWith('team', 'jonah'));
    expect(screen.queryByRole('button', { name: 'Remove Maya Reyes' })).toBeNull();
  });
});

describe('P007 wiring · a search hit jumps to its message, as Fairway’s search does', () => {
  const older = { id: 'm0', conversation_id: 'team', sender_id: 'jonah', content: 'Which bus is ours', created_at: '2026-10-14T16:00:00Z', isRead: true };

  it('opens the thread, scrolls the matched message to the middle and marks it for a moment', async () => {
    const user = userEvent.setup();
    const seen: Element[] = [];
    const spy = vi.fn(function (this: Element) {
      seen.push(this);
    });
    const real = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = spy as never;
    try {
      live.msgs.messages = [older, mine];
      a.searchGolfMessages.mockResolvedValue({ results: [{ messageId: 'm0', conversationId: 'team', conversationName: 'Varsity team', senderName: 'Jonah Okafor', content: 'Which bus is ours', createdAt: older.created_at }] });
      show();
      await user.type(screen.getByRole('searchbox', { name: /Search conversations and messages/ }), 'bus');
      const hits = await screen.findByRole('region', { name: 'Messages matching your search' });
      await user.click(await within(hits).findByRole('button', { name: /Which bus is ours/ }));
      await waitFor(() => expect(seen.map((e) => e.id)).toContain('ch-ms-message-m0'));
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ block: 'center' }));
      const row = document.getElementById('ch-ms-message-m0')!;
      expect(row.className).toContain('is-found');
      await waitFor(() => expect(document.getElementById('ch-ms-message-m0')!.className).not.toContain('is-found'), { timeout: FOUND_FOR_MS + 1000 });
    } finally {
      Element.prototype.scrollIntoView = real;
    }
  }, FOUND_FOR_MS + 4000);
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

describe('P007 wiring · the phone’s Schedule invites the direct thread’s player, as desktop does', () => {
  it('a direct thread with a player adds &with=<golf_players.id>; a group invites nobody', async () => {
    const user = userEvent.setup();
    live.convs.conversations = [team, dm];
    const first = showPhone();
    await user.click(await screen.findByRole('button', { name: /^(?!Actions for ).*Jonah Okafor/ }));
    const thread = await screen.findByRole('region', { name: /Jonah Okafor/ });
    await user.click(within(thread).getByRole('button', { name: 'Details' }));
    expect((await screen.findByRole('link', { name: 'Schedule' })).getAttribute('href')).toBe('/golf/dashboard/calendar?new=1&with=p-jonah');
    first.unmount();
    showPhone();
    await user.click(await screen.findByRole('button', { name: /^(?!Actions for ).*Varsity team/ }));
    const group = await screen.findByRole('region', { name: /Varsity team/ });
    await user.click(within(group).getByRole('button', { name: 'Details' }));
    expect((await screen.findByRole('link', { name: 'Schedule' })).getAttribute('href')).toBe('/golf/dashboard/calendar?new=1');
  });
});

// Owner, 2026-10-31 (as Fairway's thread): a message that arrives takes its height at once and only rises and fades in.
// Opening its height pushed the thread above it up frame by frame while use-thread-anchor re-pinned the end (the jitter).
describe('B7 · a message that arrives rises in at the end of the thread', () => {
  const reply = { id: 'm2', conversation_id: 'team', sender_id: 'jonah', content: 'On our way', created_at: '2026-10-14T18:05:00Z', isRead: false };
  for (const phone of [false, true]) {
    it(`${phone ? 'phone' : 'desktop'}: the opened thread is drawn in place; a new reply rises in at its full height, then hands its styles back, and the rest never move`, async () => {
      const user = userEvent.setup();
      const view = phone ? showPhone() : show();
      await user.click(await screen.findByRole('button', { name: /^(?!Actions for ).*Varsity team/ }));
      await screen.findByRole('region', { name: /Varsity team/ });
      const had = document.getElementById('ch-ms-message-m1')!;
      expect(had.style.overflow).toBe('');
      expect(had.style.height).toBe('');
      live.msgs.messages = [mine, reply];
      view.rerender(phone ? phoneTree(data) : tree(data));
      const arrived = document.getElementById('ch-ms-message-m2')!;
      expect(arrived.style.height).toBe('');
      expect(arrived.style.overflow).toBe('');
      expect(arrived.style.transform).toBe('translateY(8px)');
      // No FLIP in a thread: the scroll is use-thread-anchor's, so the message already there takes no transform.
      expect(had.style.transform).toBe('');
      await waitFor(() => expect(document.getElementById('ch-ms-message-m2')!.style.opacity).not.toBe('0'), { timeout: 3000 });
      expect(document.getElementById('ch-ms-message-m2')!.style.height).toBe('');
    });
  }
});

describe('F-0003 · a message for one person never lands in a channel or group', () => {
  // A team of one player: the Team Channel has two members, so by count alone it looks like a direct thread.
  const channel2 = { id: 'channel', title: 'Team Channel', is_team_channel: true, participant_ids: ['me', 'dan'], participant_count: 2, unread_count: 0, other_participant: { id: 'dan', name: 'Dan Whitfield' }, last_message: { content: 'Practice moved', created_at: '2026-10-14T18:30:00Z', sender_id: 'dan' }, creator_id: 'dan' };
  const dmDan = { id: 'dm-dan', title: null, participant_ids: ['me', 'dan'], participant_count: 2, unread_count: 0, other_participant: { id: 'dan', name: 'Dan Whitfield' }, last_message: null, creator_id: 'me' };
  const stash = (p: { players: string[]; draft: string }) => new URL(messagesPrefillHref(p)!, 'https://x.test').searchParams;

  it('a two-person Team Channel is never taken for the direct thread: ?user= starts one', async () => {
    live.convs.conversations = [channel2];
    a.createGolfConversation.mockResolvedValue({ conversationId: 'dm-dan', reused: false });
    live.convs.refetch.mockImplementation(async () => {
      live.convs.conversations = [dmDan, channel2];
    });
    params.current = new URLSearchParams('user=dan');
    show(player);
    await waitFor(() => expect(a.createGolfConversation).toHaveBeenCalledWith(['dan'], 't1'));
    await screen.findByRole('textbox', { name: /Message Dan$/ });
    expect(code('CH-7002')).toBeNull();
  });

  it('an answer that is a group is refused (CH-7002): the sheet stays, and the draft never lands in the group', async () => {
    const user = userEvent.setup();
    // The server answers with the group the coach and Jonah share (the bug F-0003 fixed on the server).
    a.createGolfConversation.mockResolvedValue({ conversationId: 'team', reused: true });
    params.current = stash({ players: ['p-jonah'], draft: 'Bus moved to 7' });
    show();
    const dialog = await screen.findByRole('dialog', { name: 'New message' });
    await user.click(within(dialog).getByRole('button', { name: 'Start conversation' }));
    await expectCode('CH-7002', /Couldn’t start the conversation/);
    expect(screen.queryByRole('dialog', { name: 'New message' })).not.toBeNull();
    expect(screen.queryByRole('textbox', { name: /Message Varsity team/ })).toBeNull();
    await user.keyboard('{Escape}');
    await user.click(screen.getAllByRole('button', { name: /^(?!Actions for ).*Varsity team/ })[0]!);
    const box = (await screen.findByRole('textbox', { name: /Message Varsity team/ })) as HTMLTextAreaElement;
    expect(box.value).toBe('');
  });
});
