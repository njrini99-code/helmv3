/**
 * The scripted-turn harness (docs/clubhouse/coachhelm-chat-v3/SPEC.md, "Process" step 3).
 *
 * A fixture player for the previews: it replays real protocol events (`engine/protocol.ts`) at a chosen pace through the
 * REAL hook. Nothing is faked above the network: `installScriptedChat` answers the hook's own `fetch` to a preview-only
 * endpoint with a server-sent event stream, so `useCoachHelmChat`, its parser and `applyChatEvent` all run as they do
 * in production. No sign-in, no model call, no request leaves the page.
 *
 * It also answers the three calls a task card makes about a held write (`/api/coachhelm/v3/chat/actions/<key>`: GET the
 * outcome, DELETE to undo, POST `?now=1` to save now), so the 8 seconds, Undo and the commit can be watched end to end.
 */
import { encodeChatEvent, eventForPart, type ChatEvent, type ChatUIPart, type WireDataPart } from '@/lib/coachhelm/v3/chat/engine/protocol';
import type { ActionProposal, ActionReceipt } from '@/lib/coachhelm/v3/chat/action-types';
import {
  ASK_COMPOSITION,
  ASK_EV_EMPTY,
  ASK_EV_JONAH,
  ASK_EV_JONAH_SG,
  ASK_EV_JONAH_TREND,
  ASK_EV_RANKING,
  ASK_EV_SLOPE,
  ASK_PROPOSAL,
  ASK_RECEIPT_DONE,
  ASK_RECEIPT_FAILED,
} from './fixtures-ask-thread';

/** The endpoint the preview's hook posts to. Nothing serves it: the harness answers it in the page. */
export const SCRIPTED_CHAT_ENDPOINT = '/__preview/coachhelm/chat/stream';
const ACTIONS_PATH = '/api/coachhelm/v3/chat/actions/';

/** `fast`: a quick answer on a good connection. `real`: what Claude Haiku 5.5 at high effort typically does. `worst`: a slow first word, slow reads, text in uneven bursts. */
export type AskPace = 'fast' | 'real' | 'worst';

type Lazy<T> = T | (() => T);
interface Timed {
  /** Milliseconds after the request arrived. */
  at: number;
  event: Lazy<ChatEvent>;
}
/** How a response ends: with its events, by dropping the connection, or refused before any stream. */
type Ending = { kind: 'events' } | { kind: 'cut' } | { kind: 'refuse'; status: number; body: string };

interface Flow {
  events: Timed[];
  ending?: Ending;
}

export interface AskScript {
  /** What the coach asks. */
  question: string;
  turn: Flow;
  /** The response to Confirm and to Cancel, for a script that proposes a task. */
  confirm?: Flow;
  cancel?: Flow;
  /** How the held write ends: saved (default), failed, or saved late (the result takes 1.6 s after the hold). */
  commit?: 'saved' | 'failed' | 'slow';
  /** The first attempt's ending, when a retry is to succeed: the script's `turn` is what the retry gets. */
  firstAttempt?: Flow;
}

const PACE = {
  fast: { connect: 90, think: 110, read: [140, 200, 170], gap: 10, words: [3, 6], pauseEvery: 0, pause: 0, tool: 160 },
  real: { connect: 420, think: 520, read: [620, 940, 760], gap: 26, words: [1, 4], pauseEvery: 3, pause: 260, tool: 520 },
  worst: { connect: 2600, think: 2400, read: [2600, 5200, 3900], gap: 60, words: [6, 22], pauseEvery: 1, pause: 1400, tool: 2200 },
} as const;

/** A small deterministic generator, so a script plays the same way every time it is captured. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type ReadSpec = { id: string; label: string; tool?: string; detail?: string; failed?: boolean; ev?: { id: string; ref?: string; tool?: string; envelope: unknown } };
type StepSubject = { kind: 'player' | 'team' | 'round' | 'event' | 'qualifier' | 'tournament' | 'plan' | 'document'; id: string; label: string };
/**
 * One step of the activity island, in the shape asked of the engine (SPEC, Requests): a `data-progress` part whose data names
 * the step's state and what it touches. `from`, `to` and `queued` are offsets from the beat's start, in units of the pace's
 * read time: `queued` is when the server first knows the step is coming (it is `waiting` until `from`).
 */
