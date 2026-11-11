import type { UIMessage } from 'ai';
import { capTask } from './fixtures-chat-capabilities';

/**
 * The real thread with the server-built cards in it (preview only): `/clubhouse-preview/coachhelm-ask?state=several` and
 * `?state=outofdate`. The proposals are the capability gallery's own (fixtures-chat-capabilities), so the thread shows what
 * the gallery shows: a card that declares what may be edited, several cards in one turn, a card that went out of date.
 */
const user = (id: string, text: string): UIMessage => ({ id, role: 'user', parts: [{ type: 'text', text }] }) as unknown as UIMessage;
const assistant = (id: string, parts: unknown[]): UIMessage => ({ id, role: 'assistant', parts }) as unknown as UIMessage;
const text = (t: string) => ({ type: 'text', text: t });
const step = (n: number, label: string, tool: string) => ({ type: 'data-progress', id: `progress-${n}`, data: { label, tool } });

/** One waiting card as the stream writes it: the tool part that carries the approval, then the plan. The approval id is the card's key. */
function waiting(tool: string): unknown[] {
  const cap = capTask(tool)!;
  const key = cap.proposal.idempotency_key;
  return [
    { type: `tool-${tool}`, toolCallId: `call-${tool}`, state: 'approval-requested', input: {}, approval: { id: key } },
    { type: 'data-action-proposal', id: `proposal-${key}`, data: { ...cap.proposal, tool } },
  ];
}

/** Three cards in one turn: two that can be approved together and a lock, which is always confirmed on its own. */
const SEVERAL: UIMessage[] = [
  user('u1', 'Set up Thursday: add the short-game practice, give the travel squad the Ridgeline task, and lock the lineup'),
  assistant('a1', [step(1, 'Drafting the practice', 'create_event'), text('Here are the three. Nothing is saved until you confirm.'), ...waiting('create_event'), ...waiting('create_task'), ...waiting('lock_lineup')]),
];

/** A confirmed change the server refused because the event had moved on: the card is out of date, and asking again is the way on. */
function outOfDate(): UIMessage[] {
  const cap = capTask('update_event')!;
  const key = cap.proposal.idempotency_key;
  return [
    user('u1', 'Move Thursday’s short-game practice to Friday at 3:30'),
    assistant('a1', [
      step(1, 'Drafting the change', 'update_event'),
      text('Here is the change. Nothing is changed until you confirm.'),
      { type: 'tool-update_event', toolCallId: 'call-update_event', state: 'approval-responded', input: {}, approval: { id: key, approved: true } },
      { type: 'data-action-proposal', id: `proposal-${key}`, data: { ...cap.proposal, tool: 'update_event' } },
      { type: 'data-action-receipt', id: `receipt-${key}`, data: cap.failed },
    ]),
  ];
}

export const ASK_CARD_STATES: Record<string, { messages: UIMessage[] }> = {
  several: { messages: SEVERAL },
  outofdate: { messages: outOfDate() },
};
