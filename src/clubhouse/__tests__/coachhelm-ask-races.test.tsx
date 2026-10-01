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
import { markAppRunning, RouteScope } from '../lib/session-state';
import { PhoneChromeProvider } from '../shell/phone-chrome';
import { ClubhouseMarker } from '../shell/context';
import { ToastProvider } from '../ui/Toast';
import { ASK_NOW, PREVIEW_ASK_DATA } from '../preview/fixtures-ask';
import { ASK_MSGS_ANSWER } from '../preview/fixtures-ask-thread';
import { COACHHELM_HREF } from '../screens/coachhelm/chat/SubTabs';

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
  return { hook, calls, seen, state };
}
type Fake = ReturnType<typeof fakeChat>;

const ready = (over: Partial<ChAskData> = {}): ChAskLoad => ({ status: 'ready', data: { ...PREVIEW_ASK_DATA, ...over } });
/** The page's route and team, as the shell frames it (`RouteFrame`): what a screen's remembered state is kept under. */
const SCOPE = '/golf/dashboard/coachhelm\u0000team-1';
const tree = (load: ChAskLoad, chat: Fake, scope = SCOPE) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <PhoneChromeProvider>
        {/* eslint-disable-next-line jsx-a11y/aria-role -- role is a component prop, not an ARIA role */}
        <ClubhouseMarker role="coach">
          <RouteScope value={scope}>
            <div className="ch-root" data-ui="clubhouse">
              <Ask load={load} chat={chat.hook} />
            </div>
          </RouteScope>
        </ClubhouseMarker>
      </PhoneChromeProvider>
    </ToastProvider>
  </LazyMotion>
);
function show(load: ChAskLoad = ready(), chat: Fake = fakeChat(), scope = SCOPE) {
  const view = render(tree(load, chat, scope));
  return { ...view, chat, rerenderWith: (l: ChAskLoad, c: Fake = chat) => view.rerender(tree(l, c, scope)) };
}
const box = () => screen.getByRole('textbox') as HTMLTextAreaElement;
const replaceState = vi.spyOn(window.history, 'replaceState');

beforeEach(() => {
  markAppRunning();
  sessionStorage.clear();
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

describe('New chat while a reply is on its way', () => {
  const sendFirst = async (view: ReturnType<typeof show>) => {
    await userEvent.type(box(), 'Why are we missing so many short putts lately?{Enter}', { advanceTimers: () => {} });
    view.chat.state.busy = true;
    view.rerenderWith(ready());
  };
  const panel = () => within(screen.getByRole('complementary', { name: 'Chats' }));
  const flush = () =>
    act(async () => {
      await Promise.resolve();
    });

  it('stops the reply first, then starts the new chat', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(ASK_NOW));
    const view = show();
    await sendFirst(view);
    await userEvent.click(panel().getByRole('button', { name: 'New chat' }), { advanceTimers: () => {} });
    expect(view.chat.calls.stop).toHaveBeenCalledTimes(1);
    expect(view.chat.calls.newConversation).toHaveBeenCalledTimes(1);
    expect(view.chat.calls.stop.mock.invocationCallOrder[0]).toBeLessThan(view.chat.calls.newConversation.mock.invocationCallOrder[0]!);
  });

  it('a New chat with no reply on its way does not stop anything', async () => {
    const view = show();
    await userEvent.click(panel().getByRole('button', { name: 'New chat' }));
    expect(view.chat.calls.stop).not.toHaveBeenCalled();
    expect(view.chat.calls.newConversation).toHaveBeenCalledTimes(1);
  });

  it('the late id of the abandoned chat does not move the address to it, rename the new chat or list it (the last choice wins)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(ASK_NOW));
    const view = show();
    await sendFirst(view);
    const late = view.chat.seen.options!.onConversationId!;
    await userEvent.click(panel().getByRole('button', { name: 'New chat' }), { advanceTimers: () => {} });
    expect(replaceState).toHaveBeenLastCalledWith(window.history.state, '', COACHHELM_HREF.ask);
    replaceState.mockClear();
    late('c-abandoned');
    await flush();
    expect(replaceState).not.toHaveBeenCalled();
    expect(panel().queryByRole('link', { name: 'Why are we missing so many short putts lately?' })).toBeNull();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('New chat');
  });

  it('a chat started after the New chat is adopted as before: the new send is the one waiting for its id', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(ASK_NOW));
    const view = show();
    await sendFirst(view);
    await userEvent.click(panel().getByRole('button', { name: 'New chat' }), { advanceTimers: () => {} });
    view.chat.state.busy = false;
    view.rerenderWith(ready());
    await userEvent.type(box(), 'Who is trending up?{Enter}', { advanceTimers: () => {} });
    await act(async () => {
      view.chat.seen.options!.onConversationId?.('c-second');
      await Promise.resolve();
    });
    expect(replaceState).toHaveBeenLastCalledWith(window.history.state, '', `${COACHHELM_HREF.ask}&c=c-second`);
    expect(panel().getAllByRole('link', { name: 'Who is trending up?' })).toHaveLength(1);
  });

  it('an id that arrives after another chat was opened (this frame is replaced) does not move the address', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(ASK_NOW));
    const view = show();
    await userEvent.type(box(), 'Why are we missing so many short putts lately?{Enter}', { advanceTimers: () => {} });
    const late = view.chat.seen.options!.onConversationId!;
    replaceState.mockClear();
    // The coach opened a saved chat in the meantime: its page replaces this one (the frame is keyed by the chat).
    view.rerenderWith(ready({ thread: { id: 'c-putting', title: 'Putting inside 6 feet', messages: ASK_MSGS_ANSWER } }));
    late('c-abandoned');
    await flush();
    expect(replaceState).not.toHaveBeenCalled();
  });
});