type StepSpec = {
  id: string;
  label: string;
  done?: string;
  tool?: string;
  kind?: 'read' | 'find' | 'compare' | 'calculate' | 'visual' | 'draft' | 'check';
  parent?: string;
  from: number;
  to: number;
  queued?: number;
  failed?: boolean;
  detail?: string;
  covers?: { n: number; of: number; unit: string };
  /** A tally that grows while the step runs. */
  count?: { unit: string; to: number };
  /** Join one by one while the step runs. */
  subjects?: StepSubject[];
  ev?: { id: string; ref: string; tool?: string; envelope: unknown; via?: 'code' };
};
type Beat =
  | { kind: 'reads'; reads: ReadSpec[] }
  | { kind: 'work'; steps: StepSpec[] }
  | { kind: 'text'; text: string }
  | { kind: 'part'; part: WireDataPart; wait?: 'tool' }
  | { kind: 'discard' }
  | { kind: 'decision'; key: string; tool: string }
  | { kind: 'error'; message: string; action: 'retry' | 'new-chat' | 'none' }
  | { kind: 'wait'; ms: number };

/** Lay beats out on a clock at a pace. Reads in one beat start together and finish at their own times; text arrives in bursts with pauses at sentence ends. */
function timeline(pace: AskPace, beats: Beat[], opts: { status?: 'complete' | 'awaiting_decision' | 'failed'; resumed?: boolean; noStart?: boolean } = {}): Timed[] {
  const p = PACE[pace];
  const out: Timed[] = [];
  let t = p.connect;
  if (!opts.noStart) out.push({ at: t, event: { type: 'message_start', conversation_id: 'c-scripted', message_id: `a-${pace}-${beats.length}-${Date.now() % 100000}`, resumed: !!opts.resumed } });
  t += p.think;
  for (const beat of beats) {
    if (beat.kind === 'wait') {
      t += beat.ms;
    } else if (beat.kind === 'reads') {
      let end = t;
      beat.reads.forEach((r, i) => {
        const tool = r.tool ?? 'get_player_metrics';
        const done = t + (p.read[i % p.read.length] ?? p.read[0]);
        out.push({ at: t + i * 6, event: { type: 'read_started', id: r.id, label: r.label, tool } });
        out.push({ at: done, event: { type: 'read_finished', id: r.id, label: r.label, tool, state: r.failed ? 'failed' : 'done', ...(r.detail ? { detail: r.detail } : {}) } });
        if (r.ev) out.push({ at: done + 1, event: eventForPart({ type: 'data-evidence', id: `evidence-${r.ev.id}`, data: { tool: r.ev.tool ?? tool, envelope: r.ev.envelope, ...(r.ev.ref ? { ref: r.ev.ref } : {}) } }) });
        end = Math.max(end, done);
      });
      t = end + p.think;
    } else if (beat.kind === 'work') {
      const unit = p.read[0];
      let end = t;
      for (const step of beat.steps) {
        const tool = step.tool ?? 'get_player_metrics';
        const base = { label: step.label, tool, ...(step.kind ? { kind: step.kind } : {}), ...(step.parent ? { parent_id: step.parent } : {}) };
        const start = t + Math.round(step.from * unit);
        const done = t + Math.round(step.to * unit);
        // The step's own clock is the wall's, read when each event is sent, as the server's would be.
        const clock: { started?: string } = {};
        const progress = (at: number, data: () => Record<string, unknown>) => out.push({ at, event: () => eventForPart({ type: 'data-progress', id: step.id, data: { ...base, ...data() } }) });
        if (step.queued !== undefined) progress(t + Math.round(step.queued * unit), () => ({ state: 'waiting' }));
        progress(start, () => ({ state: 'active', started_at: (clock.started = new Date().toISOString()), ...(step.count ? { count: { n: 0, unit: step.count.unit, more: true } } : {}) }));
        const ticks = Math.max(step.subjects?.length ?? 0, step.count ? 6 : 0);
        for (let k = 1; k <= ticks; k += 1) {
          progress(start + Math.round(((done - start) * k) / (ticks + 1)), () => ({
            state: 'active',
            started_at: clock.started,
            ...(step.subjects ? { subjects: step.subjects.slice(0, Math.ceil((step.subjects.length * k) / ticks)) } : {}),
            ...(step.count ? { count: { n: Math.round((step.count.to * k) / (ticks + 1)), unit: step.count.unit, more: true } } : {}),
          }));
        }
        progress(done, () => ({
          state: step.failed ? 'failed' : 'done',
          started_at: clock.started,
          ended_at: new Date().toISOString(),
          ...(step.done ? { done_label: step.done } : {}),
          ...(step.detail ? { detail: step.detail } : {}),
          ...(step.covers ? { covers: step.covers } : {}),
          ...(step.subjects ? { subjects: step.subjects } : {}),
          ...(step.count ? { count: { n: step.count.to, unit: step.count.unit, more: false } } : {}),
          ...(step.ev && !step.failed ? { evidence_ref: step.ev.ref } : {}),
        }));
        if (step.ev && !step.failed) out.push({ at: done + 1, event: eventForPart({ type: 'data-evidence', id: `evidence-${step.ev.id}`, data: { tool: step.ev.tool ?? tool, envelope: step.ev.envelope, ref: step.ev.ref, ...(step.ev.via ? { via: step.ev.via } : {}) } }) });
        end = Math.max(end, done);
      }
      t = end + p.think;
    } else if (beat.kind === 'text') {
      const next = rng(beat.text.length * 31 + pace.length);
      const words = beat.text.split(/(?<=\s)/);
      let sentences = 0;
      for (let i = 0; i < words.length; ) {
        const n = Math.max(1, Math.round(p.words[0] + next() * (p.words[1] - p.words[0])));
        const delta = words.slice(i, i + n).join('');
        i += n;
        out.push({ at: t, event: { type: 'text_delta', delta } });
        t += p.gap + Math.round(next() * p.gap);
        if (/[.?!]\s*$/.test(delta) && p.pauseEvery && ++sentences % p.pauseEvery === 0) t += p.pause;
      }
    } else if (beat.kind === 'part') {
      if (beat.wait === 'tool') t += p.tool;
      out.push({ at: t, event: eventForPart(beat.part) });
      t += 30;
    } else if (beat.kind === 'discard') {
      out.push({ at: t, event: { type: 'text_discard' } });
      t += p.think;
    } else if (beat.kind === 'decision') {
      out.push({ at: t, event: { type: 'decision_needed', key: beat.key, tool: beat.tool, tool_use_id: `toolu_${beat.key}` } });
      t += 20;
    } else if (beat.kind === 'error') {
      out.push({ at: t, event: { type: 'error', message: beat.message, action: beat.action } });
      t += 10;
    }
  }
  out.push({ at: t + 40, event: { type: 'usage', input_tokens: 4200, output_tokens: 310, cache_read_input_tokens: 3900 } });
  out.push({ at: t + 60, event: { type: 'done', status: opts.status ?? 'complete' } });
  return out.sort((a, b) => a.at - b.at);
}

