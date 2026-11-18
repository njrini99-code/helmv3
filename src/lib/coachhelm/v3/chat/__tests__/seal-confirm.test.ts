import { describe, expect, it } from 'vitest';
import type { ActionReceipt } from '../action-types';
import { sealConfirmedParts } from '../seal-confirm';

const receipt = { status: 'held', action: 'Add to calendar', summary: 'Confirm live check is on its way to the calendar.', created: [], notifications: [], partial_failures: [], retryable: false, at: '2026-11-17T19:00:00.000Z', held_until: '2026-11-17T19:00:08.000Z' } as ActionReceipt;

const parts = [
  { type: 'data-action-proposal', id: 'proposal-k1', data: { idempotency_key: 'k1', tool: 'create_event', action: 'Add to calendar' } },
  { type: 'tool-create_event', toolCallId: 'c1', state: 'approval-requested', approval: { id: 'a1' }, input: { title: 'Confirm live check' } },
];

describe('sealConfirmedParts', () => {
  it('finishes the tool as an output, so the chat does not resubmit the same message', () => {
    const sealed = sealConfirmedParts(parts, 'k1', receipt, 'a1');
    const tool = sealed[1] as { state: string; output: { message: string } };
    expect(tool.state).toBe('output-available');
    expect(tool.state).not.toBe('approval-responded');
    expect(tool.output.message).toBe(receipt.summary);
    expect(sealed).toContainEqual({ type: 'data-action-receipt', id: 'receipt-k1', data: receipt });
  });

  it('does not add a second receipt', () => {
    const once = sealConfirmedParts(parts, 'k1', receipt, 'a1');
    const twice = sealConfirmedParts(once, 'k1', receipt, 'a1');
    expect(twice.filter((part) => (part as { type?: string }).type === 'data-action-receipt')).toHaveLength(1);
  });

  it('seals the matching card when the turn proposed two', () => {
    const two = [
      ...parts,
      { type: 'data-action-proposal', id: 'proposal-k2', data: { idempotency_key: 'k2', tool: 'create_event', action: 'Add to calendar' } },
      { type: 'tool-create_event', toolCallId: 'c2', state: 'approval-requested', approval: { id: 'a2' }, input: { title: 'Other' } },
    ];
    const sealed = sealConfirmedParts(two, 'k2', receipt) as Array<{ state?: string; approval?: { id?: string } }>;
    expect(sealed[1]?.state).toBe('approval-requested');
    expect(sealed[3]?.state).toBe('output-available');
    expect(sealed[3]?.approval?.id).toBe('a2');
  });
});
