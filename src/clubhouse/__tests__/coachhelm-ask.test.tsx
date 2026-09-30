import { LazyMotion, domAnimation } from 'framer-motion';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './dialog-polyfill';

/**
 * Ask CoachHelm (P013 Ask sub-tab): the frame, found by its numbers in docs/clubhouse/catalog/coachhelm.md: the sub-tab
 * strip, the new-chat page, the composer, History (the panel and the phone drawer), the container's wiring and the states
 * that stand in for the thread. The conversation's own pieces (answers, evidence, action cards) are tested with them.
 */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard/coachhelm' }));
const phoneState = vi.hoisted(() => ({ on: false }));
vi.mock('../lib/use-phone', () => ({ useChPhone: () => phoneState.on, CH_PHONE_QUERY: '(max-width: 820px)' }));
// The conversation pieces are B's; here they are stand-ins that show what the frame hands them.
const crash = vi.hoisted(() => ({ on: false }));
vi.mock('../screens/coachhelm/chat/Thread', () => ({
  AskThread: (p: { error: unknown; offline: boolean; phone: boolean; messages: UIMessage[]; onRetry: () => void; onNewChat: () => void; onSend: (t: string) => void; onApprove: (id: string) => void; onOpenEvidence: (f: unknown) => void }) => {
    if (crash.on) throw new Error('the thread crashed');
    return (
    <div data-testid="thread">
      <pre data-testid="thread-props">{JSON.stringify({ error: p.error, offline: p.offline, phone: p.phone, count: p.messages.length })}</pre>
      <button type="button" onClick={p.onRetry}>
        stub retry
      </button>
      <button type="button" onClick={p.onNewChat}>
        stub new chat
      </button>
      <button type="button" onClick={() => p.onSend('A follow-up')}>
        stub follow-up
      </button>
      <button type="button" onClick={() => p.onApprove('approval-1')}>
        stub approve
      </button>
      <button type="button" onClick={() => p.onOpenEvidence({ messageId: 'a2', key: 'k', label: 'Jonah Okafor', playerId: 'p-jonah' })}>
        stub evidence
      </button>
    </div>
    );
  },
}));
vi.mock('../screens/coachhelm/chat/EvidencePanel', () => ({
  AskEvidencePanel: (p: { focus: { label: string }; phone: boolean; onClose: () => void }) => (
    <div data-testid="evidence" data-phone={String(p.phone)}>
      {p.focus.label}
      <button type="button" onClick={p.onClose}>
        stub close evidence
      </button>
    </div>
  ),
}));

import type { UseCoachHelmChatOptions, UseCoachHelmChatResult } from '@/components/golf/coachhelm/chat/useCoachHelmChat';
import type { ChAskData, ChAskLoad } from '../data/coachhelm-chat-shape';
import { Ask, type ChAskChat } from '../screens/coachhelm/chat/Ask';
import { AskSkeleton } from '../screens/coachhelm/chat/AskSkeleton';
import { CoachHelmTabs } from '../screens/coachhelm/chat/SubTabs';
import { PhoneChromeProvider, usePhoneChromeState } from '../shell/phone-chrome';
import { ClubhouseMarker } from '../shell/context';
import { ToastProvider } from '../ui/Toast';
import { ASK_NOW, PREVIEW_ASK_DATA, PREVIEW_ASK_NOROUNDS } from '../preview/fixtures-ask';
import { ASK_MSGS_ACTION, ASK_MSGS_ANSWER } from '../preview/fixtures-ask-thread';

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);

