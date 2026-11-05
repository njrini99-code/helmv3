// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { UIMessage } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionReceipt } from '@/lib/coachhelm/v3/chat/action-types';
import type { AskProposalView, AskStep, AskTurnRead } from '../../../../data/coachhelm-chat-thread';
import { readBasis, readRows } from '../../../../data/coachhelm-chat-thread';
import { QcSeam } from '../../../../shell/quick-chat/qc-seam';

const toast = vi.hoisted(() => vi.fn());
vi.mock('../../../../ui/Toast', () => ({ useToast: () => toast }));
vi.mock('@/app/golf/actions/coachhelm-ask', () => ({ readQuickChatWeek: vi.fn(() => Promise.resolve(null)), saveCoachFact: vi.fn(), deleteCoachFact: vi.fn(), setChatTone: vi.fn() }));

import { zoneHour } from '../Home';
import { AskThread } from '../Thread';
import { BriefCard } from '../parts/BriefCard';
import { ConfirmCard, Receipt } from '../parts/ConfirmCard';
import { Steps } from '../parts/Steps';

afterEach(() => {
  cleanup();
  toast.mockClear();
  vi.unstubAllGlobals();
});

const proposal = (over: Partial<AskProposalView['proposal']> = {}): AskProposalView['proposal'] => ({ action: 'Add to calendar', summary: 'Team meeting', facts: [{ label: 'Where', value: 'Film room' }], affects: [], notifications: ['7 players get an invite once Undo closes.'], missing: [], idempotency_key: 'k', ...over });
const view = (over: Partial<AskProposalView> = {}, p: Partial<AskProposalView['proposal']> = {}): AskProposalView => ({ key: 'k', tool: 'create_event', proposal: proposal(p), approvalId: 'a1', status: 'live', receipt: null, ...over });
const held = (): ActionReceipt => ({ status: 'held', held_until: new Date(Date.now() + 8000).toISOString(), action: 'Add', summary: 'Added', created: [], notifications: [], partial_failures: [], idempotency_key: 'k' }) as unknown as ActionReceipt;
const told = (recipients: number): ActionReceipt => ({ status: 'completed', action: 'Add', summary: 'Added', created: [], notifications: [{ channel: 'push', recipients, status: 'sent' }], partial_failures: [], idempotency_key: 'k' }) as unknown as ActionReceipt;
const card = (v: AskProposalView, more: Partial<Parameters<typeof ConfirmCard>[0]> = {}) => <ConfirmCard view={v} inlineReceipt={null} onApprove={vi.fn()} onDeny={vi.fn()} {...more} />;

