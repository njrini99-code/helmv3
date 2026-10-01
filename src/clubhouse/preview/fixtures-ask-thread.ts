import type { UIMessage } from 'ai';
import type { ActionProposal, ActionReceipt } from '@/lib/coachhelm/v3/chat/action-types';
import type { Measurement, MeasurementSeries, ToolEnvelope } from '@/lib/coachhelm/v3/chat/provenance';
import { describeChatError } from '../data/coachhelm-chat-error';
import type { EvidenceFocus } from '../data/coachhelm-chat-thread';

/**
 * Ask CoachHelm: conversations for the preview (`/clubhouse-preview/coachhelm-ask?state=...`) and the tests. The people, the
 * numbers and the wording are the approved chat mockups' (Jonah Okafor, Eli Brandt, Sofia Alvarez; 38 rounds across 8
 * players; downhill putts from 4 to 6 feet), so the looks can be compared to the boards. Every message is a real AI SDK
 * message whose parts are the ones the stream route writes.
 */

export const ASK_PLAYERS = [
  { id: 'p-jonah', name: 'Jonah Okafor' },
  { id: 'p-eli', name: 'Eli Brandt' },
  { id: 'p-sofia', name: 'Sofia Alvarez' },
  { id: 'p-theo', name: 'Theo Marchetti' },
  { id: 'p-priya', name: 'Priya Natarajan' },
  { id: 'p-ava', name: 'Ava Lindqvist' },
];

const WINDOW = { window_start: '2026-09-01', window_end: '2026-09-29', as_of: '2026-09-29T14:00:00.000Z' };
const who = (id: string, label: string, kind: 'player' | 'team' = 'player') => ({ kind, id, label });

function measurement(over: Partial<Measurement> & Pick<Measurement, 'metric_id' | 'metric_label' | 'entity'>): Measurement {
  return {
    unit: 'percent',
    value: null,
    ...WINDOW,
    sample_size: 0,
    sample_unit: 'attempts',
    coverage: 'complete',
    coverage_note: null,
    source: 'shots',
    method: 'putt make rate',
    denominator: null,
    benchmark: null,
    direction: 'higher_better',
    ...over,
  };
}

function series(over: Partial<MeasurementSeries> & Pick<MeasurementSeries, 'metric_id' | 'metric_label' | 'entity' | 'points'>): MeasurementSeries {
  return { unit: 'percent', ...WINDOW, coverage: 'complete', coverage_note: null, source: 'shots', method: 'putt make rate', benchmark: null, direction: 'higher_better', ...over };
}

const envelope = (over: Partial<ToolEnvelope> & Pick<ToolEnvelope, 'summary'>): ToolEnvelope => ({ measurements: [], series: [], coverage: 'complete', coverage_note: null, as_of: WINDOW.as_of, ...over });

/** Make rate from 4 to 6 feet by slope: a bucket series, drawn as bars with the sample beside each. */
export const ASK_EV_SLOPE = envelope({
  summary: 'Make rate from 4 to 6 feet, by slope',
  series: [
    series({
      metric_id: 'putt_make_rate_4_6ft_by_slope',
      metric_label: 'Make rate from 4 to 6 feet, by slope',
      entity: who('team-1', 'Finley University', 'team'),
      points: [
        { at: '2026-09-29', value: 81, bucket: 'Uphill', sample_size: 44 },
        { at: '2026-09-29', value: 76, bucket: 'Flat', sample_size: 51 },
        { at: '2026-09-29', value: 58, bucket: 'Downhill', sample_size: 31 },
      ],
    }),
  ],
});

/** Three players on one metric: a ranked list. */
export const ASK_EV_RANKING = envelope({
  summary: 'Missed downhill putts from 4 to 6 feet',
  measurements: [
    measurement({ metric_id: 'downhill_putts_missed_4_6ft', metric_label: 'Missed downhill putts from 4 to 6 feet', entity: who('p-jonah', 'Jonah Okafor'), unit: 'count', value: 6, denominator: 9, sample_size: 9, direction: 'lower_better' }),
    measurement({ metric_id: 'downhill_putts_missed_4_6ft', metric_label: 'Missed downhill putts from 4 to 6 feet', entity: who('p-eli', 'Eli Brandt'), unit: 'count', value: 4, denominator: 8, sample_size: 8, direction: 'lower_better' }),
    measurement({ metric_id: 'downhill_putts_missed_4_6ft', metric_label: 'Missed downhill putts from 4 to 6 feet', entity: who('p-sofia', 'Sofia Alvarez'), unit: 'count', value: 2, denominator: 7, sample_size: 7, direction: 'lower_better' }),
  ],
});

