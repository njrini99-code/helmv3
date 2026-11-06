import type { UIMessage } from 'ai';
import type { ActionProposal, ActionReceipt, TaskVisual } from '@/lib/coachhelm/v3/chat/action-types';
import type { QuickChatWeek } from '@/lib/coachhelm/v3/chat/quick-chat-week';
import type { PlanCardPreview } from '../screens/coachhelm/plan/PlanCard';
import { PP_COACHES, PP_NAMES, PP_PLAN_PART } from './fixtures-practice-plan';
import { ASK_PLAYERS } from './fixtures-ask-thread';

const ASK_ROSTER_COUNT = ASK_PLAYERS.length;

/** The design page's flows (ask/redesign FL): the words a coach said and the draft each produces, as real parts on a real turn. */
type Flow = { q: string; scope: string; tool: string; action: string; title: string; facts: Array<[string, string]>; on: string; done: string; publish?: ActionProposal['publish']; visual?: TaskVisual; sources?: Record<string, string> };
export const ASK_FLOWS: Record<string, Flow> = {
  m_cal: { visual: { kind: 'cal', date: '2026-11-05', start: '14:00', end: '17:00', title: 'Thursday practice', where: 'Range and short game', who: 'Varsity', rsvp: false }, q: 'Add Thursday’s practice to the calendar', scope: 'Varsity · calendar', tool: 'create_event', action: 'Add to calendar', title: 'Thursday practice', facts: [['When', 'Thu, Nov 5 · 2:00 to 5:00 PM'], ['Where', 'Range and short game'], ['Who', 'Varsity']], on: 'Everyone on the team hears once Undo closes.', done: 'Added to the calendar.' },
  m_fold: { q: 'Save this in a new folder called November', scope: 'Varsity · documents', tool: 'save_folder', action: 'Save to November', title: 'Thursday practice', facts: [['Folder', 'November'], ['Who sees it', 'Only coaches']], on: 'Nothing is sent. Only coaches can see it.', done: 'Saved in November.' },
  m_focus: { q: 'Set Jonah’s focus on approach', scope: 'Jonah Okafor · focus', tool: 'create_focus_area', action: 'Assign focus', title: 'Approach for Jonah', facts: [['Focus', 'Approach, 150 to 175'], ['Why', 'Greens from 150 to 175 are down 8%']], on: 'Jonah sees it on Home.', done: 'Assigned.' },
  m_pub: { q: 'Publish Thursday’s plan', scope: 'Varsity · practice', tool: 'publish_practice_plan', action: 'Publish to 11 people', title: 'Thursday’s plan', facts: [['When', 'Thu, Nov 5 · 2:00 to 5:00 PM'], ['Where', 'Range and short game'], ['Tells', '9 players and 2 coaches, push and bell']], on: 'It files in Documents and the 11 people hear once Undo closes, 8 seconds later. The plan posts in Team chat, with no second push.', done: 'Published. 11 people told.', publish: { heading: 'Publish Thursday’s plan?', coins: ['Sam Moore', 'Jonah Okafor', 'Eli Brandt', 'Theo Marchetti', 'Ava Lindqvist', 'Priya Natarajan', 'Sofia Alvarez', 'Dan Whitfield', 'Owen Park'].map((name) => ({ name })), tellsLine: '9 players and 2 coaches, push and bell', folder: 'Practice plans', teamChat: true, sample: { player: 'Jonah', title: 'Practice plan for Thursday', body: '2:00 PM · You start on the putting green with Group B' } } },
  plan_event: { visual: { kind: 'cal', date: '2026-11-03', start: '14:00', end: '17:00', title: 'Tuesday practice', where: 'Range and short game', who: 'Varsity', rsvp: false }, q: 'Build Tuesday’s practice', scope: 'Varsity · calendar', tool: 'create_event', action: 'Add to calendar', title: 'Tuesday practice', facts: [['When', 'Tue, Nov 3 · 2:00 to 5:00 PM'], ['Where', 'Range and short game']], on: 'Invites go out once Undo closes.', done: 'Added to Tuesday.' },
  f_event: { visual: { kind: 'cal', date: '2026-11-04', start: '16:00', end: '17:00', title: 'Team meeting', where: 'Film room', who: 'All 7 players', rsvp: true }, sources: { When: 'Calendar and classes', Who: 'Roster' }, q: 'Set a team meeting Wednesday at 4 in the film room', scope: 'Varsity · calendar', tool: 'create_event', action: 'Add to calendar', title: 'Team meeting', facts: [['When', 'Wed, Nov 4 · 4:00 to 5:00 PM'], ['Where', 'Film room'], ['Who', 'All 7 players']], on: '7 players see it on their calendar.', done: 'Added · Team meeting' },
  f_annc: { q: 'Tell the team the bus leaves Sunday at 7 for Hargrove', scope: 'Varsity · announcements', tool: 'create_announcement', action: 'Post to 7 players', title: 'Bus to Hargrove', facts: [['Message', 'Bus leaves the Clubhouse lot Sunday at 7:00 AM. Bags at the vans by 6:45.'], ['Urgency', 'Normal · pushes when they are free'], ['Asks for', 'Got it'], ['To', '7 players']], on: 'It posts to 7 players with a push and an email once Undo closes.', done: 'Posted · Bus to Hargrove' },
  f_travel: { q: 'Set up travel for Hargrove', scope: 'Varsity · trips', tool: 'create_trip', action: 'Add the trip', title: 'Hargrove travel', facts: [['Leave', 'Sun, Nov 8 · 7:00 AM'], ['Back', 'Tue, Nov 10'], ['Who', '5 players, 2 coaches']], on: 'The 7 people see it in Hub once Undo closes.', done: 'Added · Hargrove travel' },
  f_board: { q: 'Mark up Jonah’s approach for him', scope: 'Jonah Okafor · last 8 rounds', tool: 'draft_board', action: 'Open in Messages', title: 'Board for Jonah', facts: [['To', 'Jonah Okafor'], ['Attachment', 'Approach board']], on: 'Nothing is sent. The board goes into your message to Jonah, and you send it from Messages.', done: 'Opened in Messages' },
  f_poll: { q: 'Poll the team on dinner Friday', scope: 'Varsity · team chat', tool: 'draft_poll', action: 'Open in Messages', title: 'Team dinner poll', facts: [['Question', 'Where should we eat Friday?'], ['Options', 'Mexican, Barbecue, Pizza']], on: 'Nothing is sent until you press Send in team chat.', done: 'Opened in Messages' },
  f_qual: { visual: { kind: 'qual', title: 'Tiger Classic qualifier', rounds: 3, start: '2026-11-09', total: 5, picks: 1, field: 7, deadline: null }, q: 'Set up the Tiger Classic qualifier', scope: 'Varsity · qualifiers', tool: 'create_qualifier', action: 'Set qualifier', title: 'Tiger Classic qualifier', facts: [['Rounds', '3 rounds from Nov 9'], ['Field', '7 players'], ['Travels', 'Top 4, 1 coach pick']], on: '7 players are told once Undo closes.', done: 'Set · Tiger Classic qualifier' },
  f_lineup: { q: 'Set the Hargrove lineup from the qualifier', scope: 'Varsity · Hargrove', tool: 'set_lineup', action: 'Set lineup', title: 'Hargrove lineup', facts: [['Starters', 'Eli, Theo, Jonah, Josie, Sam'], ['Alternate', 'Owen']], on: 'The lineup is set. Locking it is its own press.', done: 'Set · Hargrove lineup' },
  f_task: { q: 'Give Eli and Theo a putting task', scope: 'Eli and Theo · tasks', tool: 'create_task', action: 'Assign task', title: 'Putting task for Eli and Theo', facts: [['Task', 'Gate drill, 4 feet, 25 makes'], ['Due', 'Fri, Nov 6'], ['To', 'Eli Brandt, Theo Marchetti']], on: 'It lands on their Home under To do.', done: 'Assigned · Putting task' },
  f_goal: { q: 'Set Jonah an approach goal', scope: 'Jonah Okafor · goals', tool: 'create_goal', action: 'Set goal', title: 'Approach goal for Jonah', facts: [['Goal', 'Greens from 125 to 150 at 50%'], ['By', 'Dec 1'], ['Now', '38%']], on: 'Jonah sees it on his card, under Goals.', done: 'Set · Approach goal' },
  f_note: { q: 'Note on Theo’s 13th at Hilltop', scope: 'Theo Marchetti · Hilltop', tool: 'add_round_note', action: 'Add note', title: 'Note on Theo’s hole 13', facts: [['Round', 'Hilltop, Oct 21'], ['Hole', '13'], ['Note', 'Good miss. Take the extra club there.']], on: 'Theo sees it in his round review.', done: 'Added · Note on hole 13' },
  f_drill: { q: 'Add a 5 foot gate drill to the bank', scope: 'Varsity · drill bank', tool: 'create_drill', action: 'Add drill', title: '5 ft gate drill', facts: [['Area', 'Putting'], ['Length', '15 min']], on: 'It lands in your drill bank.', done: 'Added · 5 ft gate drill' },
};

