import type { UIMessage } from 'ai';
import type { ActionProposal, ActionReceipt } from '@/lib/coachhelm/v3/chat/action-types';

/** The design page's flows (ask/redesign FL): the words a coach said and the draft each produces, as real parts on a real turn. */
type Flow = { q: string; scope: string; tool: string; action: string; title: string; facts: Array<[string, string]>; on: string; done: string };
export const ASK_FLOWS: Record<string, Flow> = {
  f_event: { q: 'Set a team meeting Wednesday at 4 in the film room', scope: 'Varsity · calendar', tool: 'create_event', action: 'Add to calendar', title: 'Team meeting', facts: [['When', 'Wed, Nov 4 · 4:00 to 5:00 PM'], ['Where', 'Film room'], ['Who', 'All 7 players']], on: '7 players see it on their calendar.', done: 'Added · Team meeting' },
  f_annc: { q: 'Tell the team the bus leaves Sunday at 7 for Hargrove', scope: 'Varsity · announcements', tool: 'create_announcement', action: 'Post to 7 players', title: 'Bus to Hargrove', facts: [['Message', 'Bus leaves the Clubhouse lot Sunday at 7:00 AM. Bags at the vans by 6:45.'], ['Urgency', 'Normal · pushes when they are free'], ['Asks for', 'Got it'], ['To', '7 players']], on: 'It posts to 7 players with a push and an email once Undo closes.', done: 'Posted · Bus to Hargrove' },
  f_travel: { q: 'Set up travel for Hargrove', scope: 'Varsity · trips', tool: 'create_trip', action: 'Add the trip', title: 'Hargrove travel', facts: [['Leave', 'Sun, Nov 8 · 7:00 AM'], ['Back', 'Tue, Nov 10'], ['Who', '5 players, 2 coaches']], on: 'The 7 people see it in Hub once Undo closes.', done: 'Added · Hargrove travel' },
  f_board: { q: 'Mark up Jonah’s approach for him', scope: 'Jonah Okafor · last 8 rounds', tool: 'draft_board', action: 'Open in Messages', title: 'Board for Jonah', facts: [['To', 'Jonah Okafor'], ['Attachment', 'Approach board']], on: 'Nothing is sent. The board goes into your message to Jonah, and you send it from Messages.', done: 'Opened in Messages' },
  f_poll: { q: 'Poll the team on dinner Friday', scope: 'Varsity · team chat', tool: 'draft_poll', action: 'Open in Messages', title: 'Team dinner poll', facts: [['Question', 'Where should we eat Friday?'], ['Options', 'Mexican, Barbecue, Pizza']], on: 'Nothing is sent until you press Send in team chat.', done: 'Opened in Messages' },
  f_qual: { q: 'Set up the Tiger Classic qualifier', scope: 'Varsity · qualifiers', tool: 'create_qualifier', action: 'Set qualifier', title: 'Tiger Classic qualifier', facts: [['Rounds', '3 rounds from Nov 9'], ['Field', '7 players'], ['Travels', 'Top 4, 1 coach pick']], on: '7 players are told once Undo closes.', done: 'Set · Tiger Classic qualifier' },
  f_lineup: { q: 'Set the Hargrove lineup from the qualifier', scope: 'Varsity · Hargrove', tool: 'set_lineup', action: 'Set lineup', title: 'Hargrove lineup', facts: [['Starters', 'Eli, Theo, Jonah, Josie, Sam'], ['Alternate', 'Owen']], on: 'The lineup is set. Locking it is its own press.', done: 'Set · Hargrove lineup' },
  f_task: { q: 'Give Eli and Theo a putting task', scope: 'Eli and Theo · tasks', tool: 'create_task', action: 'Assign task', title: 'Putting task for Eli and Theo', facts: [['Task', 'Gate drill, 4 feet, 25 makes'], ['Due', 'Fri, Nov 6'], ['To', 'Eli Brandt, Theo Marchetti']], on: 'It lands on their Home under To do.', done: 'Assigned · Putting task' },
  f_goal: { q: 'Set Jonah an approach goal', scope: 'Jonah Okafor · goals', tool: 'create_goal', action: 'Set goal', title: 'Approach goal for Jonah', facts: [['Goal', 'Greens from 125 to 150 at 50%'], ['By', 'Dec 1'], ['Now', '38%']], on: 'Jonah sees it on his card, under Goals.', done: 'Set · Approach goal' },
  f_note: { q: 'Note on Theo’s 13th at Hilltop', scope: 'Theo Marchetti · Hilltop', tool: 'add_round_note', action: 'Add note', title: 'Note on Theo’s hole 13', facts: [['Round', 'Hilltop, Oct 21'], ['Hole', '13'], ['Note', 'Good miss. Take the extra club there.']], on: 'Theo sees it in his round review.', done: 'Added · Note on hole 13' },
  f_drill: { q: 'Add a 5 foot gate drill to the bank', scope: 'Varsity · drill bank', tool: 'create_drill', action: 'Add drill', title: '5 ft gate drill', facts: [['Area', 'Putting'], ['Length', '15 min']], on: 'It lands in your drill bank.', done: 'Added · 5 ft gate drill' },
};