/** Jonah's downhill numbers, the team's beside them, and his rounds: what the evidence panel draws. */
export const ASK_EV_JONAH = envelope({
  summary: 'Jonah Okafor, downhill putts from 4 to 6 feet',
  measurements: [
    measurement({ metric_id: 'putt_make_rate_downhill', metric_label: 'Downhill, 4 to 6 feet', entity: who('p-jonah', 'Jonah Okafor'), value: 33, denominator: 9, sample_size: 9 }),
    measurement({ metric_id: 'putt_make_rate_downhill', metric_label: 'Downhill, 4 to 6 feet', entity: who('team-1', 'Finley University', 'team'), value: 58, denominator: 31, sample_size: 31 }),
    measurement({ metric_id: 'putt_make_rate_uphill', metric_label: 'Uphill, 4 to 6 feet', entity: who('p-jonah', 'Jonah Okafor'), value: 78, denominator: 9, sample_size: 9 }),
  ],
  series: [
    series({
      metric_id: 'putt_make_rate_downhill',
      metric_label: 'Make rate by round',
      entity: who('p-jonah', 'Jonah Okafor'),
      points: [
        { at: '2026-09-05', value: 50, bucket: null, sample_size: 2 },
        { at: '2026-09-12', value: 0, bucket: null, sample_size: 1 },
        { at: '2026-09-19', value: 50, bucket: null, sample_size: 2 },
        { at: '2026-09-26', value: 50, bucket: null, sample_size: 2 },
        { at: '2026-09-27', value: 0, bucket: null, sample_size: 2 },
      ],
    }),
  ],
});

/** A read that came back partial: the note says what is missing. */
export const ASK_EV_PARTIAL = envelope({
  summary: 'Putts per round',
  coverage: 'partial',
  coverage_note: '6 of 8 players have a round in the last 30 days. The other 2 are left out.',
  measurements: [measurement({ metric_id: 'putts_per_round', metric_label: 'Putts per round', entity: who('team-1', 'Finley University', 'team'), unit: 'score', value: 31.4, sample_size: 24, sample_unit: 'rounds', direction: 'lower_better', coverage: 'partial' })],
});

/** A read that failed: never "no data". */
export const ASK_EV_FAILED = envelope({ summary: 'Could not read rounds.', coverage: 'unavailable', coverage_note: 'The rounds query failed.' });

export const ASK_EV_EMPTY = envelope({ summary: 'No open signals for Theo Marchetti.', coverage: 'empty', coverage_note: 'No open signals for Theo Marchetti right now.' });

const user = (id: string, text: string): UIMessage => ({ id, role: 'user', parts: [{ type: 'text', text }] }) as unknown as UIMessage;
const assistant = (id: string, parts: unknown[]): UIMessage => ({ id, role: 'assistant', parts }) as unknown as UIMessage;
const step = (n: number, label: string, tool = 'get_team_overview') => ({ type: 'data-progress', id: `progress-${n}`, data: { label, tool } });
const ev = (id: string, e: ToolEnvelope, tool = 'get_player_metrics') => ({ type: 'data-evidence', id: `evidence-${id}`, data: { tool, envelope: e } });
const text = (t: string) => ({ type: 'text', text: t });

export const ASK_PROPOSAL: ActionProposal & { tool: string } = {
  tool: 'create_focus_area',
  action: 'Create focus area',
  summary: 'Give Jonah Okafor a focus area on downhill putts.',
  facts: [
    { label: 'Player', value: 'Jonah Okafor' },
    { label: 'Focus', value: 'Downhill putts, 4 to 6 feet' },
    { label: 'Goal', value: 'Make 7 of 10 in two practices' },
    { label: 'Review on', value: 'Tue, Oct 14' },
  ],
  affects: [{ kind: 'player', id: 'p-jonah', label: 'Jonah Okafor' }],
  notifications: ['Jonah gets a notification and sees the focus area on his Home.'],
  missing: [],
  idempotency_key: 'key-focus-jonah',
};

export const ASK_RECEIPT_DONE: ActionReceipt = {
  status: 'completed',
  action: 'Create focus area',
  summary: 'Created a focus area for Jonah Okafor on downhill putts.',
  created: [{ kind: 'focus area', count: 1, href: '/golf/dashboard/intelligence?view=players' }],
  notifications: [{ channel: 'in-app', recipients: 1, status: 'sent' }],
  partial_failures: [],
  retryable: false,
  at: '2026-09-29T14:05:00.000Z',
};

export const ASK_RECEIPT_FAILED: ActionReceipt = {
  status: 'failed',
  action: 'Create focus area',
  summary: 'The focus area was not created.',
  created: [],
  notifications: [],
  partial_failures: [],
  error: 'Jonah already has an active focus area on downhill putts.',
  retryable: true,
  at: '2026-09-29T14:05:00.000Z',
};