/** The week behind the calendar drafts: what the signed-in read returns, for a preview that reads nothing. */
export const ASK_PREVIEW_WEEK: QuickChatWeek = {
  days: [
    { date: '2026-11-02', hasEvent: true },
    { date: '2026-11-03', hasEvent: false },
    { date: '2026-11-04', hasEvent: true },
    { date: '2026-11-05', hasEvent: true },
    { date: '2026-11-06', hasEvent: false },
    { date: '2026-11-07', hasEvent: true },
    { date: '2026-11-08', hasEvent: false },
  ],
  items: [{ title: 'Lift', start: '2026-11-04T15:00:00Z', end: '2026-11-04T16:00:00Z' }],
  timeZone: 'UTC',
};

const user = (text: string) => ({ id: 'u1', role: 'user', parts: [{ type: 'text', text }] }) as unknown as UIMessage;
const step = (i: number, label: string, active = false) => ({ type: 'data-progress', id: `p${i}`, data: { label, tool: 'read', ...(active ? { state: 'active' } : { state: 'done', done: label }) } });

export function askFlowMessages(scene: string, stage: string): { messages: UIMessage[]; busy: boolean } | null {
  const f = ASK_FLOWS[scene];
  if (!f) return null;
  const q = user(f.q);
  const reads = [step(1, 'Read what it needs')];
  if (stage === 'reads' || stage === 'steps' || stage === 'typing') return { messages: [q, { id: 'a1', role: 'assistant', parts: [step(1, 'Reading', true)] } as unknown as UIMessage], busy: true };
  const proposal: ActionProposal & { tool: string } = { ...(f.publish ? { publish: f.publish } : {}), tool: f.tool, action: f.action, summary: f.title, ...(f.visual ? { visual: f.visual } : {}), facts: f.facts.map(([label, value]) => ({ label, value, ...(f.sources?.[label] ? { source: f.sources[label] } : {}) })), affects: [{ kind: 'team', id: 't', label: 'Varsity' }], notifications: [f.on], missing: [], idempotency_key: `key-${scene}` };
  const phase = stage === 'draft' || stage === 'confirm' ? 'requested' : stage === 'cancelled' ? 'denied' : 'approved';
  const parts: unknown[] = [...reads, { type: 'text', text: `Here’s a draft: ${f.title}. Change anything.`, state: 'done' }, { type: `tool-${f.tool}`, toolCallId: 'c1', input: {}, state: phase === 'requested' ? 'approval-requested' : 'approval-responded', approval: phase === 'requested' ? { id: 'approval-1' } : { id: 'approval-1', approved: phase === 'approved' } }, { type: 'data-action-proposal', id: `proposal-key-${scene}`, data: proposal }];
  if (stage === 'receipt' || stage === 'told' || stage === 'failed' || stage === 'partial') parts.push({ type: 'data-action-receipt', id: `receipt-key-${scene}`, data: { status: stage === 'told' ? 'completed' : stage === 'failed' ? 'failed' : stage === 'partial' ? 'partial' : 'held', ...(stage === 'told' ? {} : { held_until: new Date(Date.now() + 8000).toISOString() }), action: f.action, summary: f.done, created: [], partial_failures: stage === 'partial' ? ['The invite didn’t go out.'] : [], notifications: stage === 'told' ? [{ channel: 'push', recipients: ASK_ROSTER_COUNT, status: 'sent', summary: 'Told the team' }] : [], idempotency_key: `key-${scene}` } as unknown as ActionReceipt });
  return { messages: [q, { id: 'a1', role: 'assistant', parts } as unknown as UIMessage], busy: false };
}