const proposalPart = (p: ActionProposal & { tool: string }): WireDataPart => ({ type: 'data-action-proposal', id: `proposal-${p.idempotency_key}`, data: p });
const receiptPart = (key: string, r: ActionReceipt): WireDataPart => ({ type: 'data-action-receipt', id: `receipt-${key}`, data: r });

/** The server's hold: 8 seconds from the moment the Confirm is answered. */
export const SCRIPTED_HOLD_MS = 8000;

const LONG = [
  'Short version: the team is losing most of its strokes on the greens from 4 to 8 feet, and it is concentrated in three players.',
  'Over the last 30 days the team made 58% from 4 to 6 feet on downhill putts, against 78% on level ones [e1]. That gap is wider than it was across the season, and it accounts for close to a stroke a round for the players who see the most of those putts.',
  '**Jonah Okafor** is the clearest case. He made 3 of 9 downhill from that range [e2], and his misses were mostly low side, which usually means pace rather than line. **Theo Marchetti** and **Eli Brandt** are closer to the team rate but each had a round where they three-putted four times.',
  'What I would not read too much into: the sample from 6 to 8 feet is small, 24 attempts across the whole team, so one good day moves it a lot. Inside 3 feet the team is level with its season, and outside 10 feet lag putting has actually improved.',
  'If you want to act on it this week, I would do three things.',
  '1. Put a downhill ladder into Thursday: three balls from 4, 5 and 6 feet on the slope behind the practice green, and nobody moves back until all three drop.\n2. Give Jonah a focus area on downhill pace, with a goal he can check himself, such as 7 of 10 over two practices.\n3. Look again after the Hilltop rounds. Two more rounds is enough to tell whether the gap is closing.',
  'On the rest of the game there is nothing new to flag. Approach is steady, driving is a little better than last month, and scrambling moved with putting, which is what you would expect when the short ones are not going in.',
  'One caution on the comparison with last fall: the team played two of its hardest sets of greens in this window, and I have not adjusted for that. Hilltop in particular has more slope inside 6 feet than anywhere else on the schedule, so some of this is the course and not the stroke.',
  'If it helps, I can break this down by player, show the make rate by distance as a chart, or draft the Thursday block so you can drop it into the practice plan.',
].join('\n\n');

