import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ActionReceipt } from '@/lib/coachhelm/v3/chat/action-types';
import { ActionReceiptCard } from '../ActionCards';

/**
 * A receipt the coach undid inside the Undo window (`status: 'cancelled'`) used to be drawn exactly like one that had
 * been written: the green dot and whatever the plan said it would create. It is its own quiet state: it says it was
 * undone, and it lists nothing as created or sent, because nothing was.
 */
const receipt = (over: Partial<ActionReceipt> = {}): ActionReceipt => ({
  status: 'completed',
  action: 'Create a focus area',
  summary: 'Created the focus area.',
  created: [{ kind: 'focus area', count: 1, href: '/golf/dashboard/focus/1' }],
  notifications: [{ channel: 'Push', recipients: 8, status: 'sent' }],
  partial_failures: [],
  retryable: false,
  at: '2026-11-10T15:04:00.000Z',
  ...over,
});
const undone = receipt({ status: 'cancelled', summary: 'Undone. Nothing was written.' });

describe('ActionReceiptCard: a receipt the coach undid', () => {
  it('says it was undone, in the quiet ink, with the neutral dot', () => {
    const { container } = render(<ActionReceiptCard receipt={undone} />);
    const card = screen.getByRole('region', { name: 'Create a focus area, cancelled' });
    expect(card).toBeTruthy();
    const title = screen.getByText('Create a focus area, undone');
    expect(title.className).toContain('text-text-secondary');
    expect(title.className).not.toContain('text-text-primary');
    expect(screen.getByText('Undone. Nothing was written.')).toBeTruthy();
    const dot = container.querySelector('header span[aria-hidden]')!;
    expect(dot.className).toContain('bg-text-tertiary');
    expect(dot.className).not.toContain('bg-accent-600');
  });

  it('lists nothing as created, sent or half done, whatever the receipt carries, and never offers to try again', () => {
    const onRetry = vi.fn();
    render(<ActionReceiptCard receipt={receipt({ status: 'cancelled', summary: 'Undone. Nothing was written.', partial_failures: ['Two players were not told.'], retryable: true })} onRetry={onRetry} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText(/focus area$/)).toBeNull();
    expect(screen.queryByText(/Push sent/)).toBeNull();
    expect(screen.queryByText('Two players were not told.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('a receipt that was written is drawn as before: its title in the primary ink, the accent dot, what it created and whom it told', () => {
    const { container } = render(<ActionReceiptCard receipt={receipt()} />);
    const title = screen.getByText('Create a focus area');
    expect(title.className).toContain('text-text-primary');
    expect(container.querySelector('header span[aria-hidden]')!.className).toContain('bg-accent-600');
    expect(screen.getByRole('link').getAttribute('href')).toBe('/golf/dashboard/focus/1');
    expect(screen.getByText('Push sent to 8')).toBeTruthy();
  });

  it('a receipt that failed still says not completed and can be tried again: undone is not failed', () => {
    const onRetry = vi.fn();
    render(<ActionReceiptCard receipt={receipt({ status: 'failed', summary: 'x', error: 'That could not be saved.', created: [], notifications: [], retryable: true })} onRetry={onRetry} />);
    expect(screen.getByText('Create a focus area, not completed')).toBeTruthy();
    expect(screen.queryByText(/undone/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});
