// @vitest-environment jsdom
/**
 * ============================================================================
 * ChatThread — a Confirm card the coach walked away from
 * ----------------------------------------------------------------------------
 * A newer question under an unanswered card is a Cancel: the stream route turns
 * it into a denial (`denyAbandonedApprovals`), so the card has to read the same
 * way instead of offering buttons that no longer do anything.
 *
 * The chart library behind `EvidenceVisuals` is a multi-second transform this
 * file does not use, so it is stubbed (see `AskSurface.pending-question.test`).
 * ========================================================================== */
import { fireEvent, render, screen } from '@testing-library/react';
import type { UIMessage } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import { ChatThread } from './ChatThread';

vi.mock('./EvidenceVisuals', () => ({ EvidenceRenderer: () => null }));

const KEY = 'focus-area-key-1';
const CANCELLED = 'Cancelled. Nothing was created.';

const userTurn = (id: string, text: string) =>
  ({ id, role: 'user', parts: [{ type: 'text', text }] }) as unknown as UIMessage;

/** The assistant turn carrying the Confirm card: its proposal part and the tool part holding the approval. */
const proposalTurn = (id = 'a1', toolPart: Record<string, unknown> | null = { state: 'approval-requested', approval: { id: 'appr_1' } }) =>
  ({
    id,
    role: 'assistant',
    parts: [
      {
        type: 'data-action-proposal',
        id: `proposal-${KEY}`,
        data: {
          tool: 'create_focus_area',
          action: 'Create a focus area',
          summary: 'Putting from 6 feet',
          facts: [],
          affects: [],
          notifications: [],
          missing: [],
          idempotency_key: KEY,
        },
      },
      ...(toolPart ? [{ type: 'tool-create_focus_area', toolCallId: 'call_1', input: {}, ...toolPart }] : []),
    ],
  }) as unknown as UIMessage;

const receiptTurn = (id = 'a2') =>
  ({
    id,
    role: 'assistant',
    parts: [
      {
        type: 'data-action-receipt',
        id: `receipt-${KEY}`,
        data: {
          status: 'completed',
          action: 'Create a focus area',
          summary: 'Created a focus area',
          created: [],
          notifications: [],
          partial_failures: [],
          retryable: false,
          at: '2026-09-30T12:00:00.000Z',
        },
      },
    ],
  }) as unknown as UIMessage;

function renderThread(messages: UIMessage[], handlers = { onApprove: vi.fn(), onDeny: vi.fn() }) {
  render(<ChatThread messages={messages} busy={false} {...handlers} />);
  return handlers;
}

describe('ChatThread — Confirm cards', () => {
  it('a card still waiting on the coach offers Confirm and Cancel', () => {
    const handlers = renderThread([userTurn('u1', 'Make a putting focus area'), proposalTurn()]);

    expect(screen.queryByText(CANCELLED)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(handlers.onApprove).toHaveBeenCalledWith('appr_1');
  });

  it('a newer question turns the unanswered card into "Cancelled. Nothing was created."', () => {
    renderThread([
      userTurn('u1', 'Make a putting focus area'),
      proposalTurn(),
      userTurn('u2', 'Actually, how is the team putting?'),
    ]);

    expect(screen.getByText(CANCELLED)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /confirm/i })).toBeNull();
  });

  it('after a reload, when the tool part is not replayed, a newer question still cancels it', () => {
    renderThread([
      userTurn('u1', 'Make a putting focus area'),
      proposalTurn('a1', null),
      userTurn('u2', 'Actually, how is the team putting?'),
    ]);

    expect(screen.getByText(CANCELLED)).toBeTruthy();
  });

  it('a card the coach confirmed stays confirmed when they ask more', () => {
    renderThread([
      userTurn('u1', 'Make a putting focus area'),
      proposalTurn('a1', { state: 'output-available', approval: { id: 'appr_1', approved: true }, output: {} }),
      userTurn('u2', 'Thanks. And approach play?'),
    ]);

    expect(screen.getByText('Confirmed.')).toBeTruthy();
    expect(screen.queryByText(CANCELLED)).toBeNull();
  });

  it('a card whose write ran is never called cancelled, even when the approval state was not replayed', () => {
    // After a reload only the receipt proves the write happened.
    renderThread([
      userTurn('u1', 'Make a putting focus area'),
      proposalTurn('a1', null),
      receiptTurn(),
      userTurn('u2', 'Thanks. And approach play?'),
    ]);

    expect(screen.queryByText(CANCELLED)).toBeNull();
    expect(screen.getByText('Created a focus area')).toBeTruthy();
  });
});