function scripts(pace: AskPace): Record<string, AskScript> {
  const q = 'How is Jonah doing, and where is he losing strokes?';
  const jonahReads: ReadSpec[] = [
    { id: 'r1', label: 'Reading Jonah’s strokes gained', detail: '8 rounds', ev: { id: 'sg', ref: 'e1', envelope: ASK_EV_JONAH_SG } },
    { id: 'r2', label: 'Reading his last 7 rounds', tool: 'get_player_trend', detail: '7 rounds', ev: { id: 'trend', ref: 'e2', tool: 'get_player_trend', envelope: ASK_EV_JONAH_TREND } },
    { id: 'r3', label: 'Checking the CoachHelm board', tool: 'get_player_insights', detail: 'Approach is his open read' },
  ];
  const visual: Beat[] = [
    { kind: 'reads', reads: [{ id: 'r4', label: 'Drawing where he gains and loses', tool: 'show_visual' }] },
    { kind: 'part', part: { type: 'data-visual-composition', id: 'visual-vc-preview0001', data: ASK_COMPOSITION } },
  ];
  const lead = 'Jonah’s scoring is trending the right way [e2], but **approach** is still costing him close to a stroke a round [e1].';
  const rest = 'Putting is the only other leg below zero, and it is small. I would put the next two practices on approach shots from 125 to 175 yards before touching his putting.';

  const key = ASK_PROPOSAL.idempotency_key;
  const taskTurn = timeline(
    pace,
    [
      { kind: 'reads', reads: [{ id: 't1', label: 'Reading Jonah’s putting', detail: '9 putts, 4 to 6 feet', ev: { id: 'slope', ref: 'e1', envelope: ASK_EV_JONAH } }] },
      { kind: 'text', text: 'Here is a focus area for Jonah on downhill putts. Check it and confirm when it reads right.' },
      { kind: 'reads', reads: [{ id: 't2', label: 'Drafting the focus area', tool: 'create_focus_area' }] },
      { kind: 'part', part: proposalPart(ASK_PROPOSAL) },
      { kind: 'decision', key, tool: 'create_focus_area' },
    ],
    { status: 'awaiting_decision' },
  );
  const held = (): ChatEvent => eventForPart(receiptPart(key, { status: 'held', held_until: new Date(Date.now() + SCRIPTED_HOLD_MS).toISOString(), action: ASK_PROPOSAL.action, summary: ASK_PROPOSAL.summary, created: [], notifications: [], partial_failures: [], retryable: false, at: new Date().toISOString() }));
  const p = PACE[pace];
  const confirm: Timed[] = [
    { at: p.connect, event: { type: 'message_start', conversation_id: 'c-scripted', message_id: 'a-resumed', resumed: true } },
    { at: p.connect + 10, event: { type: 'decision', key, approved: true } },
    { at: p.connect + p.tool, event: held },
    ...timeline(pace, [{ kind: 'wait', ms: p.tool }, { kind: 'text', text: 'It is held for a few seconds in case you want to undo it. After that Jonah will see it on his Home.' }], { noStart: true }),
  ];
  const cancel: Timed[] = [
    { at: p.connect, event: { type: 'message_start', conversation_id: 'c-scripted', message_id: 'a-resumed', resumed: true } },
    { at: p.connect + 10, event: { type: 'decision', key, approved: false } },
    ...timeline(pace, [{ kind: 'text', text: 'No problem. Nothing was created.' }], { noStart: true }),
  ];
  const task: AskScript = { question: 'Create a focus area for @Jonah Okafor on downhill putts', turn: { events: taskTurn }, confirm: { events: confirm }, cancel: { events: cancel } };

  // The activity island's states (SPEC Moment 4). Every row and every change on screen is one of these events.
  const face = (id: string, label: string): StepSubject => ({ kind: 'player', id, label });
  const jonahFace = face('p-jonah', 'Jonah Okafor');
  const squad: StepSubject[] = [
    jonahFace,
    face('p-eli', 'Eli Brandt'),
    face('p-sofia', 'Sofia Alvarez'),
    face('p-theo', 'Theo Marchetti'),
    face('p-priya', 'Priya Natarajan'),
    face('p-ava', 'Ava Lindqvist'),
    face('p-noah', 'Noah Castellano'),
    face('p-ines', 'Ines Varga'),
    face('p-marcus', 'Marcus Bell'),
    face('p-hana', 'Hana Sato'),
    face('p-luca', 'Luca Ferrand'),
    face('p-dara', 'Dara Okoye'),
  ];
  const three: StepSpec[] = [
    { id: 's1', label: 'Reading Jonah’s strokes gained', kind: 'read', from: 0, to: 1.1, subjects: [jonahFace], count: { unit: 'rounds', to: 8 }, ev: { id: 'sg', ref: 'e1', envelope: ASK_EV_JONAH_SG } },
    { id: 's2', label: 'Reading his last 7 rounds', tool: 'get_player_trend', kind: 'read', from: 0.01, to: 1.6, count: { unit: 'rounds', to: 7 }, ev: { id: 'trend', ref: 'e2', tool: 'get_player_trend', envelope: ASK_EV_JONAH_TREND } },
    { id: 's3', label: 'Checking the CoachHelm board', tool: 'get_player_insights', kind: 'check', from: 0.02, to: 1.3, detail: 'Approach is his open read' },
  ];
  const teamSteps: StepSpec[] = [
    { id: 'c0', label: 'Working it out', done: 'Worked it out', tool: 'code_execution', kind: 'calculate', from: 0, to: 6.4, covers: { n: 12, of: 12, unit: 'players' } },
    { id: 'c1', label: 'Reading the roster', done: 'Read the roster', tool: 'get_team_overview', kind: 'read', parent: 'c0', from: 0.3, to: 1, detail: '12 active players' },
    { id: 'c2', label: 'Reading every player’s rounds', done: 'Read every player’s rounds', tool: 'get_player_metrics', kind: 'read', parent: 'c0', from: 1.1, to: 4.4, subjects: squad, count: { unit: 'rounds', to: 96 }, ev: { id: 'slope', ref: 'e1', envelope: ASK_EV_SLOPE, via: 'code' } },
    { id: 'c3', label: 'Comparing strokes gained by player', done: 'Compared strokes gained by player', tool: 'compare_players', kind: 'compare', parent: 'c0', from: 4.5, to: 5.6, detail: '12 players, 4 parts of the game', ev: { id: 'rank', ref: 'e2', tool: 'get_team_metric_ranking', envelope: ASK_EV_RANKING, via: 'code' } },
  ];
  const teamAnswer = 'Across all twelve players the team gives up the most on approach: 1.4 strokes a round against the field, and nine of the twelve are below zero there. Putting is next at 0.6, and it is three players who account for most of it. Driving and short game are both within a tenth of level.\n\nThe spread matters more than the average. The best four on approach are close to level; the bottom four lose more than two strokes a round between them and the middle of the roster. If practice time is limited, that group is where it buys the most.';
  const queued: StepSpec[] = [
    { id: 'q1', label: 'Reading the roster', tool: 'get_team_overview', kind: 'read', from: 0, to: 0.9, detail: '7 active players' },
    { id: 'q2', label: 'Reading practice reviews', tool: 'get_practice', kind: 'read', queued: 0, from: 0.9, to: 2.2, failed: true, detail: 'It didn’t come back. The answer goes on without it.' },
    { id: 'q3', label: 'Reading last week’s rounds', tool: 'get_player_trend', kind: 'read', queued: 0, from: 2.2, to: 3.3, count: { unit: 'rounds', to: 14 }, ev: { id: 'slope', ref: 'e1', envelope: ASK_EV_SLOPE } },
  ];

  const partial = timeline(pace, [{ kind: 'reads', reads: jonahReads.slice(0, 2) }, { kind: 'text', text: 'Jonah’s scoring is trending the right way [e2], but **approach** is still costing' }]);
  const refuse = (status: number, body: object): Flow => ({ events: [], ending: { kind: 'refuse', status, body: JSON.stringify(body) } });

  return {
    /** A plain answer with no reads: the fast path. Nothing but the mark may show before the words. */
    quick: { question: 'What does strokes gained approach measure?', turn: { events: timeline(pace, [{ kind: 'text', text: 'It compares every approach shot with what a scratch golfer averages from the same distance and lie. Positive means the shot left the player closer to holing out than the baseline expects; negative means it cost them. Shots from inside 30 yards are counted as short game, not approach.' }]) } },
    /** Three reads at once, chips in the sentences, a drawn visual, then the rest: the main demo. */
    jonah: { question: q, turn: { events: timeline(pace, [{ kind: 'reads', reads: jonahReads }, { kind: 'text', text: lead }, ...visual, { kind: 'text', text: rest }]) } },
    /** About 600 words: the measured streaming case. */
    long: {
      question: 'Give me the full picture on our putting this month.',
      turn: {
        events: timeline(pace, [
          { kind: 'reads', reads: [{ id: 'l1', label: 'Reading putts from the last 30 days', detail: '38 rounds · 1,412 putts', ev: { id: 'slope', ref: 'e1', envelope: ASK_EV_SLOPE } }, { id: 'l2', label: 'Finding who the misses come from', detail: 'Per player, 4 to 6 feet', ev: { id: 'jonah', ref: 'e2', envelope: ASK_EV_JONAH } }] },
          { kind: 'text', text: LONG },
        ]),
      },
    },
    /** Words first, then a read in the middle of the answer: the list must not open and the text must not move. */
    late: { question: 'Is Theo ready for the qualifier?', turn: { events: timeline(pace, [{ kind: 'text', text: 'On form, yes. Let me check where he stands in the ranking before I say more.' }, { kind: 'reads', reads: [{ id: 'm1', label: 'Reading the team ranking', tool: 'get_team_metric_ranking', detail: '7 players', ev: { id: 'rank', ref: 'e1', tool: 'get_team_metric_ranking', envelope: ASK_EV_RANKING } }] }, { kind: 'text', text: 'He is second on the team in make rate from 4 to 6 feet [e1], and his last three rounds were all under 72.' }]) } },
    /** One read fails and the answer goes on. */
    readfail: { question: 'How did practice go last week?', turn: { events: timeline(pace, [{ kind: 'reads', reads: [{ id: 'f1', label: 'Reading the roster', tool: 'get_team_overview', detail: '7 active players' }, { id: 'f2', label: 'Reading practice reviews', tool: 'get_practice', failed: true }] }, { kind: 'text', text: 'I could not read the practice reviews just now, so I can only tell you who was on the roster for it. Ask again in a moment and I will include what the players logged.' }]) } },
    /** A read that comes back empty. */
    empty: { question: 'Any open reads on Theo?', turn: { events: timeline(pace, [{ kind: 'reads', reads: [{ id: 'e1r', label: 'Checking the CoachHelm board', tool: 'get_player_insights', detail: 'Nothing open', ev: { id: 'empty', ref: 'e1', tool: 'get_player_insights', envelope: ASK_EV_EMPTY } }] }, { kind: 'text', text: 'Nothing is open on Theo right now [e1]. His last read was cleared after Hilltop.' }]) } },
    /** The model takes back the words of the step in progress. */
    discard: { question: q, turn: { events: timeline(pace, [{ kind: 'text', text: 'Jonah is the best putter on the' }, { kind: 'discard' }, { kind: 'reads', reads: jonahReads.slice(0, 2) }, { kind: 'text', text: lead }]) } },
    /** A task through Confirm, the 8 seconds and the save. */
    task,
    taskfail: { ...task, commit: 'failed' },
    taskslow: { ...task, commit: 'slow' },
    /** The Confirm's response is lost. */
    tasklost: { ...task, confirm: { events: [], ending: { kind: 'cut' } } },
    /** The connection drops part way through the answer. */
    lost: { question: q, turn: { events: partial.slice(0, -2), ending: { kind: 'cut' } } },
    /** The same, and Try again then succeeds. */
    retry: { question: q, firstAttempt: { events: partial.slice(0, -2), ending: { kind: 'cut' } }, turn: { events: timeline(pace, [{ kind: 'reads', reads: jonahReads }, { kind: 'text', text: lead + ' ' + rest }]) } },
    /** The model fails mid-answer: what arrived stays. */
    model: { question: q, turn: { events: timeline(pace, [{ kind: 'reads', reads: jonahReads.slice(0, 2) }, { kind: 'text', text: 'Jonah’s scoring is trending the right way [e2], but' }, { kind: 'error', message: 'Something went wrong while answering. What arrived is above.', action: 'retry' }], { status: 'failed' }) } },
    /** The model declines. */
    declined: { question: 'Write Jonah’s scholarship appeal for him.', turn: { events: timeline(pace, [{ kind: 'error', message: 'CoachHelm can’t help with that one. Try asking it another way.', action: 'none' }], { status: 'failed' }) } },
    /** The answer ran out of room. */
    truncated: { question: 'List every round this season, hole by hole.', turn: { events: timeline(pace, [{ kind: 'text', text: 'Starting with the first event of the fall. Round 1 at Hilltop: Jonah 74, Theo 71, Eli 76,' }, { kind: 'error', message: 'That answer ran too long to finish. Ask for a smaller piece of it.', action: 'none' }], { status: 'failed' }) } },
    budget: { question: q, turn: refuse(429, { error: 'Your team has reached today’s CoachHelm limit. It resets at midnight.', reason: 'team_daily_budget' }) },
    off: { question: q, turn: refuse(403, { error: 'CoachHelm is not enabled for this team' }) },
    rate: { question: q, turn: refuse(429, { error: 'Too many requests' }) },
    gone: { question: q, turn: refuse(404, { error: 'Conversation not found' }) },
    signedout: { question: q, turn: refuse(401, { error: 'Not signed in' }) },
    /** The island, one read that takes a while: it appears after a beat, as one line, and never opens by itself. */
    'isl-one': { question: 'How many rounds has Jonah logged this fall?', turn: { events: timeline(pace, [{ kind: 'work', steps: [{ id: 'o1', label: 'Reading Jonah’s rounds', kind: 'read', from: 0, to: 2.4, subjects: [jonahFace], count: { unit: 'rounds', to: 18 }, ev: { id: 'trend', ref: 'e1', tool: 'get_player_trend', envelope: ASK_EV_JONAH_TREND } }] }, { kind: 'text', text: 'Eighteen, eleven of them in events [e1]. That is the most on the team this fall.' }]) } },
    /** The island, three reads at once: it opens by itself while the page is empty and folds at the first word. */
    'isl-three': { question: q, turn: { events: timeline(pace, [{ kind: 'work', steps: three }, { kind: 'text', text: lead + ' ' + rest }]) } },
    /** The island, a whole-team calculation: twelve faces join one by one, the tally runs, the reads sit under the calculation. No markers in the answer: it shows its work in the island and under "Worked out from". */
    'isl-team': { question: 'Across the whole team, where are we losing the most strokes?', turn: { events: timeline(pace, [{ kind: 'work', steps: teamSteps }, { kind: 'text', text: teamAnswer }]) } },
    /** The island, steps the server already knows are coming wait their turn; one fails while the others finish. */
    'isl-fail': { question: 'How did practice go last week?', turn: { events: timeline(pace, [{ kind: 'work', steps: queued }, { kind: 'text', text: 'I could not read the practice reviews just now, so this is from the rounds alone [e1]: fourteen were logged last week and the scoring average came down by half a stroke.' }]) } },
    /** The island, a chart being prepared after the reads. */
    'isl-chart': {
      question: 'Show me where Jonah gains and loses strokes.',
      turn: {
        events: timeline(pace, [
          { kind: 'work', steps: three.slice(0, 2) },
          { kind: 'text', text: lead },
          { kind: 'work', steps: [{ id: 's4', label: 'Drawing where he gains and loses', done: 'Drew where he gains and loses', tool: 'show_visual', kind: 'visual', from: 0, to: 1.4, detail: '4 parts of the game' }] },
          { kind: 'part', part: { type: 'data-visual-composition', id: 'visual-vc-preview0001', data: ASK_COMPOSITION } },
          { kind: 'text', text: rest },
        ]),
      },
    },
    /** The island, a task being drafted: the read, the draft, then the card, and the island says it is the coach's turn. */
    'isl-draft': {
      ...task,
      turn: {
        events: timeline(
          pace,
          [
            { kind: 'work', steps: [{ id: 'd1', label: 'Reading Jonah’s putting', kind: 'read', from: 0, to: 1.2, subjects: [jonahFace], detail: '9 putts, 4 to 6 feet', ev: { id: 'slope', ref: 'e1', envelope: ASK_EV_JONAH } }] },
            { kind: 'text', text: 'Here is a focus area for Jonah on downhill putts. Check it and confirm when it reads right.' },
            { kind: 'work', steps: [{ id: 'd2', label: 'Drafting the focus area', done: 'Drafted the focus area', tool: 'create_focus_area', kind: 'draft', from: 0, to: 1.5, subjects: [jonahFace] }] },
            { kind: 'part', part: proposalPart(ASK_PROPOSAL) },
            { kind: 'decision', key, tool: 'create_focus_area' },
          ],
          { status: 'awaiting_decision' },
        ),
      },
    },
    /** The island, a long answer under finished steps: open a step while the words still arrive (`&isl=<ms>&islstep=<ms>`). */
    'isl-open': { question: 'Give me the full picture on our putting this month.', turn: { events: timeline(pace, [{ kind: 'work', steps: [{ id: 'l1', label: 'Reading putts from the last 30 days', kind: 'read', from: 0, to: 1.2, count: { unit: 'putts', to: 1412 }, subjects: squad.slice(0, 7), ev: { id: 'slope', ref: 'e1', envelope: ASK_EV_SLOPE } }, { id: 'l2', label: 'Finding who the misses come from', tool: 'compare_players', kind: 'find', from: 0.02, to: 1.7, detail: 'Per player, 4 to 6 feet', ev: { id: 'jonah', ref: 'e2', envelope: ASK_EV_JONAH } }] }, { kind: 'text', text: LONG }]) } },
    /** A player's own question: their own reads, no cards. */
    player: { question: 'How is my approach from 125 to 150 doing?', turn: { events: timeline(pace, [{ kind: 'reads', reads: [{ id: 'p1', label: 'Reading your strokes gained', detail: '8 rounds', ev: { id: 'sg', ref: 'e1', envelope: ASK_EV_JONAH_SG } }, { id: 'p2', label: 'Reading your last 7 rounds', tool: 'get_player_trend', detail: '7 rounds', ev: { id: 'trend', ref: 'e2', tool: 'get_player_trend', envelope: ASK_EV_JONAH_TREND } }] }, { kind: 'text', text: 'It is getting better. Your scoring has come down over the last month [e2], and approach is the part with the most left to gain: about a stroke a round [e1]. The drill Coach Reyes set, 125 to 150 with a full finish, is aimed right at it.' }]) } },
  };
}

