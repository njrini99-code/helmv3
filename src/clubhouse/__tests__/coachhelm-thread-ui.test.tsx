import type { UIMessage } from 'ai';
import { LazyMotion, domAnimation } from 'motion/react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './dialog-polyfill';

/** Ask CoachHelm (P013): the conversation, found by the catalog numbers 13250 to 13953. */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));

import {
  ASK_ERRORS,
  ASK_FOCUS_JONAH,
  ASK_MSGS_ACTION,
  ASK_MSGS_ANSWER,
  ASK_MSGS_CONFIRMED,
  ASK_MSGS_LONG,
  ASK_MSGS_PARTIAL,
  ASK_MSGS_READFAIL,
  ASK_MSGS_REJECTED,
  ASK_MSGS_RECEIPT,
  ASK_MSGS_RECEIPT_FAILED,
  ASK_MSGS_THINKING,
  ASK_MSGS_WORKING,
  ASK_PLAYERS,
} from '../preview/fixtures-ask-thread';
import { AskThread, type AskThreadProps } from '../screens/coachhelm/chat/Thread';
import { AskEvidencePanel } from '../screens/coachhelm/chat/EvidencePanel';
import { ToastProvider } from '../ui/Toast';

const wrap = (node: React.ReactNode) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <div className="ch-root" data-ui="clubhouse">
        {node}
      </div>
    </ToastProvider>
  </LazyMotion>
);
const props = (over: Partial<AskThreadProps> = {}): AskThreadProps => ({
  messages: ASK_MSGS_ANSWER,
  busy: false,
  error: null,
  offline: false,
  phone: false,
  players: ASK_PLAYERS,
  onApprove: vi.fn(),
  onDeny: vi.fn(),
  onSend: vi.fn(),
  onStop: vi.fn(),
  onRetry: vi.fn(),
  onNewChat: vi.fn(),
  evidenceFocus: null,
  onOpenEvidence: vi.fn(),
  ...over,
});
function show(over: Partial<AskThreadProps> = {}) {
  const p = props(over);
  const view = render(wrap(<AskThread {...p} />));
  return { p, ...view, update: (next: Partial<AskThreadProps>) => view.rerender(wrap(<AskThread {...{ ...p, ...next }} />)) };
}
const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
const msg = (id: string, role: 'user' | 'assistant', parts: unknown[]) => ({ id, role, parts }) as unknown as UIMessage;

beforeEach(() => {
  hapticSpy.mockClear();
});
afterEach(() => {
  cleanup();
});

