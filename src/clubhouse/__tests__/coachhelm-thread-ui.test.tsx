import type { UIMessage } from 'ai';
import { LazyMotion, domAnimation } from 'framer-motion';
import { act, cleanup, render, screen, within } from '@testing-library/react';
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
  ASK_MSGS_ABANDONED,
  ASK_MSGS_ACTION,
  ASK_MSGS_ANSWER,
  ASK_MSGS_CANCELLED,
  ASK_MSGS_CONFIRMED,
  ASK_MSGS_LONG,
  ASK_MSGS_PARTIAL,
  ASK_MSGS_READFAIL,
  ASK_MSGS_RECEIPT,
  ASK_MSGS_RECEIPT_FAILED,
  ASK_MSGS_REJECTED,
  ASK_MSGS_THINKING,
  ASK_MSGS_WORKING,
  ASK_PLAYERS,
  ASK_PROPOSAL,
  ASK_RECEIPT_PARTIAL,
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
  it('while it works, the steps are one polite live region, the newest is the current step, and Stop is offered on desktop', async () => {
    const { p } = show({ messages: ASK_MSGS_WORKING, busy: true });
    const list = screen.getByRole('list', { name: 'What CoachHelm is doing' });
    expect(list.getAttribute('aria-live')).toBe('polite');
    const items = within(list).getAllByRole('listitem');
    expect(items.map((i) => i.textContent)).toEqual(['Reading your roster', 'Reading the last 38 recorded rounds', 'Comparing putting by distance']);
    expect(items.map((i) => i.getAttribute('aria-current'))).toEqual([null, null, 'step']);
    expect(screen.getByText(/^Working/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(p.onStop).toHaveBeenCalledTimes(1);
  });
  it('the phone has no Stop here: the composer owns it', () => {
    show({ messages: ASK_MSGS_WORKING, busy: true, phone: true });
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
  });
  it('before the first token there is one quiet line, and no raw tool name anywhere', () => {
    show({ messages: ASK_MSGS_THINKING, busy: true });
    expect(screen.getByText('Reading your program')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/get_[a-z_]+/);
  });
  it('a finished answer leaves one line that opens the steps it took', async () => {
    show();
    const button = screen.getByRole('button', { name: /Read 3 players/ });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('list', { name: 'What CoachHelm is doing' }).children).toHaveLength(4);
  });
});