describe('CH-13924 the Ask page returns to what the coach left', () => {
  const draftKeys = () => Object.keys(sessionStorage).filter((k) => k.startsWith('ch:ask:draft:'));
  const mine = () => ready({ coachId: 'c1' });
  const settle = () =>
    act(async () => {
      await Promise.resolve();
    });

  it('the unsent message comes back when the coach returns to the page, in the box they left it', async () => {
    const first = show(mine());
    await userEvent.type(box(), 'Who is trending up and why');
    expect(draftKeys()).toHaveLength(1);
    first.unmount();
    show(mine());
    await settle();
    expect(box().value).toBe('Who is trending up and why');
  });

  it('it is kept per coach, per team and per chat: another coach, another team or another chat opens on an empty box', async () => {
    const first = show(mine());
    await userEvent.type(box(), 'Only for coach one');
    first.unmount();
    // Another coach in this tab, another team, another chat: none of them is handed it.
    show(ready({ coachId: 'c2' }));
    await settle();
    expect(box().value).toBe('');
    cleanup();
    show(mine(), fakeChat(), '/golf/dashboard/coachhelm\u0000team-2');
    await settle();
    expect(box().value).toBe('');
    cleanup();
    show(ready({ coachId: 'c1', thread: { id: 'c-putting', title: 'Putting inside 6 feet', messages: ASK_MSGS_ANSWER } }));
    await settle();
    expect(box().value).toBe('');
  });

  it('a send clears it, and an emptied box stores nothing', async () => {
    show(mine());
    await userEvent.type(box(), 'A question{Enter}');
    expect(draftKeys()).toHaveLength(0);
    await userEvent.type(box(), 'abc');
    expect(draftKeys()).toHaveLength(1);
    await userEvent.clear(box());
    expect(draftKeys()).toHaveLength(0);
  });

  it('a draft typed ahead while the new chat is answered moves to the chat’s own id when it arrives, and the new chat’s entry goes', async () => {
    const view = show(mine());
    await userEvent.type(box(), 'First question{Enter}');
    await userEvent.type(box(), 'a follow-up in progress');
    const [before] = draftKeys();
    expect(before).toMatch(/c1:new$/);
    await act(async () => {
      view.chat.seen.options!.onConversationId?.('c-new');
      await Promise.resolve();
    });
    expect(draftKeys()).toHaveLength(1);
    expect(draftKeys()[0]).toMatch(/c1:c-new$/);
    expect(sessionStorage.getItem(draftKeys()[0]!)).toBe('a follow-up in progress');
  });

  it('with no signed-in coach to key it by (a preview) nothing is kept, and storage that refuses writes still lets the coach type', async () => {
    show(ready());
    await userEvent.type(box(), 'No coach to keep this for');
    expect(draftKeys()).toHaveLength(0);
    cleanup();
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    show(mine());
    await userEvent.type(box(), 'still typing');
    expect(box().value).toBe('still typing');
    spy.mockRestore();
  });

  it('the History search and the chats panel come back, for this team; another team starts clean', async () => {
    const first = show();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search chats' }), 'putt');
    await userEvent.click(screen.getByRole('button', { name: 'Hide chats' }));
    first.unmount();
    const back = show();
    expect(screen.getByRole('searchbox', { name: 'Search chats' }) as HTMLInputElement).toHaveValue('putt');
    expect(screen.getByRole('button', { name: 'Show chats' })).toBeInTheDocument();
    back.unmount();
    show(ready(), fakeChat(), '/golf/dashboard/coachhelm\u0000team-2');
    expect(screen.getByRole('searchbox', { name: 'Search chats' }) as HTMLInputElement).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Hide chats' })).toBeInTheDocument();
  });
});