describe('CH-13850 what CoachHelm is doing', () => {
  it('the turn that waits is the turn that answers: one element from the send to the answer, so nothing blinks', () => {
    const { update } = show({ messages: [], busy: false });
    update({ messages: ASK_MSGS_WORKING.slice(0, 1), busy: true });
    const waiting = document.querySelector('.ch-ak-page.is-last .ch-ak-turn');
    expect(waiting).not.toBeNull();
    update({ messages: ASK_MSGS_WORKING, busy: true });
    const answer = screen.getByRole('article', { name: 'CoachHelm answer' });
    // The server opening the turn does not remount it: the island that waited is the island that works.
    expect(answer.closest('.ch-ak-turn')).toBe(waiting);
    expect(answer.querySelector('.ch-ak-isl.is-live')).not.toBeNull();
    // Nothing stands beside an answer: no mark, no name (owner, 11 Nov).
    expect(answer.querySelector('.ch-th-mark, .who, .nm')).toBeNull();
    expect(document.querySelector('.ch-th-user')?.classList.contains('is-new')).toBe(true);
  });
  it('a restored turn says how long the server worked on it, and with the island its line opens the steps instead of a list', () => {
    const restored = [
      msg('u1', 'user', [{ type: 'text', text: 'How is Jonah doing?' }]),
      msg('a1', 'assistant', [
        { type: 'data-progress', id: 'r1', data: { label: 'Reading Jonah’s strokes gained', tool: 'get_player_metrics', state: 'done', done: 'Reading Jonah’s strokes gained' } },
        { type: 'data-progress', id: 'r2', data: { label: 'Reading his last 7 rounds', tool: 'get_player_trend', state: 'done', done: 'Reading his last 7 rounds' } },
        { type: 'text', text: 'Jonah is trending the right way.' },
        { type: 'data-turn-meta', id: 'turn-meta', data: { started_at: '2026-11-10T15:00:00.000Z', duration_ms: 6200, reads: 2 } },
      ]),
    ];
    const openFor = vi.fn();
    show({ messages: restored, island: { turnId: null, open: false, pinned: false, openFor } });
    const line = document.querySelector<HTMLButtonElement>('.ch-ak-wl.is-sum');
    expect(line?.textContent).toContain('2 steps · 6s');
    expect(line?.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(line!);
    expect(openFor).toHaveBeenCalledWith('a1');
    // The steps are the island's to show: no list hangs under the name.
    expect(document.querySelector('.ch-ak-reads')).toBeNull();
    cleanup();
    // While the island is on screen for the turn, the line is silent: one place speaks at a time.
    show({ messages: restored, island: { turnId: 'a1', open: false, pinned: false, openFor } });
    expect(document.querySelector('.ch-ak-wl.is-sum')).toBeNull();
  });

  it('the island sits in the flow under the question: the steps while it works, one line once the answer begins, the steps again on a tap', () => {
    const working = (parts: unknown[]) => [msg('u1', 'user', [{ type: 'text', text: 'How is Jonah doing?' }]), msg('a1', 'assistant', parts)];
    const r1 = { type: 'data-progress', id: 'r1', data: { label: 'Reading Jonah’s strokes gained', tool: 'get_player_metrics', state: 'done', done: 'Reading Jonah’s strokes gained' } };
    const r2 = { type: 'data-progress', id: 'r2', data: { label: 'Reading his last 7 rounds', tool: 'get_player_trend' } };
    const { update } = show({ messages: working([r1, r2]), busy: true });
    const island = () => document.querySelector('.ch-ak-page.is-last .ch-ak-isl')!;
    // It comes after the question, inside the turn, and is open while nothing is under it.
    expect(document.querySelector('.ch-th-user')!.compareDocumentPosition(island()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(island().classList.contains('is-open')).toBe(true);
    expect([...island().querySelectorAll('.st')].map((li) => li.className.match(/is-(done|active|waiting)/)?.[1])).toEqual(['done', 'active']);
    expect(island().querySelector('.ch-th-mark, [class*="sparkle"]')).toBeNull();
    // The first words of the answer: it folds to one line, and the words are under it.
    update({ messages: working([r1, { ...r2, data: { ...r2.data, state: 'done' } }, { type: 'text', text: 'Jonah is trending the right way.' }]), busy: true });
    expect(island().classList.contains('is-open')).toBe(false);
    expect(island().querySelector('.steps')).toBeNull();
    expect(island().nextElementSibling?.matches('.ch-ak-say, .ch-ak-leaf')).toBe(true);
    // The work is over: the line says what it came to, and a tap opens the steps again.
    update({ messages: working([r1, { ...r2, data: { ...r2.data, state: 'done' } }, { type: 'text', text: 'Jonah is trending the right way.' }]), busy: false });
    const key = within(island() as HTMLElement).getByRole('button');
    expect(key.getAttribute('aria-expanded')).toBe('false');
    expect(key.textContent).toMatch(/2 steps/);
    fireEvent.click(key);
    expect(key.getAttribute('aria-expanded')).toBe('true');
    expect(island().querySelectorAll('.st.is-done')).toHaveLength(2);
  });

  it('the phone has no Stop here: the composer owns it', () => {
    show({ messages: ASK_MSGS_WORKING, busy: true, phone: true });
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
  });
  it('before the server answers there are no words, only the island’s ring; its line speaks at 1.2 s and says only what is known', () => {
    vi.useFakeTimers();
    try {
      show({ messages: ASK_MSGS_THINKING, busy: true });
      // The turn arrives after its question (150 ms), with the ring turning and nothing said.
      expect(screen.queryByRole('article', { name: 'CoachHelm answer' })).toBeNull();
      act(() => { vi.advanceTimersByTime(200); });
      const turn = screen.getByRole('article', { name: 'CoachHelm answer' });
      expect(turn.querySelector('.ch-ak-isl.is-live .mk.is-active')).not.toBeNull();
      expect(turn.querySelector('.ch-ak-isl .hd')?.textContent).toBe('');
      // Nothing has come back from the server: it is still being sent, and that is all that is claimed.
      act(() => { vi.advanceTimersByTime(1100); });
      expect(turn.querySelector('.ch-ak-isl .hd')?.textContent).toBe('Sending');
      act(() => { vi.advanceTimersByTime(5000); });
      expect(turn.querySelector('.ch-ak-isl .hd')?.textContent).toBe('Still sending. Check your connection.');
      expect(document.body.textContent).not.toMatch(/get_[a-z_]+/);
    } finally {
      vi.useRealTimers();
    }
  });
});

// Owner, 11 Nov: the "Table" key is gone from what an answer shows. A block that is rows is its own table; a chart keeps its
// figures as a table for a screen reader (chat/__tests__/evidence-direction.test.tsx).
describe('CH-13852 the figures without a Table key', () => {
  it('has no key to swap a figure for a table: the rows are the figures, toned by what the read says is the weak side', () => {
    show();
    expect(screen.queryByRole('button', { name: /View as table/ })).toBeNull();
    const rows = within(screen.getByRole('list', { name: 'Make rate from 4 to 6 feet, by slope' })).getAllByRole('listitem');
    expect(rows.map((r) => [r.querySelector('.ch-aks-dist__band')?.textContent, r.querySelector('.ch-aks-dist__val')?.textContent, r.querySelector('.ch-aks-dist__val')?.getAttribute('data-tone')])).toEqual([
      ['Uphill', '76%', 'gain'],
      ['Level', '81%', 'gain'],
      ['Downhill', '58%', 'loss'],
    ]);
    // No bar on a track: the figure is type.
    expect(document.querySelector('.ch-ak-leaf [class*="track"]')).toBeNull();
    expect(screen.queryByRole('table', { name: /by slope/ })).toBeNull();
  });
  it('the rows carry the sample beside each and the source line under them', () => {
    show();
    const figure = screen.getByRole('list', { name: 'Make rate from 4 to 6 feet, by slope' });
    expect(within(figure).getAllByRole('listitem').map((i) => i.textContent)).toEqual(['Uphill76% of 51', 'Level81% of 44', 'Downhill58% of 31']);
    expect(screen.getByText('126 attempts · Sep 1 to Sep 29 · computed Sep 29')).toBeTruthy();
  });
  it('a ranking names each player with the value and the sample', () => {
    show();
    const rank = screen.getByRole('list', { name: 'Missed downhill putts from 4 to 6 feet' });
    expect(within(rank).getAllByRole('listitem').map((i) => i.textContent?.replace(/^\d/, ''))).toEqual(['Jonah Okaforof 96', 'Eli Brandtof 84', 'Sofia Alvarezof 72']);
  });
});

describe('CH-13250 a read tool failed, CH-13350 nothing recorded', () => {
  it('a failed read says it could not read this, never "no data"', () => {
    show({ messages: ASK_MSGS_READFAIL });
    expect(code('CH-13250')?.textContent).toBe('Could not read this: The rounds query failed.');
    expect(document.body.textContent).not.toMatch(/Nothing recorded/);
  });
  it('a partial read keeps its note on the figure', () => {
    show({ messages: ASK_MSGS_PARTIAL });
    expect(screen.getByText('6 of 8 players have a round in the last 30 days. The other 2 are left out.')).toBeTruthy();
  });
});

describe('CH-13251 a failed answer', () => {
  const coachAsked = [msg('u1', 'user', [{ type: 'text', text: 'Who should play?' }])];
  it('a rate limit reads as a sentence with Try again, and no raw JSON', async () => {
    const { p } = show({ messages: coachAsked, error: ASK_ERRORS.rate });
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText("Too many questions in a row. Give it a few seconds and try again.")).toBeTruthy();
    expect(alert.textContent).not.toMatch(/\{"error"/);
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(p.onRetry).toHaveBeenCalledTimes(1);
  });
  it('a daily limit keeps the server sentence and offers nothing to press', () => {
    show({ messages: coachAsked, error: ASK_ERRORS.budget });
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('You have reached today’s analysis limit for your program. It resets tomorrow.');
    expect(within(alert).queryByRole('button')).toBeNull();
  });
  it('a lost conversation offers a new chat, not a retry that would 404 again', async () => {
    const { p } = show({ messages: coachAsked, error: ASK_ERRORS.gone });
    const alert = screen.getByRole('alert');
    expect(within(alert).queryByRole('button', { name: 'Try again' })).toBeNull();
    await userEvent.click(within(alert).getByRole('button', { name: 'Start a new chat' }));
    expect(p.onNewChat).toHaveBeenCalledTimes(1);
  });
  it("a stream fault keeps the provider's own sentence", () => {
    show({ messages: coachAsked, error: ASK_ERRORS.fault });
    expect(screen.getByRole('alert').textContent).toContain('AI features are unavailable: the Anthropic account is out of credit.');
  });
  it('fires the error haptic once when it appears', () => {
    show({ messages: coachAsked, error: ASK_ERRORS.rate });
    expect(hapticSpy.mock.calls.filter((c) => c[0] === 'error')).toHaveLength(1);
  });
  it('CH-1905 offline: Try again is held and the line says why', () => {
    show({ messages: coachAsked, error: ASK_ERRORS.rate, offline: true });
    const alert = screen.getByRole('alert');
    expect(code('CH-1905')?.textContent).toBe('You’re offline. Reconnect, then try again.');
    expect((within(alert).getByRole('button', { name: 'Try again' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('says "Nothing was changed." only when it is true of the turn', () => {
    const a = show({ messages: coachAsked, error: ASK_ERRORS.generic });
    expect(screen.getByText('Nothing was changed.')).toBeTruthy();
    a.unmount();
    // The last turn holds a receipt: a write happened.
    show({ messages: ASK_MSGS_RECEIPT_FAILED, error: ASK_ERRORS.generic });
    expect(screen.queryByText('Nothing was changed.')).toBeNull();
  });
  it('a confirmed action with no receipt yet says to check before asking again', () => {
    show({ messages: ASK_MSGS_CONFIRMED, error: ASK_ERRORS.generic });
    expect(screen.queryByText('Nothing was changed.')).toBeNull();
    expect(screen.getByText('You confirmed an action in this answer. Check whether it was created before you ask again.')).toBeTruthy();
  });
});

describe('Copy, follow-ups and the coach\'s line', () => {
  it('CH-13752 a follow-up sends its text with a selection tick, on the last answer only, and not while it works', async () => {
    const { p, update } = show({ messages: ASK_MSGS_LONG });
    // The long thread ends on an answer with no evidence: none offered.
    expect(screen.queryByRole('list', { name: 'Next steps' })).toBeNull();
    update({ messages: ASK_MSGS_ANSWER });
    const pills = within(screen.getByRole('list', { name: 'Next steps' })).getAllByRole('button');
    expect(pills.map((b) => b.textContent)).toEqual(['Create a focus area for Jonah Okafor on putting', 'Build a putting practice for Jonah Okafor']);
    await userEvent.click(pills[0]!);
    expect(p.onSend).toHaveBeenCalledWith('Create a focus area for Jonah Okafor on putting');
    expect(hapticSpy).toHaveBeenCalledWith('select');
    update({ messages: ASK_MSGS_ANSWER, busy: true });
    expect(screen.queryByRole('list', { name: 'Next steps' })).toBeNull();
  });
  it('the follow-ups wait while an action card waits for its answer', () => {
    show({ messages: ASK_MSGS_ACTION });
    expect(screen.queryByRole('list', { name: 'Next steps' })).toBeNull();
  });
  it('and while an approval is pending even when its card did not arrive: a new question would abandon it', () => {
    const evidenceOnly = ASK_MSGS_ANSWER[1] as unknown as { parts: unknown[] };
    const m = msg('a1', 'assistant', [...evidenceOnly.parts, { type: 'tool-create_task', toolCallId: 'c', state: 'approval-requested', approval: { id: 'ap' } }]);
    show({ messages: [ASK_MSGS_ANSWER[0]!, m] });
    expect(screen.queryByRole('list', { name: 'Next steps' })).toBeNull();
  });
  it('an @mention in the coach\'s line is drawn as a mention; a roster name in an answer is a link to their stats', () => {
    show({ messages: ASK_MSGS_ACTION });
    expect(document.querySelector('.ch-th-at')?.textContent).toBe('@Jonah Okafor');
    const link = screen.getAllByRole('link', { name: 'Jonah Okafor' })[0] as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/golf/dashboard/stats?player=p-jonah');
  });
});

describe('CH-13951 the action card', () => {
  it('the quiet key ("Not now") answers the same approval as denied', async () => {
    const { p } = show({ messages: ASK_MSGS_ACTION });
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(p.onDeny).toHaveBeenCalledWith('approval-1');
    expect(p.onApprove).not.toHaveBeenCalled();
  });
});

describe('the receipt', () => {
  it('CH-13750 a receipt that arrives while the thread is open: one success haptic, or an error haptic and a toast. A reloaded thread announces nothing.', async () => {
    const live = show({ messages: ASK_MSGS_CONFIRMED });
    hapticSpy.mockClear();
    live.update({ messages: ASK_MSGS_RECEIPT });
    expect(hapticSpy.mock.calls.filter((c) => c[0] === 'success')).toHaveLength(1);
    live.update({ messages: ASK_MSGS_RECEIPT });
    expect(hapticSpy.mock.calls.filter((c) => c[0] === 'success')).toHaveLength(1);
    live.unmount();

    hapticSpy.mockClear();
    const failing = show({ messages: ASK_MSGS_CONFIRMED });
    failing.update({ messages: ASK_MSGS_RECEIPT_FAILED });
    expect(hapticSpy.mock.calls.filter((c) => c[0] === 'error')).toHaveLength(1);
    expect(await screen.findByText('Create focus area, not completed', { selector: '[data-ch-code="CH-13050"] *' })).toBeTruthy();
    failing.unmount();

    hapticSpy.mockClear();
    const reloaded = show({ messages: ASK_MSGS_RECEIPT_FAILED });
    expect(hapticSpy).not.toHaveBeenCalled();
    expect(code('CH-13050')).toBeNull();
    // Still nothing when the thread updates around the receipts it opened with.
    reloaded.update({ messages: [...ASK_MSGS_RECEIPT_FAILED] });
    expect(hapticSpy).not.toHaveBeenCalled();
    expect(code('CH-13050')).toBeNull();
  });
});

describe('the evidence panel', () => {
  const panel = (over: Partial<Parameters<typeof AskEvidencePanel>[0]> = {}) => {
    const onClose = vi.fn();
    const view = render(wrap(<AskEvidencePanel focus={ASK_FOCUS_JONAH} messages={ASK_MSGS_ACTION} phone={false} onClose={onClose} {...over} />));
    return { onClose, ...view };
  };
  it('is a complementary landmark named Evidence, with the tiles, the team figure, the rounds and the small-sample line', () => {
    panel();
    const aside = screen.getByRole('complementary', { name: 'Evidence' });
    expect(within(aside).getByText('Jonah Okafor, downhill putts, 4 to 6 feet')).toBeTruthy();
    // The figures are ruled rows drawn by the studio (the figure, its name, its sample), not tiles.
    const figures = Array.from(aside.querySelectorAll('.ch-aks-fig__cell')).map((t) => [t.querySelector('.ch-aks-fig__label')?.textContent, t.querySelector('.ch-aks-fig__value')?.textContent, t.querySelector('.ch-aks-fig__sub')?.textContent]);
    expect(figures).toEqual([
      ['Downhill, 4 to 6 feet', '33%', '3 of 9'],
      ['Team, Downhill, 4 to 6 feet', '58%', '18 of 31'],
      ['Level, 4 to 6 feet', '78%', '7 of 9'],
    ]);
    expect(aside.querySelector('.ch-th-tile')).toBeNull();
    expect(within(aside).getByRole('img', { name: /Make rate by round for Jonah Okafor: 50% to 0% across 5 rounds/ })).toBeTruthy();
    expect(within(aside).getByText('Team 58%')).toBeTruthy();
    expect(within(aside).getByText('Small sample: 9 attempts. Treat it as a direction, not a verdict.')).toBeTruthy();
    // Two tables: the trend's rounds, kept for a screen reader, and the rounds the panel lists.
    const tables = within(aside).getAllByRole('table');
    expect(tables).toHaveLength(2);
    expect(tables[0]!.className).toBe('ch-sr-only');
  });
  it('focus moves to the panel when it opens and back to the control that opened it when it closes; Esc and the close button close it', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const { onClose, unmount } = panel();
    const aside = screen.getByRole('complementary', { name: 'Evidence' });
    expect(document.activeElement).toBe(aside);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Close evidence' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
  it('CH-13255 says so when the conversation has nothing for that player', () => {
    panel({ focus: { ...ASK_FOCUS_JONAH, playerId: 'p-ava', label: 'Ava Lindqvist' } });
    expect(code('CH-13255')?.textContent).toMatch(/Nothing in this conversation speaks to this player yet/);
  });
  it('on a phone it is a sheet, with the same figures', async () => {
    const { onClose } = panel({ phone: true });
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Evidence' })).toBeTruthy();
    expect(within(dialog).getByText('Small sample: 9 attempts. Treat it as a direction, not a verdict.')).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('Rule P: the question takes the top of the page, and the thread never scrolls itself', () => {
  /** A scroller with a size: jsdom lays nothing out, so the page's geometry is given. */
  function inScroller(over: Partial<AskThreadProps> = {}) {
    const p = props(over);
    const tree = (q: AskThreadProps) => wrap(
      <section className="ch-ask-main">
        <div data-testid="sp" style={{ overflowY: 'auto' }}>
          <AskThread {...q} />
        </div>
      </section>,
    );
    const view = render(tree(p));
    const sp = screen.getByTestId('sp');
    const sets: number[] = [];
    let top = 0;
    Object.defineProperty(sp, 'scrollTop', { configurable: true, get: () => top, set: (v: number) => { top = v; sets.push(v); } });
    Object.defineProperty(sp, 'clientHeight', { configurable: true, value: 600 });
    const height = (h: number) => Object.defineProperty(sp, 'scrollHeight', { configurable: true, value: h });
    height(600);
    return { sp, sets, height, at: (v: number) => { top = v; }, update: (next: Partial<AskThreadProps>) => view.rerender(tree({ ...p, ...next })) };
  }
  const u1 = msg('u1', 'user', [{ type: 'text', text: 'first' }]);
  const a1 = (text: string) => msg('a1', 'assistant', [{ type: 'text', text }]);
  const u2 = msg('u2', 'user', [{ type: 'text', text: 'second' }]);

  it('a page is a question and what answers it; only the last one is held a screen tall', () => {
    inScroller({ messages: [u1, a1('one'), u2, msg('a2', 'assistant', [{ type: 'text', text: 'two' }])] });
    const pages = document.querySelectorAll('.ch-ak-page');
    expect(pages).toHaveLength(2);
    expect(pages[0]!.classList.contains('is-last')).toBe(false);
    expect(pages[1]!.classList.contains('is-last')).toBe(true);
    expect(pages[1]!.querySelector('.ch-th-user')?.textContent).toBe('second');
  });

  it('a sent question sets the thread\'s position once, at once, and never by scrollIntoView (which would move the page too)', () => {
    const into = vi.fn();
    Element.prototype.scrollIntoView = into;
    const t = inScroller({ messages: [u1, a1('one')] });
    t.sets.length = 0;
    t.update({ messages: [u1, a1('one'), u2], busy: true });
    expect(t.sets).toHaveLength(1);
    expect(into).not.toHaveBeenCalled();
  });

  it('does not follow a streaming answer by itself; follows once the coach has scrolled to the live edge', () => {
    vi.useFakeTimers();
    try {
      const t = inScroller({ messages: [u1, a1('one')] });
      t.update({ messages: [u1, a1('one'), u2], busy: true });
      t.sets.length = 0;
      // The answer grows past the fold: the thread stays where it is.
      t.height(1400);
      for (const text of ['two', 'two three', 'two three four']) t.update({ messages: [u1, a1('one'), u2, msg('a2', 'assistant', [{ type: 'text', text }])], busy: true });
      act(() => { vi.advanceTimersByTime(600); });
      expect(t.sets).toHaveLength(0);
      // The coach scrolls to the end themselves: from here the newest line is followed.
      t.at(800);
      act(() => { t.sp.dispatchEvent(new Event('scroll')); });
      t.sets.length = 0;
      t.height(1600);
      t.update({ messages: [u1, a1('one'), u2, msg('a2', 'assistant', [{ type: 'text', text: 'two three four five' }])], busy: true });
      act(() => { vi.advanceTimersByTime(50); });
      expect(t.sets).toEqual([1600]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('the Latest key says there is more below while the answer is still being written, and takes the coach there', () => {
    vi.useFakeTimers();
    try {
      const t = inScroller({ messages: [u1, a1('one')] });
      t.update({ messages: [u1, a1('one'), u2], busy: true });
      t.height(1400);
      t.update({ messages: [u1, a1('one'), u2, msg('a2', 'assistant', [{ type: 'text', text: 'two' }])], busy: true });
      act(() => { vi.advanceTimersByTime(50); });
      const key = screen.getByRole('button', { name: 'More below. Jump to the latest' });
      expect(key.querySelector('.ch-ak-live')).not.toBeNull();
      const scrollTo = vi.fn();
      t.sp.scrollTo = scrollTo;
      fireEvent.click(key);
      expect(scrollTo).toHaveBeenCalledWith({ top: 1400, behavior: 'smooth' });
      expect(hapticSpy).toHaveBeenCalledWith('select');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('a thread as it opens', () => {
  it('an opened thread does not fade in turn by turn; a turn added after does', () => {
    const { update } = show({ messages: ASK_MSGS_LONG });
    expect(document.querySelectorAll('.ch-th-turn.is-new')).toHaveLength(0);
    update({ messages: [...ASK_MSGS_LONG, msg('u9', 'user', [{ type: 'text', text: 'and one more' }])] });
    expect(document.querySelectorAll('.ch-th-turn.is-new')).toHaveLength(1);
  });
  it('a long thread is one named conversation; every answer is an article that speaks in sentences, not words', () => {
    show({ messages: ASK_MSGS_LONG });
    // Not a log: a log is a live region, and a streaming answer in one is read out a word at a time. Each answer has its own polite region.
    expect(screen.getByRole('group', { name: 'Conversation' })).toBeTruthy();
    expect(screen.queryByRole('log')).toBeNull();
    expect(document.querySelectorAll('article[aria-label="CoachHelm answer"] > [aria-live="polite"][aria-atomic="true"]')).toHaveLength(5);
    expect(screen.getAllByRole('article', { name: 'CoachHelm answer' })).toHaveLength(5);
  });
});

/** The Ask v2 answer card is the only card: its Confirm and Cancel answer the approval by its id (the old action card is retired with coachhelm_ask_v2). */
describe('CH-13252 a rejected answer', () => {
  it('shows its one note on the answer card', () => {
    show({ messages: ASK_MSGS_REJECTED });
    expect(code('CH-13252')).not.toBeNull();
  });
});

describe('CH-13951 the confirm card inside the thread', () => {
  it('Confirm answers the approval by its id, once, and the quiet key ("Not now") answers it as denied', async () => {
    const { p } = show({ messages: ASK_MSGS_ACTION });
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(p.onDeny).toHaveBeenCalledWith('approval-1');
    expect(p.onApprove).not.toHaveBeenCalled();
  });
});