export const ASK_SCRIPT_NAMES = ['quick', 'jonah', 'long', 'late', 'readfail', 'empty', 'discard', 'task', 'taskfail', 'taskslow', 'tasklost', 'lost', 'retry', 'model', 'declined', 'truncated', 'budget', 'off', 'rate', 'gone', 'signedout', 'player', 'isl-one', 'isl-three', 'isl-team', 'isl-fail', 'isl-chart', 'isl-draft', 'isl-open'] as const;
export type AskScriptName = (typeof ASK_SCRIPT_NAMES)[number];

export function askScript(name: string | null | undefined, pace: AskPace = 'real'): AskScript {
  const all = scripts(pace);
  return all[name && name in all ? name : 'jonah']!;
}

export const isAskPace = (v: string | null | undefined): v is AskPace => v === 'fast' || v === 'real' || v === 'worst';

/** Play one flow as a response. `until`: events after this many milliseconds are never delivered and the stream stays open (a still frame of that instant). */
function respond(flow: Flow, signal: AbortSignal | null | undefined, until: number | null, onEvent?: (event: ChatEvent) => void): Response {
  const ending = flow.ending ?? { kind: 'events' };
  if (ending.kind === 'refuse') return new Response(ending.body, { status: ending.status, headers: { 'content-type': 'application/json' } });
  const encoder = new TextEncoder();
  const timers: Array<ReturnType<typeof setTimeout>> = [];
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true;
      const close = (fail: boolean) => {
        if (!open) return;
        open = false;
        timers.forEach(clearTimeout);
        try {
          if (fail) controller.error(new TypeError('Load failed'));
          else controller.close();
        } catch {
          // Already closed by the reader.
        }
      };
      signal?.addEventListener('abort', () => close(true));
      let last = 0;
      for (const step of flow.events) {
        if (until !== null && step.at > until) continue;
        last = Math.max(last, step.at);
        timers.push(
          setTimeout(() => {
            if (!open) return;
            const event = typeof step.event === 'function' ? step.event() : step.event;
            onEvent?.(event);
            controller.enqueue(encoder.encode(encodeChatEvent(event)));
          }, step.at),
        );
      }
      // A still frame keeps the stream open; a cut ends it without the last event (the hook reads that as a lost connection).
      if (until !== null && flow.events.some((s) => s.at > until)) return;
      timers.push(setTimeout(() => close(false), last + (ending.kind === 'cut' ? 60 : 20)));
    },
    cancel() {
      timers.forEach(clearTimeout);
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8', 'x-conversation-id': 'c-scripted' } });
}

