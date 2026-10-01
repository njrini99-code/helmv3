/**
 * A Confirm card the coach walked away from.
 *
 * The model proposes a write and the SDK suspends the tool call on an
 * `approval-requested` part — the Confirm card. That part is kept on purpose
 * (`isIncompleteToolPart` does not drop it: it is the whole Confirm flow). But
 * the browser resends the whole thread with every new question, so a coach who
 * never answered the card and simply asked something else sent the SDK a tool
 * call with no result. The request died with "Tool result is missing for tool
 * call …" before the model was reached, and every later question in the thread
 * died the same way until the card was answered (production, 2026-08-26
 * 18:54:06).
 *
 * A newer user message means the coach moved on. That is a Cancel: nothing is
 * created, and the model is told the action was declined so the conversation
 * carries on. The card in the browser reads the same way (see `ChatThread`).
 */
import type { InspectablePart } from './ui-parts';

interface ThreadMessage {
  role: string;
  parts: InspectablePart[];
}

/** What the model reads for an action the coach never confirmed. */
export const ABANDONED_APPROVAL_REASON = 'The coach did not confirm this action and asked something else.';

/**
 * The thread with every still-pending Confirm card that has a newer user
 * message after it turned into a denial. Cards after the last user message are
 * untouched: those are live, and an approval resubmit carries their answer.
 */
export function denyAbandonedApprovals<M extends ThreadMessage>(messages: readonly M[]): M[] {
  const lastUser = messages.map((m) => m.role).lastIndexOf('user');
  return messages.map((message, index) => {
    if (message.role !== 'assistant' || index >= lastUser) return message;
    if (!message.parts.some(isPendingApproval)) return message;
    return {
      ...message,
      parts: message.parts.map((part) => {
        if (!isPendingApproval(part)) return part;
        const approval = (part.approval ?? {}) as Record<string, unknown>;
        return {
          ...part,
          state: 'approval-responded',
          approval: { ...approval, approved: false, reason: ABANDONED_APPROVAL_REASON },
        };
      }),
    };
  });
}

function isPendingApproval(part: InspectablePart): boolean {
  return part.type.startsWith('tool-') && part.state === 'approval-requested';
}