export const ASK_RECEIPT_PARTIAL: ActionReceipt = {
  status: 'partial',
  action: 'Create recurring practice',
  summary: 'Created 6 of 8 practices.',
  created: [{ kind: 'practice', count: 6, href: '/golf/dashboard/calendar' }],
  notifications: [{ channel: 'push', recipients: 8, status: 'queued' }],
  partial_failures: ['Oct 28 and Nov 4 could not be added.'],
  retryable: true,
  at: '2026-09-29T14:05:00.000Z',
};

const Q1 = 'Why are we missing so many short putts lately?';

/** The answer board: steps, the slope bars, a ranking, prose, follow-ups. */
export const ASK_MSGS_ANSWER: UIMessage[] = [
  user('u1', Q1),
  assistant('a1', [
    step(1, 'Reading your roster'),
    step(2, 'Reading the last 38 recorded rounds', 'get_recent_rounds'),
    step(3, 'Comparing putting by distance', 'get_putting_distance_profile'),
    step(4, 'Ranking the team', 'get_team_metric_ranking'),
    text('Most of it is **downhill putts from 4 to 6 feet**. The team makes 58% of those, against 81% uphill from the same distance. Flat putts in that range look normal, so this is a slope problem more than a stroke problem.'),
    ev('slope', ASK_EV_SLOPE, 'get_putting_distance_profile'),
    text('Three players account for most of the downhill misses:'),
    ev('ranking', ASK_EV_RANKING, 'get_team_metric_ranking'),
    text("For this week, I'd put a downhill ladder drill into Thursday's practice and give Jonah Okafor a focus area, so he sees it before his next round."),
    ev('jonah', ASK_EV_JONAH, 'get_player_metrics'),
  ]),
];

/** Working: two steps announced, nothing answered yet. */
export const ASK_MSGS_WORKING: UIMessage[] = [user('u1', Q1), assistant('a1', [step(1, 'Reading your roster'), step(2, 'Reading the last 38 recorded rounds', 'get_recent_rounds'), step(3, 'Comparing putting by distance', 'get_putting_distance_profile')])];

/** Asked, and no token yet. */
export const ASK_MSGS_THINKING: UIMessage[] = [user('u1', Q1)];

const approval = (state: 'approval-requested' | 'approval-responded', approved?: boolean, id = 'approval-1') => ({
  type: 'tool-create_focus_area',
  toolCallId: 'call-1',
  state,
  input: { player_id: 'p-jonah', title: 'Downhill putts, 4 to 6 feet' },
  approval: approved === undefined ? { id } : { id, approved },
});
const PROPOSE = 'Create a focus area for @Jonah Okafor on downhill putts';
const proposalTurn = (parts: unknown[]) => assistant('a2', [step(5, 'Drafting a focus area', 'create_focus_area'), approvalPart(parts), { type: 'data-action-proposal', id: `proposal-${ASK_PROPOSAL.idempotency_key}`, data: ASK_PROPOSAL }, text('Here it is. Nothing is created until you confirm. His numbers are on the right.'), ...parts.slice(1)]);
function approvalPart(parts: unknown[]) {
  return parts[0];
}

/** A focus-area proposal waiting for Confirm: the answer before it carries Jonah's evidence. */
export const ASK_MSGS_ACTION: UIMessage[] = [...ASK_MSGS_ANSWER, user('u2', PROPOSE), proposalTurn([approval('approval-requested')])];

/** Confirmed, the receipt not back yet. */
export const ASK_MSGS_CONFIRMED: UIMessage[] = [...ASK_MSGS_ANSWER, user('u2', PROPOSE), proposalTurn([approval('approval-responded', true)])];

/** Cancelled: nothing was created. */
export const ASK_MSGS_CANCELLED: UIMessage[] = [...ASK_MSGS_ANSWER, user('u2', PROPOSE), proposalTurn([approval('approval-responded', false)])];

/** Created: the receipt with its link. */
export const ASK_MSGS_RECEIPT: UIMessage[] = [...ASK_MSGS_ANSWER, user('u2', PROPOSE), proposalTurn([approval('approval-responded', true), { type: 'data-action-receipt', id: `receipt-${ASK_PROPOSAL.idempotency_key}`, data: ASK_RECEIPT_DONE }])];

/** Not created: the reason, and Ask again. */
export const ASK_MSGS_RECEIPT_FAILED: UIMessage[] = [...ASK_MSGS_ANSWER, user('u2', PROPOSE), proposalTurn([approval('approval-responded', true), { type: 'data-action-receipt', id: `receipt-${ASK_PROPOSAL.idempotency_key}`, data: ASK_RECEIPT_FAILED }])];

/** A proposal in a turn the conversation has moved past: no live buttons. */
export const ASK_MSGS_ABANDONED: UIMessage[] = [...ASK_MSGS_ACTION, user('u3', 'What is on this week?'), assistant('a3', [text('Practice on Thursday at 3:00 PM and the qualifier on Oct 6.')])];