/** A question's stage on today's answer fixtures. */
export const ASK_STAGE_STATE: Record<string, string> = { typing: 'thinking', steps: 'working', 'steps-2': 'working', skeleton: 'composelive', chart: 'visual', 'chart-2': 'visual', answer: 'answer', 'steps-open': 'answer', sources: 'chips', popover: 'chips', folded: 'answer' };

const BRIEF = {
  title: 'A few things first',
  questions: [
    { id: 'len', title: 'How long is practice?', why: 'The calendar has Tuesday at 2:00.', options: [{ id: 'a', label: 'Two hours' }, { id: 'b', label: 'Three hours', hint: 'From the calendar' }], pick: ['b'] },
    { id: 'aim', title: 'What matters most?', multi: true, options: [{ id: 'a', label: 'Short putts', hint: 'Lost most in the last 8 rounds' }, { id: 'b', label: 'Approach' }, { id: 'c', label: 'Wedges' }], pick: ['a'] },
    { id: 'who', title: 'Who is there?', options: [{ id: 'a', label: 'Everyone' }, { id: 'b', label: 'Travel squad' }], pick: ['a'] },
    { id: 'where', title: 'Where does it start?', options: [{ id: 'a', label: 'Range' }, { id: 'b', label: 'Putting green' }], pick: ['b'] },
  ],
};
const assistant = (parts: unknown[]) => ({ id: 'a1', role: 'assistant', parts }) as unknown as UIMessage;
const PLAN_Q = user('Build Thursday’s practice around putting');
const planPart = (id: string, data: object) => ({ type: 'data-practice-plan', id, data: { ...data, saveOn: true, sheet: { team: 'Demo University Golf', start: '2026-11-05T19:00:00Z', end: '2026-11-05T22:00:00Z', zone: 'America/New_York', coaches: [...PP_COACHES], names: Object.fromEntries(PP_NAMES) } } });
const redrafted = { ...PP_PLAN_PART, draft: { ...PP_PLAN_PART.draft, version: PP_PLAN_PART.draft.version + 1, body: { ...PP_PLAN_PART.draft.body, variants: { ...PP_PLAN_PART.draft.body.variants, main: { ...PP_PLAN_PART.draft.body.variants.main, blocks: PP_PLAN_PART.draft.body.variants.main.blocks.map((b, i) => (i === 0 ? { ...b, len: b.len + 15 } : b)) } } } } };

