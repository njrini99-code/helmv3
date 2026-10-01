import { LazyMotion, domAnimation } from 'framer-motion';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './dialog-polyfill';

/**
 * Ask CoachHelm (P013), the owner's rules 2 and 4 (2026-10-01) on the Ask frame: a retry that lands clears what it was a retry of
 * (the chats list is the server's, read each render, not a copy taken once), a retry says it is working (CH-13222, CH-13223), and a
 * late answer for a chat the coach has left never moves the address (a new chat is a new chat, and the last choice wins).
 */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard/coachhelm' }));
const phoneState = vi.hoisted(() => ({ on: false }));
vi.mock('../lib/use-phone', () => ({ useChPhone: () => phoneState.on, CH_PHONE_QUERY: '(max-width: 820px)' }));
vi.mock('../screens/coachhelm/chat/Thread', () => ({
  AskThread: (p: { onNewChat: () => void; onSend: (t: string) => void }) => (
    <div data-testid="thread">
      <button type="button" onClick={p.onNewChat}>
        stub new chat
      </button>
      <button type="button" onClick={() => p.onSend('A follow-up')}>
        stub follow-up
      </button>
    </div>
  ),
}));
vi.mock('../screens/coachhelm/chat/EvidencePanel', () => ({ AskEvidencePanel: () => <div data-testid="evidence" /> }));

import type { UseCoachHelmChatOptions, UseCoachHelmChatResult } from '@/components/golf/coachhelm/chat/useCoachHelmChat';
import type { ChAskData, ChAskLoad } from '../data/coachhelm-chat-shape';
import { Ask, type ChAskChat } from '../screens/coachhelm/chat/Ask';
import { PhoneChromeProvider } from '../shell/phone-chrome';
import { ClubhouseMarker } from '../shell/context';
import { ToastProvider } from '../ui/Toast';
import { ASK_NOW, PREVIEW_ASK_DATA } from '../preview/fixtures-ask';

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);

/** What the conversation hook would return, with spies on everything the frame can ask of it. */
function fakeChat(state: { messages?: UIMessage[]; busy?: boolean } = {}) {
  const calls = { send: vi.fn(), stop: vi.fn(), retry: vi.fn(), newConversation: vi.fn(), approve: vi.fn(), deny: vi.fn() };
  const seen: { options?: UseCoachHelmChatOptions } = {};
  const hook = ((options: UseCoachHelmChatOptions = {}): UseCoachHelmChatResult => {
    seen.options = options;
    return {
      messages: options.initialMessages ?? state.messages ?? [],
      status: state.busy ? 'streaming' : 'ready',
      error: undefined,
      busy: state.busy ?? false,
      conversationId: null,
      context: [],
      addContext: () => {},
      removeContext: () => {},
      ...calls,
    };
  }) as ChAskChat;
  return { hook, calls, seen };
}
type Fake = ReturnType<typeof fakeChat>;

const ready = (over: Partial<ChAskData> = {}): ChAskLoad => ({ status: 'ready', data: { ...PREVIEW_ASK_DATA, ...over } });
const tree = (load: ChAskLoad, chat: Fake) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <PhoneChromeProvider>
        {/* eslint-disable-next-line jsx-a11y/aria-role -- role is a component prop, not an ARIA role */}
        <ClubhouseMarker role="coach">
          <div className="ch-root" data-ui="clubhouse">
            <Ask load={load} chat={chat.hook} />
          </div>
        </ClubhouseMarker>
      </PhoneChromeProvider>
    </ToastProvider>
  </LazyMotion>
);
function show(load: ChAskLoad = ready(), chat: Fake = fakeChat()) {
  const view = render(tree(load, chat));
  return { ...view, chat, rerenderWith: (l: ChAskLoad, c: Fake = chat) => view.rerender(tree(l, c)) };
}
const box = () => screen.getByRole('textbox') as HTMLTextAreaElement;
const replaceState = vi.spyOn(window.history, 'replaceState');

beforeEach(() => {
  phoneState.on = false;
  router.push.mockClear();
  router.refresh.mockClear();
  replaceState.mockClear();
  vi.mocked(window.matchMedia).mockImplementation(
    (query: string) =>
      ({ matches: query.includes('pointer: fine'), media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }) as unknown as MediaQueryList,
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('History’s Try again', () => {
  it('CH-13222 a retry that lands clears "your chats didn’t load": the refreshed list is read, not a copy taken once (the key did not change)', () => {
    const failed = show(ready({ conversations: { list: [], error: true } }));
    expect(code('CH-13222')).not.toBeNull();
    expect(screen.queryByText('No chats yet')).toBeNull();
    failed.rerenderWith(ready({ conversations: PREVIEW_ASK_DATA.conversations }));
    expect(code('CH-13222')).toBeNull();
    const first = PREVIEW_ASK_DATA.conversations.list[0]!;
    expect(within(screen.getByRole('complementary', { name: 'Chats' })).getByRole('link', { name: first.title })).toBeInTheDocument();
  });

  it('CH-13222 a retry that fails again keeps the notice; a list that is verified empty is "No chats yet", only then', () => {
    const failed = show(ready({ conversations: { list: [], error: true } }));
    failed.rerenderWith(ready({ conversations: { list: [], error: true } }));
    expect(code('CH-13222')).not.toBeNull();
    failed.rerenderWith(ready({ conversations: { list: [], error: false } }));
    expect(code('CH-13222')).toBeNull();
    expect(screen.getByText('No chats yet')).toBeInTheDocument();
  });

  it('a chat started in this visit stays in History until the server’s own list holds it, and is not listed twice once it does', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(ASK_NOW));
    const view = show();
    await userEvent.type(box(), 'Why are we missing so many short putts lately?{Enter}', { advanceTimers: () => {} });
    await act(async () => {
      view.chat.seen.options!.onConversationId?.('c-new');
      await Promise.resolve();
    });
    const panel = () => within(screen.getByRole('complementary', { name: 'Chats' }));
    expect(panel().getAllByRole('link', { name: 'Why are we missing so many short putts lately?' })).toHaveLength(1);
    // A refresh whose list does not hold it yet (the write is still landing) keeps it.
    view.rerenderWith(ready({ conversations: PREVIEW_ASK_DATA.conversations }));
    expect(panel().getAllByRole('link', { name: 'Why are we missing so many short putts lately?' })).toHaveLength(1);
    // The server's list now holds it, under its own title: one row, not two.
    const held = { id: 'c-new', title: 'Short putts', updatedAt: ASK_NOW };
    view.rerenderWith(ready({ conversations: { list: [held, ...PREVIEW_ASK_DATA.conversations.list], error: false } }));
    expect(panel().queryAllByRole('link', { name: 'Why are we missing so many short putts lately?' })).toHaveLength(0);
    expect(panel().getAllByRole('link', { name: 'Short putts' })).toHaveLength(1);
  });
});
