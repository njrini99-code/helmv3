
import { render, screen, within } from '@testing-library/react';
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
import { MessagesNoTeam } from '../screens/messages/MessagesNoTeam';
import { messagesPrefillHref, onRoster, takePrefill } from '../screens/messages/prefill';
import './dialog-polyfill';

const code = (c: string) => [...document.querySelectorAll(`[data-ch-code="${c}"]`)].find((el) => el.tagName !== 'DIALOG' || el.hasAttribute('open')) ?? null;
const team = { id: 'team', title: 'Varsity team', participant_ids: ['me', 'jonah', 'eli'], participant_count: 3, unread_count: 0, last_message: { content: 'Bus at 6:15', created_at: '2026-10-14T18:00:00Z', sender_id: 'me' }, creator_id: 'me' };
const mine = { id: 'm1', conversation_id: 'team', sender_id: 'me', content: 'Bus at 6:15', created_at: '2026-10-14T18:00:00Z', isRead: true };
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
});
