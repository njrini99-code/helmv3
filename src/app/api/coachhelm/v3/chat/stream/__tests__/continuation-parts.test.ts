import { describe, expect, it } from 'vitest';
import type { UIMessage } from 'ai';
import { continuationParts, deniedProposalKeys } from '../continuation-parts';
import { denyAbandonedApprovals } from '@/lib/coachhelm/v3/chat/abandoned-approvals';

describe('approval continuation delta', () => {
  const before = [
    { type: 'text', text: 'Please confirm.' },
    { type: 'data-action-proposal', id: 'proposal-k', data: { tool: 'create_event', idempotency_key: 'k' } },
    { type: 'data-action-receipt', id: 'receipt-k', data: { status: 'held' } },
  ] as UIMessage['parts'];

  it('keeps new parts and an in-place receipt update without repeating the first leg', () => {
    const final = { type: 'data-action-receipt', id: 'receipt-k', data: { status: 'completed' } };
    const text = { type: 'text', text: 'Done.' };
    expect(continuationParts(before, [before[0]!, before[1]!, final, text] as UIMessage['parts'])).toEqual([final, text]);
  });

  it('does not copy unchanged evidence, cards or prose on a duplicate approval', () => {
    expect(continuationParts(before, structuredClone(before))).toEqual([]);
  });
});

describe('durable denial keys', () => {
  const tool = (approved?: boolean) => ({ type: 'tool-create_event', state: approved === undefined ? 'approval-requested' : 'approval-responded', approval: { id: 'a', ...(approved === undefined ? {} : { approved }) } });
  const proposal = (key: string) => ({ type: 'data-action-proposal', data: { tool: 'create_event', idempotency_key: key } });

  it('denies only the declined call when the same tool was proposed twice', () => {
    expect(deniedProposalKeys([{ role: 'assistant', parts: [tool(false), proposal('no'), tool(true), proposal('yes')] }])).toEqual(['no']);
  });

  it('records moving on as a denial but leaves a current approval alone', () => {
    const thread = [
      { role: 'assistant', parts: [tool(), proposal('old')] },
      { role: 'user', parts: [{ type: 'text', text: 'Something else' }] },
      { role: 'assistant', parts: [tool(), proposal('current')] },
    ];
    expect(deniedProposalKeys(denyAbandonedApprovals(thread))).toEqual(['old']);
  });

  it('never invents a key for a missing proposal or missing tool', () => {
    expect(deniedProposalKeys([{ role: 'assistant', parts: [tool(false)] }, { role: 'assistant', parts: [proposal('orphan')] }])).toEqual([]);
  });
});