/** The checks rejected the answer: one note, and the card stays. */
export const ASK_MSGS_REJECTED: UIMessage[] = [
  user('u1', PROPOSE),
  assistant('a1', [
    text('Jonah makes 41% of downhill putts.'),
    ev('x', ASK_EV_SLOPE),
    { type: 'data-grounding-flag', id: 'flag-1', data: { note: "This answer didn't finish coming through, so it isn't being shown. Please ask again." } },
    approval('approval-requested'),
    { type: 'data-action-proposal', id: `proposal-${ASK_PROPOSAL.idempotency_key}`, data: ASK_PROPOSAL },
  ]),
];

/** A read tool failed, then the answer says so. */
export const ASK_MSGS_READFAIL: UIMessage[] = [user('u1', 'How is the team putting?'), assistant('a1', [step(1, 'Reading the last 38 recorded rounds', 'get_recent_rounds'), ev('fail', ASK_EV_FAILED, 'get_recent_rounds'), text('I could not read your rounds just now, so I have no putting numbers to give you.')])];

/** A partial read: the note stays on the figure. */
export const ASK_MSGS_PARTIAL: UIMessage[] = [user('u1', 'How many putts per round are we taking?'), assistant('a1', [step(1, 'Reading recorded statistics', 'get_player_metrics'), text('The team averages **31.4 putts per round**.'), ev('partial', ASK_EV_PARTIAL)])];

/** A long thread: five exchanges. */
export const ASK_MSGS_LONG: UIMessage[] = [
  ...ASK_MSGS_ANSWER,
  user('u2', 'Who is trending up this month?'),
  assistant('a2', [text('Theo Marchetti has three rounds under 72 in a row. **Approach play** is the main lift.')]),
  user('u3', 'What is on this week?'),
  assistant('a3', [text('Practice on Thursday at 3:00 PM and the qualifier on Oct 6.\n\n- Priya Natarajan has not replied\n- Ava Lindqvist has not replied')]),
  user('u4', 'Compare Jonah and Eli on putting'),
  assistant('a4', [text('Jonah Okafor and Eli Brandt both struggle on the downhill putts, Jonah more.')]),
  user('u5', 'Thanks'),
  assistant('a5', [text('Anytime.')]),
];

export const ASK_FOCUS_JONAH: EvidenceFocus = { messageId: 'a2', key: ASK_PROPOSAL.idempotency_key, label: 'Jonah Okafor, downhill putts, 4 to 6 feet', playerId: 'p-jonah' };

/** The sentences a failed answer shows (describeChatError on what the route sends). */
export const ASK_ERRORS = {
  rate: describeChatError({ statusCode: 429, responseBody: JSON.stringify({ error: 'Too many requests. Please slow down.' }) }),
  budget: describeChatError({ statusCode: 429, responseBody: JSON.stringify({ error: 'You have reached today’s analysis limit for your program. It resets tomorrow.', reason: 'gated' }) }),
  gone: describeChatError({ statusCode: 404, responseBody: JSON.stringify({ error: 'Conversation not found' }) }),
  fault: describeChatError(new Error('AI features are unavailable: the Anthropic account is out of credit. Retrying will not help until it is topped up.')),
  generic: describeChatError({ statusCode: 500, responseBody: '{"error":"Internal error"}' }),
};

/** A thread by preview state name (`?state=`). */
export const ASK_THREAD_STATES: Record<string, { messages: UIMessage[]; busy?: boolean; error?: keyof typeof ASK_ERRORS; focus?: EvidenceFocus }> = {
  answer: { messages: ASK_MSGS_ANSWER },
  thinking: { messages: ASK_MSGS_THINKING, busy: true },
  working: { messages: ASK_MSGS_WORKING, busy: true },
  action: { messages: ASK_MSGS_ACTION, focus: ASK_FOCUS_JONAH },
  confirmed: { messages: ASK_MSGS_CONFIRMED },
  cancelled: { messages: ASK_MSGS_CANCELLED },
  receipt: { messages: ASK_MSGS_RECEIPT },
  receiptfailed: { messages: ASK_MSGS_RECEIPT_FAILED },
  abandoned: { messages: ASK_MSGS_ABANDONED },
  rejected: { messages: ASK_MSGS_REJECTED },
  readfail: { messages: ASK_MSGS_READFAIL },
  partial: { messages: ASK_MSGS_PARTIAL },
  long: { messages: ASK_MSGS_LONG },
  error: { messages: [user('u1', 'Who should play the qualifier on Oct 6?')], error: 'rate' },
  errorfault: { messages: [user('u1', 'Who should play the qualifier on Oct 6?')], error: 'fault' },
  errorbudget: { messages: [user('u1', 'Who should play the qualifier on Oct 6?')], error: 'budget' },
  errorgone: { messages: ASK_MSGS_ANSWER, error: 'gone' },
};
