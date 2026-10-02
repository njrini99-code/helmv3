import { LazyMotion, domAnimation } from 'framer-motion';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Messages: every numbered state in docs/clubhouse/catalog/messages.md, found by its number. */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
const params = vi.hoisted(() => ({ current: new URLSearchParams() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, useSearchParams: () => params.current }));
vi.mock('../lib/use-now', () => ({ useNow: () => null }));
/** Phone or desktop layout (useChPhone), set per test. */
const layout = vi.hoisted(() => ({ phone: false }));
vi.mock('../lib/use-phone', () => ({ useChPhone: () => layout.phone, CH_PHONE_QUERY: '(max-width: 820px)' }));

/** The realtime hooks, as plain state the tests set. */
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
    getPendingAttachmentSend: vi.fn(async (_conversationId: string): Promise<{ clientMessageId: string; content: string; replyToId: string | null; attachments: { fileName: string }[] } | null> => null),
    retryPendingAttachmentSend: vi.fn(async (_conversationId: string): Promise<{ success: boolean; attachmentsFailed?: boolean; sendOutcome?: 'unknown' }> => ({ success: true })),
    sendMessageWithAttachments: vi.fn(async (_options: { conversationId: string; content: string; attachments: { file: File }[]; replyToId?: string | null }): Promise<{ success: boolean; error?: string; attachmentsFailed?: boolean; sendOutcome?: "unknown" }> => ({ success: true })) },
}));
vi.mock('@/hooks/golf/use-golf-messages', () => ({ useGolfConversations: () => live.convs, useGolfMessages: () => live.msgs }));
vi.mock('@/hooks/golf/use-message-reactions', async (orig) => ({ ...(await orig<object>()), useMessageReactions: () => live.reactions }));
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
}));
vi.mock('@/app/golf/actions/message-attachments', () => ({ getGolfConversationFiles: a.getGolfConversationFiles }));
vi.mock('@/app/golf/actions/message-mute', () => ({ getGolfConversationMute: a.getGolfConversationMute, setGolfConversationMute: a.setGolfConversationMute }));
vi.mock('@/app/golf/actions/announcements', () => ({
  completeAnnouncementTask: a.completeAnnouncementTask,
  createEnrichedAnnouncement: a.createEnrichedAnnouncement,
  getAnnouncementDetail: a.getAnnouncementDetail,
  getAnnouncementsWithMeta: a.getAnnouncementsWithMeta,
}));
vi.mock('@/app/golf/actions/communication', () => ({ acknowledgeAnnouncement: a.acknowledgeAnnouncement }));

import type { ChMessagesData } from '../data/messages';
import { Messages } from '../screens/messages/Messages';
import { DraftStore } from '../screens/messages/drafts';
import { MessagesSkeleton } from '../screens/messages/MessagesSkeleton';
import { MessagesNoTeam } from '../screens/messages/MessagesNoTeam';
import { ToastProvider } from '../ui/Toast';
import { PhoneChromeProvider, usePhoneChromeState } from '../shell/phone-chrome';
import './dialog-polyfill';

const code = (c: string) => [...document.querySelectorAll(`[data-ch-code="${c}"]`)].find((el) => el.tagName !== 'DIALOG' || el.hasAttribute('open')) ?? null;
async function expectCode(c: string, text?: RegExp) {
  await waitFor(() => expect(code(c)).not.toBeNull());
  if (text) expect(code(c)!.textContent).toMatch(text);
}

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
    { userId: 'jonah', name: 'Jonah Okafor', role: 'player', subtitle: 'Sophomore', playerId: 'p-jonah' },
    { userId: 'eli', name: 'Eli Brandt', role: 'player', subtitle: 'Junior', playerId: 'p-eli' },
  ],
  directoryError: false,
};
const team = { id: 'team', title: 'Varsity team', participant_ids: ['me', 'jonah', 'eli'], participant_count: 3, unread_count: 0, last_message: { content: 'Bus at 6:15', created_at: '2026-10-14T18:00:00Z', sender_id: 'me' }, creator_id: 'me' };
const mine = { id: 'm1', conversation_id: 'team', sender_id: 'me', content: 'Bus at 6:15', created_at: '2026-10-14T18:00:00Z', isRead: true };

function show(d: ChMessagesData = data) {
  return render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          <Messages data={d} />
        </div>
      </ToastProvider>
    </LazyMotion>,
  );
}
/** The phone layout, inside the shell's phone chrome so the page's own top bar (New message) renders. */
function SlotHost() {
  const { setSlot } = usePhoneChromeState();
  return <div ref={setSlot} data-testid="phone-top" />;
}
function showPhone(d: ChMessagesData = data) {
  layout.phone = true;
  // Phone width: nothing opens beside the list.
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as never;
  return render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <PhoneChromeProvider>
          <div className="ch-root" data-ui="clubhouse">
            <SlotHost />
            <Messages data={d} />
          </div>
        </PhoneChromeProvider>
      </ToastProvider>
    </LazyMotion>,
  );
}
type User = ReturnType<typeof userEvent.setup>;
const openDetails = (user: User) => user.click(screen.getByRole('button', { name: 'Details' }));
const messageMenu = async (user: User, item: string) => {
  await user.click(screen.getByRole('button', { name: 'More message actions' }));
  await user.click(await screen.findByRole('menuitem', { name: item }));
};
const setOnline = (v: boolean) => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => v });