describe('the Confirm card', () => {
  it('draws the real week for a calendar draft, with the open slot, the day from the proposal and the week the read returned', () => {
    const v = view({}, { visual: { kind: 'cal', date: '2026-11-04', start: '16:00', end: '17:00', title: 'Team meeting', where: null, who: '7 players', rsvp: true } });
    const { container } = render(<QcSeam.Provider value={{ week: { days: [{ date: '2026-11-02', hasEvent: true }], items: [{ title: 'Lift', start: '2026-11-04T15:00:00Z', end: '2026-11-04T16:00:00Z' }], timeZone: 'UTC' } }}>{card(v)}</QcSeam.Provider>);
    expect(container.querySelector('.ch-ak-wk .slot.is-open')).not.toBeNull();
    expect(container.querySelector('.ch-ak-wk .busy')?.textContent).toBe('Lift');
    expect(container.querySelector('.ch-ak-hs')).toBeNull();
  });

  it('shows an announcement as a phone will, word for word, and says Urgent only when it is', () => {
    const v = view({ tool: 'create_team_announcement' }, { facts: [{ label: 'Title', value: 'Bus to Hargrove' }, { label: 'Message', value: 'Bus leaves at 7:00 AM.' }, { label: 'Urgency', value: 'normal' }] });
    const { container } = render(card(v, { team: 'Varsity' }));
    const lock = container.querySelector('.ch-ak-lock');
    expect(lock?.textContent).toContain('Bus leaves at 7:00 AM.');
    expect(lock?.textContent).toContain('Announcement · now');
    expect(lock?.querySelector('.is-urgent')).toBeNull();
  });

  it('says a worked-out value once, on its pill with its source', () => {
    const { container } = render(card(view({}, { facts: [{ label: 'When', value: 'Wed 4:00', source: 'Calendar and classes' }, { label: 'Where', value: 'Film room' }] }), { onSend: vi.fn() }));
    expect(container.querySelector('.ipl')?.textContent).toContain('Calendar and classes');
    expect(container.querySelector('.evd')?.textContent).not.toContain('Wed 4:00');
  });

  it('fills its fields only when the card is new in this visit', () => {
    const fresh = render(card(view(), { fresh: true }));
    expect(fresh.container.querySelector('.conf.is-fill')).not.toBeNull();
    cleanup();
    const again = render(card(view()));
    expect(again.container.querySelector('.conf.is-fill')).toBeNull();
  });

  it('offers the reads behind a draft when it has them', () => {
    const onOpen = vi.fn();
    render(card(view(), { evidence: { open: false, onOpen } }));
    fireEvent.click(screen.getByRole('button', { name: 'See what this is based on' }));
    expect(onOpen).toHaveBeenCalledOnce();
  });
});

describe('the receipt', () => {
  it('Undo that the server refuses as late says so and never says Undone', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{}', { status: 409 }))));
    render(<Receipt receipt={held()} idempotencyKey="k" undoneLine="Undone. The event was removed." />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Undo/ }));
    });
    expect(screen.getByText(/Too late to undo\. It’s done\. Open it to change it\./)).toBeTruthy();
    expect(screen.queryByText(/Undone/)).toBeNull();
  });

  it('a dropped Undo keeps the control, and a good one uses the flow’s own line and tells the card', async () => {
    const onUndone = vi.fn();
    const f = vi.fn(() => Promise.reject(new Error('offline')));
    vi.stubGlobal('fetch', f);
    render(<Receipt receipt={held()} idempotencyKey="k" undoneLine="Undone. The event was removed." onUndone={onUndone} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Undo/ }));
    });
    expect(screen.getByText('Couldn’t undo that. Try again.')).toBeTruthy();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{}', { status: 200 }))));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Undo/ }));
    });
    expect(screen.getByText('Undone. The event was removed.')).toBeTruthy();
    expect(onUndone).toHaveBeenCalledOnce();
  });

  it('draws coins only when they are everyone the count says was told', () => {
    const { container, rerender } = render(<Receipt receipt={told(2)} idempotencyKey="k" coins={['Eli Brandt', 'Theo Marchetti']} />);
    expect(container.querySelectorAll('.told .coin')).toHaveLength(2);
    // A reloaded receipt draws still.
    expect(container.querySelector('.told.is-live')).toBeNull();
    rerender(<Receipt receipt={told(7)} idempotencyKey="k" coins={['Eli Brandt', 'Theo Marchetti']} />);
    cleanup();
    const other = render(<Receipt receipt={told(7)} idempotencyKey="k" coins={['Eli Brandt', 'Theo Marchetti']} />);
    expect(other.container.querySelectorAll('.told .coin')).toHaveLength(0);
  });
});

describe('a held receipt in the thread', () => {
  it('is not a failed write: no "not completed" toast', () => {
    const msg = (parts: unknown[]) => [{ id: 'a1', role: 'assistant', parts }] as unknown as UIMessage[];
    const props = { v2: true, busy: false, error: null, offline: false, phone: false, players: [], onApprove: vi.fn(), onDeny: vi.fn(), onSend: vi.fn(), onStop: vi.fn(), onRetry: vi.fn(), onNewChat: vi.fn(), evidenceFocus: null, onOpenEvidence: vi.fn() };
    const { rerender } = render(<AskThread {...props} messages={msg([{ type: 'text', text: 'Here is a draft.' }])} />);
    rerender(<AskThread {...props} messages={msg([{ type: 'text', text: 'Here is a draft.' }, { type: 'data-action-receipt', id: 'receipt-k', data: held() }])} />);
    expect(toast).not.toHaveBeenCalled();
  });
});

