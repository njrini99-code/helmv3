import { LazyMotion, domAnimation } from 'motion/react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Messages swap audit (spec §12): write paths whose failures the screen used to hide. Mocks as in messages.test.tsx. */

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
  files: { getPendingAttachmentSend: vi.fn(async () => null), retryPendingAttachmentSend: vi.fn(async () => ({ success: true })), sendMessageWithAttachments: vi.fn(async (): Promise<{ success: boolean; error?: string }> => ({ success: true })) },
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
/** The phone layout, inside the shell's phone chrome, as in messages.test.tsx. */
function SlotHost() {
  const { setSlot } = usePhoneChromeState();
  return <div ref={setSlot} data-testid="phone-top" />;
}
/** As TopBar does: the shell's top bar, which holds the page's New message, is inert while a screen is pushed. */
function InertSlotHost() {
  const { setSlot, immersive } = usePhoneChromeState();
  return (
    <header inert={immersive || undefined}>
      <div ref={setSlot} data-testid="phone-top" />
    </header>
  );
}
function showPhone(d: ChMessagesData = data, { inertTop = false } = {}) {
  layout.phone = true;
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as never;
  return render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <PhoneChromeProvider>
          <div className="ch-root" data-ui="clubhouse">
            {inertTop ? <InertSlotHost /> : <SlotHost />}
            <Messages data={d} />
          </div>
        </PhoneChromeProvider>
      </ToastProvider>
    </LazyMotion>,
  );
}
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
  a.getGolfConversationFiles.mockResolvedValue({ files: [] });
  a.getGolfGroupAddCandidates.mockResolvedValue({ candidates: [] });
  a.addGolfGroupMember.mockResolvedValue({ success: true });
});
afterEach(() => {
  setOnline(true);
  layout.phone = false;
});