export interface AskIdRoute {
  flow?: { messages: UIMessage[]; busy: boolean } | null;
  plan?: PlanCardPreview;
  /** What a person would press, in order. */
  press?: string[];
  /** Typed into the composer. */
  type?: string;
}

const STAGE: Record<string, string> = { commit: 'adding' };

/** `?id=` (05): each drawn state's own route, reached the way a person gets there. */
export function askIdRoute(id?: string): AskIdRoute | null {
  if (!id) return null;
  let m = id.match(/^S-ASK\.moment\.(cal|fold|focus|pub)\.(draft|confirm|receipt|told)$/);
  if (m) return { flow: askFlowMessages(`m_${m[1]}`, m[2]!) };
  m = id.match(/^S-ASK\.flow\.plan\.(reads|drafting|draft|confirm|commit|receipt|told|undone|cancelled)$/);
  if (m) {
    const s = m[1]!;
    if (s === 'reads' || s === 'drafting') return { flow: { messages: [user('Build Tuesday’s practice'), assistant([step(1, s === 'reads' ? 'Reading the last 8 rounds' : 'Drafting the plan', true)])], busy: true } };
    if (s === 'undone') return { flow: askFlowMessages('plan_event', 'receipt'), press: ['Undo'] };
    return { flow: askFlowMessages('plan_event', STAGE[s] ?? s) };
  }
  m = id.match(/^S-ASK\.publish(?:\.(commit|receipt|told|undone|cancelled))?$/);
  if (m) {
    const s = m[1];
    if (s === 'undone') return { flow: askFlowMessages('m_pub', 'receipt'), press: ['Undo'] };
    return { flow: askFlowMessages('m_pub', s ? (STAGE[s] ?? s) : 'confirm') };
  }
  m = id.match(/^S-ASK\.kit\.(failed|partial|reloaded)$/);
  if (m) return { flow: askFlowMessages('m_cal', m[1] === 'reloaded' ? 'told' : m[1]!) };
  m = id.match(/^S-ASK\.brief\.(q[1-4]|free|folded|skip|change)$/);
  if (m) {
    const s = m[1]!;
    const press = s === 'q2' ? ['Next'] : s === 'q3' ? ['Next', 'Next'] : s === 'q4' || s === 'free' ? ['Next', 'Next', 'Next'] : s === 'folded' ? ['Next', 'Next', 'Next', 'Build it'] : s === 'skip' ? ['Skip, just build'] : s === 'change' ? ['Skip, just build', 'Change answers'] : [];
    return { flow: { messages: [user('Build Tuesday’s practice'), assistant([step(1, 'Read the calendar'), { type: 'data-brief', id: 'b1', data: BRIEF }])], busy: false }, press };
  }
  const withPlan = (plan: PlanCardPreview, parts: unknown[] = [planPart('p1', PP_PLAN_PART)]) => ({ flow: { messages: [PLAN_Q, assistant([step(1, 'Read the last 8 rounds'), ...parts])], busy: false }, plan });
  m = id.match(/^S-ASK\.artifact\.(card\.saved|card|push|pane|versions|why-popover|edit)$/);
  if (m) {
    const s = m[1]!;
    if (s === 'versions') return withPlan({ full: true }, [planPart('p1', PP_PLAN_PART), planPart('p2', redrafted)]);
    if (s === 'card.saved') return withPlan({ phase: 'saved' });
    if (s === 'push' || s === 'pane' || s === 'edit') return withPlan({ full: true });
    return { ...withPlan({ phase: 'ready' }), ...(s === 'why-popover' ? { press: ['Why'] } : {}) };
  }
  m = id.match(/^S-ASK\.save(?:\.(folder-list|new-folder|confirm|commit|receipt|told|undone|cancelled))?$/);
  if (m) {
    const s = m[1];
    const folders = [{ name: 'Practice plans', count: 6 }, { name: 'Hargrove week', count: 3 }];
    if (s === 'folder-list') return withPlan({ phase: 'ready', menu: 'open', folders });
    if (s === 'new-folder') return withPlan({ phase: 'ready', menu: 'new', folders });
    if (s === 'commit') return withPlan({ phase: 'saving', folders });
    if (s === 'receipt' || s === 'told') return withPlan({ phase: 'saved', folders });
    if (s === 'undone') return withPlan({ phase: 'undone', folders });
    return withPlan({ phase: 'ready', folders });
  }
  const COMPOSER: Record<string, AskIdRoute> = {
    'S-ASK.composer.typing': { type: 'Why are we missing so many short putts lately?' },
    'S-ASK.composer.at-menu': { type: '@' },
    'S-ASK.composer.slash-menu': { type: '/' },
    'S-ASK.composer.add-menu': { press: ['Add to your question'] },
    'S-ASK.history.sheet': { press: ['Chats'] },
    'S-ASK.settings.sheet': { press: ['Chat settings'] },
    'S-ASK.knows.edit': { press: ['Edit what it knows'] },
    'S-ASK.tone': { press: ['Straight'] },
    'S-ASK.tone.detailed': { press: ['Detailed'] },
    'S-ASK.tone.team-talk': { press: ['Team talk'] },
  };
  return COMPOSER[id] ?? null;
}