describe('CH-13852 View as table', () => {
  it('swaps a chart for a real table of the same figures, and back', async () => {
    show();
    const toggles = screen.getAllByRole('button', { name: /View as table/ });
    const slope = toggles[0]!;
    expect(slope.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('list', { name: 'Make rate from 4 to 6 feet, by slope' })).toBeTruthy();
    await userEvent.click(slope);
    expect(slope.getAttribute('aria-pressed')).toBe('true');
    const table = screen.getByRole('table', { name: 'Make rate from 4 to 6 feet, by slope for Finley University' });
    expect(within(table).getAllByRole('row').map((r) => r.textContent)).toEqual(['RangeMake rate from 4 to 6 feet, by slopeSample', 'Uphill81%44', 'Flat76%51', 'Downhill58%31']);
    expect(screen.queryByRole('list', { name: 'Make rate from 4 to 6 feet, by slope' })).toBeNull();
    await userEvent.click(slope);
    expect(screen.queryByRole('table', { name: /by slope/ })).toBeNull();
  });
  it('the bars carry the sample beside each and the source line under them', () => {
    show();
    const figure = screen.getByRole('list', { name: 'Make rate from 4 to 6 feet, by slope' });
    expect(within(figure).getAllByRole('listitem').map((i) => i.textContent)).toEqual(['Uphill81% of 44', 'Flat76% of 51', 'Downhill58% of 31']);
    expect(screen.getByText('126 attempts · Sep 1 to Sep 29 · computed Sep 29')).toBeTruthy();
  });
  it('a ranking names each player with the value and the sample', () => {
    show();
    const rank = screen.getByRole('list', { name: 'Missed downhill putts from 4 to 6 feet' });
    expect(within(rank).getAllByRole('listitem').map((i) => i.textContent?.replace(/^\d/, ''))).toEqual(['JOJonah Okafor6 of 9', 'EBEli Brandt4 of 8', 'SASofia Alvarez2 of 7']);
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
    expect(within(alert).getByText("You're asking quickly. Wait a moment, then try again.")).toBeTruthy();
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
    expect(code('CH-1905')?.textContent).toBe("You're offline. Reconnect, then try again.");
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

describe('CH-13252 a rejected answer', () => {
  it('shows its one note and keeps the card; the prose and the evidence are not shown', () => {
    show({ messages: ASK_MSGS_REJECTED });
    expect(code('CH-13252')?.textContent).toBe("This answer didn't finish coming through, so it isn't being shown. Please ask again.");
    expect(document.body.textContent).not.toMatch(/makes 41%/);
    expect(screen.queryByText('Uphill')).toBeNull();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull();
  });
});

describe('Copy, follow-ups and the coach\'s line', () => {
  it('CH-13950 Copy copies the answer as plain text and says so', async () => {
    const user = userEvent.setup();
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    show();
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(write).toHaveBeenCalledTimes(1);
    const copied = write.mock.calls[0]![0];
    expect(copied).toContain('Most of it is downhill putts from 4 to 6 feet.');
    expect(copied).not.toContain('**');
    expect(await screen.findByText('Copied')).toBeTruthy();
    expect(code('CH-13950')).not.toBeNull();
    expect(hapticSpy).not.toHaveBeenCalled();
  });
  it("CH-13051 when the clipboard refuses, it says so and how to copy instead", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    show();
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(await screen.findByText("Couldn't copy")).toBeTruthy();
    expect(code('CH-13051')).not.toBeNull();
  });
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
  it('Confirm answers the approval by its id, once, even on a double tap, and a later Cancel is ignored', async () => {
    const { p } = show({ messages: ASK_MSGS_ACTION });
    const confirm = screen.getByRole('button', { name: 'Confirm' });
    await userEvent.dblClick(confirm);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(p.onApprove).toHaveBeenCalledTimes(1);
    expect(p.onApprove).toHaveBeenCalledWith('approval-1');
    expect(p.onDeny).not.toHaveBeenCalled();
    // The primary press (light) fires once; the answer's own success comes with the receipt.
    expect(hapticSpy.mock.calls.filter((c) => c[0] === 'press')).toHaveLength(1);
  });
  it('Cancel answers the same approval as denied', async () => {
    const { p } = show({ messages: ASK_MSGS_ACTION });
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(p.onDeny).toHaveBeenCalledWith('approval-1');
    expect(p.onApprove).not.toHaveBeenCalled();
  });
  it('states the facts, who is told, and nothing else, before the button', () => {
    show({ messages: ASK_MSGS_ACTION });
    const card = screen.getByRole('region', { name: 'Create focus area' });
    expect(within(card).getByText('Needs your OK')).toBeTruthy();
    const facts = Array.from(card.querySelectorAll('dl > div')).map((d) => d.textContent);
    expect(facts).toEqual(['PlayerJonah Okafor', 'FocusDownhill putts, 4 to 6 feet', 'GoalMake 7 of 10 in two practices', 'Review onTue, Oct 14']);
    expect(within(card).getByText('Will send.').parentElement?.textContent).toBe('Will send. Jonah gets a notification and sees the focus area on his Home.');
  });
  it('an action that sends nothing says so, and a missing fact says what it will be created without', () => {
    const quiet = { ...ASK_PROPOSAL, notifications: [], missing: ['Location'], facts: [...ASK_PROPOSAL.facts, { label: 'Location', value: '', missing: true }] };
    const m = msg('a2', 'assistant', [
      { type: 'tool-create_focus_area', toolCallId: 'c', state: 'approval-requested', approval: { id: 'ap' } },
      { type: 'data-action-proposal', id: 'proposal-k', data: { ...quiet, idempotency_key: 'k' } },
    ]);
    show({ messages: [m] });
    expect(screen.getByText('Nothing is sent.')).toBeTruthy();
    expect(screen.getByText('Location not set. This will be created without it.')).toBeTruthy();
    expect(screen.getByText('Not set')).toBeTruthy();
  });
  it('an impact line is stated on the card', () => {
    const risky = { ...ASK_PROPOSAL, impact: 'Every player on the team gets this message.' };
    const m = msg('a2', 'assistant', [
      { type: 'tool-create_focus_area', toolCallId: 'c', state: 'approval-requested', approval: { id: 'ap' } },
      { type: 'data-action-proposal', id: 'proposal-k', data: { ...risky, idempotency_key: 'k' } },
    ]);
    show({ messages: [m] });
    expect(screen.getByText('Every player on the team gets this message.')).toBeTruthy();
  });
  it('two proposals of one tool are not crossed: each Confirm answers its own approval', async () => {
    const card = (key: string, name: string) => ({ type: 'data-action-proposal', id: `proposal-${key}`, data: { ...ASK_PROPOSAL, idempotency_key: key, affects: [{ kind: 'player', id: `p-${name}`, label: name }], facts: [{ label: 'Player', value: name }] } });
    const m = msg('a2', 'assistant', [
      { type: 'tool-create_focus_area', toolCallId: 'c1', state: 'approval-requested', approval: { id: 'ap-1' } },
      card('k1', 'Jonah Okafor'),
      { type: 'tool-create_focus_area', toolCallId: 'c2', state: 'approval-requested', approval: { id: 'ap-2' } },
      card('k2', 'Eli Brandt'),
    ]);
    const { p } = show({ messages: [m] });
    const cards = screen.getAllByRole('region', { name: 'Create focus area' });
    await userEvent.click(within(cards[1]!).getByRole('button', { name: 'Confirm' }));
    expect(p.onApprove).toHaveBeenCalledWith('ap-2');
    await userEvent.click(within(cards[0]!).getByRole('button', { name: 'Cancel' }));
    expect(p.onDeny).toHaveBeenCalledWith('ap-1');
  });
  it('after Confirm it says so and waits for the receipt; after Cancel, that nothing was created', () => {
    const a = show({ messages: ASK_MSGS_CONFIRMED });
    expect(code('CH-13450')?.textContent).toBe('Confirmed. Working on it.');
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
    a.unmount();
    show({ messages: ASK_MSGS_CANCELLED });
    expect(code('CH-13952')?.textContent).toBe('Cancelled. Nothing was created.');
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
  });
  it('CH-13254 a card the conversation moved past has no buttons and says nothing was created', () => {
    show({ messages: ASK_MSGS_ABANDONED });
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    expect(screen.getByText('No decision was made. Nothing was created.')).toBeTruthy();
    expect(code('CH-13254')).not.toBeNull();
  });
  it('a card that arrives before its approval waits, with its buttons held', () => {
    const m = msg('a2', 'assistant', [{ type: 'data-action-proposal', id: 'proposal-k', data: { ...ASK_PROPOSAL, idempotency_key: 'k' } }]);
    show({ messages: [m], busy: true });
    expect((screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Getting it ready')).toBeTruthy();
  });
});

describe('the receipt', () => {
  it('CH-13953 a created action says what was created, links only to a screen that is rebuilt, and Confirmed is stated once', () => {
    show({ messages: ASK_MSGS_RECEIPT });
    expect(code('CH-13953')).not.toBeNull();
    expect(screen.getByText('Created a focus area for Jonah Okafor on downhill putts.')).toBeTruthy();
    // Focus areas live in Intelligence, which is not rebuilt: the chip is text, not a dead link.
    expect(screen.queryByRole('link', { name: /1 focus area/ })).toBeNull();
    expect(screen.getByText('1 focus area')).toBeTruthy();
    expect(screen.getByText('Confirmed.')).toBeTruthy();
  });
  it('a failed action that is not safe to ask again offers no Ask again', () => {
    const m = msg('a2', 'assistant', [{ type: 'data-action-receipt', id: 'receipt-x', data: { ...ASK_RECEIPT_PARTIAL, status: 'failed', retryable: false, error: 'The calendar refused it.' } }]);
    show({ messages: [m] });
    expect(screen.getByText('The calendar refused it.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ask again' })).toBeNull();
  });
  it('a partly done action links the calendar, says to check before asking again, and offers no Ask again', () => {
    const m = msg('a2', 'assistant', [{ type: 'data-action-receipt', id: 'receipt-x', data: ASK_RECEIPT_PARTIAL }]);
    show({ messages: [m] });
    const link = screen.getByRole('link', { name: /6 practices/ }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/golf/dashboard/calendar');
    expect(screen.getByText('Oct 28 and Nov 4 could not be added.')).toBeTruthy();
    expect(screen.getByText('Check what was created before you ask again.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ask again' })).toBeNull();
    expect(code('CH-13253')).not.toBeNull();
  });
  it('CH-13253 a failed action says it was not completed, why, and Ask again asks CoachHelm to propose it again', async () => {
    const { p } = show({ messages: ASK_MSGS_RECEIPT_FAILED });
    expect(screen.getByText('Create focus area, not completed')).toBeTruthy();
    expect(screen.getByText('Jonah already has an active focus area on downhill putts.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Ask again' }));
    expect(p.onSend).toHaveBeenCalledWith('Try that again: Create focus area');
  });
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

describe('CH-13851 the evidence control', () => {
  it('desktop: Evidence opens the panel for the player this card is about', async () => {
    const { p } = show({ messages: ASK_MSGS_ACTION });
    await userEvent.click(screen.getByRole('button', { name: 'Evidence' }));
    expect(p.onOpenEvidence).toHaveBeenCalledWith({ messageId: 'a2', key: 'key-focus-jonah', label: 'Jonah Okafor, downhill putts, 4 to 6 feet', playerId: 'p-jonah' });
  });
  it("phone: a row that reads See Jonah's numbers", () => {
    show({ messages: ASK_MSGS_ACTION, phone: true });
    expect(screen.getByRole('button', { name: /See Jonah's numbers/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Evidence' })).toBeNull();
  });
  it("when the conversation has no figures for that player, it links to their stats instead", () => {
    const m = msg('a2', 'assistant', [
      { type: 'tool-create_focus_area', toolCallId: 'c', state: 'approval-requested', approval: { id: 'ap' } },
      { type: 'data-action-proposal', id: 'proposal-k', data: { ...ASK_PROPOSAL, idempotency_key: 'k', affects: [{ kind: 'player', id: 'p-ava', label: 'Ava Lindqvist' }] } },
    ]);
    show({ messages: [m] });
    const link = screen.getByRole('link', { name: "See Ava's stats" }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/golf/dashboard/stats?player=p-ava');
    expect(screen.queryByRole('button', { name: 'Evidence' })).toBeNull();
  });
  it('the open panel marks its card pressed', () => {
    show({ messages: ASK_MSGS_ACTION, evidenceFocus: ASK_FOCUS_JONAH });
    expect(screen.getByRole('button', { name: 'Evidence' }).getAttribute('aria-pressed')).toBe('true');
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
    const tiles = Array.from(aside.querySelectorAll('.ch-th-tile')).map((t) => t.textContent);
    expect(tiles).toEqual(['Downhill, 4 to 6 feet33%3 of 9', 'Team, Downhill, 4 to 6 feet58%18 of 31', 'Uphill, 4 to 6 feet78%7 of 9']);
    expect(within(aside).getByRole('img', { name: /Make rate by round for Jonah Okafor: 50% to 0% across 5 rounds/ })).toBeTruthy();
    expect(within(aside).getByText('Team 58%')).toBeTruthy();
    expect(within(aside).getByText('Small sample: 9 attempts. Treat it as a direction, not a verdict.')).toBeTruthy();
    expect(within(aside).getByRole('table')).toBeTruthy();
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

describe('scrolling', () => {
  const scrollTo = vi.fn();
  beforeEach(() => {
    scrollTo.mockClear();
    Element.prototype.scrollIntoView = scrollTo;
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 0, configurable: true });
  });
  afterEach(() => {
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 0, configurable: true });
  });
  it('shows what the coach sent, wherever they were; follows a streaming answer only while they are at the bottom', () => {
    const { update } = show({ messages: [msg('u1', 'user', [{ type: 'text', text: 'first' }]), msg('a1', 'assistant', [{ type: 'text', text: 'one' }])] });
    scrollTo.mockClear();
    // They scrolled up: the page is tall and they are far from the end.
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 5000, configurable: true });
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    update({ messages: [msg('u1', 'user', [{ type: 'text', text: 'first' }]), msg('a1', 'assistant', [{ type: 'text', text: 'one two' }])], busy: true });
    expect(scrollTo).not.toHaveBeenCalled();
    update({ messages: [msg('u1', 'user', [{ type: 'text', text: 'first' }]), msg('a1', 'assistant', [{ type: 'text', text: 'one two' }]), msg('u2', 'user', [{ type: 'text', text: 'second' }])], busy: false });
    expect(scrollTo).toHaveBeenCalled();
  });
});

describe('a thread as it opens', () => {
  it('an opened thread does not fade in turn by turn; a turn added after does', () => {
    const { update } = show({ messages: ASK_MSGS_LONG });
    expect(document.querySelectorAll('.ch-th-turn.is-new')).toHaveLength(0);
    update({ messages: [...ASK_MSGS_LONG, msg('u9', 'user', [{ type: 'text', text: 'and one more' }])] });
    expect(document.querySelectorAll('.ch-th-turn.is-new')).toHaveLength(1);
  });
  it('a long thread is one conversation log; every answer is an article', () => {
    show({ messages: ASK_MSGS_LONG });
    expect(screen.getByRole('log', { name: 'Conversation' })).toBeTruthy();
    expect(screen.getAllByRole('article', { name: 'CoachHelm answer' })).toHaveLength(5);
  });
});