describe('Messages · swap audit §12', () => {
  it('MSG-12.3 a reaction the hook refuses (it returns false, never throws) is reported, not silently dropped', async () => {
    const user = userEvent.setup();
    live.reactions.setReaction.mockResolvedValue(false as never);
    show();
    await screen.findByText('Bus at 6:15', { selector: '.ch-ms-bub' });
    await user.click(screen.getByRole('button', { name: 'React' }));
    await user.click(screen.getAllByRole('menuitem', { name: /^React / })[0]!);
    await expectCode('CH-7009', /Couldn’t save the reaction/);
  });

  it('MSG-12.3 a tap while another reaction is still saving is ignored, with no false failure', async () => {
    const user = userEvent.setup();
    (live.reactions as { pending?: string | null }).pending = 'm1:x';
    try {
      show();
      await screen.findByText('Bus at 6:15', { selector: '.ch-ms-bub' });
      await user.click(screen.getByRole('button', { name: 'React' }));
      await user.click(screen.getAllByRole('menuitem', { name: /^React / })[0]!);
      expect(live.reactions.setReaction).not.toHaveBeenCalled();
      expect(code('CH-7009')).toBeNull();
    } finally {
      (live.reactions as { pending?: string | null }).pending = null;
    }
  });

  it('MSG-26 a failed text send leaves what was typed while it was pending alone: the failed text lives in its bubble (owner 2026-10-01)', async () => {
    const user = userEvent.setup();
    let reject: (e: Error) => void = () => {};
    live.msgs.sendMessage.mockImplementation(() => new Promise<never>((_, r) => (reject = r)));
    show();
    const box = (await screen.findByRole('textbox', { name: /Message Varsity team/ })) as HTMLTextAreaElement;
    await user.type(box, 'First{Enter}');
    await waitFor(() => expect(live.msgs.sendMessage).toHaveBeenCalledWith('First'));
    await user.type(box, 'Second thought');
    await act(async () => reject(new Error('refused')));
    await expectCode('CH-7004');
    await waitFor(() => expect(box.value).toBe('Second thought'));
  });

  it('MSG-26 a failed attachment send keeps its text and files alongside a file added while it uploaded', async () => {
    const user = userEvent.setup();
    let settle: (r: { success: boolean; error?: string }) => void = () => {};
    live.files.sendMessageWithAttachments.mockImplementation(() => new Promise((r) => (settle = r)));
    show();
    const box = (await screen.findByRole('textbox', { name: /Message Varsity team/ })) as HTMLTextAreaElement;
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(['x'], 'plan.pdf', { type: 'application/pdf' }));
    await user.type(box, 'Here is the plan');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(live.files.sendMessageWithAttachments).toHaveBeenCalled());
    await user.upload(input, new File(['y'], 'map.pdf', { type: 'application/pdf' }));
    await act(async () => settle({ success: false, error: 'nope' }));
    await expectCode('CH-7006', /Couldn’t send the attachment/);
    expect(box.value).toBe('Here is the plan');
    expect(screen.getByRole('button', { name: 'Remove plan.pdf' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove map.pdf' })).toBeTruthy();
  });

  it('CLS coach phone inbox: the conversations wait for the announcements, so they are never pushed down when those land', async () => {
    const annRow = { id: 'a1', title: 'Bus times', body: 'Bus leaves at 6:15.', urgency: 'normal', published_at: '2026-10-14T17:00:00Z', created_at: '2026-10-14T17:00:00Z', requires_acknowledgement: true, acknowledged_count: 0, total_recipients: 2, has_player_acknowledged: false, task_count: 0, completed_task_count: 0, document_count: 0 };
    let land: (v: unknown) => void = () => {};
    a.getAnnouncementsWithMeta.mockImplementation(() => new Promise((r) => (land = r)));
    showPhone();
    // Conversations are in, announcements are not: the inbox still shows its skeleton, not a list that will move.
    await waitFor(() => expect(code('CH-7402')).not.toBeNull());
    expect(screen.queryByText('Varsity team')).toBeNull();
    await act(async () => land({ success: true, data: [annRow] }));
    const ann = await screen.findByRole('region', { name: 'Announcements' });
    const conv = screen.getByText('Varsity team');
    expect(code('CH-7402')).toBeNull();
    // The announcements came first in the same frame as the conversations, above them.
    expect(ann.compareDocumentPosition(conv) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('announcements read with the page: the inbox shows at once and the client does not read them again', async () => {
    // Next runs server actions one at a time; this one queued ahead of the conversation list (Simulator audit 2026-10-14).
    const pre = { id: 'a1', title: 'Bus times', body: 'Bus leaves at 6:15.', urgent: false, publishedAt: '2026-10-14T17:00:00Z', requiresAck: false, ackCount: 0, total: 2, acknowledgedByMe: false, taskCount: 0, completedTaskCount: 0, docCount: 0, authorId: null };
    showPhone({ ...data, announcements: [pre], canHide: true });
    expect(await screen.findByRole('region', { name: 'Announcements' })).toBeTruthy();
    expect(screen.getByText('Varsity team')).toBeTruthy();
    expect(a.getAnnouncementsWithMeta).not.toHaveBeenCalled();
  });

  it('CLS a failed announcements read still lets the inbox show, with its notice', async () => {
    a.getAnnouncementsWithMeta.mockResolvedValue({ success: false, error: 'boom' });
    showPhone();
    expect(await screen.findByText('Varsity team')).toBeTruthy();
    await expectCode('CH-7206');
  });

  it('MSG-23 a failed text send does not put the text back in the box, so a second Send cannot duplicate it (owner 2026-10-01)', async () => {
    const user = userEvent.setup();
    live.msgs.sendMessage.mockRejectedValue(new Error('refused'));
    show();
    const box = (await screen.findByRole('textbox', { name: /Message Varsity team/ })) as HTMLTextAreaElement;
    await user.type(box, 'First{Enter}');
    await expectCode('CH-7004');
    expect(box.value).toBe('');
  });

  it('MSG-10 (already handled, coverage) a ?conversation= link to a thread the viewer is not in says so and shows no thread', async () => {
    params.current = new URLSearchParams('conversation=gone');
    router.replace.mockClear();
    show();
    await expectCode('CH-7015', /That conversation isn’t available/);
    expect(router.replace).toHaveBeenCalledWith('/golf/dashboard/messages', { scroll: false });
    expect(screen.queryByRole('textbox', { name: /^Message / })).toBeNull();
  });
});

describe('Messages · runtime audit 2026-10-14 (WebKit)', () => {
  it.each([
    ['WebKit', 'Load failed'],
    ['Chrome', 'Failed to fetch'],
    ['Firefox', 'NetworkError when attempting to fetch resource.'],
  ])('A-06 a %s network drop on send: the toast says the outcome is unknown, as the bubble does, with no raw browser text', async (_engine, raw) => {
    const user = userEvent.setup();
    live.msgs.sendMessage.mockRejectedValue(new TypeError(raw));
    show();
    const box = (await screen.findByRole('textbox', { name: /Message Varsity team/ })) as HTMLTextAreaElement;
    await user.type(box, 'Bus at 6{Enter}');
    await expectCode('CH-7005', /Couldn’t confirm this message sent/);
    expect(code('CH-7005')!.textContent).toMatch(/check it, then Retry/);
    expect(code('CH-7004')).toBeNull();
    expect(document.body.textContent).not.toContain(raw);
  });

  it('A-06 a refusal the server words for people still reads as not sent, with its reason', async () => {
    const user = userEvent.setup();
    live.msgs.sendMessage.mockRejectedValue(new Error('This conversation is closed'));
    show();
    const box = (await screen.findByRole('textbox', { name: /Message Varsity team/ })) as HTMLTextAreaElement;
    await user.type(box, 'Bus at 6{Enter}');
    await expectCode('CH-7004', /Couldn’t send the message/);
    expect(code('CH-7004')!.textContent).toMatch(/This conversation is closed\./);
    expect(code('CH-7005')).toBeNull();
  });

  it('A-06 an attachment send that throws while its earlier attempt is unconfirmed says unconfirmed, not "Try again"', async () => {
    const user = userEvent.setup();
    live.files.sendMessageWithAttachments.mockResolvedValueOnce({ success: false, sendOutcome: 'unknown' } as never);
    show();
    const box = (await screen.findByRole('textbox', { name: /Message Varsity team/ })) as HTMLTextAreaElement;
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(['x'], 'plan.pdf', { type: 'application/pdf' }));
    await user.type(box, 'Here is the plan');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(live.files.sendMessageWithAttachments).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getAllByText('Couldn’t confirm this send').length).toBeGreaterThan(0));
    live.files.sendMessageWithAttachments.mockRejectedValueOnce(new TypeError('Load failed'));
    await user.click(await screen.findByRole('button', { name: 'Retry send' }));
    await waitFor(() => expect(live.files.sendMessageWithAttachments).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(hapticSpy).toHaveBeenCalledWith('error'));
    expect(code('CH-7006')).toBeNull();
    expect(document.body.textContent).not.toContain('Load failed');
  });

  it('A-26 the reaction bar opened from the keyboard takes focus, arrows move along it, and Esc returns to React', async () => {
    const user = userEvent.setup();
    show();
    await screen.findByText('Bus at 6:15', { selector: '.ch-ms-bub' });
    const react = screen.getByRole('button', { name: 'React' });
    react.focus();
    await user.keyboard('{Enter}');
    const bar = await screen.findByRole('menu', { name: 'Reactions' });
    const items = within(bar).getAllByRole('menuitem');
    await waitFor(() => expect(document.activeElement).toBe(items[0]));
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(items[1]);
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(document.activeElement).toBe(items[items.length - 1]);
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(items[0]);
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(react);
    expect(react.getAttribute('aria-expanded')).toBe('false');
  });

  it('A-26 a reaction picked from the keyboard saves and leaves focus on React, not on <body>', async () => {
    const user = userEvent.setup();
    show();
    await screen.findByText('Bus at 6:15', { selector: '.ch-ms-bub' });
    const react = screen.getByRole('button', { name: 'React' });
    react.focus();
    await user.keyboard('{Enter}');
    const bar = await screen.findByRole('menu', { name: 'Reactions' });
    await waitFor(() => expect(document.activeElement).toBe(within(bar).getAllByRole('menuitem')[0]));
    await user.keyboard('{ArrowRight}{Enter}');
    expect(live.reactions.setReaction).toHaveBeenCalledWith('m1', expect.any(String), true);
    expect(document.activeElement).toBe(react);
  });

  it('A-26 Esc in the More message actions menu returns focus to its trigger', async () => {
    const user = userEvent.setup();
    show();
    await screen.findByText('Bus at 6:15', { selector: '.ch-ms-bub' });
    const more = screen.getByRole('button', { name: 'More message actions' });
    more.focus();
    await user.keyboard('{Enter}');
    const menu = await screen.findByRole('menu', { name: 'Message actions' });
    await waitFor(() => expect(document.activeElement).toBe(within(menu).getAllByRole('menuitem')[0]));
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(more);
  });

  it.each(['coach', 'player'] as const)('A-28 phone New message (%s): focus starts on its title, and a hardware Esc cancels it back to New message', async (role) => {
    const user = userEvent.setup();
    showPhone(role === 'coach' ? data : { ...data, role: 'player', viewerPlayerId: 'p-me' }, { inertTop: true });
    const opener = await screen.findByRole('button', { name: 'New message' });
    opener.focus();
    await user.keyboard('{Enter}');
    const screenEl = await screen.findByRole('region', { name: 'New message' });
    await waitFor(() => expect(document.activeElement).toBe(within(screenEl).getByRole('heading', { name: 'New message' })));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('region', { name: 'New message' })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'New message' })));
  });
});
