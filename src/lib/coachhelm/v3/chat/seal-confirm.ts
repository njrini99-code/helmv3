import type { ActionReceipt } from './action-types';

/**
 * Record a confirm on the message the coach is looking at, without resubmitting the thread.
 *
 * The tool part becomes `output-available`, not `approval-responded`. The chat hook
 * auto-sends when the last step has an `approval-responded` part, and that second
 * request re-runs the tool and tells the model the draft failed. A finished output
 * does not. The receipt part is what the card draws after a reload.
 */
export function sealConfirmedParts(parts: readonly unknown[], key: string, receipt: ActionReceipt, approvalId?: string): unknown[] {
  const next = parts.map((part) => (isRecord(part) ? { ...part } : part));
  const index = approvalId ? toolIndexByApproval(next, approvalId) : toolIndexByKey(next, key);
  if (index >= 0 && isRecord(next[index])) {
    const part = next[index];
    const approval = isRecord(part.approval) ? { ...part.approval, approved: true } : { approved: true };
    next[index] = { ...part, state: 'output-available', approval, output: { status: receipt.status, message: receipt.summary } };
  }
  const receiptId = `receipt-${key}`;
  if (!next.some((part) => isRecord(part) && part.type === 'data-action-receipt' && part.id === receiptId)) {
    next.push({ type: 'data-action-receipt', id: receiptId, data: receipt });
  }
  return next;
}

function toolIndexByApproval(parts: readonly unknown[], approvalId: string): number {
  return parts.findIndex((part) => isRecord(part) && typeof part.type === 'string' && part.type.startsWith('tool-') && isRecord(part.approval) && part.approval.id === approvalId);
}

/** The n-th proposal of a tool pairs with the n-th tool part, the same way the card does. */
function toolIndexByKey(parts: readonly unknown[], key: string): number {
  const proposals: Array<{ tool: string; key: string }> = [];
  for (const part of parts) {
    if (!isRecord(part) || part.type !== 'data-action-proposal' || !isRecord(part.data)) continue;
    const idem = part.data.idempotency_key;
    if (typeof idem !== 'string') continue;
    proposals.push({ tool: typeof part.data.tool === 'string' ? part.data.tool : '', key: idem });
  }
  const hit = proposals.findIndex((p) => p.key === key);
  if (hit < 0) return -1;
  const tool = proposals[hit]?.tool ?? '';
  const nth = proposals.slice(0, hit + 1).filter((p) => p.tool === tool).length - 1;
  let seen = 0;
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (!isRecord(part) || part.type !== `tool-${tool}`) continue;
    if (seen === nth) return i;
    seen += 1;
  }
  return -1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