const user = (text: string) => ({ id: 'u1', role: 'user', parts: [{ type: 'text', text }] }) as unknown as UIMessage;
const step = (i: number, label: string, active = false) => ({ type: 'data-progress', id: `p${i}`, data: { label, tool: 'read', ...(active ? { state: 'active' } : { state: 'done', done: label }) } });

export function askFlowMessages(scene: string, stage: string): { messages: UIMessage[]; busy: boolean } | null {
  const f = ASK_FLOWS[scene];
  if (!f) return null;
  const q = user(f.q);
  const reads = [step(1, 'Read what it needs')];
  if (stage === 'reads' || stage === 'steps' || stage === 'typing') return { messages: [q, { id: 'a1', role: 'assistant', parts: [step(1, 'Reading', true)] } as unknown as UIMessage], busy: true };
  const proposal: ActionProposal & { tool: string } = { tool: f.tool, action: f.action, summary: f.title, facts: f.facts.map(([label, value]) => ({ label, value })), affects: [], notifications: [f.on], missing: [], idempotency_key: `key-${scene}` };
  const phase = stage === 'draft' || stage === 'confirm' ? 'requested' : stage === 'cancelled' ? 'denied' : 'approved';
  const parts: unknown[] = [...reads, { type: 'text', text: `Here’s the ${f.title.toLowerCase()}. Change anything.`, state: 'done' }, { type: `tool-${f.tool}`, toolCallId: 'c1', input: {}, state: phase === 'requested' ? 'approval-requested' : 'approval-responded', approval: phase === 'requested' ? { id: 'approval-1' } : { id: 'approval-1', approved: phase === 'approved' } }, { type: 'data-action-proposal', id: `proposal-key-${scene}`, data: proposal }];
  if (stage === 'receipt' || stage === 'told') parts.push({ type: 'data-action-receipt', id: `receipt-key-${scene}`, data: { status: stage === 'told' ? 'completed' : 'held', ...(stage === 'told' ? {} : { held_until: '2099-01-01T00:00:00Z' }), action: f.action, summary: f.done, created: [], notifications: stage === 'told' ? [{ channel: 'push', recipients: 7, status: 'sent', summary: 'Told 7' }] : [], idempotency_key: `key-${scene}` } as unknown as ActionReceipt });
  return { messages: [q, { id: 'a1', role: 'assistant', parts } as unknown as UIMessage], busy: false };
}

/** A question's stage on today's answer fixtures. */
export const ASK_STAGE_STATE: Record<string, string> = { typing: 'thinking', steps: 'working', 'steps-2': 'working', skeleton: 'composelive', chart: 'visual', 'chart-2': 'visual', answer: 'answer', 'steps-open': 'answer', sources: 'reads', popover: 'reads', folded: 'answer' };