beforeEach(() => {
  // Drafts persist per tab (F-12); each test starts with none.
  sessionStorage.clear();
  // Desktop width: the newest thread opens beside the rail.
  window.matchMedia = ((q: string) => ({ matches: /min-width/.test(q), media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as never;
  hapticSpy.mockClear();
  router.refresh.mockClear();
  params.current = new URLSearchParams();
  for (const f of Object.values(a)) f.mockReset();
  a.getAnnouncementsWithMeta.mockResolvedValue({ success: true, data: [] });
  a.getGolfConversationMute.mockResolvedValue({ success: true, data: { muted: false, until: null } });
  a.getGolfConversationParticipantIdentities.mockResolvedValue({ participants: [] });
  a.searchGolfMessages.mockResolvedValue({ results: [] });
  live.convs.conversations = [team];
  live.convs.loading = false;
  live.convs.error = null;
  live.msgs.messages = [mine];
  live.msgs.loading = false;
  live.msgs.error = null;
  live.msgs.sendMessage.mockReset().mockResolvedValue(undefined);
  live.msgs.editMessage.mockReset().mockResolvedValue(undefined);
  live.msgs.removeMessage.mockReset().mockResolvedValue(undefined);
  live.reactions.setReaction.mockReset().mockResolvedValue(undefined);
  live.files.sendMessageWithAttachments.mockReset().mockResolvedValue({ success: true });
  live.files.getPendingAttachmentSend.mockReset().mockResolvedValue(null);
  live.files.retryPendingAttachmentSend.mockReset().mockResolvedValue({ success: true });
  a.getGolfConversationFiles.mockResolvedValue({ files: [] });
  a.getGolfGroupAddCandidates.mockResolvedValue({ candidates: [] });
  a.addGolfGroupMember.mockResolvedValue({ success: true });
});
afterEach(() => {
  setOnline(true);
  layout.phone = false;
});

describe('Messages · actions that fail', () => {
  it('CH-7001 a deep link to a player who is not on the team', async () => {
    params.current = new URLSearchParams('player=nobody');
    show();
    await expectCode('CH-7001', /Couldn't open that conversation/);
  });

  it('CH-7001 ?user= (a player’s Message coach) starts the thread with that person, or says they aren’t on the team', async () => {
    a.createGolfConversation.mockResolvedValue({ error: 'nope' });
    params.current = new URLSearchParams('user=eli');
    const { unmount } = show();
    // Found in the directory: the start is attempted (and here refused, CH-7002), never "not on your team".
    await expectCode('CH-7002');
    expect(a.createGolfConversation).toHaveBeenCalled();
    expect(code('CH-7001')).toBeNull();
    unmount();
    params.current = new URLSearchParams('user=nobody');
    show();
    await expectCode('CH-7001', /That person isn’t on your team/);
  });

  it('CH-7002 starting a direct thread fails', async () => {
    a.createGolfConversation.mockResolvedValue({ error: 'nope' });
    params.current = new URLSearchParams('player=p-eli');
    show();
    await expectCode('CH-7002', /Couldn't start the conversation/);
  });

  it('CH-7004 CH-7005 71201 a send that throws points to its bubble (the box stays empty); a network error says to check first', async () => {
    const user = userEvent.setup();
    live.msgs.sendMessage.mockRejectedValueOnce(new Error('refused'));
    show();
    const box = await screen.findByRole('textbox', { name: /Message Varsity team/ });
    await user.type(box, 'Bring rain gear{Enter}');
    await expectCode('CH-7004', /Couldn't send the message/);
    expect((box as HTMLTextAreaElement).value).toBe('');
    live.msgs.sendMessage.mockRejectedValueOnce(new Error('network timeout'));
    await user.type(box, 'Bus at 6{Enter}');
    await expectCode('CH-7005', /Couldn't confirm this message sent/);
  });

  it('CH-7007 CH-7501 CH-7008 editing and deleting fail; deleting asks first', async () => {
    const user = userEvent.setup();
    live.msgs.editMessage.mockRejectedValue(new Error('refused'));
    live.msgs.removeMessage.mockRejectedValue(new Error('refused'));
    show();
    await screen.findByText('Bus at 6:15', { selector: '.ch-ms-bub' });
    await messageMenu(user, 'Edit');
    const edit = within(screen.getByRole('heading', { name: 'Edit message' }).closest('dialog') as HTMLElement);
    await user.type(edit.getByRole('textbox'), ' sharp');
    await user.click(edit.getByRole('button', { name: /Save/ }));
    await expectCode('CH-7007', /Couldn't edit the message/);
    await user.click(edit.getByRole('button', { name: 'Cancel' }));
    await messageMenu(user, 'Delete');
    await expectCode('CH-7501', /Delete this message\?/);
    await user.click(within(code('CH-7501') as HTMLElement).getByRole('button', { name: /^Delete/ }));
    await expectCode('CH-7008', /Couldn't delete the message/);
  });

  it('CH-7009 a reaction that fails', async () => {
    const user = userEvent.setup();
    live.reactions.setReaction.mockRejectedValue(new Error('refused'));
    show();
    await screen.findByText('Bus at 6:15', { selector: '.ch-ms-bub' });
    await user.click(screen.getByRole('button', { name: 'React' }));
    await user.click(screen.getAllByRole('menuitem', { name: /^React / })[0]!);
    await expectCode('CH-7009', /Couldn't save the reaction/);
  });

  it('desktop: a right click on a message opens its reaction bar, as the React button does', async () => {
    show();
    const bubble = await screen.findByText('Bus at 6:15', { selector: '.ch-ms-bub' });
    expect(screen.queryByRole('menu', { name: 'Reactions' })).toBeNull();
    fireEvent.contextMenu(bubble);
    expect(await screen.findByRole('menu', { name: 'Reactions' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'React' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('CH-7010 CH-7502 leaving a group asks first; a failed leave says so', async () => {
    const user = userEvent.setup();
    a.leaveGolfGroup.mockResolvedValue({ error: 'nope' });
    // Only someone who didn't create the group can leave it.
    live.convs.conversations = [{ ...team, creator_id: 'dan' }];
    show();
    await openDetails(user);
    await user.click(await screen.findByRole('button', { name: 'Leave group' }));
    await expectCode('CH-7502', /Leave Varsity team\?/);
    await user.click(within(code('CH-7502') as HTMLElement).getByRole('button', { name: 'Leave group' }));
    await expectCode('CH-7010', /Couldn't leave the group/);
  });

  it('CH-1902 the Messages progress notice ends when mute settles and its failure stays visible', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      let finish!: (result: { success: boolean; error: string }) => void;
      a.setGolfConversationMute.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
      show();
      await openDetails(user);
      await user.click(await screen.findByRole('button', { name: 'Mute 8 hours' }));
      expect(a.setGolfConversationMute).toHaveBeenCalledTimes(1);
      act(() => vi.advanceTimersByTime(5001));
      await expectCode('CH-1902', /Still saving/);
      await act(async () => finish({ success: false, error: 'nope' }));
      await expectCode('CH-7011', /Couldn't mute the conversation/);
      await waitFor(() => expect(code('CH-1902')).toBeNull());
      expect(a.setGolfConversationMute).toHaveBeenCalledTimes(1);
      expect(code('CH-7011')).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('CH-7011 muting fails', async () => {
    const user = userEvent.setup();
    a.setGolfConversationMute.mockResolvedValue({ success: false, error: 'nope' });
    show();
    await openDetails(user);
    await user.click(await screen.findByRole('button', { name: 'Mute 8 hours' }));
    await expectCode('CH-7011', /Couldn't mute the conversation/);
  });

  it('CH-1903 an action while offline is refused and nothing is sent', async () => {
    const user = userEvent.setup();
    show();
    await openDetails(user);
    const mute = await screen.findByRole('button', { name: 'Mute 8 hours' });
    setOnline(false);
    await user.click(mute);
    await expectCode('CH-1903', /Couldn't mute the conversation: you're offline/);
    expect(a.setGolfConversationMute).not.toHaveBeenCalled();
  });
});

describe('Messages · reads that fail', () => {
  it('CH-7201 conversations do not load', async () => {
    const user = userEvent.setup();
    live.convs.conversations = [];
    live.convs.error = new Error('boom');
    show();
    await expectCode('CH-7201', /Conversations didn't load/);
    await user.click(within(code('CH-7201') as HTMLElement).getByRole('button', { name: 'Try again' }));
    expect(live.convs.refetch).toHaveBeenCalled();
  });

  it('CH-7202 a conversation does not load', async () => {
    live.msgs.messages = [];
    live.msgs.error = new Error('boom');
    show();
    await expectCode('CH-7202', /This conversation didn't load/);
  });

  it('CH-7216 a conversation that fails to refresh keeps its messages and says they may be out of date', async () => {
    live.msgs.error = new Error('boom');
    show();
    await expectCode('CH-7216', /This conversation may be out of date/);
    expect(code('CH-7202')).toBeNull();
    expect(code('CH-7304')).toBeNull();
  });

  it('CH-7203 71402 message search does not load, with Try again', async () => {
    const user = userEvent.setup();
    a.searchGolfMessages.mockRejectedValueOnce(new Error('boom'));
    show();
    await user.type(screen.getByRole('searchbox', { name: /Search conversations and messages/ }), 'bus');
    await expectCode('CH-7203', /Message search didn't load/);
    await user.click(within(code('CH-7203') as HTMLElement).getByRole('button', { name: 'Try again' }));
    await expectCode('CH-7303', /No messages mention “bus”/);
  });

  it('CH-7204 group members do not load, with Try again', async () => {
    const user = userEvent.setup();
    a.getGolfConversationParticipantIdentities.mockResolvedValueOnce({ error: 'boom' });
    show();
    await openDetails(user);
    await expectCode('CH-7204', /Members didn't load/);
    await user.click(within(code('CH-7204') as HTMLElement).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(a.getGolfConversationParticipantIdentities).toHaveBeenCalledTimes(2));
  });

  it('CH-7205 the team list does not load in New message', async () => {
    const user = userEvent.setup();
    show({ ...data, directoryError: true, directory: [] });
    await user.click(screen.getAllByRole('button', { name: 'New message' })[0]!);
    await expectCode('CH-7205', /Your team list didn't load/);
    await user.click(within(code('CH-7205') as HTMLElement).getByRole('button', { name: 'Try again' }));
    expect(router.refresh).toHaveBeenCalled();
  });

  it('CH-7208 the mute setting does not load, with Try again', async () => {
    const user = userEvent.setup();
    a.getGolfConversationMute.mockResolvedValueOnce({ success: false, error: 'boom' });
    show();
    await openDetails(user);
    await expectCode('CH-7208', /The mute setting didn't load/);
  });

  it('CH-7212 a crash in the thread is contained; the rail stays', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    live.msgs.messages = [{ ...mine, created_at: 'not a date' }];
    show();
    await expectCode('CH-7212', /This conversation couldn’t be shown/);
    expect(screen.getByRole('complementary', { name: 'Conversations' })).toBeTruthy();
    quiet.mockRestore();
  });
});

describe('Messages · empty and loading', () => {
  it('CH-7309 nothing at all yet: the page is the first-run empty, with New message as its one action', async () => {
    const user = userEvent.setup();
    live.convs.conversations = [];
    live.msgs.messages = [];
    show();
    await expectCode('CH-7309', /No conversations yet/);
    expect(code('CH-7301')).toBeNull();
    expect(code('CH-7305')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'New message' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('CH-7301 CH-7305 no conversations, but an announcement: the rail and thread empties', async () => {
    live.convs.conversations = [];
    live.msgs.messages = [];
    a.getAnnouncementsWithMeta.mockResolvedValue({ success: true, data: [annRow] });
    show();
    await expectCode('CH-7301', /No conversations yet/);
    await expectCode('CH-7305', /Start your first conversation/);
    expect(code('CH-7309')).toBeNull();
  });

  it('CH-7302 a rail search that matches nothing', async () => {
    const user = userEvent.setup();
    show();
    await user.type(screen.getByRole('searchbox', { name: /Search conversations and messages/ }), 'zzz');
    await expectCode('CH-7302', /No conversation matches “zzz”/);
  });

  it('CH-7304 a thread with no messages yet', async () => {
    live.msgs.messages = [];
    show();
    await expectCode('CH-7304', /No messages yet\. Say hello to the group/);
  });

  it('CH-7401 CH-7402 CH-7403 route, rail and thread loading', async () => {
    render(<MessagesSkeleton />);
    expect(code('CH-7401')!.getAttribute('aria-busy')).toBe('true');
    live.convs.conversations = [];
    live.convs.loading = true;
    show();
    await expectCode('CH-7402');
  });

  it('CH-7403 the thread is loading', async () => {
    live.msgs.messages = [];
    live.msgs.loading = true;
    show();
    await expectCode('CH-7403');
  });
});

describe('Messages · validation, haptics, accessibility', () => {
  it('CH-7104 CH-7105 a new group needs a name and people', async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getAllByRole('button', { name: 'New message' })[0]!);
    const dlg = within(screen.getByRole('heading', { name: 'New message' }).closest('dialog') as HTMLElement);
    await user.click(dlg.getByRole('radio', { name: /Group/ }));
    const submit = dlg.getAllByRole('button').filter((b) => /Create|Start|Send/.test(b.textContent ?? ''));
    await user.click(submit[submit.length - 1]!);
    await expectCode('CH-7104', /Name the group/);
  });

  it('CH-7016 CH-7017 71401 a message that did not send says so in the thread, with Retry', async () => {
    const user = userEvent.setup();
    live.msgs.messages = [{ ...mine, id: 'f1', sendFailed: true, sendOutcome: 'refused' }, { ...mine, id: 'f2', content: 'Second', sendFailed: true, sendOutcome: 'unknown' }];
    show();
    await expectCode('CH-7016', /Not sent/);
    await expectCode('CH-7017', /Couldn’t confirm this sent/);
    await user.click(within(code('CH-7016') as HTMLElement).getByRole('button', { name: 'Retry' }));
    expect(live.msgs.retryMessage).toHaveBeenCalledWith('f1');
  });

  it('CH-7801 the composer is named for the conversation; failures in the thread are alerts', async () => {
    live.msgs.messages = [{ ...mine, id: 'f1', sendFailed: true, sendOutcome: 'refused' }];
    show();
    expect(await screen.findByRole('textbox', { name: 'Message Varsity team' })).toBeTruthy();
    await expectCode('CH-7016');
    expect(code('CH-7016')!.getAttribute('role')).toBe('alert');
  });

  it('CH-7701 a send that fails lands with the error pattern', async () => {
    const user = userEvent.setup();
    live.msgs.sendMessage.mockRejectedValueOnce(new Error('refused'));
    show();
    await user.type(await screen.findByRole('textbox', { name: /Message Varsity team/ }), 'Hi{Enter}');
    await waitFor(() => expect(hapticSpy).toHaveBeenCalledWith('error'));
    await act(async () => {});
  });
});

const player: ChMessagesData = { ...data, role: 'player', viewerUserId: 'me', viewerName: 'Jonah Okafor', viewerPlayerId: 'p-me' };
const annRow = { id: 'a1', title: 'Bus times', body: 'Bus leaves at 6:15.', urgency: 'normal', published_at: '2026-10-14T17:00:00Z', created_at: '2026-10-14T17:00:00Z', requires_acknowledgement: true, acknowledged_count: 0, total_recipients: 2, has_player_acknowledged: false, task_count: 1, completed_task_count: 0, document_count: 0 };
const annDetail = (title: unknown = 'Upload yardage book') => ({
  success: true,
  data: { id: 'a1', acknowledgements: [], recipients: [], documents: [], tasks: [{ task_id: 't1', task: { title, due_date: null }, assignments: [{ player_id: 'p-me', status: 'pending' }] }] },
});
const openAnnouncement = async (user: User) => user.click(await screen.findByRole('button', { name: /Bus times/ }));
const newMessage = async (user: User, kind: RegExp) => {
  await user.click(screen.getAllByRole('button', { name: 'New message' })[0]!);
  const dlg = within(screen.getByRole('heading', { name: 'New message' }).closest('dialog') as HTMLElement);
  await user.click(dlg.getByRole('radio', { name: kind }));
  return dlg;
};
const never = () => new Promise(() => {});

describe('Messages · more actions that fail', () => {
  it('CH-7003 creating a group fails', async () => {
    const user = userEvent.setup();
    a.createGolfTeamBroadcast.mockResolvedValue({ error: 'nope' });
    show();
    const dlg = await newMessage(user, /Group/);
    await user.type(dlg.getByRole('textbox', { name: 'Group name' }), 'Travel');
    await user.click(dlg.getByRole('option', { name: /Jonah Okafor/ }));
    await user.click(dlg.getByRole('button', { name: 'Create group' }));
    await expectCode('CH-7003', /Couldn't create the group/);
  });

  it('CH-7101 CH-7006 a file of the wrong type is refused; a failed attachment send says so', async () => {
    const user = userEvent.setup({ applyAccept: false });
    live.files.sendMessageWithAttachments.mockResolvedValue({ success: false, error: 'nope' });
    show();
    await screen.findByRole('textbox', { name: /Message Varsity team/ });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(['x'], 'setup.exe', { type: 'application/x-msdownload' }));
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await expectCode('CH-7101', /Can't attach setup\.exe/);
    expect(live.files.sendMessageWithAttachments).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Remove setup.exe' }));
    await user.upload(input, new File(['x'], 'plan.pdf', { type: 'application/pdf' }));
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await expectCode('CH-7006', /Couldn't send the attachment/);
  });

  it('CH-7406 CH-7012 the details load behind the announcement; a failed acknowledgement says so', async () => {
    const user = userEvent.setup();
    a.getAnnouncementsWithMeta.mockResolvedValue({ success: true, data: [annRow] });
    a.getAnnouncementDetail.mockImplementation(never);
    a.acknowledgeAnnouncement.mockResolvedValue({ success: false, error: 'nope' });
    show(player);
    await openAnnouncement(user);
    await expectCode('CH-7406');
    await user.click(screen.getByRole('button', { name: 'Acknowledge' }));
    await expectCode('CH-7012', /Couldn't send your acknowledgement/);
  });

  it('CH-7013 marking a task done fails', async () => {
    const user = userEvent.setup();
    a.getAnnouncementsWithMeta.mockResolvedValue({ success: true, data: [annRow] });
    a.getAnnouncementDetail.mockResolvedValue(annDetail());
    a.completeAnnouncementTask.mockResolvedValue({ success: false, error: 'nope' });
    show(player);
    await openAnnouncement(user);
    await user.click(await screen.findByRole('button', { name: 'Mark done' }));
    await expectCode('CH-7013', /Couldn't mark the task done/);
  });

  it('CH-7102 CH-7103 CH-7014 an announcement needs a title and a body; a failed post says so', async () => {
    const user = userEvent.setup();
    a.createEnrichedAnnouncement.mockResolvedValue({ success: false, error: 'nope' });
    show();
    const dlg = await newMessage(user, /Announcement/);
    const post = () => user.click(within(screen.getByRole('heading', { name: 'New announcement' }).closest('dialog') as HTMLElement).getByRole('button', { name: 'Post announcement' }));
    await post();
    await expectCode('CH-7102', /Give the announcement a title/);
    await expectCode('CH-7103', /Write what the team needs to know/);
    expect(a.createEnrichedAnnouncement).not.toHaveBeenCalled();
    await user.type(dlg.getByRole('textbox', { name: /^Title/ }), 'Bus times');
    await user.type(dlg.getByRole('textbox', { name: /^Message/ }), 'Bus leaves at 6:15.');
    await post();
    await expectCode('CH-7014', /Couldn't post the announcement/);
  });

  it('CH-7015 an open conversation that disappears says so', async () => {
    const tree = () => (
      <LazyMotion features={domAnimation}>
        <ToastProvider>
          <div className="ch-root" data-ui="clubhouse">
            <Messages data={data} />
          </div>
        </ToastProvider>
      </LazyMotion>
    );
    const view = render(tree());
    await screen.findByRole('textbox', { name: /Message Varsity team/ });
    live.convs.conversations = [{ ...team, id: 'other', title: 'Travel' }];
    view.rerender(tree());
    await expectCode('CH-7015', /That conversation isn't available/);
  });
});

describe('Messages · more reads that fail', () => {
  it('CH-7206 announcements do not load, with Try again', async () => {
    const user = userEvent.setup();
    a.getAnnouncementsWithMeta.mockResolvedValue({ success: false, error: 'boom' });
    show();
    await expectCode('CH-7206', /Announcements didn't load/);
    await user.click(within(code('CH-7206') as HTMLElement).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(a.getAnnouncementsWithMeta).toHaveBeenCalledTimes(2));
  });

  it('CH-7207 an announcement’s details do not load, with Try again', async () => {
    const user = userEvent.setup();
    a.getAnnouncementsWithMeta.mockResolvedValue({ success: true, data: [annRow] });
    a.getAnnouncementDetail.mockResolvedValue({ success: false, error: 'boom' });
    show(player);
    await openAnnouncement(user);
    await expectCode('CH-7207', /The details didn't load/);
    await user.click(within(code('CH-7207') as HTMLElement).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(a.getAnnouncementDetail).toHaveBeenCalledTimes(2));
  });

  it('CH-7408 CH-7209 attachments load in place; a failed tile tries again when tapped', async () => {
    const user = userEvent.setup();
    live.msgs.messages = [{ ...mine, has_attachments: true }];
    a.getGolfMessageAttachments.mockImplementationOnce(never).mockResolvedValue({ error: 'boom' });
    const view = show();
    await expectCode('CH-7408');
    view.unmount();
    show();
    await expectCode('CH-7209', /Attachment didn't load/);
    await user.click(code('CH-7209') as HTMLElement);
    await waitFor(() => expect(a.getGolfMessageAttachments).toHaveBeenCalledTimes(3));
  });

  it('CH-7210 a crash in the conversation list is contained', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    live.convs.conversations = [{ ...team, last_message: { ...team.last_message, created_at: 'not a date' } }];
    show();
    await expectCode('CH-7210', /Your conversations couldn’t be shown/);
    quiet.mockRestore();
  });

  it('CH-7211 a crash in an announcement is contained', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    a.getAnnouncementsWithMeta.mockResolvedValue({ success: true, data: [annRow] });
    a.getAnnouncementDetail.mockResolvedValue(annDetail({}));
    show(player);
    await openAnnouncement(user);
    await expectCode('CH-7211', /This announcement couldn’t be shown/);
    expect(screen.getByRole('complementary', { name: 'Conversations' })).toBeTruthy();
    quiet.mockRestore();
  });

  it('CH-7213 a crash in details is contained', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    a.getGolfConversationParticipantIdentities.mockResolvedValue({ participants: [{ userId: 'dan', name: 'Dan', subtitle: {}, type: 'player' }] });
    show();
    await openDetails(user);
    await expectCode('CH-7213', /Details couldn’t be shown/);
    quiet.mockRestore();
  });
});

describe('Messages · more loading', () => {
  it('CH-7404 message search is running', async () => {
    const user = userEvent.setup();
    a.searchGolfMessages.mockImplementation(never);
    show();
    await user.type(screen.getByRole('searchbox', { name: /Search conversations and messages/ }), 'bus');
    await expectCode('CH-7404');
  });

  it('CH-7405 CH-7407 members and the mute setting are loading', async () => {
    const user = userEvent.setup();
    a.getGolfConversationParticipantIdentities.mockImplementation(never);
    a.getGolfConversationMute.mockImplementation(never);
    show();
    await openDetails(user);
    await expectCode('CH-7405');
    await expectCode('CH-7407');
  });
});

const nora = { userId: 'nora', name: 'Nora Castillo', avatarUrl: null, subtitle: 'Freshman', type: 'player' };
const dan = { userId: 'dan', name: 'Dan Whitfield', role: 'coach' as const, subtitle: 'Assistant coach', playerId: null };
const deferred = <T,>() => {
  let resolve: (v: T) => void = () => {};
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

describe('Messages · group members (D-45, D-47)', () => {
  it('CH-7410 CH-7215 CH-7307 the Add sheet loads, fails with Try again, and says when everyone is in', async () => {
    const user = userEvent.setup();
    const first = deferred<{ error: string }>();
    a.getGolfGroupAddCandidates.mockReturnValueOnce(first.promise).mockResolvedValueOnce({ candidates: [] });
    show();
    await openDetails(user);
    await user.click(await screen.findByRole('button', { name: /^Add$/ }));
    await expectCode('CH-7410');
    first.resolve({ error: 'nope' });
    await expectCode('CH-7215', /team list didn't load/);
    await user.click(within(code('CH-7215') as HTMLElement).getByRole('button', { name: /Try again/ }));
    await expectCode('CH-7307', /Everyone on the team is already in this group/);
  });

  it('CH-7018 70902 adding someone who cannot be added says so; a success names them', async () => {
    const user = userEvent.setup();
    a.getGolfGroupAddCandidates.mockResolvedValue({ candidates: [nora] });
    a.addGolfGroupMember.mockResolvedValueOnce({ error: 'nope' }).mockResolvedValueOnce({ success: true });
    show();
    await openDetails(user);
    await user.click(await screen.findByRole('button', { name: /^Add$/ }));
    await user.click(await screen.findByRole('button', { name: 'Add Nora Castillo' }));
    await expectCode('CH-7018', /Couldn't add Nora/);
    await user.click(screen.getByRole('button', { name: 'Add Nora Castillo' }));
    expect(await screen.findByText(/Added Nora to Varsity team/)).toBeTruthy();
    expect(a.addGolfGroupMember).toHaveBeenLastCalledWith('team', 'nora');
  });

  it('CH-7019 a coach in a new group is added after it is created; one who cannot be added is named', async () => {
    const user = userEvent.setup();
    a.createGolfTeamBroadcast.mockResolvedValue({ conversationId: 'g1' });
    a.addGolfGroupMember.mockResolvedValue({ error: 'nope' });
    show({ ...data, directory: [dan, ...data.directory] });
    const dlg = await newMessage(user, /Group/);
    await user.type(dlg.getByRole('textbox', { name: 'Group name' }), 'Travel');
    await user.click(dlg.getByRole('option', { name: /Jonah Okafor/ }));
    await user.click(dlg.getByRole('option', { name: /Dan Whitfield/ }));
    await user.click(dlg.getByRole('button', { name: 'Create group' }));
    await expectCode('CH-7019', /Group created, but Dan wasn't added/);
    expect(a.createGolfTeamBroadcast).toHaveBeenCalledWith({ teamId: 't1', title: 'Travel', selectedPlayerIds: ['p-jonah'] });
    expect(a.addGolfGroupMember).toHaveBeenCalledWith('g1', 'dan');
  });
});

describe('Messages · phone', () => {
  const openThread = async (user: User) => {
    await user.click(await screen.findByRole('button', { name: /Varsity team/ }));
    return screen.findByRole('region', { name: /Varsity team/ });
  };

  it('CH-7804 CH-7704 71901 the inbox pushes a named thread; a message opens its actions by long press or its button', async () => {
    const user = userEvent.setup();
    showPhone();
    const thread = await openThread(user);
    expect(within(thread).getByRole('button', { name: 'Back to Messages' })).toBeTruthy();
    const bubble = await within(thread).findByText('Bus at 6:15', { selector: '.ch-ms-bub' });
    const stack = bubble.closest('.ch-ms-msg__stack') as HTMLElement;
    hapticSpy.mockClear();
    act(() => {
      stack.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }));
    });
    await waitFor(() => expect(hapticSpy).toHaveBeenCalledWith('press'), { timeout: 1500 });
    await expectCode('CH-7604');
    const sheet = within(code('CH-7604') as HTMLElement);
    expect(sheet.getByRole('button', { name: 'Copy' })).toBeTruthy();
    expect(sheet.getByRole('button', { name: 'Edit' })).toBeTruthy();
    expect(sheet.getByRole('button', { name: 'Delete' })).toBeTruthy();
    await user.click(sheet.getByRole('button', { name: 'Close' }));
    // Without a long press: the named button VoiceOver and keyboards reach.
    await user.click(within(thread).getByRole('button', { name: 'Message actions' }));
    await expectCode('CH-7604');
    await user.click(within(code('CH-7604') as HTMLElement).getByRole('button', { name: 'Close' }));
    await user.click(within(thread).getByRole('button', { name: 'Details' }));
    const details = await screen.findByRole('region', { name: 'Details' });
    expect(within(details).getByRole('button', { name: 'Back to Chat' })).toBeTruthy();
    // The thread under Details is out of reach until Details pops.
    expect(thread.hasAttribute('inert')).toBe(true);
  });

  it('72001 phone Return adds a line; tapping Send sends the complete text', async () => {
    const user = userEvent.setup();
    showPhone();
    const thread = await openThread(user);
    const box = within(thread).getByRole('textbox', { name: /Message Varsity team/ }) as HTMLTextAreaElement;
    await user.type(box, 'Bus at 6{Enter}Bring water');
    expect(box.value).toBe('Bus at 6\nBring water');
    expect(box.getAttribute('enterkeyhint')).toBe('enter');
    expect(live.msgs.sendMessage).not.toHaveBeenCalled();
    await user.click(within(thread).getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(live.msgs.sendMessage).toHaveBeenCalledWith('Bus at 6\nBring water'));
  });

  it('72001 a bordered six-line phone editor fits its content and longer drafts retain the cap', async () => {
    const user = userEvent.setup();
    showPhone();
    const thread = await openThread(user);
    const box = within(thread).getByRole('textbox', { name: /Message Varsity team/ }) as HTMLTextAreaElement;
    // JSDOM has no layout: reproduce WebKit's measured content and border box.
    box.style.cssText = 'max-height:144px;box-sizing:border-box;border:3px solid transparent';
    const contentHeight = vi.spyOn(box, 'scrollHeight', 'get').mockReturnValue(138);
    const sixLines = 'Travel plan\nBreakfast at six\nMeet at the field house\nBring pairings\nRain gear\nThanks, coach';
    fireEvent.change(box, { target: { value: sixLines } });
    expect(box.style.height).toBe('144px');
    expect(box.value).toBe(sixLines);
    contentHeight.mockReturnValue(158);
    fireEvent.change(box, { target: { value: `${sixLines}\nOne more detail` } });
    expect(box.style.height).toBe('144px');
    expect(box.value).toContain('One more detail');
    expect(live.msgs.sendMessage).not.toHaveBeenCalled();
    contentHeight.mockRestore();
  });

  it('72002 Reply from the message sheet sends its persisted parent id and Cancel removes it', async () => {
    const user = userEvent.setup();
    showPhone();
    const thread = await openThread(user);
    await user.click(within(thread).getByRole('button', { name: 'Message actions' }));
    const sheet = within(code('CH-7604') as HTMLElement);
    expect(sheet.getByLabelText('Selected message').textContent).toContain('Bus at 6:15');
    await user.click(sheet.getByRole('button', { name: 'Reply' }));
    expect(within(thread).getByLabelText('Reply to You').textContent).toContain('Bus at 6:15');
    const box = within(thread).getByRole('textbox', { name: /Message Varsity team/ });
    expect(document.activeElement).toBe(box);
    await user.type(box, 'I will be there');
    await user.click(within(thread).getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(live.msgs.sendMessage).toHaveBeenCalledWith('I will be there', 'm1'));
    expect(within(thread).queryByRole('button', { name: 'Cancel reply' })).toBeNull();
    await user.click(within(thread).getByRole('button', { name: 'Message actions' }));
    await user.click(within(code('CH-7604') as HTMLElement).getByRole('button', { name: 'Reply' }));
    await user.click(within(thread).getByRole('button', { name: 'Cancel reply' }));
    expect(within(thread).queryByLabelText('Reply to You')).toBeNull();
  });

  it('72002 horizontal reply gesture respects vertical scrolling and the shell back edge', async () => {
    const user = userEvent.setup();
    showPhone();
    const thread = await openThread(user);
    const stack = (await within(thread).findByText('Bus at 6:15', { selector: '.ch-ms-bub' })).closest('.ch-ms-msg__stack') as HTMLElement;
    const gesture = (x: number, y: number, endX: number, endY: number) => {
      fireEvent.pointerDown(stack, { clientX: x, clientY: y });
      fireEvent.pointerMove(stack, { clientX: endX, clientY: endY });
      fireEvent.pointerUp(stack, { clientX: endX, clientY: endY });
    };
    // MouseEvent preserves pointer coordinates in jsdom, where PointerEvent is absent.
    const original = window.PointerEvent;
    window.PointerEvent = MouseEvent as typeof PointerEvent;
    try {
      gesture(80, 80, 145, 130);
      expect(within(thread).queryByRole('button', { name: 'Cancel reply' })).toBeNull();
      gesture(12, 80, 100, 80);
      expect(within(thread).queryByRole('button', { name: 'Cancel reply' })).toBeNull();
      gesture(80, 80, 145, 85);
      expect(within(thread).getByRole('button', { name: 'Cancel reply' })).toBeTruthy();
    } finally { window.PointerEvent = original; }
  });

  it('72002 loaded, deleted and unavailable reply parents are distinguished without invented context', async () => {
    live.msgs.messages = [mine, { ...mine, id: 'm2', content: 'Yes coach', sender_id: 'jonah', reply_to_id: 'm1' }, { ...mine, id: 'm3', content: 'Later', reply_to_id: 'not-loaded' }, { ...mine, id: 'gone', content: 'Private text', is_deleted: true }, { ...mine, id: 'm4', content: 'Acknowledged', reply_to_id: 'gone' }];
    const user = userEvent.setup();
    showPhone();
    const thread = await openThread(user);
    expect(within(thread).getByLabelText('Reply to Reply').textContent).toContain('Original message unavailable');
    const quotes = within(thread).getAllByLabelText('Reply to You');
    expect(quotes.some((quote) => quote.textContent?.includes('Bus at 6:15'))).toBe(true);
    expect(quotes.some((quote) => quote.textContent?.includes('Message deleted'))).toBe(true);
    expect(quotes.some((quote) => quote.textContent?.includes('Private text'))).toBe(false);
  });

  it('72002 an in-flight send locks its reply target until completion', async () => {
    const user = userEvent.setup();
    let finish!: () => void;
    live.msgs.sendMessage.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    live.msgs.messages = [mine, { ...mine, id: 'm2', content: 'Second message' }];
    showPhone();
    const thread = await openThread(user);
    const actions = within(thread).getAllByRole('button', { name: 'Message actions' });
    await user.click(actions[0]!);
    await user.click(within(code('CH-7604') as HTMLElement).getByRole('button', { name: 'Reply' }));
    await user.type(within(thread).getByRole('textbox', { name: /Message Varsity team/ }), 'Response to first');
    await user.click(within(thread).getByRole('button', { name: 'Send' }));
    expect((within(thread).getByRole('button', { name: 'Cancel reply' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(actions[1]!);
    const sheet = within(code('CH-7604') as HTMLElement);
    expect((sheet.getByRole('button', { name: 'Reply' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(sheet.getByRole('button', { name: 'Reply' }));
    expect(live.msgs.sendMessage).toHaveBeenCalledWith('Response to first', 'm1');
    await user.click(sheet.getByRole('button', { name: 'Close' }));
    await act(async () => finish());
    expect(within(thread).queryByRole('button', { name: 'Cancel reply' })).toBeNull();
  });

  it('72002 a refused attachment restores its original text, file and reply target', async () => {
    const user = userEvent.setup({ applyAccept: false });
    let refuse!: (result: { success: boolean; error: string }) => void;
    live.files.sendMessageWithAttachments.mockImplementationOnce(() => new Promise((resolve) => { refuse = resolve; }));
    showPhone();
    const thread = await openThread(user);
    await user.click(within(thread).getByRole('button', { name: 'Message actions' }));
    await user.click(within(code('CH-7604') as HTMLElement).getByRole('button', { name: 'Reply' }));
    await user.type(within(thread).getByRole('textbox', { name: /Message Varsity team/ }), 'Original response');
    await user.upload(thread.querySelector('input[type="file"]') as HTMLInputElement, new File(['x'], 'plan.pdf', { type: 'application/pdf' }));
    await user.click(within(thread).getByRole('button', { name: 'Send' }));
    expect(live.files.sendMessageWithAttachments).toHaveBeenCalledTimes(1);
    expect(live.files.sendMessageWithAttachments).toHaveBeenCalledWith(expect.objectContaining({ replyToId: 'm1', content: 'Original response' }));
    expect((within(thread).getByRole('button', { name: 'Cancel reply' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(within(thread).getByRole('button', { name: 'Cancel reply' }));
    await act(async () => refuse({ success: false, error: 'refused' }));
    expect((within(thread).getByRole('textbox', { name: /Message Varsity team/ }) as HTMLTextAreaElement).value).toBe('Original response');
    expect(within(thread).getByRole('button', { name: 'Remove plan.pdf' })).toBeTruthy();
    expect(within(thread).getByLabelText('Reply to You').textContent).toContain('Bus at 6:15');
    expect((within(thread).getByRole('button', { name: 'Cancel reply' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('CH-7022 partial attachment success keeps only the unsaved files and parent; retry never duplicates delivered text', async () => {
    const user = userEvent.setup();
    live.files.sendMessageWithAttachments.mockResolvedValueOnce({ success: true, attachmentsFailed: true });
    showPhone();
    const thread = await openThread(user);
    await user.click(within(thread).getByRole('button', { name: 'Message actions' }));
    await user.click(within(code('CH-7604') as HTMLElement).getByRole('button', { name: 'Reply' }));
    const file = new File(['x'], 'plan.pdf', { type: 'application/pdf' });
    await user.upload(thread.querySelector('input[type="file"]') as HTMLInputElement, file);
    const box = within(thread).getByRole('textbox', { name: /Message Varsity team/ }) as HTMLTextAreaElement;
    await user.type(box, 'Delivered text');
    hapticSpy.mockClear();
    await user.click(within(thread).getByRole('button', { name: 'Send' }));
    await expectCode('CH-7022', /Message sent; attachments not saved/);
    expect(box.value).toBe('');
    expect(within(thread).getByRole('button', { name: 'Remove plan.pdf' })).toBeTruthy();
    expect(within(thread).getByRole('button', { name: 'Cancel reply' })).toBeTruthy();
    expect(hapticSpy).toHaveBeenCalledWith('warning');
    expect(hapticSpy).not.toHaveBeenCalledWith('success');
    await user.click(within(thread).getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(live.files.sendMessageWithAttachments).toHaveBeenCalledTimes(2));
    expect(live.files.sendMessageWithAttachments.mock.calls[1]?.[0]).toEqual(expect.objectContaining({ content: '', replyToId: 'm1', attachments: [expect.objectContaining({ file })] }));
    expect(live.msgs.sendMessage).not.toHaveBeenCalled();
  });

  it('CH-7023 an unknown attachment send freezes its payload across reopening; confirmation restores the later draft', async () => {
    const user = userEvent.setup();
    let finish!: (value: { success: boolean; sendOutcome: 'unknown' }) => void;
    live.files.sendMessageWithAttachments.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    showPhone();
    const thread = await openThread(user);
    await user.click(within(thread).getByRole('button', { name: 'Message actions' }));
    await user.click(within(code('CH-7604') as HTMLElement).getByRole('button', { name: 'Reply' }));
    const file = new File(['x'], 'plan.pdf', { type: 'application/pdf' });
    const laterFile = new File(['y'], 'map.pdf', { type: 'application/pdf' });
    const box = within(thread).getByRole('textbox', { name: /Message Varsity team/ }) as HTMLTextAreaElement;
    const input = thread.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);
    await user.type(box, 'Original text');
    await user.click(within(thread).getByRole('button', { name: 'Send' }));
    await user.type(box, 'Next draft');
    await user.upload(input, laterFile);
    hapticSpy.mockClear();
    await act(async () => finish({ success: false, sendOutcome: 'unknown' }));
    expect(box.value).toBe('Original text');
    expect(box.readOnly).toBe(true);
    expect((within(thread).getByRole('button', { name: 'Cancel reply' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(thread).getByRole('button', { name: 'Remove plan.pdf' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(thread).getByRole('button', { name: 'Attach a file' }) as HTMLButtonElement).disabled).toBe(true);
    expect(hapticSpy).not.toHaveBeenCalledWith('success');
    await user.type(box, 'Changed');
    expect(box.value).toBe('Original text');
    await user.click(within(thread).getByRole('button', { name: 'Back to Messages' }));
    const reopened = await openThread(user);
    const restored = within(reopened).getByRole('textbox', { name: /Message Varsity team/ }) as HTMLTextAreaElement;
    expect(restored.value).toBe('Original text');
    expect(restored.readOnly).toBe(true);
    expect(within(reopened).getByLabelText('Reply to You').textContent).toContain('Bus at 6:15');
    await user.click(within(reopened).getByRole('button', { name: 'Retry send' }));
    await waitFor(() => expect(restored.readOnly).toBe(false));
    expect(live.files.sendMessageWithAttachments).toHaveBeenCalledTimes(2);
    const first = live.files.sendMessageWithAttachments.mock.calls[0]?.[0];
    const retry = live.files.sendMessageWithAttachments.mock.calls[1]?.[0];
    expect(retry).toEqual(expect.objectContaining({ content: 'Original text', replyToId: 'm1' }));
    expect(retry?.attachments[0]?.file).toBe(first?.attachments[0]?.file);
    expect(restored.value).toBe('Next draft');
    expect(within(reopened).getByRole('button', { name: 'Remove map.pdf' })).toBeTruthy();
    expect(within(reopened).queryByRole('button', { name: 'Remove plan.pdf' })).toBeNull();
    expect(within(reopened).queryByRole('button', { name: 'Cancel reply' })).toBeNull();
  });

  it('CH-7023 after reload a pending request shows stored filenames and retries its identity; offline cannot unlock a plain send', async () => {
    const user = userEvent.setup();
    new DraftStore(data.viewerUserId).set('team', 'Later ordinary draft');
    live.files.getPendingAttachmentSend.mockResolvedValue({ clientMessageId: 'same-request-id', content: 'Original request text', replyToId: 'm1', attachments: [{ fileName: 'plan.pdf' }] });
    showPhone();
    const thread = await openThread(user);
    const retry = await within(thread).findByRole('button', { name: 'Retry send' });
    const box = within(thread).getByRole('textbox', { name: /Message Varsity team/ }) as HTMLTextAreaElement;
    expect(box.value).toBe('Original request text');
    expect(box.readOnly).toBe(true);
    expect(within(thread).getByLabelText('Pending attachments').textContent).toContain('plan.pdf');
    expect((within(thread).getByRole('button', { name: 'Cancel reply' }) as HTMLButtonElement).disabled).toBe(true);
    setOnline(false);
    await user.click(retry);
    await expectCode('CH-1903', /offline/);
    expect(box.value).toBe('Original request text');
    expect(box.readOnly).toBe(true);
    expect(live.files.retryPendingAttachmentSend).not.toHaveBeenCalled();
    expect(live.files.sendMessageWithAttachments).not.toHaveBeenCalled();
    expect(live.msgs.sendMessage).not.toHaveBeenCalled();
    setOnline(true);
    let confirm!: (result: { success: boolean }) => void;
    live.files.retryPendingAttachmentSend.mockImplementationOnce(() => new Promise((resolve) => { confirm = resolve; }));
    await user.click(retry);
    await waitFor(() => expect(live.files.retryPendingAttachmentSend).toHaveBeenCalledWith('team'));
    expect(new DraftStore(data.viewerUserId).get('team')).toBe('Later ordinary draft');
    await act(async () => { confirm({ success: true }); });
    await waitFor(() => expect(box.readOnly).toBe(false));
    expect(box.value).toBe('Later ordinary draft');
    expect(within(thread).queryByLabelText('Pending attachments')).toBeNull();
    expect(live.files.sendMessageWithAttachments).not.toHaveBeenCalled();
    expect(live.msgs.sendMessage).not.toHaveBeenCalled();
  });

  it('CH-7217 a failed recovery check blocks sending until the check succeeds', async () => {
    const user = userEvent.setup();
    live.files.getPendingAttachmentSend.mockRejectedValueOnce(new Error('unreadable')).mockResolvedValue(null);
    showPhone();
    const thread = await openThread(user);
    await expectCode('CH-7217', /Couldn’t check a pending send/);
    const box = within(thread).getByRole('textbox', { name: /Message Varsity team/ }) as HTMLTextAreaElement;
    expect(box.readOnly).toBe(true);
    expect((within(thread).getByRole('button', { name: 'Send' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(within(code('CH-7217') as HTMLElement).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(box.readOnly).toBe(false));
    await user.type(box, 'Fresh message');
    await user.click(within(thread).getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(live.msgs.sendMessage).toHaveBeenCalledWith('Fresh message'));
  });

  it('72002 leaving a phone thread clears reply intent while preserving its text draft', async () => {
    const user = userEvent.setup();
    showPhone();
    const thread = await openThread(user);
    await user.click(within(thread).getByRole('button', { name: 'Message actions' }));
    await user.click(within(code('CH-7604') as HTMLElement).getByRole('button', { name: 'Reply' }));
    await user.type(within(thread).getByRole('textbox', { name: /Message Varsity team/ }), 'Half written');
    await user.click(within(thread).getByRole('button', { name: 'Back to Messages' }));
    const reopened = await openThread(user);
    expect((within(reopened).getByRole('textbox', { name: /Message Varsity team/ }) as HTMLTextAreaElement).value).toBe('Half written');
    expect(within(reopened).queryByRole('button', { name: 'Cancel reply' })).toBeNull();
  });

  it('72003 swipe-left reveals a real intermediate timestamp; tapping a loaded quote goes to its parent', async () => {
    const user = userEvent.setup();
    live.msgs.messages = [mine, { ...mine, id: 'm2', content: 'Follow up', created_at: '2026-10-14T18:01:00Z', reply_to_id: 'm1' }];
    showPhone();
    const thread = await openThread(user);
    expect(within(thread).queryByText('2:00 PM')).toBeNull();
    const stack = (await within(thread).findByText('Bus at 6:15', { selector: '.ch-ms-bub' })).closest('.ch-ms-msg__stack') as HTMLElement;
    act(() => {
      stack.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 160, clientY: 80 }));
      stack.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 90, clientY: 84 }));
      stack.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 90, clientY: 84 }));
    });
    expect(within(thread).getByText('2:00 PM')).toBeTruthy();
    const scroll = vi.fn();
    document.getElementById('ch-ms-message-m1')!.scrollIntoView = scroll;
    await user.click(within(thread).getByRole('button', { name: 'Reply to You' }));
    expect(scroll).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
    const previousMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({ ...previousMatchMedia(query), matches: query === '(prefers-reduced-motion: reduce)' })) as typeof window.matchMedia;
    try {
      await user.click(within(thread).getByRole('button', { name: 'Reply to You' }));
      expect(scroll).toHaveBeenLastCalledWith({ block: 'center', behavior: 'instant' });
    } finally { window.matchMedia = previousMatchMedia; }
  });

  it('CH-7309 the phone with nothing at all yet is the first-run empty alone: no search or filter chips over nothing', async () => {
    live.convs.conversations = [];
    live.msgs.messages = [];
    showPhone();
    await expectCode('CH-7309', /No conversations yet/);
    expect(screen.queryByRole('searchbox', { name: /Search conversations and messages/ })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Filter conversations' })).toBeNull();
  });

  it('CH-7020 copying a message that cannot be copied says so', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    showPhone();
    const thread = await openThread(user);
    await user.click(within(thread).getByRole('button', { name: 'Message actions' }));
    await user.click(within(code('CH-7604') as HTMLElement).getByRole('button', { name: 'Copy' }));
    await expectCode('CH-7020', /Couldn't copy the message/);
  });

  it('CH-7409 CH-7306 CH-7214 Details files load, say when there are none, and fail with Try again', async () => {
    const user = userEvent.setup();
    const first = deferred<{ files: [] }>();
    a.getGolfConversationFiles.mockReturnValueOnce(first.promise).mockResolvedValueOnce({ error: 'nope' }).mockResolvedValue({ files: [] });
    const { unmount } = showPhone();
    const thread = await openThread(user);
    await user.click(within(thread).getByRole('button', { name: 'Details' }));
    await expectCode('CH-7409');
    first.resolve({ files: [] });
    await expectCode('CH-7306', /No files shared yet/);
    unmount();
    showPhone();
    const again = await openThread(user);
    await user.click(within(again).getByRole('button', { name: 'Details' }));
    await expectCode('CH-7214', /Files didn't load/);
    await user.click(within(code('CH-7214') as HTMLElement).getByRole('button', { name: /Try again/ }));
    await expectCode('CH-7306');
  });

  it('CH-7021 a shared file that will not open says so', async () => {
    const user = userEvent.setup();
    a.getGolfConversationFiles.mockResolvedValue({ files: [{ id: 'f1', messageId: 'm1', fileName: 'Room list.pdf', mimeType: 'application/pdf', fileSize: 49152, sentAt: '2026-10-14T15:02:00Z', senderId: 'me' }] });
    a.getGolfMessageAttachments.mockResolvedValue({ attachments: [] });
    showPhone();
    const thread = await openThread(user);
    await user.click(within(thread).getByRole('button', { name: 'Details' }));
    await user.click(await screen.findByRole('button', { name: /Room list\.pdf/ }));
    await expectCode('CH-7021', /Couldn't open Room list\.pdf/);
    expect(a.getGolfMessageAttachments).toHaveBeenCalledWith('m1');
  });

  it('CH-7104 a coach names a new group before it is created; a player picks one person at a time', async () => {
    const user = userEvent.setup();
    const { unmount } = showPhone();
    await user.click(await screen.findByRole('button', { name: 'New message' }));
    const newMsg = await screen.findByRole('region', { name: 'New message' });
    expect(within(newMsg).getByText('Whole team')).toBeTruthy();
    await user.click(within(newMsg).getByRole('option', { name: /Jonah Okafor/ }));
    await user.click(within(newMsg).getByRole('option', { name: /Eli Brandt/ }));
    await user.click(within(newMsg).getByRole('button', { name: 'Create group' }));
    await expectCode('CH-7104', /Name the group/);
    expect(a.createGolfTeamBroadcast).not.toHaveBeenCalled();
    unmount();
    showPhone({ ...data, role: 'player', viewerPlayerId: 'p-me' });
    await user.click(await screen.findByRole('button', { name: 'New message' }));
    const playerNew = await screen.findByRole('region', { name: 'New message' });
    expect(within(playerNew).queryByText('Whole team')).toBeNull();
    await user.click(within(playerNew).getByRole('option', { name: /Jonah Okafor/ }));
    await user.click(within(playerNew).getByRole('option', { name: /Eli Brandt/ }));
    expect(within(playerNew).getAllByRole('option', { selected: true }).map((o) => o.textContent)).toEqual([expect.stringMatching(/Eli Brandt/)]);
    expect(within(playerNew).getByRole('button', { name: 'Next' })).toBeTruthy();
  });

  it('CH-7004 the first message written in New message is sent when the thread opens, and a failure leaves it to its bubble', async () => {
    const user = userEvent.setup();
    live.msgs.sendMessage.mockRejectedValueOnce(new Error('refused'));
    live.convs.conversations = [team, { id: 'dm-jonah', title: null, participant_ids: ['me', 'jonah'], participant_count: 2, unread_count: 0, other_participant: { id: 'jonah', name: 'Jonah Okafor' }, last_message: null, creator_id: 'me' }];
    showPhone();
    await user.click(await screen.findByRole('button', { name: 'New message' }));
    const newMsg = await screen.findByRole('region', { name: 'New message' });
    await user.click(within(newMsg).getByRole('option', { name: /Jonah Okafor/ }));
    await user.type(within(newMsg).getByRole('textbox', { name: 'Message Jonah' }), '5 works. Bay 4.');
    await user.click(within(newMsg).getByRole('button', { name: 'Next' }));
    await expectCode('CH-7004', /Couldn't send the message/);
    expect(live.msgs.sendMessage).toHaveBeenCalledWith('5 works. Bay 4.');
    const box = await screen.findByRole('textbox', { name: /Message Jonah/ });
    expect((box as HTMLTextAreaElement).value).toBe('');
  });

  describe('attach in New message (clickables 14)', () => {
    const dmJonah = { id: 'dm-jonah', title: null, participant_ids: ['me', 'jonah'], participant_count: 2, unread_count: 0, other_participant: { id: 'jonah', name: 'Jonah Okafor' }, last_message: null, creator_id: 'me' };
    const newMessageTo = async (user: User) => {
      live.convs.conversations = [team, dmJonah];
      showPhone();
      await user.click(await screen.findByRole('button', { name: 'New message' }));
      const newMsg = await screen.findByRole('region', { name: 'New message' });
      const attach = within(newMsg).getByRole('button', { name: 'Attach a file' });
      // Like the message box, attach waits for someone to send to.
      expect((attach as HTMLButtonElement).disabled).toBe(true);
      await user.click(within(newMsg).getByRole('option', { name: /Jonah Okafor/ }));
      expect((attach as HTMLButtonElement).disabled).toBe(false);
      return { newMsg, input: newMsg.querySelector('input[type="file"]') as HTMLInputElement };
    };

    it('a first message with a file is sent by the thread as an attachment send, text and file together', async () => {
      const user = userEvent.setup({ applyAccept: false });
      const { newMsg, input } = await newMessageTo(user);
      await user.upload(input, new File(['x'], 'plan.pdf', { type: 'application/pdf' }));
      expect(within(newMsg).getByRole('button', { name: 'Remove plan.pdf' })).toBeTruthy();
      await user.type(within(newMsg).getByRole('textbox', { name: 'Message Jonah' }), 'Range plan for Friday');
      await user.click(within(newMsg).getByRole('button', { name: 'Next' }));
      await waitFor(() =>
        expect(live.files.sendMessageWithAttachments).toHaveBeenCalledWith(
          expect.objectContaining({ conversationId: 'dm-jonah', content: 'Range plan for Friday', attachments: [expect.objectContaining({ file: expect.objectContaining({ name: 'plan.pdf' }) })] }),
        ),
      );
      expect(live.msgs.sendMessage).not.toHaveBeenCalled();
    });

    it('a file alone is a first message: Send is ready without text and the thread sends it', async () => {
      const user = userEvent.setup({ applyAccept: false });
      const { newMsg, input } = await newMessageTo(user);
      const send = within(newMsg).getByRole('button', { name: 'Send' }) as HTMLButtonElement;
      expect(send.disabled).toBe(true);
      await user.upload(input, new File(['x'], 'plan.pdf', { type: 'application/pdf' }));
      expect(send.disabled).toBe(false);
      await user.click(send);
      await waitFor(() =>
        expect(live.files.sendMessageWithAttachments).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'dm-jonah', content: '', attachments: [expect.objectContaining({ file: expect.objectContaining({ name: 'plan.pdf' }) })] })),
      );
    });

    it('CH-7101 a file the thread would refuse is refused the same way, and stays in the thread box', async () => {
      const user = userEvent.setup({ applyAccept: false });
      const { newMsg, input } = await newMessageTo(user);
      await user.upload(input, new File(['x'], 'setup.exe', { type: 'application/x-msdownload' }));
      await user.click(within(newMsg).getByRole('button', { name: 'Next' }));
      await expectCode('CH-7101', /Can't attach setup\.exe/);
      expect(live.files.sendMessageWithAttachments).not.toHaveBeenCalled();
      const thread = await screen.findByRole('region', { name: /Jonah/ });
      expect(within(thread).getByRole('button', { name: 'Remove setup.exe' })).toBeTruthy();
    });
  });
});

describe('Messages · desktop Schedule and shared files (clickables 10, 13)', () => {
  const dm = { id: 'dm', title: null, participant_ids: ['me', 'jonah'], participant_count: 2, unread_count: 0, other_participant: { id: 'jonah', name: 'Jonah Okafor' }, last_message: { content: 'See you at 6', created_at: '2026-10-14T17:00:00Z', sender_id: 'jonah' }, creator_id: 'me' };
  const dmCoach = { ...dm, id: 'dm-dana', participant_ids: ['me', 'dana'], other_participant: { id: 'dana', name: 'Dana Cole' }, last_message: { content: 'Bay 4', created_at: '2026-10-14T16:00:00Z', sender_id: 'dana' } };
  const dana = { userId: 'dana', name: 'Dana Cole', role: 'coach' as const, subtitle: 'Assistant coach', playerId: null };
  const roomList = { id: 'f1', messageId: 'm1', fileName: 'Room list.pdf', mimeType: 'application/pdf', fileSize: 49152, sentAt: '2026-10-14T15:02:00Z', senderId: 'me' };

  it('the thread header Schedule opens Calendar’s New event: a group invites nobody, a player thread invites that player, a coach thread nobody', async () => {
    const user = userEvent.setup();
    live.convs.conversations = [team, dm, dmCoach];
    show({ ...data, directory: [...data.directory, dana] });
    const schedule = async () => (await screen.findByRole('link', { name: 'Schedule' })).getAttribute('href');
    // The team thread is the newest and opens first.
    expect(await schedule()).toBe('/golf/dashboard/calendar?new=1');
    await user.click(screen.getAllByRole('button', { name: /Jonah Okafor/ })[0]!);
    await screen.findByRole('textbox', { name: /Message Jonah$/ });
    expect(await schedule()).toBe('/golf/dashboard/calendar?new=1&with=p-jonah');
    await user.click(screen.getAllByRole('button', { name: /Dana Cole/ })[0]!);
    await screen.findByRole('textbox', { name: /Message Dana$/ });
    expect(await schedule()).toBe('/golf/dashboard/calendar?new=1');
    expect(screen.getByRole('link', { name: 'Schedule' }).getAttribute('title')).toBe('Schedule');
  });

  it('a player has no Schedule link in a thread header', async () => {
    live.convs.conversations = [team, dm];
    show({ ...data, role: 'player', viewerPlayerId: 'p-me' });
    await screen.findByRole('textbox', { name: /Message Varsity team/ });
    expect(screen.queryByRole('link', { name: 'Schedule' })).toBeNull();
  });

  it('CH-7409 CH-7306 CH-7214 Details files load, say when there are none, and fail with Try again', async () => {
    const user = userEvent.setup();
    const first = deferred<{ files: [] }>();
    a.getGolfConversationFiles.mockReturnValueOnce(first.promise).mockResolvedValueOnce({ error: 'nope' }).mockResolvedValue({ files: [] });
    const { unmount } = show();
    await screen.findByRole('textbox', { name: /Message Varsity team/ });
    await openDetails(user);
    await expectCode('CH-7409');
    first.resolve({ files: [] });
    await expectCode('CH-7306', /No files shared yet/);
    unmount();
    show();
    await screen.findByRole('textbox', { name: /Message Varsity team/ });
    await openDetails(user);
    await expectCode('CH-7214', /Files didn't load/);
    await user.click(within(code('CH-7214') as HTMLElement).getByRole('button', { name: /Try again/ }));
    await expectCode('CH-7306');
    expect(a.getGolfConversationFiles).toHaveBeenCalledTimes(3);
  });

  it('Details lists a conversation’s files with kind, size and day, and a file opens through its message', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    a.getGolfConversationFiles.mockResolvedValue({ files: [roomList] });
    a.getGolfMessageAttachments.mockResolvedValue({ attachments: [{ id: 'f1', fileName: 'Room list.pdf', fileSize: 49152, mimeType: 'application/pdf', url: 'https://files.example/room-list.pdf' }] });
    show();
    await screen.findByRole('textbox', { name: /Message Varsity team/ });
    await openDetails(user);
    const row = await screen.findByRole('button', { name: /Room list\.pdf/ });
    expect(row.textContent).toMatch(/PDF · 48 KB · Today/);
    expect(a.getGolfConversationFiles).toHaveBeenCalledWith('team');
    await user.click(row);
    await waitFor(() => expect(open).toHaveBeenCalledWith('https://files.example/room-list.pdf', '_blank', 'noopener,noreferrer'));
    expect(a.getGolfMessageAttachments).toHaveBeenCalledWith('m1');
    open.mockRestore();
  });

  it('CH-7021 a shared file that will not open says so', async () => {
    const user = userEvent.setup();
    a.getGolfConversationFiles.mockResolvedValue({ files: [roomList] });
    a.getGolfMessageAttachments.mockResolvedValue({ attachments: [] });
    show();
    await screen.findByRole('textbox', { name: /Message Varsity team/ });
    await openDetails(user);
    await user.click(await screen.findByRole('button', { name: /Room list\.pdf/ }));
    await expectCode('CH-7021', /Couldn't open Room list\.pdf/);
  });
});

describe('Messages · behaviour contracts (P007, docs/clubhouse/pages/P007-messages/CONTRACT.md)', () => {
  const dm = { id: 'dm', title: null, participant_ids: ['me', 'jonah'], participant_count: 2, unread_count: 0, other_participant: { id: 'jonah', name: 'Jonah Okafor' }, last_message: { content: 'See you at 6', created_at: '2026-10-14T17:00:00Z', sender_id: 'jonah' }, creator_id: 'me' };

  it('70101 desktop opens the newest thread beside the rail without marking it read', async () => {
    live.msgs.markRead.mockClear();
    show();
    expect(await screen.findByRole('textbox', { name: /Message Varsity team/ })).toBeTruthy();
    expect(live.msgs.markRead).not.toHaveBeenCalled();
  });

  it('70102 a ?conversation= link opens that thread and cleans the address', async () => {
    live.convs.conversations = [team, dm];
    params.current = new URLSearchParams('conversation=dm');
    router.replace.mockClear();
    show();
    expect(await screen.findByRole('textbox', { name: /Message Jonah$/ })).toBeTruthy();
    expect(router.replace).toHaveBeenCalledWith('/golf/dashboard/messages', { scroll: false });
  });

  it('70901 72001 Enter sends with the success haptic and no toast; Shift+Enter adds a line instead', async () => {
    const user = userEvent.setup();
    show();
    const box = (await screen.findByRole('textbox', { name: /Message Varsity team/ })) as HTMLTextAreaElement;
    await user.type(box, 'Bus at 6{Shift>}{Enter}{/Shift}Bring water');
    expect(live.msgs.sendMessage).not.toHaveBeenCalled();
    expect(box.value).toBe('Bus at 6\nBring water');
    await user.type(box, '{Enter}');
    await waitFor(() => expect(live.msgs.sendMessage).toHaveBeenCalledWith('Bus at 6\nBring water'));
    await waitFor(() => expect(hapticSpy).toHaveBeenCalledWith('success'));
    expect(box.value).toBe('');
    expect(document.querySelector('[data-ch-code^="CH-70"]')).toBeNull();
  });

  it('71202 an unsent draft survives switching to another thread and back', async () => {
    const user = userEvent.setup();
    live.convs.conversations = [team, dm];
    show();
    const box = await screen.findByRole('textbox', { name: /Message Varsity team/ });
    await user.type(box, 'Half-written note');
    await user.click(screen.getAllByRole('button', { name: /Jonah Okafor/ })[0]!);
    const other = (await screen.findByRole('textbox', { name: /Message Jonah$/ })) as HTMLTextAreaElement;
    expect(other.value).toBe('');
    await user.click(screen.getAllByRole('button', { name: /Varsity team/ })[0]!);
    expect(((await screen.findByRole('textbox', { name: /Message Varsity team/ })) as HTMLTextAreaElement).value).toBe('Half-written note');
  });

  it('72301 a failed change is reported with its messages surface before the toast', async () => {
    const { chReport } = await import('../lib/track');
    vi.mocked(chReport).mockClear();
    live.convs.conversations = [team];
    a.createGolfConversation.mockRejectedValueOnce(new Error('boom'));
    params.current = new URLSearchParams('player=p-jonah');
    show();
    await expectCode('CH-7002');
    expect(chReport).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ surface: 'messages.startDirect' }));
  });
});

describe('Messages · no team', () => {
  it('CH-7308 a coach or player with no team gets the v2 page empty state', () => {
    render(<MessagesNoTeam />);
    const el = code('CH-7308')!;
    expect(el.classList.contains('ch-empty-page')).toBe(true);
    expect(within(el as HTMLElement).getByRole('heading', { level: 2, name: "You aren't on a team yet" })).toBeTruthy();
  });
});