/**
 * Answer the hook's requests from a script. Returns the function that puts `fetch` back.
 * Only the scripted endpoint and the held-action calls are answered; every other request goes to the real `fetch`.
 */
export function installScriptedChat(script: AskScript, opts: { until?: number | null } = {}): () => void {
  const real = window.fetch;
  const until = opts.until ?? null;
  let attempts = 0;
  // The held write, as the server would keep it: when it commits, and whether Undo got there first.
  const hold: { until: number | null; undone: boolean; saved: boolean } = { until: null, undone: false, saved: false };
  const proposal = ASK_PROPOSAL;
  const final = (): ActionReceipt => (script.commit === 'failed' ? { ...ASK_RECEIPT_FAILED, action: proposal.action } : { ...ASK_RECEIPT_DONE, at: new Date().toISOString() });
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

  const scripted: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes(ACTIONS_PATH)) {
      const method = (init?.method ?? 'GET').toUpperCase();
      const lateBy = script.commit === 'slow' ? 1600 : 0;
      if (method === 'DELETE') {
        if (hold.saved || (hold.until !== null && Date.now() >= hold.until)) return json({ error: 'Too late' }, 409);
        hold.undone = true;
        return json({ ok: true });
      }
      if (method === 'POST') {
        hold.saved = true;
        return json({ receipt: final() });
      }
      if (hold.undone) return json({ receipt: null });
      if (hold.until !== null && Date.now() >= hold.until + lateBy) {
        hold.saved = true;
        return json({ receipt: final() });
      }
      return json({ receipt: null });
    }
    if (!url.includes(SCRIPTED_CHAT_ENDPOINT)) return real(input, init);
    const sent = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as { message?: string; decision?: { approved: boolean } };
    if (sent.decision) {
      const flow = sent.decision.approved ? script.confirm : script.cancel;
      // The card's clock is the server's `held_until`; the harness keeps the same instant for Undo and the outcome.
      const onEvent = (event: ChatEvent) => {
        const held = event.type === 'receipt' ? (event.part.data as ActionReceipt) : null;
        if (held?.status === 'held' && held.held_until) hold.until = Date.parse(held.held_until);
      };
      return respond(flow ?? { events: [{ at: 40, event: { type: 'done', status: 'complete' } }] }, init?.signal, until, onEvent);
    }
    attempts += 1;
    const flow = attempts === 1 && script.firstAttempt ? script.firstAttempt : script.turn;
    return respond(flow, init?.signal, until);
  };
  window.fetch = scripted;
  return () => {
    if (window.fetch === scripted) window.fetch = real;
  };
}

/** The parts a script's first turn leaves behind, for tests that want the folded result without playing it. */
export function partsOfScript(script: AskScript): ChatUIPart[] {
  return script.turn.events.flatMap((s) => {
    const e = typeof s.event === 'function' ? s.event() : s.event;
    return e.type === 'evidence' || e.type === 'visual' || e.type === 'proposal' || e.type === 'receipt' || e.type === 'part' ? [{ type: e.part.type, ...(e.part.id ? { id: e.part.id } : {}), data: e.part.data }] : [];
  });
}
