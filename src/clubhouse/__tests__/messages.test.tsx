import { LazyMotion, domAnimation } from 'motion/react';
import { useAppearancePreferences } from '@/hooks/golf/use-appearance-preferences';
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
/** The redesign's three server-backed rail hooks, off the network: device pins, no mute glyphs, no typing rows. */
vi.mock('../screens/messages/use-conversation-pins', async () => {
  const { usePinned } = await import('../screens/messages/pinned');
  return { useConversationPins: (viewer: string, team: string, ids: readonly string[], enabled: boolean) => usePinned(viewer, team, ids, enabled) };
});
vi.mock('../screens/messages/use-row-mutes', () => ({ isMutedRow: () => false, useRowMutes: () => ({ muted: null, refresh: () => {} }) }));
vi.mock('../screens/messages/use-typing-by-conversation', () => ({ useTypingByConversation: () => new Map() }));
/** Phone or desktop layout (useChPhone), set per test. */
const layout = vi.hoisted(() => ({ phone: false }));
vi.mock('../lib/use-phone', () => ({ useChPhone: () => layout.phone, CH_PHONE_QUERY: '(max-width: 820px), (max-height: 500px) and (pointer: coarse)' }));

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
    insertConfirmed: vi.fn(),
  },
  reactions: { rows: [] as unknown[], setReaction: vi.fn(async () => {}) },
  files: {
    getPendingAttachmentSend: vi.fn(async (_conversationId: string): Promise<{ clientMessageId: string; content: string; replyToId: string | null; attachments: { fileName: string }[] } | null> => null),
    retryPendingAttachmentSend: vi.fn(async (_conversationId: string): Promise<{ success: boolean; attachmentsFailed?: boolean; sendOutcome?: 'unknown' }> => ({ success: true })),
    sendMessageWithAttachments: vi.fn(async (_options: { conversationId: string; content: string; attachments: { file: File }[]; replyToId?: string | null }): Promise<{ success: boolean; error?: string; attachmentsFailed?: boolean; sendOutcome?: "unknown" }> => ({ success: true })) },
}));
vi.mock('@/hooks/golf/use-golf-messages', () => ({ useGolfConversations: () => live.convs, useGolfMessages: () => live.msgs }));
vi.mock('@/hooks/golf/use-message-reactions', async (orig) => ({ ...(await orig<object>()), useMessageReactions: () => live.reactions }));
const polls = vi.hoisted(() => ({
  responses: { rows: [] as unknown[], error: null as string | null, ready: true, pending: new Set<string>() as ReadonlySet<string>, refresh: vi.fn(async () => {}), vote: vi.fn(async (_messageId: string, _choice: string | null): Promise<{ ok: true } | { ok: false; reason: 'closed' | 'deleted' | 'member' | 'session' | 'failed' }> => ({ ok: true })) },
  sendGolfPoll: vi.fn(async () => ({ success: true as const, id: 'poll-1' })),
  closeGolfPoll: vi.fn(async () => ({ success: true as const, id: 'poll-1' })),
}));
vi.mock('@/hooks/golf/use-message-responses', () => ({ useMessageResponses: () => polls.responses }));
vi.mock('@/app/golf/actions/message-polls', () => ({ sendGolfPoll: polls.sendGolfPoll, closeGolfPoll: polls.closeGolfPoll }));
vi.mock('@/hooks/golf/use-message-attachments', () => ({ useMessageAttachments: () => live.files }));
const a = vi.hoisted(() => ({
  markGolfMessagesAsRead: vi.fn(),
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
}));
vi.mock('@/app/golf/actions/messages', () => ({
  markGolfMessagesAsRead: a.markGolfMessagesAsRead,
  createGolfConversation: a.createGolfConversation,
  createGolfTeamBroadcast: a.createGolfTeamBroadcast,
  getGolfConversationParticipantIdentities: a.getGolfConversationParticipantIdentities,
  getGolfMessageAttachments: a.getGolfMessageAttachments,
  leaveGolfGroup: a.leaveGolfGroup,
  searchGolfMessages: a.searchGolfMessages,
  addGolfGroupMember: a.addGolfGroupMember,
  getGolfGroupAddCandidates: a.getGolfGroupAddCandidates,
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

import type { ChMessagesData } from '../data/messages';
import { Messages } from '../screens/messages/Messages';
import { DraftStore } from '../screens/messages/drafts';
import { MessagesSkeleton } from '../screens/messages/MessagesSkeleton';
import { MessagesNoTeam } from '../screens/messages/MessagesNoTeam';
import { messagesPrefillHref, onRoster, takePrefill } from '../screens/messages/prefill';
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
  const queries = new Map<string, MediaQueryList>();
  window.matchMedia = ((q: string) => {
    if (!queries.has(q)) queries.set(q, Object.assign(new EventTarget(), {
      matches: false, media: q, onchange: null,
      addListener: () => {}, removeListener: () => {},
    }) as MediaQueryList);
    return queries.get(q)!;
  }) as typeof window.matchMedia;
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
/** MSG-604 / Q-31: the Mute quick action opens a menu; this picks "For 8 hours" (or another length) and returns the item. */
const chooseMute = async (user: User, label = 'For 8 hours') => {
  await user.click(await screen.findByRole('button', { name: 'Mute this conversation' }));
  return screen.findByRole('menuitem', { name: label });
};
const setOnline = (v: boolean) => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => v });

beforeEach(() => {
  // Drafts persist per tab (F-12); each test starts with none.
  sessionStorage.clear();
  // jsdom has no Web Animations: the thread's make-room and the composer's lift animate in a browser.
  HTMLElement.prototype.animate = (() => ({ cancel: () => {}, finish: () => {}, finished: Promise.resolve(), onfinish: null })) as never;
  HTMLElement.prototype.getAnimations = (() => []) as never;
  // Desktop width: the newest thread opens beside the rail.
  window.matchMedia = ((q: string) => ({ matches: /min-width/.test(q), media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as never;
  hapticSpy.mockClear();
  router.refresh.mockClear();
  params.current = new URLSearchParams();
  for (const f of Object.values(a)) f.mockReset();
  a.getAnnouncementsWithMeta.mockResolvedValue({ success: true, data: [] });
  a.canHideGolfConversations.mockResolvedValue(false);
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
  live.msgs.retryMessage.mockReset().mockResolvedValue(true);
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

// A message is on screen here: attachments sign as they come near it (MOB-MSG-24).
class InViewObserver {
  constructor(private cb: (e: Array<{ isIntersecting: boolean }>) => void) {}
  observe() {
    this.cb([{ isIntersecting: true }]);
  }
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('IntersectionObserver', InViewObserver);

describe('Messages · actions that fail', () => {
  it('B11 ↓ and ↑ walk the conversation rail, which is one Tab stop; the loading rows never take it (#2361 audit)', async () => {
    live.convs.conversations = [team, { ...team, id: 'travel', title: 'Travel' }, { ...team, id: 'quals', title: 'Qualifier crew' }];
    show();
    // While the conversations load the rail draws placeholder rows with the same class: none is a Tab stop. (This test
    // used to walk those placeholders, which is the audit's finding; it now waits for the conversations.)
    for (const r of document.querySelectorAll<HTMLElement>('.ch-ms-rail div.ch-ms-row')) expect(r.hasAttribute('tabindex')).toBe(false);
    await waitFor(() => expect(document.querySelectorAll('.ch-ms-rail button.ch-ms-row').length).toBeGreaterThan(2));
    const rows = [...document.querySelectorAll<HTMLElement>('.ch-ms-rail button.ch-ms-row')];
    await waitFor(() => expect(rows.filter((r) => r.tabIndex === 0)).toHaveLength(1));
    rows[0]!.focus();
    fireEvent.keyDown(rows[0]!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rows[1]);
    fireEvent.keyDown(rows[1]!, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(rows[0]);
    fireEvent.keyDown(rows[0]!, { key: 'End' });
    expect(document.activeElement).toBe(rows.at(-1));
    expect(rows.filter((r) => r.tabIndex === 0)).toEqual([rows.at(-1)]);
  });

  it('CH-7001 a deep link to a player who is not on the team', async () => {
    params.current = new URLSearchParams('player=nobody');
    show();
    await expectCode('CH-7001', /Couldn’t open that conversation/);
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
    await expectCode('CH-7002', /Couldn’t start the conversation/);
  });

  it('CH-7004 CH-7005 71201 a send that throws points to its bubble (the box stays empty); a network error says to check first', async () => {
    const user = userEvent.setup();
    live.msgs.sendMessage.mockRejectedValueOnce(new Error('refused'));
    show();
    const box = await screen.findByRole('textbox', { name: /Message Varsity team/ });
    await user.type(box, 'Bring rain gear{Enter}');
    await expectCode('CH-7004', /Couldn’t send the message/);
    expect((box as HTMLTextAreaElement).value).toBe('');
    // A real transport failure, as the hook's classifySendFailure reads it for the bubble (an invented
    // "network timeout" is a refusal there, so the toast must not call it unconfirmed: audit A-06).
    live.msgs.sendMessage.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await user.type(box, 'Bus at 6{Enter}');
    await expectCode('CH-7005', /Couldn’t confirm this message sent/);
  });

  it('CH-7503 CH-7025 deleting a conversation asks first, hides it for you only, and a failed delete says so', async () => {
    const user = userEvent.setup();
    a.canHideGolfConversations.mockResolvedValue(true);
    a.hideGolfConversation.mockResolvedValueOnce({ success: false, error: 'nope' }).mockResolvedValueOnce({ success: true });
    live.convs.conversations = [team];
    show();
    await openDetails(user);
    await user.click(await screen.findByRole('button', { name: 'Delete conversation' }));
    await expectCode('CH-7503', /Delete Varsity team\?/);
    expect(a.hideGolfConversation).not.toHaveBeenCalled();
    await user.click(within(code('CH-7503') as HTMLElement).getByRole('button', { name: 'Delete conversation' }));
    await expectCode('CH-7025', /Couldn’t delete the conversation/);
    expect(a.hideGolfConversation).toHaveBeenCalledWith('team');
    await user.click(within(code('CH-7503') as HTMLElement).getByRole('button', { name: 'Delete conversation' }));
    await waitFor(() => expect(a.hideGolfConversation).toHaveBeenCalledTimes(2));
  });

  it('CH-7026 Mark as read from a row writes the server read, and a failed one says so and keeps the row unread', async () => {
    const user = userEvent.setup();
    a.markGolfMessagesAsRead.mockResolvedValueOnce({ success: false, error: 'nope' }).mockResolvedValueOnce({ success: true });
    live.convs.conversations = [{ ...team, unread_count: 2 }];
    show();
    const row = await screen.findByRole('button', { name: /^(?!Actions for ).*Varsity team/ });
    fireEvent.contextMenu(row, { clientX: 120, clientY: 120 });
    await user.click(within(screen.getByRole('menu', { name: 'Actions for Varsity team' })).getByRole('menuitem', { name: 'Mark as read' }));
    await expectCode('CH-7026', /Couldn’t mark the conversation read/);
    expect(a.markGolfMessagesAsRead).toHaveBeenCalledWith('team');
    expect(row.className).toMatch(/\bis-unread\b/);
    fireEvent.contextMenu(row, { clientX: 120, clientY: 120 });
    await user.click(within(screen.getByRole('menu', { name: 'Actions for Varsity team' })).getByRole('menuitem', { name: 'Mark as read' }));
    await waitFor(() => expect(a.markGolfMessagesAsRead).toHaveBeenCalledTimes(2));
  });

  it('CH-1902 the Messages progress notice ends when mute settles and its failure stays visible', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      let finish!: (result: { success: boolean; error: string }) => void;
      a.setGolfConversationMute.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
      show();
      await openDetails(user);
      await user.click(await chooseMute(user));
      // The menu fades out for 160 ms before it picks (MOT-DET-3).
      await waitFor(() => expect(a.setGolfConversationMute).toHaveBeenCalledTimes(1));
      act(() => vi.advanceTimersByTime(5001));
      await expectCode('CH-1902', /Still saving/);
      await act(async () => finish({ success: false, error: 'nope' }));
      await expectCode('CH-7011', /Couldn’t mute the conversation/);
      await waitFor(() => expect(code('CH-1902')).toBeNull());
      expect(a.setGolfConversationMute).toHaveBeenCalledTimes(1);
      expect(code('CH-7011')).not.toBeNull();
      // D's mute action owns the success toast; a refused mute makes none.
      expect(screen.queryByText('Muted for 8 hours')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('MSG-604 a mute that lands says so once, in the menu\u2019s words', async () => {
    const user = userEvent.setup();
    a.setGolfConversationMute.mockResolvedValue({ success: true, data: { muted: true, until: '2026-10-19T02:00:00Z' } });
    show();
    await openDetails(user);
    await user.click(await chooseMute(user));
    expect(await screen.findByText('Muted for 8 hours')).toBeTruthy();
    expect(screen.getAllByText('Muted for 8 hours')).toHaveLength(1);
  });

  it('CH-7011 muting fails', async () => {
    const user = userEvent.setup();
    a.setGolfConversationMute.mockResolvedValue({ success: false, error: 'nope' });
    show();
    await openDetails(user);
    await user.click(await chooseMute(user));
    await expectCode('CH-7011', /Couldn’t mute the conversation/);
  });

  it('CH-1903 an action while offline is refused and nothing is sent', async () => {
    const user = userEvent.setup();
    show();
    await openDetails(user);
    const mute = await chooseMute(user);
    setOnline(false);
    await user.click(mute);
    await expectCode('CH-1903', /Couldn’t mute the conversation: you’re offline/);
    expect(a.setGolfConversationMute).not.toHaveBeenCalled();
  });
});

describe('Messages · reads that fail', () => {
  it('CH-7201 conversations do not load', async () => {
    const user = userEvent.setup();
    live.convs.conversations = [];
    live.convs.error = new Error('boom');
    show();
    await expectCode('CH-7201', /Conversations didn’t load/);
    await user.click(within(code('CH-7201') as HTMLElement).getByRole('button', { name: 'Try again' }));
    expect(live.convs.refetch).toHaveBeenCalled();
  });

  it('CH-7202 a conversation does not load', async () => {
    live.msgs.messages = [];
    live.msgs.error = new Error('boom');
    show();
    await expectCode('CH-7202', /This conversation didn’t load/);
  });

  it('CH-7216 a conversation that fails to refresh keeps its messages and says they may be out of date', async () => {
    live.msgs.error = new Error('boom');
    show();
    await expectCode('CH-7216', /This conversation may be out of date/);
    expect(code('CH-7202')).toBeNull();
    expect(code('CH-7304')).toBeNull();
  });

  it('CH-7204 group members do not load, with Try again', async () => {
    const user = userEvent.setup();
    a.getGolfConversationParticipantIdentities.mockResolvedValueOnce({ error: 'boom' });
    show();
    await openDetails(user);
    await expectCode('CH-7204', /Members didn’t load/);
    await user.click(within(code('CH-7204') as HTMLElement).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(a.getGolfConversationParticipantIdentities).toHaveBeenCalledTimes(2));
  });

  it('CH-7205 the team list does not load in New message', async () => {
    const user = userEvent.setup();
    show({ ...data, directoryError: true, directory: [] });
    await user.click(screen.getAllByRole('button', { name: 'New message' })[0]!);
    await expectCode('CH-7205', /Your team list didn’t load/);
    await user.click(within(code('CH-7205') as HTMLElement).getByRole('button', { name: 'Try again' }));
    expect(router.refresh).toHaveBeenCalled();
  });

  it('CH-7208 the mute setting does not load, with Try again', async () => {
    const user = userEvent.setup();
    a.getGolfConversationMute.mockResolvedValueOnce({ success: false, error: 'boom' });
    show();
    await openDetails(user);
    await expectCode('CH-7208', /The mute setting didn’t load/);
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
  it('CH-7301 CH-7305 no conversations, but an announcement: the rail and thread empties', async () => {
    live.convs.conversations = [];
    live.msgs.messages = [];
    a.getAnnouncementsWithMeta.mockResolvedValue({ success: true, data: [annRow] });
    show();
    await expectCode('CH-7301', /No conversations yet/);
    await expectCode('CH-7305', /Start your first conversation/);
    expect(code('CH-7309')).toBeNull();
  });

  it('CH-7304 a thread with no messages yet', async () => {
    live.msgs.messages = [];
    show();
    await expectCode('CH-7304', /No messages yet.*Say hello to the group/);
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
  it('CH-7016 CH-7017 71401 a message that did not send says so in the thread, with Retry', async () => {
    const user = userEvent.setup();
    live.msgs.messages = [{ ...mine, id: 'f1', sendFailed: true, sendOutcome: 'refused' }, { ...mine, id: 'f2', content: 'Second', sendFailed: true, sendOutcome: 'unknown' }];
    show();
    await expectCode('CH-7016', /Not delivered/);
    await expectCode('CH-7017', /Couldn’t confirm this message sent\. Check before sending again\./);
    await user.click(within(code('CH-7016') as HTMLElement).getByRole('button', { name: 'Try again' }));
    expect(live.msgs.retryMessage).toHaveBeenCalledWith('f1');
  });

  it('CH-1903 Try again while offline is refused with the shared notice and sends nothing', async () => {
    const user = userEvent.setup();
    live.msgs.messages = [{ ...mine, id: 'f1', sendFailed: true, sendOutcome: 'refused' }];
    show();
    await expectCode('CH-7016', /Not delivered/);
    setOnline(false);
    await user.click(within(code('CH-7016') as HTMLElement).getByRole('button', { name: 'Try again' }));
    await expectCode('CH-1903', /offline/);
    expect(live.msgs.retryMessage).not.toHaveBeenCalled();
  });

  it('CH-7004 Try again that fails again says so', async () => {
    const user = userEvent.setup();
    live.msgs.retryMessage.mockResolvedValueOnce(false);
    live.msgs.messages = [{ ...mine, id: 'f1', sendFailed: true, sendOutcome: 'refused' }];
    show();
    await expectCode('CH-7016', /Not delivered/);
    await user.click(within(code('CH-7016') as HTMLElement).getByRole('button', { name: 'Try again' }));
    await expectCode('CH-7004', /Couldn’t send the message/);
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
// Announcements fold under the conversations: open the fold, then the announcement.
const openAnnouncement = async (user: User) => {
  await user.click(await screen.findByRole('button', { name: /^Announcements/, expanded: false }));
  await user.click(screen.getByRole('button', { name: /^Bus times/ }));
};
const never = () => new Promise(() => {});

describe('Messages · more actions that fail', () => {
  it('CH-7101 CH-7006 a file of the wrong type is refused; a failed attachment send says so', async () => {
    const user = userEvent.setup({ applyAccept: false });
    live.files.sendMessageWithAttachments.mockResolvedValue({ success: false, error: 'nope' });
    show();
    await screen.findByRole('textbox', { name: /Message Varsity team/ });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(['x'], 'setup.exe', { type: 'application/x-msdownload' }));
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await expectCode('CH-7101', /Can’t attach setup\.exe/);
    expect(live.files.sendMessageWithAttachments).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Remove setup.exe' }));
    await user.upload(input, new File(['x'], 'plan.pdf', { type: 'application/pdf' }));
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await expectCode('CH-7006', /Couldn’t send the attachment/);
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
    await expectCode('CH-7012', /Couldn’t send your acknowledgement/);
  });

  it('P007-A1 an announcement reads as a signed letter: team and date, the asks in words, the coach’s signature', async () => {
    const user = userEvent.setup();
    a.getAnnouncementsWithMeta.mockResolvedValue({ success: true, data: [{ ...annRow, urgency: 'urgent', created_by: 'c-maya' }] });
    a.getAnnouncementDetail.mockImplementation(never);
    show({ ...player, signers: { 'c-maya': { name: 'Maya Reyes', title: 'Head coach' } } });
    await openAnnouncement(user);
    const head = document.querySelector('.ch-ms-ann__head')!;
    expect(head.textContent).toMatch(/Wednesday 14 October/);
    expect(head.textContent).toMatch(/Urgent · please acknowledge/);
    expect(document.querySelector('.ch-ms-ann__sig')!.textContent).toBe('Maya ReyesHead coach');
    // No chips: the asks are words.
    expect(document.querySelector('.ch-ms-ann .ch-badge')).toBeNull();
    // The list row says it too: the same amber mark and the word, not a different icon on each surface.
    const row = document.querySelector('.ch-ms-row.is-ann')!;
    expect(row.querySelector('.ch-ms-grp.is-urgent svg.lucide-triangle-alert')).not.toBeNull();
    expect(row.querySelector('.ch-ms-row__bot em.is-urgent')!.textContent).toBe('Urgent · ');
  });

  it('CH-7013 marking a task done fails', async () => {
    const user = userEvent.setup();
    a.getAnnouncementsWithMeta.mockResolvedValue({ success: true, data: [annRow] });
    a.getAnnouncementDetail.mockResolvedValue(annDetail());
    a.completeAnnouncementTask.mockResolvedValue({ success: false, error: 'nope' });
    show(player);
    await openAnnouncement(user);
    await user.click(await screen.findByRole('button', { name: 'Mark done' }));
    await expectCode('CH-7013', /Couldn’t mark the task done/);
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
    await expectCode('CH-7015', /That conversation isn’t available/);
  });
});

describe('Messages · more reads that fail', () => {
  it('CH-7206 announcements do not load, with Try again', async () => {
    const user = userEvent.setup();
    a.getAnnouncementsWithMeta.mockResolvedValue({ success: false, error: 'boom' });
    show();
    await expectCode('CH-7206', /Announcements didn’t load/);
    await user.click(within(code('CH-7206') as HTMLElement).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(a.getAnnouncementsWithMeta).toHaveBeenCalledTimes(2));
  });

  it('CH-7207 an announcement’s details do not load, with Try again', async () => {
    const user = userEvent.setup();
    a.getAnnouncementsWithMeta.mockResolvedValue({ success: true, data: [annRow] });
    a.getAnnouncementDetail.mockResolvedValue({ success: false, error: 'boom' });
    show(player);
    await openAnnouncement(user);
    await expectCode('CH-7207', /The details didn’t load/);
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
    await expectCode('CH-7209', /Attachment didn’t load/);
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
    await expectCode('CH-7215', /team list didn’t load/);
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
    await expectCode('CH-7018', /Couldn’t add Nora/);
    await user.click(screen.getByRole('button', { name: 'Add Nora Castillo' }));
    expect(await screen.findByText(/Added Nora to Varsity team/)).toBeTruthy();
    expect(a.addGolfGroupMember).toHaveBeenLastCalledWith('team', 'nora');
  });

});

describe('Messages · phone', () => {
  const openThread = async (user: User) => {
    // A thread popped by Back is still on screen until its exit settles, slower on a loaded runner.
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^(?!Actions for ).*Varsity team/ })).toHaveLength(1), { timeout: 5000 });
    await user.click(screen.getByRole('button', { name: /^(?!Actions for ).*Varsity team/ }));
    return screen.findByRole('region', { name: /Varsity team/ });
  };

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

  it('72002 leaving a phone thread clears reply intent while preserving its text draft', async () => {
    const user = userEvent.setup();
    showPhone();
    const thread = await openThread(user);
    await user.click(within(thread).getByRole('button', { name: 'Message actions' }));
    await user.click(within(code('CH-7604') as HTMLElement).getByRole('menuitem', { name: 'Reply' }));
    await user.type(within(thread).getByRole('textbox', { name: /Message Varsity team/ }), 'Half written');
    await user.click(within(thread).getByRole('button', { name: 'Back to Messages' }));
    const reopened = await openThread(user);
    expect((within(reopened).getByRole('textbox', { name: /Message Varsity team/ }) as HTMLTextAreaElement).value).toBe('Half written');
    expect(within(reopened).queryByRole('button', { name: 'Cancel reply' })).toBeNull();
  });


  it('reply quotes respond immediately when Clubhouse Animations is switched off and back on', async () => {
    function AnimationPreference() {
      const { showAnimations, updatePreferences } = useAppearancePreferences();
      return <button type="button" onClick={() => updatePreferences({ showAnimations: !showAnimations })}>
        {showAnimations ? 'Switch animations off' : 'Switch animations on'}
      </button>;
    }
    const user = userEvent.setup();
    live.msgs.messages = [mine, { ...mine, id: 'm2', content: 'Follow up', reply_to_id: 'm1' }];
    render(<AnimationPreference />);
    showPhone();
    const thread = await openThread(user);
    const scroll = vi.fn();
    document.getElementById('ch-ms-message-m1')!.scrollIntoView = scroll;
    const quote = within(thread).getByRole('button', { name: 'Reply to You' });
    try {
      await user.click(quote);
      expect(scroll).toHaveBeenLastCalledWith({ block: 'center', behavior: 'smooth' });
      await user.click(screen.getByRole('button', { name: 'Switch animations off' }));
      await user.click(quote);
      expect(scroll).toHaveBeenLastCalledWith({ block: 'center', behavior: 'instant' });
      await user.click(screen.getByRole('button', { name: 'Switch animations on' }));
      await user.click(quote);
      expect(scroll).toHaveBeenLastCalledWith({ block: 'center', behavior: 'smooth' });
    } finally {
      const restore = screen.queryByRole('button', { name: 'Switch animations on' });
      if (restore) await user.click(restore);
    }
  });

  it('CH-7309 the phone with nothing at all yet is the first-run empty alone: no search or filter chips over nothing', async () => {
    live.convs.conversations = [];
    live.msgs.messages = [];
    showPhone();
    await expectCode('CH-7309', /No conversations yet/);
    expect(screen.queryByRole('searchbox', { name: /Search conversations and messages/ })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Filter conversations' })).toBeNull();
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
    await expectCode('CH-7214', /Files didn’t load/);
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
    await expectCode('CH-7021', /Couldn’t open Room list\.pdf/);
    expect(a.getGolfMessageAttachments).toHaveBeenCalledWith('m1');
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
    await user.click(screen.getAllByRole('button', { name: /^(?!Actions for ).*Jonah Okafor/ })[0]!);
    await screen.findByRole('textbox', { name: /Message Jonah$/ });
    expect(await schedule()).toBe('/golf/dashboard/calendar?new=1&with=p-jonah');
    await user.click(screen.getAllByRole('button', { name: /Dana Cole/ })[0]!);
    await screen.findByRole('textbox', { name: /Message Dana$/ });
    expect(await schedule()).toBe('/golf/dashboard/calendar?new=1');
    expect(screen.getByRole('link', { name: 'Schedule' })).not.toHaveAttribute('title'); // its tip is the Tooltip's, not a second native one
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
    await expectCode('CH-7214', /Files didn’t load/);
    await user.click(within(code('CH-7214') as HTMLElement).getByRole('button', { name: /Try again/ }));
    await expectCode('CH-7306');
    expect(a.getGolfConversationFiles).toHaveBeenCalledTimes(3);
  });

  it('Details lists a conversation’s files with kind, size and day, and a file opens through its message', async () => {
    const user = userEvent.setup();
    const tab = { opener: {} as unknown, location: { href: '' }, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockImplementation(() => tab as unknown as Window);
    a.getGolfConversationFiles.mockResolvedValue({ files: [roomList] });
    a.getGolfMessageAttachments.mockResolvedValue({ attachments: [{ id: 'f1', fileName: 'Room list.pdf', fileSize: 49152, mimeType: 'application/pdf', url: 'https://files.example/room-list.pdf' }] });
    show();
    await screen.findByRole('textbox', { name: /Message Varsity team/ });
    await openDetails(user);
    const row = await screen.findByRole('button', { name: /Room list\.pdf/ });
    expect(row.textContent).toMatch(/PDF · 48 KB · Today/);
    expect(a.getGolfConversationFiles).toHaveBeenCalledWith('team');
    await user.click(row);
    // The tab opens inside the tap, or iPhone Safari blocks it; the signed address fills it in.
    expect(open).toHaveBeenCalledWith('about:blank', '_blank');
    await waitFor(() => expect(tab.location.href).toBe('https://files.example/room-list.pdf'));
    expect(tab.opener).toBeNull();
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
    await expectCode('CH-7021', /Couldn’t open Room list\.pdf/);
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

  it('A16 a ?compose=1 link (the palette’s New message) opens New message and cleans the address', async () => {
    live.convs.conversations = [team, dm];
    params.current = new URLSearchParams('compose=1');
    router.replace.mockClear();
    show();
    expect(await screen.findByRole('dialog', { name: 'New message' })).toBeTruthy();
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
    await user.click(screen.getAllByRole('button', { name: /^(?!Actions for ).*Jonah Okafor/ })[0]!);
    const other = (await screen.findByRole('textbox', { name: /Message Jonah$/ })) as HTMLTextAreaElement;
    expect(other.value).toBe('');
    await user.click(screen.getAllByRole('button', { name: /^(?!Actions for ).*Varsity team/ })[0]!);
    expect(((await screen.findByRole('textbox', { name: /Message Varsity team/ })) as HTMLTextAreaElement).value).toBe('Half-written note');
  });

  it('CH-7605 the first thread opens in place; another settles in over it, the last leaving the accessibility tree at once', async () => {
    const user = userEvent.setup();
    live.convs.conversations = [team, dm];
    show();
    const leaving = () => document.querySelector('.ch-ms-pane .ch-swap__body[aria-hidden]');
    await screen.findByRole('textbox', { name: /Message Varsity team/ });
    expect(leaving()).toBeNull();
    await user.click(screen.getAllByRole('button', { name: /^(?!Actions for ).*Jonah Okafor/ })[0]!);
    await screen.findByRole('textbox', { name: /Message Jonah$/ });
    // Varsity team fades out behind Jonah's thread (jsdom never finishes the fade), hidden from assistive tech.
    expect(leaving()?.querySelector('[aria-label="Conversation with Varsity team"]')).not.toBeNull();
    expect(screen.queryByRole('region', { name: 'Conversation with Varsity team' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Conversation with Jonah Okafor' })).toBeTruthy();
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
    const { unmount } = render(<MessagesNoTeam coach />);
    const el = code('CH-7308')!;
    expect(el.classList.contains('ch-es--page')).toBe(true);
    expect(within(el as HTMLElement).getByRole('heading', { level: 2, name: "You aren’t on a team yet" })).toBeTruthy();
    expect(within(el as HTMLElement).getByRole('link', { name: 'Open team settings' }).getAttribute('href')).toBe('/golf/dashboard/settings?section=team');
    unmount();
    // A player joins a team from Golf profile (CH-8302).
    render(<MessagesNoTeam coach={false} />);
    expect(screen.getByRole('link', { name: 'Open team settings' }).getAttribute('href')).toBe('/golf/dashboard/settings?section=golf');
  });
});

describe('Messages · prefilled messages (D2-7: the coach presses Send)', () => {
  /** What an action elsewhere does: keeps the prefill in this tab's storage, and hands Messages only its key. */
  const stash = (p: { players: string[]; draft: string; title?: string }) => new URL(messagesPrefillHref(p)!, 'https://x.test').searchParams;
  afterEach(() => window.sessionStorage.clear());

  it('the URL carries only an opaque key: no draft, no group name, no player ids', () => {
    const href = messagesPrefillHref({ players: ['p-eli', 'p-jonah'], draft: 'Eli, how is the wrist after physio?', title: 'Injury check-in' })!;
    expect(href).toMatch(/^\/golf\/dashboard\/messages\?prefill=[a-z0-9]+$/);
    expect(href).not.toMatch(/wrist|physio|Injury|p-eli|p-jonah|draft|title|players/i);
    // The same prefill gives the same href, on the server and in the browser.
    expect(messagesPrefillHref({ players: ['p-eli', 'p-jonah'], draft: 'Eli, how is the wrist after physio?', title: 'Injury check-in' })).toBe(href);
    expect(messagesPrefillHref({ players: [], draft: 'hi' })).toBeNull();
  });

  it('the key is single-use, and a key with nothing stored (a cold link, a new tab) gives nothing', () => {
    const q = stash({ players: ['p-eli'], draft: 'Can you make the 3:30 block?' });
    expect(takePrefill(q)).toEqual({ players: ['p-eli'], draft: 'Can you make the 3:30 block?', title: undefined });
    expect(takePrefill(q)).toBeNull();
    expect(takePrefill(new URLSearchParams('prefill=unknown'))).toBeNull();
    expect(takePrefill(new URLSearchParams('players=p-eli&draft=hi'))).toBeNull();
  });

  it('players not on the team are left out, in order, and the rest are kept', () => {
    expect(onRoster(['p-eli', 'stranger', 'p-jonah'], (id) => id.startsWith('p-'))).toEqual({ kept: ['p-eli', 'p-jonah'], dropped: ['stranger'] });
  });

  it('a cold link opens Messages as usual, with nothing prefilled and nothing sent', async () => {
    live.convs.conversations = [team];
    params.current = new URLSearchParams('prefill=gone');
    show();
    await screen.findByRole('textbox', { name: /Message Varsity team/ });
    expect(screen.queryByRole('dialog', { name: 'New message' })).toBeNull();
    expect(live.msgs.sendMessage).not.toHaveBeenCalled();
  });

  it('CH-7001 a foreign id is dropped and reported; the teammate stays chosen and nothing is sent', async () => {
    params.current = stash({ players: ['p-eli', 'stranger', 'p-jonah'], title: 'Short-game block', draft: 'Reply when you can' });
    show();
    await expectCode('CH-7001', /One player was left out/);
    const dialog = await screen.findByRole('dialog', { name: 'New message' });
    expect(dialog.textContent).toContain('Reply when you can');
    expect(a.createGolfTeamBroadcast).not.toHaveBeenCalled();
    expect(live.msgs.sendMessage).not.toHaveBeenCalled();
  });

  const dmEli = { id: 'dm-eli', title: null, participant_ids: ['me', 'eli'], participant_count: 2, unread_count: 0, other_participant: { id: 'eli', name: 'Eli Brandt' }, last_message: null, creator_id: 'me' };

  it('one player with a thread opens it with the draft in the composer, and nothing is sent', async () => {
    live.convs.conversations = [team, dmEli];
    params.current = stash({ players: ['p-eli'], draft: 'Can you make the 3:30 block?' });
    show();
    const box = await screen.findByRole('textbox', { name: /Message Eli/ });
    await waitFor(() => expect((box as HTMLTextAreaElement).value).toBe('Can you make the 3:30 block?'));
    expect(live.msgs.sendMessage).not.toHaveBeenCalled();
    expect(a.createGolfConversation).not.toHaveBeenCalled();
  });

  it('MSG-CP-56 New announcement is in a coach New message and absent from a player DOM', async () => {
    const user = userEvent.setup();
    const { unmount } = showPhone();
    await user.click(await screen.findByRole('button', { name: 'New message' }));
    expect((await screen.findByRole('region', { name: 'New message' })).textContent).toMatch(/announcement/i);
    unmount();
    showPhone({ ...data, role: 'player', viewerPlayerId: 'p-me' });
    await user.click(await screen.findByRole('button', { name: 'New message' }));
    expect((await screen.findByRole('region', { name: 'New message' })).textContent).not.toMatch(/announcement/i);
  });

  it('W-MSG-16 the coach own unsent draft wins over the prefill, and nothing is sent', async () => {
    live.convs.conversations = [team, dmEli];
    new DraftStore(data.viewerUserId).set('dm-eli', 'My own words');
    params.current = stash({ players: ['p-eli'], draft: 'Can you make the 3:30 block?' });
    show();
    const box = await screen.findByRole('textbox', { name: /Message Eli/ });
    await waitFor(() => expect((box as HTMLTextAreaElement).value).toBe('My own words'));
    expect(live.msgs.sendMessage).not.toHaveBeenCalled();
    new DraftStore(data.viewerUserId).delete('dm-eli');
  });

  it('two players open New message as a named group with the draft quoted; nothing is created until the coach presses on', async () => {
    const user = userEvent.setup();
    a.createGolfTeamBroadcast.mockResolvedValue({ conversationId: 'grp' });
    params.current = stash({ players: ['p-eli', 'p-jonah'], title: 'Short-game block', draft: 'Reply when you can' });
    show();
    const dialog = await screen.findByRole('dialog', { name: 'New message' });
    expect((within(dialog).getByRole('textbox', { name: 'Group name' }) as HTMLInputElement).value).toBe('Short-game block');
    expect(dialog.textContent).toContain('Reply when you can');
    expect(a.createGolfTeamBroadcast).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Create group' }));
    await waitFor(() => expect(a.createGolfTeamBroadcast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Short-game block', selectedPlayerIds: ['p-eli', 'p-jonah'] })));
    expect(live.msgs.sendMessage).not.toHaveBeenCalled();
  });

  it('phone: Next creates the thread and leaves the draft in its composer, unsent', async () => {
    const user = userEvent.setup();
    a.createGolfConversation.mockResolvedValue({ conversationId: 'dm-eli' });
    params.current = stash({ players: ['p-eli'], draft: 'Can you make the 3:30 block?' });
    showPhone();
    const newMsg = await screen.findByRole('region', { name: 'New message' });
    expect(newMsg.textContent).toContain('Can you make the 3:30 block?');
    live.convs.conversations = [team, dmEli];
    await user.click(within(newMsg).getByRole('button', { name: 'Next' }));
    const box = await screen.findByRole('textbox', { name: /Message Eli/ });
    await waitFor(() => expect((box as HTMLTextAreaElement).value).toBe('Can you make the 3:30 block?'));
    expect(live.msgs.sendMessage).not.toHaveBeenCalled();
  });

  it('a player’s prefill to two people keeps one (players start direct threads only, D-15)', async () => {
    params.current = stash({ players: ['p-eli', 'p-jonah'], draft: 'hi' });
    show({ ...data, role: 'player', viewerPlayerId: 'p-me' });
    const dialog = await screen.findByRole('dialog', { name: 'New message' });
    // Direct mode: one person picked, and no group chips.
    expect(dialog.querySelector('.ch-ms-to')).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Start conversation' })).toBeTruthy();
  });

  it('CH-7001 players who are not on the team', async () => {
    params.current = stash({ players: ['nobody'], draft: 'hi' });
    show();
    await expectCode('CH-7001', /Those players aren’t on your team/);
  });
});

describe('Messages · senders peek (P003-C1)', () => {
  const fromJonah = { ...mine, id: 'j1', sender_id: 'jonah', content: 'Yes coach' };

  it('a player sees names without the coach’s player peek', async () => {
    live.convs.conversations = [team];
    live.msgs.messages = [fromJonah];
    show({ ...data, role: 'player', viewerPlayerId: 'p-me' });
    await screen.findByText('Yes coach');
    expect(document.getElementById('ch-ms-message-j1')!.querySelector('.ch-peek-target')).toBeNull();
  });
});

describe('Messages · wave 5 feedback', () => {
  const jonahMsg = { id: 'j1', conversation_id: 'team', sender_id: 'jonah', content: 'Which bay?', created_at: '2026-10-14T18:05:00Z', isRead: true };
  const dmJonah = { id: 'dm-jonah', title: null, participant_ids: ['me', 'jonah'], participant_count: 2, unread_count: 0, other_participant: { id: 'jonah', name: 'Jonah Okafor' }, last_message: null, creator_id: 'me' };

  it('#13 a web link in a message is a link that opens apart from the app; other schemes stay text', async () => {
    live.msgs.messages = [{ ...mine, content: 'Tee sheet: https://golf.example.com/tee. Not javascript:alert(1)' }];
    show();
    const link = await screen.findByRole('link', { name: 'https://golf.example.com/tee' });
    expect(link.getAttribute('href')).toBe('https://golf.example.com/tee');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noreferrer noopener');
    expect(link.closest('.ch-ms-bub')!.textContent).toBe('Tee sheet: https://golf.example.com/tee. Not javascript:alert(1)');
    expect(link.closest('.ch-ms-bub')!.querySelectorAll('a')).toHaveLength(1);
  });

  it('#12 Groups with no group says so, not “caught up”', async () => {
    const user = userEvent.setup();
    live.convs.conversations = [{ ...dmJonah, last_message: { content: 'See you at 6', created_at: '2026-10-14T17:00:00Z', sender_id: 'jonah' } }];
    live.msgs.messages = [];
    show();
    await user.click(await screen.findByRole('radio', { name: 'Groups' }));
    // Messages v2 (MSG-108): the artifact's "Nothing here" card with its one line, still never "caught up".
    await expectCode('CH-7302', /Nothing hereNo groups right now\.$/);
    expect(screen.queryByText(/caught up/i)).toBeNull();
  });

  it('#6 CH-7106 more than ten files: ten are kept and the rest are said, not dropped silently', async () => {
    const user = userEvent.setup({ applyAccept: false });
    show();
    await screen.findByRole('textbox', { name: /Message Varsity team/ });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, Array.from({ length: 11 }, (_, i) => new File(['x'], `plan-${i}.pdf`, { type: 'application/pdf' })));
    await expectCode('CH-7106', /Up to 10 files per message.*1 file wasn’t added/);
    expect(screen.getAllByRole('button', { name: /^Remove plan-/ })).toHaveLength(10);
    expect(screen.getByTitle('plan-0.pdf').querySelector('.ch-ms-to__n')?.textContent).toBe('plan-0.pdf');
  });

  it('#21 the composer counts down within 300 of the limit', async () => {
    show();
    const box = await screen.findByRole('textbox', { name: /Message Varsity team/ });
    fireEvent.change(box, { target: { value: 'x'.repeat(4600) } });
    expect(screen.queryByText('400 left')).toBeNull();
    fireEvent.change(box, { target: { value: 'x'.repeat(4800) } });
    expect(screen.getByText('200 left')).toBeTruthy();
    fireEvent.change(box, { target: { value: 'x'.repeat(5000) } });
    expect(screen.getByText('No characters left')).toBeTruthy();
  });

  it('#2 a week’s mute reads as a date, not “today”', async () => {
    const user = userEvent.setup();
    a.getGolfConversationMute.mockResolvedValue({ success: true, data: { muted: true, until: '2026-10-21T18:40:00Z' } });
    show();
    await openDetails(user);
    expect(await screen.findByText('Muted until Oct 21 · 2:40 PM')).toBeTruthy();
  });

  it('#17 a thread opened with something unread marks where it starts', async () => {
    live.convs.conversations = [{ ...team, unread_count: 1 }];
    live.msgs.messages = [mine, jonahMsg];
    show();
    const sep = await screen.findByRole('separator', { name: 'New messages' });
    expect(sep.nextElementSibling?.id).toBe('ch-ms-message-j1');
  });

  describe('phone', () => {
    it('#4 #7 #18 New message: Return adds a line, the first message survives Cancel, and Next says Starting… while it works', async () => {
      const user = userEvent.setup();
      let finish!: (v: unknown) => void;
      a.createGolfConversation.mockImplementation(() => new Promise((r) => { finish = r; }));
      showPhone();
      await user.click(await screen.findByRole('button', { name: 'New message' }));
      let newMsg = await screen.findByRole('region', { name: 'New message' });
      await user.click(within(newMsg).getByRole('option', { name: /Eli Brandt/ }));
      const box = within(newMsg).getByRole('textbox', { name: 'Message Eli' }) as HTMLTextAreaElement;
      expect(box.getAttribute('enterkeyhint')).toBe('enter');
      await user.type(box, 'Range at 4{Enter}Bring balls');
      expect(box.value).toBe('Range at 4\nBring balls');
      await user.click(within(newMsg).getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.queryByRole('region', { name: 'New message' })).toBeNull());
      await user.click(screen.getByRole('button', { name: 'New message' }));
      newMsg = await screen.findByRole('region', { name: 'New message' });
      await user.click(within(newMsg).getByRole('option', { name: /Eli Brandt/ }));
      expect((within(newMsg).getByRole('textbox', { name: 'Message Eli' }) as HTMLTextAreaElement).value).toBe('Range at 4\nBring balls');
      await user.click(within(newMsg).getByRole('button', { name: 'Next' }));
      expect(within(newMsg).getByRole('button', { name: 'Starting…' })).toBeTruthy();
      await act(async () => finish({ error: 'nope' }));
      await expectCode('CH-7002');
      expect((within(newMsg).getByRole('textbox', { name: 'Message Eli' }) as HTMLTextAreaElement).value).toBe('Range at 4\nBring balls');
    });

  });
});

/** P-10 Notify anyway: the "Notified anyway" caption keys on the delivery stamp, never on the coach's request. */
describe('Messages: CH-7271 Notified anyway caption', () => {
  const dm = { id: 'dm', title: null, participant_ids: ['me', 'jonah'], participant_count: 2, unread_count: 0, other_participant: { id: 'jonah', name: 'Jonah Okafor' }, last_message: null, creator_id: 'me' };
  const stamped = { ...mine, notify_anyway: true, notify_anyway_pushed_at: '2026-10-14T18:00:02Z' };
  const caption = () => document.querySelector('.ch-ms-msg__na');

  it('shows after a push went out, to a coach in a 1:1', async () => {
    live.convs.conversations = [dm];
    live.msgs.messages = [{ ...stamped, conversation_id: 'dm' }];
    show();
    await waitFor(() => expect(caption()?.textContent).toMatch(/Notified anyway/));
  });

  it('shows to a player in a 1:1 too', async () => {
    live.convs.conversations = [dm];
    live.msgs.messages = [{ ...stamped, conversation_id: 'dm', sender_id: 'jonah' }];
    show({ ...data, role: 'player', viewerUserId: 'me', viewerPlayerId: 'p-me' });
    await waitFor(() => expect(caption()?.textContent).toMatch(/Notified anyway/));
  });

  it('is not shown while the push is only requested (no stamp), or when the send failed', async () => {
    live.convs.conversations = [dm];
    live.msgs.messages = [{ ...mine, conversation_id: 'dm', notify_anyway: true, notify_anyway_pushed_at: null }];
    const view = show();
    await waitFor(() => expect(screen.getAllByText('Bus at 6:15').length).toBeGreaterThan(0));
    expect(caption()).toBeNull();
    view.unmount();
    live.msgs.messages = [{ ...stamped, conversation_id: 'dm', sendFailed: true, sendOutcome: 'refused' }];
    show();
    await waitFor(() => expect(screen.getAllByText('Bus at 6:15').length).toBeGreaterThan(0));
    expect(caption()).toBeNull();
  });

  it('in a group shows to a coach and stays hidden from a player', async () => {
    live.msgs.messages = [stamped];
    const view = show();
    await waitFor(() => expect(caption()?.textContent).toMatch(/Notified anyway/));
    view.unmount();
    live.msgs.messages = [{ ...stamped, sender_id: 'jonah' }];
    show({ ...data, role: 'player', viewerUserId: 'me', viewerPlayerId: 'p-me' });
    await waitFor(() => expect(screen.getAllByText('Bus at 6:15').length).toBeGreaterThan(0));
    expect(caption()).toBeNull();
  });
});

describe('Messages · polls (premium features P-2)', () => {
  const poll = {
    id: 'p1',
    conversation_id: 'team',
    sender_id: 'me',
    content: 'Poll: Which van?\n1. Van A\n2. Van B\nVote in GolfHelm.',
    created_at: '2026-10-14T18:10:00Z',
    isRead: true,
    kind: 'poll',
    payload: { v: 1, question: 'Which van?', options: [{ id: 'o1', label: 'Van A' }, { id: 'o2', label: 'Van B' }], multi: false, closes_at: null, closed_at: null },
  };
  beforeEach(() => {
    live.msgs.messages = [mine, poll];
    polls.responses.rows = [{ message_id: 'p1', user_id: 'eli', choice: 'o2' }];
    polls.responses.error = null;
    polls.responses.ready = true;
    polls.responses.pending = new Set<string>();
    polls.responses.vote.mockReset().mockResolvedValue({ ok: true });
    polls.sendGolfPoll.mockReset().mockResolvedValue({ success: true, id: 'p2' });
    polls.closeGolfPoll.mockReset().mockResolvedValue({ success: true, id: 'p1' });
  });

  it('a poll message draws as its card, never as its plain-text copy, with the thread’s count', async () => {
    show();
    const card = await screen.findByRole('group', { name: 'Which van?' });
    // MSG-501: the footer counts the votes cast; a sole leader is marked at any time (Q-34).
    expect(within(card).getByRole('radio', { name: 'Van B, 1 vote, most votes' })).toBeTruthy();
    expect(card.querySelector('.ch-msd-poll__count')!.textContent).toBe('1 vote');
    expect(screen.queryByText(/Vote in GolfHelm/)).toBeNull();
  });

  it('D30: Remind fills the composer as a reply to the poll, and asks before replacing a draft', async () => {
    const user = userEvent.setup();
    show();
    const card = await screen.findByRole('group', { name: 'Which van?' });
    const box = (await screen.findByRole('textbox', { name: /Message Varsity team/ })) as HTMLTextAreaElement;
    await user.click(within(card).getByRole('button', { name: /^Remind \d$/ }));
    await waitFor(() => expect(box.value).toMatch(/^Reminder: vote in the “Which van\?” poll/));
    expect(document.querySelector('.ch-ms-comp__reply')).not.toBeNull();
    await user.clear(box);
    await user.type(box, 'My own words');
    await user.click(within(card).getByRole('button', { name: /^Remind \d$/ }));
    const ask = await screen.findByRole('dialog', { name: 'Replace your draft?' });
    await user.click(within(ask).getByRole('button', { name: 'Keep my draft' }));
    expect(box.value).toBe('My own words');
  });

  it('a vote is saved with the option id', async () => {
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole('radio', { name: /Van A/ }));
    await waitFor(() => expect(polls.responses.vote).toHaveBeenCalledWith('p1', 'o1'));
  });

  it('CH-7029 a vote that isn’t saved says so', async () => {
    const user = userEvent.setup();
    polls.responses.vote.mockResolvedValue({ ok: false, reason: 'failed' });
    show();
    await user.click(await screen.findByRole('radio', { name: /Van A/ }));
    await expectCode('CH-7029', /Your vote wasn’t saved/);
  });

  it('CH-7030 a vote refused because the poll ended says the result is final', async () => {
    const user = userEvent.setup();
    polls.responses.vote.mockResolvedValue({ ok: false, reason: 'closed' });
    show();
    await user.click(await screen.findByRole('radio', { name: /Van A/ }));
    await expectCode('CH-7030', /Voting has ended/);
  });

  it('CH-7030 a vote on a poll deleted meanwhile says so; a former member’s refusal is the CH-7029 toast', async () => {
    const user = userEvent.setup();
    polls.responses.vote.mockResolvedValueOnce({ ok: false, reason: 'deleted' });
    show();
    await user.click(await screen.findByRole('radio', { name: /Van A/ }));
    await expectCode('CH-7030', /This poll was deleted/);
    polls.responses.vote.mockResolvedValueOnce({ ok: false, reason: 'member' });
    await user.click(await screen.findByRole('radio', { name: /Van B/ }));
    await expectCode('CH-7029', /Your vote wasn’t saved/);
  });

  it('CH-7027 closing a poll that fails says so and keeps the confirm open', async () => {
    const user = userEvent.setup();
    polls.closeGolfPoll.mockResolvedValue({ success: false, error: 'nope' } as never);
    show();
    await user.click(await screen.findByRole('button', { name: 'Close poll' }));
    const dialog = await screen.findByRole('dialog', { name: 'Close this poll?' });
    await user.click(within(dialog).getByRole('button', { name: 'Close poll' }));
    await expectCode('CH-7027', /Couldn’t close the poll/);
    expect(polls.closeGolfPoll).toHaveBeenCalledWith('p1');
    expect(screen.getByRole('dialog', { name: 'Close this poll?' })).toBeTruthy();
  });

});

describe('F-0004 · coach Start conversation opens the one-to-one thread, never the channel', () => {
  // The Team Channel is the newest thread, so desktop opens it beside the rail.
  const channel = { id: 'channel', title: 'Team Channel', is_team_channel: true, participant_ids: ['me', 'jonah', 'eli', 'dan', 'dana', 'x'], participant_count: 6, unread_count: 0, last_message: { content: 'Practice moved', created_at: '2026-10-14T18:30:00Z', sender_id: 'me' }, creator_id: 'me' };
  const dmEliNew = { id: 'dm-eli', title: null, participant_ids: ['me', 'eli'], participant_count: 2, unread_count: 0, other_participant: { id: 'eli', name: 'Eli Brandt' }, last_message: null, creator_id: 'me' };

  it('?player= with the channel open beside the rail opens the player’s thread', async () => {
    live.convs.conversations = [channel, team];
    a.createGolfConversation.mockResolvedValue({ conversationId: 'dm-eli', reused: false });
    live.convs.refetch.mockImplementation(async () => {
      live.convs.conversations = [channel, team, dmEliNew];
    });
    params.current = new URLSearchParams('player=p-eli');
    show();
    expect(await screen.findByRole('textbox', { name: /Message Eli$/ })).toBeTruthy();
    expect(a.createGolfConversation).toHaveBeenCalledWith(['eli'], 't1');
  });
});

describe('Messages · actions that fail, on the redesign', () => {
  it('CH-7009 a reaction that fails says so', async () => {
    const user = userEvent.setup();
    live.reactions.setReaction.mockRejectedValue(new Error('refused'));
    show();
    await screen.findByText('Bus at 6:15', { selector: '.ch-ms-bub' });
    await user.click(screen.getAllByRole('button', { name: 'Like' })[0]!);
    await expectCode('CH-7009', /Couldn’t save the reaction/);
  });
});

describe('MSG-406 reactions appear at once (messages-v2 fix 1)', () => {
  /** jsdom has no Web Animations: every animation here finishes on the next microtask, as it would in a browser. */
  const finishing = () => {
    HTMLElement.prototype.animate = (() => {
      const anim = { cancel: () => {}, finish: () => {}, reverse: () => {}, finished: Promise.resolve() };
      Object.defineProperty(anim, 'onfinish', { configurable: true, set(fn: (() => void) | null) { if (fn) queueMicrotask(fn); }, get: () => null });
      return anim;
    }) as never;
  };
  it('right-click, then a key in the lift bar: the badge shows before the server has answered', async () => {
    finishing();
    live.msgs.messages = [{ ...mine, sender_id: 'jonah' }];
    let save!: () => void;
    live.reactions.setReaction.mockImplementation(() => new Promise<boolean>((resolve) => { save = () => resolve(true); }) as never);
    show();
    const bubble = await screen.findByText('Bus at 6:15', { selector: '.ch-ms-bub' });
    fireEvent.contextMenu(bubble, { clientX: 100, clientY: 100 });
    fireEvent.click(await screen.findByRole('button', { name: 'Love' }));
    await waitFor(() => expect(live.reactions.setReaction).toHaveBeenCalledWith('m1', '❤️', true));
    await waitFor(() => expect(document.querySelectorAll('.ch-ms-reacts .ch-ms-react')).toHaveLength(1));
    save();
  });

  it('taking your reaction back removes the badge before the server has answered', async () => {
    finishing();
    live.msgs.messages = [{ ...mine, sender_id: 'jonah' }];
    live.reactions.rows = [{ id: 'r1', message_id: 'm1', user_id: 'me', emoji: '❤️' }];
    live.reactions.setReaction.mockImplementation(() => new Promise<boolean>(() => {}) as never);
    try {
      show();
      const bubble = await screen.findByText('Bus at 6:15', { selector: '.ch-ms-bub' });
      expect(document.querySelectorAll('.ch-ms-reacts .ch-ms-react')).toHaveLength(1);
      fireEvent.contextMenu(bubble, { clientX: 100, clientY: 100 });
      const love = await screen.findByRole('button', { name: 'Love' });
      expect(love.getAttribute('aria-pressed')).toBe('true');
      fireEvent.click(love);
      await waitFor(() => expect(live.reactions.setReaction).toHaveBeenCalledWith('m1', '❤️', false));
      await waitFor(() => expect(document.querySelectorAll('.ch-ms-reacts .ch-ms-react')).toHaveLength(0));
    } finally {
      live.reactions.rows = [];
    }
  });
});