/** What the conversation hook would return, with spies on everything the frame can ask of it. */
function fakeChat(state: { messages?: UIMessage[]; busy?: boolean; error?: unknown } = {}) {
  const calls = { send: vi.fn(), stop: vi.fn(), retry: vi.fn(), newConversation: vi.fn(), approve: vi.fn(), deny: vi.fn() };
  const seen: { options?: UseCoachHelmChatOptions } = {};
  const hook = ((options: UseCoachHelmChatOptions = {}): UseCoachHelmChatResult => {
    seen.options = options;
    return {
      messages: options.initialMessages ?? state.messages ?? [],
      status: state.error ? 'error' : state.busy ? 'streaming' : 'ready',
      error: state.error as Error | undefined,
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

/** The phone shell's state, so a test can see whether the tab bar is hidden. */
function Probe() {
  const { noTabs } = usePhoneChromeState();
  return <output data-testid="probe" data-notabs={String(noTabs)} />;
}
function SlotHost() {
  const { setSlot } = usePhoneChromeState();
  return <div ref={setSlot} data-testid="phone-top" />;
}
const ready = (over: Partial<ChAskData> = {}): ChAskLoad => ({ status: 'ready', data: { ...PREVIEW_ASK_DATA, ...over } });
const tree = (load: ChAskLoad, chat: Fake, initial?: Parameters<typeof Ask>[0]['initial']) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <PhoneChromeProvider>
        {/* eslint-disable-next-line jsx-a11y/aria-role -- role is a component prop, not an ARIA role */}
        <ClubhouseMarker role="coach">
          <div className="ch-root" data-ui="clubhouse">
            <SlotHost />
            <Probe />
            <Ask load={load} chat={chat.hook} initial={initial} />
          </div>
        </ClubhouseMarker>
      </PhoneChromeProvider>
    </ToastProvider>
  </LazyMotion>
);
function show(load: ChAskLoad = ready(), chat: Fake = fakeChat(), initial?: Parameters<typeof Ask>[0]['initial']) {
  const view = render(tree(load, chat, initial));
  return { ...view, chat, rerenderWith: (l: ChAskLoad, c: Fake = chat) => view.rerender(tree(l, c, initial)) };
}
const box = () => screen.getByRole('textbox') as HTMLTextAreaElement;

let fine = true;
const setOnline = (on: boolean) => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => on });
const replaceState = vi.spyOn(window.history, 'replaceState');

beforeEach(() => {
  phoneState.on = false;
  fine = true;
  setOnline(true);
  hapticSpy.mockClear();
  router.push.mockClear();
  router.refresh.mockClear();
  replaceState.mockClear();
  vi.mocked(window.matchMedia).mockImplementation(
    (query: string) =>
      ({ matches: query.includes('pointer: fine') ? fine : false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }) as unknown as MediaQueryList,
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('CH-13923 the sub-tab strip', () => {
  it('draws Board and Ask as one radiogroup with Ask on, and Board is a route change with the select haptic', async () => {
    render(
      <LazyMotion features={domAnimation}>
        <div className="ch-root" data-ui="clubhouse">
          <CoachHelmTabs active="ask" />
        </div>
      </LazyMotion>,
    );
    const group = screen.getByRole('radiogroup', { name: 'CoachHelm view' });
    expect(within(group).getByRole('radio', { name: 'Ask' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(within(group).getByRole('radio', { name: 'Board' }));
    expect(router.push).toHaveBeenCalledWith('/golf/dashboard/coachhelm');
    expect(hapticSpy).toHaveBeenCalledWith('select');
    cleanup();
    render(
      <LazyMotion features={domAnimation}>
        <div className="ch-root" data-ui="clubhouse">
          <CoachHelmTabs active="board" />
        </div>
      </LazyMotion>,
    );
    await userEvent.click(screen.getByRole('radio', { name: 'Ask' }));
    expect(router.push).toHaveBeenLastCalledWith('/golf/dashboard/coachhelm?view=ask');
  });

  it('is on the Ask view, above the chat, with the team beside it (desktop) and without a team label on the phone', () => {
    show();
    expect(code('CH-13923')).not.toBeNull();
    expect(screen.getByText('Finley University', { selector: '.ch-ask-team' })).toBeInTheDocument();
    cleanup();
    phoneState.on = true;
    show();
    expect(code('CH-13923')).not.toBeNull();
    expect(document.querySelector('.ch-ask-team')).toBeNull();
  });
});

describe('the new chat page (desktop)', () => {
  it('CH-13721 greets with the team, offers the openers as pills that send with the select haptic, and draws the findings', async () => {
    const { chat } = show();
    expect(screen.getByRole('heading', { name: 'What do you want to know about Finley University?' })).toBeInTheDocument();
    expect(screen.getByText('Answers come from your recorded rounds, signals and schedule.')).toBeInTheDocument();
    const pills = within(screen.getByRole('list', { name: 'Questions to start with' })).getAllByRole('button');
    expect(pills.map((b) => b.textContent)).toEqual(['Brief me on Finley University', 'Where is the team losing the most strokes?', 'Who is trending up this month?', "What's on this week?"]);
    await userEvent.click(pills[1]!);
    expect(chat.calls.send).toHaveBeenCalledWith('Where is the team losing the most strokes?');
    expect(hapticSpy).toHaveBeenCalledWith('select');
    expect(screen.getByRole('region', { name: 'Since you were last here' })).toBeInTheDocument();
    expect(screen.getByText('6 of 8 players have a round in the last 30 days. Answers cover those 6. As of 2:00 PM.')).toBeInTheDocument();
  });

  it('a finding with a question is a button that asks it; one without is text; a link shows only when the data gave one', async () => {
    const findings = [
      { id: 'a', category: 'Putting', headline: 'Downhill putts dropped to 58%', evidence: 'Uphill is 81%.', tone: 'attention' as const, ask: 'Why are we missing short putts?', link: null },
      { id: 'b', category: 'Coverage', headline: 'No rounds in 30 days', evidence: 'Since Sept 1.', tone: 'neutral' as const, ask: null, link: { label: 'Open roster', href: '/golf/dashboard/roster' } },
    ];
    const { chat } = show(ready({ pulse: { findings, coverage: null, asOfLabel: null } }));
    await userEvent.click(screen.getByRole('button', { name: /Downhill putts dropped to 58%/ }));
    expect(chat.calls.send).toHaveBeenCalledWith('Why are we missing short putts?');
    expect(screen.queryByRole('button', { name: /No rounds in 30 days/ })).toBeNull();
    expect(screen.getByText('No rounds in 30 days')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open roster' })).toHaveAttribute('href', '/golf/dashboard/roster');
    expect(screen.queryByRole('link', { name: 'Open calendar' })).toBeNull();
  });

  it('CH-13322 players and no recorded round is "Nothing to report yet", with no findings grid and the chat still there', () => {
    show(ready(PREVIEW_ASK_NOROUNDS));
    expect(code('CH-13322')?.textContent).toMatch(/Nothing to report yet.*No player has a recorded round yet\. Findings show up here after the first rounds come in\. You can still ask about your roster and schedule\./);
    expect(document.querySelector('.ch-ask-find__grid')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Ask CoachHelm' })).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Questions to start with' })).getAllByRole('button').map((b) => b.textContent)).toEqual(["What's on this week?"]);
  });

  it('CH-13325 a pulse with no findings but rounds says nothing is flagged, not that nothing has been recorded', () => {
    show(ready({ pulse: { findings: [], coverage: 'All 8 players have a round in the last 30 days.', asOfLabel: null } }));
    expect(code('CH-13325')?.textContent).toMatch(/Nothing is flagged right now/);
    expect(code('CH-13322')).toBeNull();
  });

  it('CH-13223 a pulse that did not load is a notice with Try again, never "nothing to report"', async () => {
    show(ready({ pulse: null }));
    expect(code('CH-13223')?.textContent).toMatch(/What’s new didn’t load/);
    expect(code('CH-13322')).toBeNull();
    await userEvent.click(within(code('CH-13223') as HTMLElement).getByRole('button', { name: 'Try again' }));
    expect(router.refresh).toHaveBeenCalled();
  });
});

describe('the composer', () => {
  it('Enter sends on a fine pointer, with the press haptic, and the box empties; Shift+Enter is a new line', async () => {
    const { chat } = show();
    await userEvent.type(box(), 'How is the team putting?{Enter}');
    expect(chat.calls.send).toHaveBeenCalledWith('How is the team putting?');
    expect(hapticSpy).toHaveBeenCalledWith('press');
    expect(box().value).toBe('');
    await userEvent.type(box(), 'line one{Shift>}{Enter}{/Shift}line two');
    expect(box().value).toBe('line one\nline two');
    expect(chat.calls.send).toHaveBeenCalledTimes(1);
  });

  it('Enter that picks a character in an IME composition is left alone', () => {
    const { chat } = show();
    fireEvent.change(box(), { target: { value: 'にほん' } });
    fireEvent.keyDown(box(), { key: 'Enter', isComposing: true });
    expect(chat.calls.send).not.toHaveBeenCalled();
    expect(box().value).toBe('にほん');
  });

  it('without a fine pointer Enter is a new line and only Send sends', async () => {
    fine = false;
    const { chat } = show();
    await userEvent.type(box(), 'Hello{Enter}');
    expect(chat.calls.send).not.toHaveBeenCalled();
    expect(box().value).toBe('Hello\n');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(chat.calls.send).toHaveBeenCalledWith('Hello');
  });

  it('Send is off until there is text', async () => {
    show();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    await userEvent.type(box(), 'x');
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
  });

  it('the plus menu has the seven starters; a starter seeds the text and never sends', async () => {
    const { chat } = show();
    await userEvent.click(screen.getByRole('button', { name: 'Add to your question' }));
    const items = within(screen.getByRole('menu', { name: 'Add to your question' })).getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(['Add player', 'Compare players', 'Add date range', 'Create practice', 'Create focus area', 'Assign task', 'Draft team update']);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Create focus area' }));
    expect(box().value).toBe('Create a focus area for ');
    expect(chat.calls.send).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Add to your question' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Assign task' }));
    expect(box().value).toBe('Create a focus area for Assign a task to ');
    expect(chat.calls.send).not.toHaveBeenCalled();
  });

  it('CH-13821 typing @ opens the roster; the arrow keys and Enter pick, and the mention is text in the box', async () => {
    const { chat } = show();
    await userEvent.type(box(), 'Compare @jo');
    const list = screen.getByRole('listbox', { name: 'Players' });
    expect(within(list).getAllByRole('option').map((o) => o.textContent)).toEqual(['Jonah Okafor']);
    await userEvent.keyboard('{Enter}');
    expect(box().value).toBe('Compare @Jonah Okafor ');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(chat.calls.send).not.toHaveBeenCalled();
    await userEvent.type(box(), 'and @');
    expect(within(screen.getByRole('listbox', { name: 'Players' })).getAllByRole('option').map((o) => o.textContent)).not.toContain('Jonah Okafor');
    await userEvent.keyboard('{ArrowDown}{Enter}');
    // Jonah is already mentioned, so the list starts at Eli; one arrow down is Sofia.
    expect(box().value).toBe('Compare @Jonah Okafor and @Sofia Alvarez ');
  });

  it('Escape closes the roster popover without sending, and the Add player starter opens it with an @', async () => {
    const { chat } = show();
    await userEvent.click(screen.getByRole('button', { name: 'Add to your question' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Add player' }));
    expect(box().value).toBe('@');
    expect(screen.getByRole('listbox', { name: 'Players' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(box().value).toBe('@');
    expect(chat.calls.send).not.toHaveBeenCalled();
  });

  it('CH-13821 a roster with nobody says so instead of drawing an empty list', async () => {
    show(ready({ players: [] }));
    await userEvent.type(box(), '@');
    expect(screen.getByText('No active players')).toBeInTheDocument();
  });

  it('the date chip starts on Any dates; a chosen range adds its sentence to what is sent, visibly, once', async () => {
    const { chat } = show();
    const chip = screen.getByRole('button', { name: /Any dates/ });
    await userEvent.click(chip);
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Last 30 days' }));
    expect(screen.getByRole('button', { name: /Last 30 days/ })).toBeInTheDocument();
    await userEvent.type(box(), 'Who is trending up?{Enter}');
    expect(chat.calls.send).toHaveBeenCalledWith('Who is trending up? Use the last 30 days.');
    expect(screen.getByRole('button', { name: /Any dates/ })).toBeInTheDocument();
    await userEvent.type(box(), 'And now?{Enter}');
    expect(chat.calls.send).toHaveBeenLastCalledWith('And now?');
  });

  it('CH-13920 offline, Send is refused before anything is sent: the shell toast CH-1903, an error haptic, and the text stays', async () => {
    const { chat } = show();
    setOnline(false);
    await userEvent.type(box(), 'Brief me');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(chat.calls.send).not.toHaveBeenCalled();
    await waitFor(() => expect(code('CH-1903')).not.toBeNull());
    expect(code('CH-1903')!.textContent).toMatch(/Couldn't send: you're offline.*Reconnect, then try again\. Nothing was sent\./);
    expect(hapticSpy).toHaveBeenCalledWith('error');
    expect(hapticSpy).not.toHaveBeenCalledWith('press');
    expect(box().value).toBe('Brief me');
  });

  it('CH-13920 a pill tapped offline is refused the same way', async () => {
    const { chat } = show();
    setOnline(false);
    await userEvent.click(screen.getByRole('button', { name: 'Brief me on Finley University' }));
    expect(chat.calls.send).not.toHaveBeenCalled();
    await waitFor(() => expect(code('CH-1903')).not.toBeNull());
  });

  it('CH-13120 while an action card awaits Confirm or Cancel, Send is off and Enter sends nothing, and the box says why', async () => {
    const { chat } = show(ready({ thread: { id: 'c-putting', title: 'Putting inside 6 feet', messages: ASK_MSGS_ACTION } }), fakeChat());
    await userEvent.type(box(), 'What about Eli?{Enter}');
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(chat.calls.send).not.toHaveBeenCalled();
    expect(code('CH-13120')?.textContent).toBe('Confirm or cancel the action above first');
    expect(box()).toHaveAccessibleDescription('Confirm or cancel the action above first');
    expect(box().value).toBe('What about Eli?');
  });

  it('CH-13120 a pill or a follow-up sent over a waiting card is not sent either', async () => {
    const { chat } = show(ready({ thread: { id: 'c-putting', title: 'Putting inside 6 feet', messages: ASK_MSGS_ACTION } }), fakeChat());
    await userEvent.click(screen.getByRole('button', { name: 'stub follow-up' }));
    expect(chat.calls.send).not.toHaveBeenCalled();
  });

  it('CH-13421 while a reply streams Send is Stop, and Stop is silent', async () => {
    const { chat } = show(ready({ thread: { id: 'c', title: 't', messages: ASK_MSGS_ANSWER } }), fakeChat({ busy: true }));
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
    hapticSpy.mockClear();
    await userEvent.click(screen.getByRole('button', { name: 'Stop generating' }));
    expect(chat.calls.stop).toHaveBeenCalled();
    expect(hapticSpy).not.toHaveBeenCalled();
  });

  it('CH-13921 a send that failed puts its text back once, into an empty box, and never over what was typed since', async () => {
    const chat = fakeChat();
    const view = show(ready(), chat);
    await userEvent.type(box(), 'Who should play?{Enter}');
    expect(box().value).toBe('');
    view.rerenderWith(ready(), fakeChat({ error: new Error('Something went wrong') }));
    await waitFor(() => expect(box().value).toBe('Who should play?'));
    await userEvent.type(box(), ' Today.');
    view.rerenderWith(ready(), fakeChat({ error: new Error('Something went wrong') }));
    expect(box().value).toBe('Who should play? Today.');
    // Once it has come back, a box the coach emptied stays empty while the same failure is still showing.
    await userEvent.clear(box());
    view.rerenderWith(ready(), fakeChat({ error: new Error('Something went wrong') }));
    expect(box().value).toBe('');
  });

  it('CH-13921 a failure with something already typed leaves the new text alone', async () => {
    const view = show(ready(), fakeChat());
    await userEvent.type(box(), 'First{Enter}');
    await userEvent.type(box(), 'Second');
    view.rerenderWith(ready(), fakeChat({ error: new Error('x') }));
    expect(box().value).toBe('Second');
  });
});

describe('the composer on the phone', () => {
  beforeEach(() => {
    phoneState.on = true;
  });

  it('is one row (plus, text, mention, Send) docked at the foot, with no chips and no disclaimer', () => {
    show();
    expect(screen.getByRole('button', { name: 'Add to your question' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mention a player' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Players/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Any dates/ })).toBeNull();
    expect(document.querySelector('.ch-ask-foot')).toBeNull();
    expect(document.querySelector('.ch-ask-dock')).not.toBeNull();
  });

  it('CH-13821 the mention button opens a sheet of roster rows, a pick puts @Name in the text, and the filter narrows it', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Mention a player' }));
    const dialog = document.querySelector('dialog[open]') as HTMLElement;
    expect(within(dialog).getByRole('heading', { name: 'Mention a player' })).toBeInTheDocument();
    await userEvent.type(within(dialog).getByRole('searchbox', { name: 'Filter players' }), 'eli');
    expect(within(dialog).getAllByRole('button', { name: /Eli Brandt|Jonah Okafor/ }).map((b) => b.textContent)).toEqual(['Eli Brandt']);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Eli Brandt' }));
    expect(box().value).toBe('@Eli Brandt ');
    expect(document.querySelector('dialog[open]')).toBeNull();
  });
});

describe('the new chat page (phone)', () => {
  beforeEach(() => {
    phoneState.on = true;
  });

  it('draws the greeting and the shortcut cards (three at most), no pills and no findings, and keeps the tab bar', async () => {
    const { chat } = show();
    expect(screen.getByRole('heading', { name: 'What do you want to know about Finley University?' })).toBeInTheDocument();
    const cards = within(screen.getByRole('list', { name: 'Questions to start with' })).getAllByRole('button');
    expect(cards.map((c) => c.textContent)).toEqual(['Brief meon Finley University', 'Losing strokeswhere the team loses most', 'Trending upwho\'s improving this month']);
    expect(document.querySelector('.ch-ask-pills')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Since you were last here' })).toBeNull();
    expect(screen.getByTestId('probe')).toHaveAttribute('data-notabs', 'false');
    await userEvent.click(cards[0]!);
    expect(chat.calls.send).toHaveBeenCalledWith('Brief me on Finley University');
  });

  it('the one-row box invites a first question on a new chat, and asks for a follow-up inside a thread', () => {
    show();
    expect(screen.getByRole('textbox', { name: 'Ask CoachHelm' })).toHaveAttribute('placeholder', 'Ask about a player, a stat, or the week');
    cleanup();
    show(ready({ thread: { id: 'c', title: 't', messages: ASK_MSGS_ANSWER } }), fakeChat());
    expect(screen.getByRole('textbox', { name: 'Reply to CoachHelm' })).toHaveAttribute('placeholder', 'Ask a follow-up');
  });

  it('CH-13322 with no recorded round the greeting carries the nothing-to-report line, and the cards are only what the data supports', () => {
    show(ready(PREVIEW_ASK_NOROUNDS));
    expect(code('CH-13322')?.textContent).toBe('Nothing to report yetNo player has a recorded round yet. You can still ask about your roster and schedule.');
    expect(document.querySelector('.ch-ask-cards')).toBeNull();
  });

  it('puts History, the title and New chat in the phone top bar, and hides the tab bar while a thread is open', async () => {
    const { chat } = show(ready({ thread: { id: 'c-putting', title: 'Putting inside 6 feet', messages: ASK_MSGS_ANSWER } }), fakeChat());
    const top = within(screen.getByTestId('phone-top'));
    expect(top.getByRole('button', { name: 'Chats' })).toBeInTheDocument();
    expect(top.getByText('Putting inside 6 feet')).toBeInTheDocument();
    expect(screen.getByTestId('probe')).toHaveAttribute('data-notabs', 'true');
    await userEvent.click(top.getByRole('button', { name: 'New chat' }));
    expect(chat.calls.newConversation).toHaveBeenCalled();
  });
});

describe('History: the standing panel (desktop)', () => {
  it('groups the chats as Today, This week and Earlier in the team zone, each a link, and marks the open one', () => {
    show(ready({ thread: { id: 'c-putting', title: 'Putting inside 6 feet', messages: ASK_MSGS_ANSWER } }), fakeChat());
    const panel = within(screen.getByRole('complementary', { name: 'Chats' }));
    expect(panel.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Today', 'This week', 'Earlier']);
    const open = panel.getByRole('link', { name: 'Putting inside 6 feet' });
    expect(open).toHaveAttribute('href', '/golf/dashboard/coachhelm?view=ask&c=c-putting');
    expect(open).toHaveAttribute('aria-current', 'page');
    expect(code('CH-13823')).toBe(open);
    expect(panel.getByRole('link', { name: 'Weekly brief, Sept 29' })).not.toHaveAttribute('aria-current');
  });

  it('CH-13324 Search chats filters by title, and a search with no match says so', async () => {
    show();
    const panel = within(screen.getByRole('complementary', { name: 'Chats' }));
    await userEvent.type(panel.getByRole('searchbox', { name: 'Search chats' }), 'QUAL');
    expect(panel.getAllByRole('link').map((l) => l.textContent)).toEqual(['Qualifier lineup for Oct 6']);
    await userEvent.clear(panel.getByRole('searchbox', { name: 'Search chats' }));
    await userEvent.type(panel.getByRole('searchbox', { name: 'Search chats' }), 'zzz');
    expect(code('CH-13324')?.textContent).toBe('No chats match “zzz”.');
    expect(panel.queryAllByRole('link')).toHaveLength(0);
  });

  it('CH-13620 Hide chats folds the panel away (inert) and moves Show chats and New chat into the header; Show chats brings it back', async () => {
    show();
    const aside = () => document.querySelector('aside.ch-ask-hist') as HTMLElement;
    expect(aside().classList.contains('is-closed')).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Hide chats' }));
    expect(aside().classList.contains('is-closed')).toBe(true);
    expect(aside().hasAttribute('inert')).toBe(true);
    expect(document.querySelector('.ch-ask-body')!.classList.contains('has-panel')).toBe(false);
    const head = within(document.querySelector('.ch-ask-head') as HTMLElement);
    expect(head.getByRole('button', { name: 'New chat' })).toBeInTheDocument();
    await userEvent.click(head.getByRole('button', { name: 'Show chats' }));
    expect(aside().classList.contains('is-closed')).toBe(false);
    expect(document.querySelector('.ch-ask-head')!.querySelector('button')).toBeNull();
  });

  it('New chat starts a fresh thread at once (no server trip), clears the address and closes the evidence', async () => {
    const { chat } = show(ready({ thread: { id: 'c-putting', title: 'Putting inside 6 feet', messages: ASK_MSGS_ANSWER } }), fakeChat(), undefined);
    await userEvent.click(within(screen.getByRole('complementary', { name: 'Chats' })).getByRole('button', { name: 'New chat' }));
    expect(chat.calls.newConversation).toHaveBeenCalled();
    expect(replaceState).toHaveBeenCalledWith(window.history.state, '', '/golf/dashboard/coachhelm?view=ask');
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('New chat');
  });

  it('CH-13323 no chats yet is its own state with a New chat button, not a search box over nothing', async () => {
    const { chat } = show(ready({ conversations: { list: [], error: false } }));
    expect(code('CH-13323')?.textContent).toMatch(/No chats yetAsk your first question and it will be kept here\./);
    expect(screen.queryByRole('searchbox', { name: 'Search chats' })).toBeNull();
    await userEvent.click(within(code('CH-13323') as HTMLElement).getByRole('button', { name: 'New chat' }));
    expect(chat.calls.newConversation).toHaveBeenCalled();
  });

  it('CH-13222 a chat list that did not load is a notice with Try again, never "No chats yet"', async () => {
    show(ready({ conversations: { list: [], error: true } }));
    expect(code('CH-13222')?.textContent).toMatch(/Your chats didn’t load/);
    expect(code('CH-13323')).toBeNull();
    await userEvent.click(within(code('CH-13222') as HTMLElement).getByRole('button', { name: 'Try again' }));
    expect(router.refresh).toHaveBeenCalled();
  });
});

describe('History: the phone drawer', () => {
  beforeEach(() => {
    phoneState.on = true;
  });
  const drawer = () => document.querySelector('dialog.ch-ask-drawer') as HTMLDialogElement;

  it('CH-13822 the Chats button opens the drawer; Esc, the scrim and choosing a chat close it', async () => {
    show();
    expect(drawer().open).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Chats' }));
    expect(drawer().open).toBe(true);
    expect(within(drawer()).getByText('Chats', { selector: 'b' })).toBeInTheDocument();
    fireEvent(drawer(), new Event('cancel', { cancelable: true }));
    await waitFor(() => expect(drawer().open).toBe(false));

    await userEvent.click(screen.getByRole('button', { name: 'Chats' }));
    fireEvent.click(drawer());
    await waitFor(() => expect(drawer().open).toBe(false));

    await userEvent.click(screen.getByRole('button', { name: 'Chats' }));
    await userEvent.click(within(drawer()).getByRole('link', { name: 'Weekly brief, Sept 29' }));
    await waitFor(() => expect(drawer().open).toBe(false));
  });

  it('CH-13621 a drag to the left past 80px closes it; a nudge of a few pixels leaves it open', async () => {
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Chats' }));
    const aside = drawer().querySelector('aside') as HTMLElement;
    const drag = (dx: number) => {
      fireEvent.pointerDown(aside, { button: 0, clientX: 300 });
      fireEvent.pointerMove(window, { clientX: 300 + dx });
      fireEvent.pointerUp(window, { clientX: 300 + dx });
    };
    drag(-5);
    expect(drawer().open).toBe(true);
    drag(-120);
    await waitFor(() => expect(drawer().open).toBe(false));
  });

  it('New chat in the drawer starts a fresh thread and closes it', async () => {
    const { chat } = show();
    await userEvent.click(screen.getByRole('button', { name: 'Chats' }));
    await userEvent.click(within(drawer()).getByRole('button', { name: 'New chat' }));
    expect(chat.calls.newConversation).toHaveBeenCalled();
    await waitFor(() => expect(drawer().open).toBe(false));
  });

  it('CH-13323 the drawer with no chats says No chats yet, with New chat', async () => {
    show(ready({ conversations: { list: [], error: false } }));
    await userEvent.click(screen.getByRole('button', { name: 'Chats' }));
    expect(within(drawer()).getByText('No chats yet')).toBeInTheDocument();
    expect(within(drawer()).getByText('Ask your first question and it will be kept here.')).toBeInTheDocument();
  });
});

describe('the container', () => {
  it('CH-13922 a new thread lands in History at once, titled by the first question, and the address names it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(ASK_NOW));
    const { chat } = show();
    await userEvent.type(box(), 'Why are we missing so many short putts lately?{Enter}', { advanceTimers: () => {} });
    await act(async () => {
      chat.seen.options!.onConversationId?.('c-new');
      await Promise.resolve();
    });
    const link = within(screen.getByRole('complementary', { name: 'Chats' })).getByRole('link', { name: 'Why are we missing so many short putts lately?' });
    expect(link).toHaveAttribute('href', '/golf/dashboard/coachhelm?view=ask&c=c-new');
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(replaceState).toHaveBeenCalledWith(window.history.state, '', '/golf/dashboard/coachhelm?view=ask&c=c-new');
  });

  it('opens a saved thread on its messages, with the conversation id the hook continues', () => {
    const { chat } = show(ready({ thread: { id: 'c-putting', title: 'Putting inside 6 feet', messages: ASK_MSGS_ANSWER } }), fakeChat());
    expect(chat.seen.options).toMatchObject({ conversationId: 'c-putting', initialMessages: ASK_MSGS_ANSWER });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Putting inside 6 feet');
    expect(screen.getByTestId('thread')).toBeInTheDocument();
    expect(document.querySelector('.ch-ask-dock')).not.toBeNull();
    expect(screen.getByText('CoachHelm reads Finley University data only. Check the numbers before you act on them.')).toBeInTheDocument();
  });

  it('hands the thread the failed answer as a sentence with what to offer, by the rule of the stream route', () => {
    const cases: Array<[unknown, { message: string; recovery: string }]> = [
      [{ statusCode: 429, responseBody: JSON.stringify({ error: 'Too many requests. Please slow down.' }) }, { message: "You're asking quickly. Wait a moment, then try again.", recovery: 'retry' }],
      [{ statusCode: 429, responseBody: JSON.stringify({ error: 'You have reached today’s analysis limit for your program. It resets tomorrow.', reason: 'gated' }) }, { message: 'You have reached today’s analysis limit for your program. It resets tomorrow.', recovery: 'none' }],
      [{ statusCode: 404, responseBody: JSON.stringify({ error: 'Conversation not found' }) }, { message: "That conversation isn't available. Start a new chat.", recovery: 'new-chat' }],
      [new TypeError('Failed to fetch'), { message: 'Something went wrong while answering. Try again.', recovery: 'retry' }],
    ];
    for (const [error, want] of cases) {
      const { unmount } = show(ready({ thread: { id: 'c', title: 't', messages: ASK_MSGS_ANSWER } }), fakeChat({ error }));
      const props = JSON.parse(screen.getByTestId('thread-props').textContent!) as { error: unknown };
      expect(props.error).toEqual(want);
      unmount();
    }
    show(ready({ thread: { id: 'c', title: 't', messages: ASK_MSGS_ANSWER } }), fakeChat());
    expect(JSON.parse(screen.getByTestId('thread-props').textContent!)).toMatchObject({ error: null });
  });

  it('wires the thread\'s Try again to the hook\'s retry, New chat to a fresh thread, Confirm to approve, and a follow-up to send; offline and phone go through', async () => {
    setOnline(false);
    const { chat } = show(ready({ thread: { id: 'c', title: 't', messages: ASK_MSGS_ANSWER } }), fakeChat());
    expect(JSON.parse(screen.getByTestId('thread-props').textContent!)).toMatchObject({ offline: true, phone: false });
    setOnline(true);
    await userEvent.click(screen.getByRole('button', { name: 'stub retry' }));
    expect(chat.calls.retry).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'stub approve' }));
    expect(chat.calls.approve).toHaveBeenCalledWith('approval-1');
    await userEvent.click(screen.getByRole('button', { name: 'stub follow-up' }));
    expect(chat.calls.send).toHaveBeenCalledWith('A follow-up');
    await userEvent.click(screen.getByRole('button', { name: 'stub new chat' }));
    expect(chat.calls.newConversation).toHaveBeenCalled();
  });

  it('the evidence opens beside the thread on desktop, and in a sheet on the phone; either closes', async () => {
    show(ready({ thread: { id: 'c', title: 't', messages: ASK_MSGS_ANSWER } }), fakeChat());
    expect(screen.queryByTestId('evidence')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'stub evidence' }));
    expect(screen.getByRole('complementary', { name: 'Evidence' })).toContainElement(screen.getByTestId('evidence'));
    expect(screen.getByTestId('evidence')).toHaveAttribute('data-phone', 'false');
    expect(document.querySelector('.ch-ask-body')!.classList.contains('has-evidence')).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'stub close evidence' }));
    expect(screen.queryByTestId('evidence')).toBeNull();
    cleanup();
    phoneState.on = true;
    show(ready({ thread: { id: 'c', title: 't', messages: ASK_MSGS_ANSWER } }), fakeChat());
    await userEvent.click(screen.getByRole('button', { name: 'stub evidence' }));
    const sheet = document.querySelector('dialog[open]') as HTMLElement;
    expect(within(sheet).getByTestId('evidence')).toHaveAttribute('data-phone', 'true');
    expect(within(sheet).getByRole('region', { name: 'Evidence' })).toHaveAttribute('tabindex', '0');
    await userEvent.click(within(sheet).getByRole('button', { name: 'stub close evidence' }));
    expect(document.querySelector('dialog[open]')).toBeNull();
  });
});

describe('CH-13225 a section that crashes leaves the rest of the page usable', () => {
  it('a crash in the thread is a notice with Try again, and History and the message box still work', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    crash.on = true;
    show(ready({ thread: { id: 'c-putting', title: 'Putting inside 6 feet', messages: ASK_MSGS_ANSWER } }), fakeChat());
    const notice = code('CH-13225') as HTMLElement;
    expect(notice.textContent).toMatch(/The conversation couldn’t be shown\..*The rest of the page is fine\. This has been reported automatically\./);
    expect(within(screen.getByRole('complementary', { name: 'Chats' })).getAllByRole('link').length).toBeGreaterThan(0);
    expect(screen.getByRole('textbox', { name: 'Reply to CoachHelm' })).toBeInTheDocument();
    crash.on = false;
    await userEvent.click(within(notice).getByRole('button', { name: 'Try again' }));
    expect(screen.getByTestId('thread')).toBeInTheDocument();
    spy.mockRestore();
  });
});

describe('the states that stand in for the thread', () => {
  it('CH-13321 an empty roster is the first-run page with Open roster, the sub-tab strip, and no composer', () => {
    show({ status: 'noRoster', teamName: 'Finley University' });
    expect(code('CH-13321')?.textContent).toMatch(/Add players to ask CoachHelm.*CoachHelm answers from your players’ rounds, stats and schedule\. Once your roster is in, ask about anyone on it\./);
    expect(screen.getByRole('link', { name: 'Open roster' })).toHaveAttribute('href', '/golf/dashboard/roster');
    expect(screen.getByRole('radiogroup', { name: 'CoachHelm view' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('CH-13221 a program that did not load is a notice with Try again and no composer, and Try again refreshes the page', async () => {
    show({ status: 'failed' });
    expect(code('CH-13221')?.textContent).toMatch(/Ask CoachHelm couldn’t load your program/);
    expect(screen.queryByRole('textbox')).toBeNull();
    await userEvent.click(within(code('CH-13221') as HTMLElement).getByRole('button', { name: 'Try again' }));
    expect(router.refresh).toHaveBeenCalled();
  });

  it('CH-13320 a conversation that will not open is an alert with Start a new chat, and the composer still works', async () => {
    const { chat } = show(ready({ notFound: true }));
    const alert = code('CH-13320') as HTMLElement;
    expect(alert).toHaveAttribute('role', 'alert');
    expect(alert.textContent).toMatch(/That conversation isn’t availableIt may have been deleted, or it belongs to another coach\. Your other chats are on the left\.Start a new chat/);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Chat not found');
    expect(chat.seen.options).toMatchObject({ conversationId: null });
    expect(screen.getByRole('textbox', { name: 'Reply to CoachHelm' })).toBeInTheDocument();
    await userEvent.click(within(alert).getByRole('button', { name: 'Start a new chat' }));
    expect(chat.calls.newConversation).toHaveBeenCalled();
    expect(code('CH-13320')).toBeNull();
  });

  it('CH-13320 on the phone the alert points at History instead of "on the left"', () => {
    phoneState.on = true;
    show(ready({ notFound: true }));
    expect(code('CH-13320')!.textContent).toMatch(/Your other chats are under History\./);
  });

  it('CH-13224 a conversation whose messages did not read is a notice with Try again, and no composer to write into it', async () => {
    show(ready({ threadFailed: true }));
    expect(code('CH-13224')?.textContent).toMatch(/That conversation didn’t load/);
    expect(screen.queryByRole('textbox')).toBeNull();
    await userEvent.click(within(code('CH-13224') as HTMLElement).getByRole('button', { name: 'Try again' }));
    expect(router.refresh).toHaveBeenCalled();
  });

  it('CH-13420 the skeleton is aria-busy and draws the sub-tab strip, the chats and the greeting in place, with no script', () => {
    render(<AskSkeleton />);
    const sk = code('CH-13420') as HTMLElement;
    expect(sk).toHaveAttribute('aria-busy', 'true');
    expect(sk).toHaveAttribute('aria-label', 'Loading Ask CoachHelm');
    expect(sk.querySelectorAll('.ch-skel').length).toBeGreaterThan(8);
  });

  it('CH-13820 the page is one landmark labelled Ask CoachHelm, with the chats as a complementary region', () => {
    show();
    expect(screen.getByRole('main', { name: 'Ask CoachHelm' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Chats' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Conversation' })).toBeInTheDocument();
  });
});
