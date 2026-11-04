import type { UIMessage } from 'ai';
import type { ActionProposal, ActionReceipt } from '@/lib/coachhelm/v3/chat/action-types';
import type { QcSeamValue } from '../shell/quick-chat/qc-seam';

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
      visual: { kind: 'cal', date: '2026-11-06', start: '15:00', end: '17:00', title: 'Team practice', where: 'Lonnie Poole range', who: 'All 11 active', rsvp: false },
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

const PLAN_PART = {
  type: 'data-practice-plan',
  id: 'plan-1',
  data: {
    version: 1,
    eventId: '00000000-0000-4000-8000-000000000011',
    title: 'Tuesday practice',
    saveOn: true,
    draft: {
      version: 1,
      why: {},
      body: {
        v: 2, focus: 'Putting and wedges', notes: '', place: 'Lonnie Poole', arrivalBufferMin: 15, bring: [], players: [], groups: [],
        variants: {
          rain: null,
          main: {
            blocks: [
              { id: 'b1', kind: 'block', title: 'Putting', len: 20, note: '3, 6, 9, 12 ft, make 3 in a row' },
              { id: 'b2', kind: 'block', title: 'Wedges', len: 30, note: '40, 60, 80 yd, 10 balls each' },
              { id: 'b3', kind: 'block', title: '9 holes', len: 40, note: 'Front nine, pairs' },
            ],
          },
        },
      },
    },
  },
};
const planThread = (): UIMessage[] => [user('u1', 'Make a practice plan for Tuesday, 90 minutes of putting, wedges and some holes'), assistant([...STEPS, { type: 'text', text: 'Here’s the plan.', state: 'done' }, PLAN_PART])];
const brief = (title: string, why: string, questions: Array<[string, string, string[], boolean?]>) => ({
  type: 'data-brief',
  id: 'brief-1',
  data: { title, questions: questions.map(([id, label, options, multi], i) => ({ id, title: label, multi, ...(i === 0 ? { why } : {}), options: options.map((o) => ({ id: o, label: o })) })) },
});
const askPlan = brief('What should Tuesday cover?', 'Pick what fits. Anything you already said is ticked.', [
  ['len', 'How long', ['60 min', '90 min', '2 hours']],
  ['focus', 'Work on', ['Putting', 'Wedges', 'Driving', 'On course'], true],
  ['who', 'Who', ['Everyone', 'Travel squad', 'Pick players']],
]);
const askQual = brief('Two things before I set it', '“Top 5 travel” doesn’t say how many are your picks, and Lonnie Poole has three tees.', [
  ['picks', 'Your picks in the 5', ['None, all by score', '1', '2']],
  ['tees', 'Tees', ['White', 'Blue', 'Black']],
]);

const FOLDERS = [{ name: 'Practice plans', count: 4 }, { name: 'Qualifier prep', count: 2 }, { name: 'Team', count: 7 }];
/** What a signed-in read would have given the panel, per `?qc=`. */
export function seamFor(state: string): QcSeamValue {
  const base: QcSeamValue = {
    planOn: true,
    earlier: { title: 'Moved Team lift to 2:00 PM', line: 'Mon 3 Nov · 11 players told', at: '9:12 AM' },
    week: {
      days: ['02', '03', '04', '05', '06', '07', '08'].map((d, i) => ({ date: `2026-11-${d}`, hasEvent: i % 2 === 1 })),
      items: [{ title: 'Team lift', start: '2026-11-06T14:00:00Z', end: '2026-11-06T14:45:00Z' }],
    },
  };
  if (state.startsWith('undone-') && state !== 'undone-plan') return { ...base, taskPhase: 'undone' };
  const plan = (phase: NonNullable<QcSeamValue['plan']>['phase'], menu?: 'open' | 'new') => ({ ...base, plan: { phase, menu, folders: FOLDERS } });
  if (state === 'confirm-plan') return plan('draft');
  if (state === 'folder') return plan('draft', 'open');
  if (state === 'folder-new') return plan('draft', 'new');
  if (state === 'receipt-plan') return plan('saved');
  if (state === 'told-plan') return plan('told');
  if (state === 'undone-plan') return plan('undone');
  if (state === 'failed-plan') return plan('failed');
  return base;
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
    [`undone-${k}`, { messages: task(k, 'held') }],
  ])),
  cancelled: { messages: task('cal', 'cancelled') },
  asking: { messages: [user('u1', 'Make a practice plan for Tuesday'), assistant([step(1, 'Checked Tuesday · nothing else on the calendar'), askPlan])] },
  'asking-qual': { messages: [user('u1', ASK.qual), assistant([step(1, 'Read the course’s tees'), askQual])] },
  ...Object.fromEntries(['confirm-plan', 'folder', 'folder-new', 'receipt-plan', 'told-plan', 'undone-plan', 'failed-plan'].map((k) => [k, { messages: planThread() }])),
};