describe('the steps', () => {
  const steps: AskStep[] = [
    { id: '1', label: 'Reading the roster', state: 'done', done: 'Read the roster', detail: '7 active players' },
    { id: '2', label: 'Reading putts', state: 'active' },
    { id: '3', label: 'Draft the plan', state: 'next' },
  ];
  it('marks the running row with a dash on Stop, says nothing was saved, and stops the shimmer', () => {
    const { container } = render(<Steps steps={steps} active={false} seconds={null} stopped />);
    expect(container.querySelectorAll('.step .dash')).toHaveLength(1);
    expect(container.querySelector('.shim')).toBeNull();
    expect(screen.getByText('Stopped. Nothing was saved.')).toBeTruthy();
  });
  it('draws an announced step with no check and no shimmer', () => {
    const { container } = render(<Steps steps={steps} active seconds={null} />);
    const next = container.querySelector('.step.is-next');
    expect(next?.textContent).toContain('Next');
    expect(next?.querySelector('.shim')).toBeNull();
    expect(next?.classList.contains('done')).toBe(false);
  });
  it('a folded list opened later is not the live list, so its checks do not redraw', () => {
    const { container } = render(<Steps steps={[steps[0]!]} active={false} seconds={null} />);
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(container.querySelector('.steps')).not.toBeNull();
    expect(container.querySelector('.steps.is-live')).toBeNull();
    expect(container.querySelector('.steps')?.getAttribute('aria-live')).toBeNull();
  });
});

describe('the brief card', () => {
  const questions = [
    { id: 'a', title: 'How long?', options: [{ id: 'x', label: 'Two hours' }], pick: ['x'] },
    { id: 'b', title: 'Where?', options: [{ id: 'y', label: 'Range' }], pick: ['y'] },
  ];
  it('counts its questions, keeps Back disabled on the first, and carries the free line into what it sends', () => {
    const onDone = vi.fn();
    render(<BriefCard title="A few things first" questions={questions} onDone={onDone} />);
    expect(screen.getByText('Question 1 of 2')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Back' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Anything else?' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Anything else?' }), { target: { value: 'Bring the launch monitor' } });
    fireEvent.click(screen.getByRole('button', { name: 'Build it' }));
    expect(onDone).toHaveBeenCalledWith(expect.anything(), 'Two hours · Range · Bring the launch monitor');
  });
});

describe('what a read chip says', () => {
  it('a trend read has a window and a date, and claims no sample its series does not hold', () => {
    const envelope = { measurements: [], series: [{ entity: { kind: 'player', id: 'p', label: 'Jonah' }, window_start: '2026-09-01', window_end: '2026-10-20', as_of: '2026-10-21T00:00:00Z', points: [] }] } as unknown as AskTurnRead['envelope'];
    expect(readBasis(envelope)?.entity.id).toBe('p');
    const rows = readRows({ ref: 'e1', tool: 'get_player_trend', name: 'Trend', chip: 'Trend · 49 days', envelope });
    expect(rows.map((r) => r.label)).toEqual(['Window', 'Computed']);
  });
});

describe('the greeting', () => {
  it('takes its hour from the team’s zone, so the server and the browser say the same words', () => {
    expect(zoneHour('2026-11-05T13:30:00Z', 'America/New_York')).toBe(8);
    expect(zoneHour('2026-11-05T13:30:00Z', 'America/Los_Angeles')).toBe(5);
    expect(zoneHour('2026-11-05T04:30:00Z', 'UTC')).toBe(4);
  });
});
