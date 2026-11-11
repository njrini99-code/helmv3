import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../../../../__tests__/dialog-polyfill';

/**
 * The thread hands its task cards what their built behaviours need (CAPABILITIES 0.8, 0.9): the way to edit a waiting card,
 * the server's word on that edit, and the one safe "approve all" under several cards in a turn.
 */

vi.mock('../../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));

import { ASK_CARD_STATES } from '../../../../preview/fixtures-ask-cards';
import { capTask } from '../../../../preview/fixtures-chat-capabilities';
import { ASK_MSGS_ACTION } from '../../../../preview/fixtures-ask-thread';
import { ToastProvider } from '../../../../ui/Toast';
import { AskThread, type AskThreadProps } from '../Thread';

const wrap = (node: ReactNode) => (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <div className="ch-root" data-ui="clubhouse">
        {node}
      </div>
    </ToastProvider>
  </LazyMotion>
);
const thread = (over: Partial<AskThreadProps> = {}) => (
  <AskThread messages={ASK_CARD_STATES.several!.messages} busy={false} error={null} offline={false} phone={false} players={[]} onApprove={vi.fn()} onDeny={vi.fn()} onSend={vi.fn()} onStop={vi.fn()} onRetry={vi.fn()} onNewChat={vi.fn()} evidenceFocus={null} onOpenEvidence={vi.fn()} {...over} />
);
const keyOf = (tool: string) => capTask(tool)!.proposal.idempotency_key;
const cards = () => [...document.querySelectorAll<HTMLElement>('.ch-ak-task')];

afterEach(cleanup);

describe('several cards in one turn', () => {
  it('draws each card, and under the last one the bar that approves the safe ones together', () => {
    const onApproveAll = vi.fn();
    render(wrap(thread({ onApproveAll })));
    expect(cards().length).toBe(3);
    // The lock cannot be undone, so it is never in a batch: two of the three go together.
    expect(screen.getByText('Approve 2 of 3 together')).toBeTruthy();
    expect(screen.getByText('Not included: it cannot be undone, so it is confirmed on its own.')).toBeTruthy();
    expect(document.querySelector('.ch-akc-deck > .ch-ak-task + .ch-akc-all')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Approve these 2' }));
    expect(onApproveAll).toHaveBeenCalledWith([keyOf('create_event'), keyOf('create_task')]);
  });

  it('offers no bar when the shell cannot approve several (each card is decided on its own), and none for one card', () => {
    render(wrap(thread()));
    expect(cards().length).toBe(3);
    expect(document.querySelector('.ch-akc-all')).toBeNull();
    cleanup();
    render(wrap(thread({ messages: ASK_MSGS_ACTION, onApproveAll: vi.fn() })));
    expect(cards().length).toBe(1);
    expect(document.querySelector('.ch-akc-all, .ch-akc-deck')).toBeNull();
  });

  it('leaves a card out of the batch while its edit form is open: what is on screen is not what would be confirmed', () => {
    render(wrap(thread({ onApproveAll: vi.fn(), onEditCard: vi.fn() })));
    fireEvent.click(cards()[0]!.querySelector<HTMLButtonElement>('.ch-akc-editkey button')!);
    // One card left that could go, and one card is decided on the card: no bar.
    expect(document.querySelector('.ch-akc-all')).toBeNull();
  });
});

describe('edit mode in the thread', () => {
  it('a card offers Edit only when the thread is given the way to send it, and sends the approval id', () => {
    render(wrap(thread()));
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    cleanup();
    const onEditCard = vi.fn();
    render(wrap(thread({ onEditCard })));
    // The lock declares nothing editable, so two of the three offer it.
    expect(screen.getAllByRole('button', { name: 'Edit' }).length).toBe(2);
    fireEvent.click(cards()[1]!.querySelector<HTMLButtonElement>('.ch-akc-editkey button')!);
    fireEvent.change(screen.getByDisplayValue('Post your Ridgeline practice round hole by hole'), { target: { value: 'Post your Ridgeline round tonight' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update the card' }));
    expect(onEditCard).toHaveBeenCalledWith(keyOf('create_task'), { title: 'Post your Ridgeline round tonight' });
  });

  it('shows the server\'s refusal of that edit on the card it was about', () => {
    const onEditCard = vi.fn();
    const base = ASK_CARD_STATES.several!.messages;
    const { rerender } = render(wrap(thread({ onEditCard })));
    fireEvent.click(cards()[1]!.querySelector<HTMLButtonElement>('.ch-akc-editkey button')!);
    fireEvent.change(screen.getByDisplayValue('Post your Ridgeline practice round hole by hole'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update the card' }));
    const refused = base.map((m) => (m.role === 'assistant' ? { ...m, parts: [...m.parts, { type: 'data-card-revision', id: `revision-${keyOf('create_task')}`, data: { key: keyOf('create_task'), accepted: false, kind: 'invalid', reason: 'Task: Say what to post.' } }] } : m)) as AskThreadProps['messages'];
    rerender(wrap(thread({ onEditCard, messages: refused })));
    expect(cards()[1]!.querySelector('[role="alert"]')?.textContent).toContain('Task: Say what to post.');
    expect(cards()[0]!.querySelector('[role="alert"]')).toBeNull();
  });
});
