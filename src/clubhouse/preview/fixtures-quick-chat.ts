import type { UIMessage } from 'ai';
import type { ActionProposal, ActionReceipt } from '@/lib/coachhelm/v3/chat/action-types';

/** The design page's demo values (coachhelm 03 Fixture): team Varsity, Mon 3 Nov, 11 active players, Travel squad of 6. */
export interface QcFixture {
  messages: UIMessage[];
  busy?: boolean;
  closed?: boolean;
}

type Kind = 'cal' | 'msg' | 'qual';
const proposal = (kind: Kind): ActionProposal => {
  const base = { affects: [], missing: [], idempotency_key: `qc-${kind}` };
  if (kind === 'cal')
    return {
      ...base,
      visual: { kind: 'cal', date: '2026-11-06', start: '15:00', end: '17:00', title: 'Team practice', where: 'the range', who: 'All 11 active', rsvp: false },
      action: 'Add to calendar',
      summary: 'Team practice',
      facts: [{ label: 'When', value: 'Thu 6 Nov, 3:00 to 5:00 PM' }],
      notifications: ['11 players see it on their calendar. No RSVP asked.'],
    };
  if (kind === 'msg')
    return {
      ...base,
      visual: { kind: 'msg', conversationId: '00000000-0000-4000-8000-000000000006', thread: 'Travel squad', count: 6, last: 'Do we need to bring our own lunch Friday?', draft: 'Bus leaves the field house at 6:15 Friday. Bags on by 6. Lunch is covered, so no need to bring one.' },
      action: 'Send to 6 players',
      summary: 'Travel squad',
      facts: [{ label: 'Thread', value: 'Travel squad' }],
      notifications: ['Sends as you to 6 players in Travel squad, after an 8 second Undo.'],
    };
  return {
    ...base,
    visual: { kind: 'qual', title: 'Fall qualifier', rounds: 3, start: '2026-11-10', total: 5, picks: 1, field: 11, deadline: null },
    action: 'Set qualifier',
    summary: 'Fall qualifier',
    facts: [{ label: 'Starts', value: 'Mon 10 Nov' }],
    notifications: ['11 players get a push and an email once Undo closes.'],
  };
};
const ASK: Record<Kind, string> = { cal: 'Add a team practice Thursday 3 to 5 at the range, everyone', msg: 'Tell the travel squad the bus leaves at 6:15 Friday, bags on by 6, lunch is covered', qual: 'Set up the fall qualifier: three rounds next week at Lonnie Poole, top 5 travel' };
const SAY: Record<Kind, string> = { cal: 'Thursday’s lift ends at 2:45, so 3:00 is clear. Here’s the practice.', msg: 'Here’s the draft for the Travel squad.', qual: 'Here’s the qualifier.' };
const DONE: Record<Kind, string> = { cal: 'Thu 6 Nov, 3:00 to 5:00 PM', msg: 'Delivered to 6 players', qual: 'Fall qualifier · starts Mon 10 Nov' };
const TOOL: Record<Kind, string> = { cal: 'create_event', msg: 'send_message', qual: 'create_qualifier' };

const user = (id: string, text: string) => ({ id, role: 'user', parts: [{ type: 'text', text }] }) as unknown as UIMessage;
const step = (i: number, label: string, done = true) => ({ type: 'data-progress', id: `p${i}`, data: { label, ...(done ? { state: 'done' } : {}) } });
const STEPS = [step(1, 'Checked Thursday · lift ends at 2:45'), step(2, 'Found 11 active players'), step(3, 'Drafted the practice')];
const assistant = (parts: unknown[]) => ({ id: 'a1', role: 'assistant', parts }) as unknown as UIMessage;

function task(kind: Kind, phase: 'confirm' | 'held' | 'done' | 'failed' | 'cancelled'): UIMessage[] {
  const p = proposal(kind);
  const approved = phase !== 'confirm' && phase !== 'cancelled';
  const tool = { type: `tool-${TOOL[kind]}`, toolCallId: 'call-1', input: {}, state: phase === 'confirm' ? 'approval-requested' : 'approval-responded', approval: { id: 'approval-1', ...(phase === 'confirm' ? {} : { approved }) } };
  const receipt = (phase === 'held' || phase === 'done' || phase === 'failed'
    ? { status: phase === 'held' ? 'held' : phase === 'done' ? 'completed' : 'failed', ...(phase === 'held' ? { held_until: new Date(Date.now() + 8000).toISOString() } : {}), action: p.action, summary: phase === 'failed' ? 'The calendar didn’t answer. Nothing was saved.' : DONE[kind], created: [{ kind: 'event', count: 1, href: '/golf/dashboard/calendar', label: p.summary }], notifications: phase === 'done' ? [{ channel: 'bell', recipients: kind === 'msg' ? 6 : 11, status: 'sent' as const }] : [], partial_failures: [], retryable: phase === 'failed' }
    : null) as ActionReceipt | null;
  return [
    user('u1', ASK[kind]),
    assistant([...STEPS, { type: 'text', text: SAY[kind], state: 'done' }, tool, { type: 'data-action-proposal', id: `proposal-${p.idempotency_key}`, data: { ...p, tool: TOOL[kind] } }, ...(receipt ? [{ type: 'data-action-receipt', id: `receipt-${p.idempotency_key}`, data: receipt }] : [])]),
  ];
}

const kinds: Kind[] = ['cal', 'msg', 'qual'];
export const QC_FIXTURES: Record<string, QcFixture> = {
  hello: { messages: [] },
  closed: { messages: [], closed: true },
  steps: { messages: [user('u1', ASK.cal), assistant([step(1, 'Checked Thursday · lift ends at 2:45'), step(2, 'Finding everyone on the active roster', false)])], busy: true },
  stopped: { messages: [user('u1', ASK.cal), assistant([step(1, 'Checked Thursday · lift ends at 2:45')])] },
  live: { messages: [user('u1', ASK.cal), assistant([step(1, 'Checking Thursday on the team calendar', false)])], busy: true, closed: true },
  ...Object.fromEntries(kinds.flatMap((k) => [
    [`confirm-${k}`, { messages: task(k, 'confirm') }],
    [`receipt-${k}`, { messages: task(k, 'held') }],
    [`told-${k}`, { messages: task(k, 'done') }],
    [`failed-${k}`, { messages: task(k, 'failed') }],
  ])),
  cancelled: { messages: task('cal', 'cancelled') },
};
