/**
 * CoachHelm chat: what a coach does to a focus area, a goal or a signal after it exists.
 *
 *   set_focus_area_status   mark a focus area achieved, or reopen it: `completeFocusArea`, `reactivateFocusArea`.
 *   set_goal_state          pause, resume or close a goal: `pauseGoal`, `resumeGoal`, `abandonGoal`.
 *   mark_signal_handled     mark a CoachHelm signal as dealt with: `acknowledgeInsight`.
 *
 * None of these sends anything. What each card must say instead is what the player will see on their own pages,
 * because all three change something the player can read:
 *   - a focus area's status shows on the player's development page (the action refreshes that page itself);
 *   - a goal's state decides whether it is among the player's active goals;
 *   - an acknowledged signal reads "Acknowledged" on the player's own CoachHelm board and Deep dive, in place of its
 *     priority (`toChInsight` sets `acknowledged` from the row's status for the player's loaders as for the coach's,
 *     `src/clubhouse/data/coachhelm-player.ts` and `coachhelm-dive.ts`; `stanceOf` draws the word).
 *
 * Permission is the action's own, made first in `plan` with the same exported function the action calls
 * (`verifyPlayerAccess`, `verifyInsightAccess`), so no card is shown to someone the action would refuse. Dismissing a
 * signal is not here: see INVENTORY.md.
 */
import 'server-only';
import { z } from 'zod';
import { completeFocusArea, reactivateFocusArea } from '@/app/golf/actions/development';
import { acknowledgeInsight } from '@/app/golf/actions/insights-feed';
import { abandonGoal, pauseGoal, resumeGoal } from '@/app/golf/actions/v3/goals';
import { verifyInsightAccess, verifyPlayerAccess } from '@/lib/auth/verify-player-access';
import { keyOf } from '../action-planners';
import type { ProposalFact } from '../action-types';
import { CoachContextError, type CoachChatContext } from '../context';
import type { ChatTool, TaskTool, ToolContext } from '../engine/tool';
import { coachOnly, done, failed, now, rosterPlayer, settle, type StoredProposal } from './kit';

/** The action's own gate for anything about one player, asked the way the action asks it. */
async function requirePlayerAccess(ctx: ToolContext, who: CoachChatContext, playerId: string): Promise<void> {
  const access = await verifyPlayerAccess(playerId, who.user_id, ctx.sb as never);
  if (access.allowed) return;
  if (access.reason === 'unavailable') throw new Error('Your access to this player could not be checked just now. Try again in a moment.');
  throw new CoachContextError('You do not have access to that player.', 403);
}

const NO_NOTICE = 'No notification is sent.';

// ---------------------------------------------------------------------------------------------------------------------
// set_focus_area_status
// ---------------------------------------------------------------------------------------------------------------------

const FOCUS_WORDS: Record<string, string> = { active: 'Active', in_progress: 'In progress', paused: 'Paused', completed: 'Completed', proposed: 'Proposed to the player', declined: 'Declined by the player', archived: 'Archived' };
const FocusInput = z.strictObject({
  focus_area_id: z.string().uuid().describe('The focus area’s id, from the CoachHelm reader.'),
  status: z.enum(['completed', 'active']).describe('completed: the player has achieved it. active: reopen one that was completed.'),
});
type FocusInput = z.infer<typeof FocusInput>;
const FocusStored = z.object({ focus_area_id: z.string().uuid(), status: z.enum(['completed', 'active']), title: z.string(), player: z.string() });

async function focusRow(ctx: ToolContext, id: string) {
  const { data, error } = await ctx.sb.from('golf_player_focus_areas').select('id, player_id, title, status').eq('id', id).maybeSingle();
  if (error) throw new Error('The focus area could not be read just now. Try again in a moment.');
  return data as { id: string; player_id: string; title: string; status: string | null } | null;
}

export const setFocusAreaStatus: TaskTool<FocusInput, StoredProposal> = {
  kind: 'task',
  name: 'set_focus_area_status',
  description:
    'Mark one of a player’s focus areas as achieved, or reopen one that was completed. Use it when the coach says a player has done what a focus area asked, or wants a finished one active again. The card names the player and the focus area and says what the player will see; it saves after the coach confirms. Nothing is sent.',
  input: FocusInput,
  progress: () => 'Preparing the focus area',
  plan: async (ctx, input) => {
    const who = coachOnly(ctx);
    const row = await focusRow(ctx, input.focus_area_id);
    // A focus area of a player outside the roster is treated as not there: the id alone proves nothing.
    if (!row || !who.roster.some((p) => p.id === row.player_id)) throw new Error('That focus area is not one of your players’. Read the player’s focus areas first.');
    const player = rosterPlayer(who, row.player_id);
    await requirePlayerAccess(ctx, who, player.id);
    const current = row.status ?? 'active';
    if (input.status === 'completed' && current === 'completed') throw new Error('That focus area is already completed.');
    if (input.status === 'completed' && !['active', 'in_progress', 'paused'].includes(current)) throw new Error(`That focus area is ${(FOCUS_WORDS[current] ?? current).toLowerCase()}, so it cannot be marked completed.`);
    if (input.status === 'active' && current !== 'completed') throw new Error('Only a completed focus area can be reopened.');
    const facts: ProposalFact[] = [
      { label: 'Player', value: player.name },
      { label: 'Focus area', value: row.title },
      { label: 'Now', value: FOCUS_WORDS[current] ?? current },
      { label: 'After', value: FOCUS_WORDS[input.status]! },
      { label: 'The player sees', value: `${input.status === 'completed' ? 'It shows as completed' : 'It shows as active again'} on their development page. ${NO_NOTICE}` },
    ];
    return {
      action: input.status === 'completed' ? 'Complete a focus area' : 'Reopen a focus area',
      summary: `${input.status === 'completed' ? 'Mark' : 'Reopen'} ${player.name}’s focus area “${row.title}”${input.status === 'completed' ? ' as completed' : ''}.`,
      facts,
      affects: [{ kind: 'player', id: player.id, label: player.name }],
      notifications: [],
      missing: [],
      idempotency_key: keyOf(['set_focus_area_status', row.id, input.status]),
      tool: 'set_focus_area_status',
      input: { focus_area_id: row.id, status: input.status, title: row.title, player: player.name },
      planned_at: now(),
    };
  },
  commit: async (ctx, proposal) => {
    const name = 'set_focus_area_status';
    coachOnly(ctx);
    const parsed = FocusStored.safeParse(proposal.input);
    if (!parsed.success) return failed(name, 'This card could not be read back, so it was not run. Nothing was changed.', false);
    const s = parsed.data;
    return settle({
      action: name,
      nothing: 'Nothing was changed.',
      where: 'the player’s focus areas',
      look: async () => {
        const row = await focusRow(ctx, s.focus_area_id).catch(() => undefined);
        return row === undefined ? null : row?.status === s.status;
      },
      write: () => (s.status === 'completed' ? completeFocusArea(s.focus_area_id) : reactivateFocusArea(s.focus_area_id)),
      receipt: () => done(name, `${s.player}’s focus area “${s.title}” is ${s.status === 'completed' ? 'completed' : 'active again'}. ${NO_NOTICE}`, [{ kind: 'focus_area', count: 1, label: s.title }]),
    });
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// set_goal_state
// ---------------------------------------------------------------------------------------------------------------------

const GOAL_STATES = ['paused', 'active', 'abandoned'] as const;
type GoalState = (typeof GOAL_STATES)[number];
const GOAL_WORDS: Record<string, string> = { active: 'Active', paused: 'Paused', abandoned: 'Closed without being reached', achieved: 'Achieved', missed: 'Missed', proposed: 'Proposed', declined: 'Declined' };
const GoalInput = z.strictObject({
  goal_id: z.string().uuid().describe('The goal’s id, from the CoachHelm reader.'),
  state: z.enum(GOAL_STATES).describe('paused: stop tracking it for now. active: resume a paused goal. abandoned: close it without it being reached.'),
  reason: z.string().min(1).max(300).nullable().describe('Why it is being closed, in the coach’s words, when state is abandoned and a reason was given; otherwise null.'),
});
type GoalInput = z.infer<typeof GoalInput>;
const GoalStored = z.object({ goal_id: z.string().uuid(), state: z.enum(GOAL_STATES), reason: z.string().nullable(), title: z.string(), player: z.string() });

async function goalRow(ctx: ToolContext, id: string) {
  const { data, error } = await ctx.sb.from('golf_goals').select('id, player_id, title, state').eq('id', id).maybeSingle();
  if (error) throw new Error('The goal could not be read just now. Try again in a moment.');
  return data as { id: string; player_id: string; title: string | null; state: string | null } | null;
}

const GOAL_VERB: Record<GoalState, string> = { paused: 'Pause', active: 'Resume', abandoned: 'Close' };
const GOAL_SEES: Record<GoalState, string> = {
  paused: 'It shows as paused among their goals and stops being tracked until it is resumed.',
  active: 'It is among their active goals again and is tracked from here.',
  abandoned: 'It leaves their active goals and shows as closed.',
};

export const setGoalState: TaskTool<GoalInput, StoredProposal> = {
  kind: 'task',
  name: 'set_goal_state',
  description:
    'Pause, resume or close one of a player’s goals. Use it when the coach wants a goal put on hold, picked up again, or dropped without being reached. A goal that was reached is marked by the app from the rounds, not here. The card names the player and the goal and says what the player will see; it saves after the coach confirms. Nothing is sent.',
  input: GoalInput,
  progress: () => 'Preparing the goal',
  plan: async (ctx, input) => {
    const who = coachOnly(ctx);
    const row = await goalRow(ctx, input.goal_id);
    if (!row || !who.roster.some((p) => p.id === row.player_id)) throw new Error('That goal is not one of your players’. Read the player’s goals first.');
    const player = rosterPlayer(who, row.player_id);
    await requirePlayerAccess(ctx, who, player.id);
    const current = row.state ?? 'active';
    const title = row.title?.trim() || 'Goal';
    if (current === input.state) throw new Error(`That goal is already ${(GOAL_WORDS[current] ?? current).toLowerCase()}.`);
    if (input.state === 'paused' && current !== 'active') throw new Error('Only an active goal can be paused.');
    if (input.state === 'active' && current !== 'paused') throw new Error('Only a paused goal can be resumed.');
    if (input.state === 'abandoned' && !['active', 'paused'].includes(current)) throw new Error('Only an active or paused goal can be closed.');
    const reason = input.state === 'abandoned' ? input.reason?.replace(/\s+/g, ' ').trim() || null : null;
    const facts: ProposalFact[] = [
      { label: 'Player', value: player.name },
      { label: 'Goal', value: title },
      { label: 'Now', value: GOAL_WORDS[current] ?? current },
      { label: 'After', value: GOAL_WORDS[input.state]! },
      ...(input.state === 'abandoned' ? [{ label: 'Reason kept with the goal', value: reason ?? 'Not set' }] : []),
      { label: 'The player sees', value: `${GOAL_SEES[input.state]} ${NO_NOTICE}` },
    ];
    return {
      action: `${GOAL_VERB[input.state]} a goal`,
      summary: `${GOAL_VERB[input.state]} ${player.name}’s goal “${title}”.`,
      facts,
      affects: [{ kind: 'player', id: player.id, label: player.name }],
      notifications: [],
      missing: [],
      idempotency_key: keyOf(['set_goal_state', row.id, input.state]),
      tool: 'set_goal_state',
      input: { goal_id: row.id, state: input.state, reason, title, player: player.name },
      planned_at: now(),
    };
  },
  commit: async (ctx, proposal) => {
    const name = 'set_goal_state';
    coachOnly(ctx);
    const parsed = GoalStored.safeParse(proposal.input);
    if (!parsed.success) return failed(name, 'This card could not be read back, so it was not run. Nothing was changed.', false);
    const s = parsed.data;
    const call = () => (s.state === 'paused' ? pauseGoal(s.goal_id) : s.state === 'active' ? resumeGoal(s.goal_id) : abandonGoal(s.goal_id, s.reason ?? undefined));
    return settle({
      action: name,
      nothing: 'Nothing was changed.',
      where: 'the player’s goals',
      look: async () => {
        const row = await goalRow(ctx, s.goal_id).catch(() => undefined);
        return row === undefined ? null : row?.state === s.state;
      },
      // The goals actions answer `{ ok }` where the others answer `{ success }`.
      write: async () => {
        const r = (await call()) as { ok?: boolean; success?: boolean; error?: string };
        return { success: r.ok === true || r.success === true, error: r.error };
      },
      receipt: () => done(name, `${s.player}’s goal “${s.title}” is ${s.state === 'paused' ? 'paused' : s.state === 'active' ? 'active again' : 'closed'}. ${NO_NOTICE}`, [{ kind: 'goal', count: 1, label: s.title }]),
    });
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// mark_signal_handled
// ---------------------------------------------------------------------------------------------------------------------

const SignalInput = z.strictObject({ insight_id: z.string().uuid().describe('The signal’s id, from the CoachHelm reader.') });
type SignalInput = z.infer<typeof SignalInput>;
const SignalStored = z.object({ insight_id: z.string().uuid(), title: z.string(), about: z.string() });

async function signalRow(ctx: ToolContext, who: CoachChatContext, id: string) {
  const { data, error } = await ctx.sb.from('golf_coach_insights').select('id, team_id, player_id, title, status').eq('id', id).eq('team_id', who.team_id).maybeSingle();
  if (error) throw new Error('The signal could not be read just now. Try again in a moment.');
  return data && data.team_id === who.team_id ? (data as { id: string; team_id: string; player_id: string | null; title: string; status: string | null }) : null;
}

export const markSignalHandled: TaskTool<SignalInput, StoredProposal> = {
  kind: 'task',
  name: 'mark_signal_handled',
  description:
    'Mark one CoachHelm signal as handled, so it stops reading as an open priority. Use it when the coach says they have dealt with or talked through a signal you read. It does not dismiss or remove the signal. The card names the signal and says what the player will see on their own page; it saves after the coach confirms. Nothing is sent.',
  input: SignalInput,
  progress: () => 'Preparing the signal',
  plan: async (ctx, input) => {
    const who = coachOnly(ctx);
    // The action's own gate, with the same function.
    const access = await verifyInsightAccess(input.insight_id, who.user_id, ctx.sb as never);
    if (!access.allowed) {
      if (access.reason === 'unavailable') throw new Error('Your access to this signal could not be checked just now. Try again in a moment.');
      throw new CoachContextError('That signal is not one of your team’s.', 403);
    }
    const row = await signalRow(ctx, who, input.insight_id);
    if (!row) throw new CoachContextError('That signal is not one of your team’s.', 403);
    if (row.status === 'acknowledged') throw new Error('That signal is already marked handled.');
    if (row.status === 'dismissed') throw new Error('That signal was dismissed. It is no longer open.');
    const player = row.player_id ? who.roster.find((p) => p.id === row.player_id) : null;
    if (row.player_id && !player) throw new Error('That signal is about a player who is not on your active roster.');
    const about = player?.name ?? 'The team';
    const facts: ProposalFact[] = [
      { label: 'Signal', value: row.title },
      { label: 'About', value: about },
      { label: 'After', value: 'Handled. It no longer reads as an open priority on your board.' },
      { label: player ? 'The player sees' : 'Players see', value: player ? `On ${player.name}’s own CoachHelm page this signal reads “Acknowledged” in place of its priority. ${NO_NOTICE}` : `Nothing changes for players. ${NO_NOTICE}` },
    ];
    return {
      action: 'Mark a signal handled',
      summary: `Mark “${row.title}” as handled.`,
      facts,
      affects: player ? [{ kind: 'player', id: player.id, label: player.name }] : [{ kind: 'team', id: who.team_id, label: who.team_name }],
      notifications: [],
      missing: [],
      idempotency_key: keyOf(['mark_signal_handled', row.id]),
      tool: 'mark_signal_handled',
      input: { insight_id: row.id, title: row.title, about },
      planned_at: now(),
    };
  },
  commit: async (ctx, proposal) => {
    const name = 'mark_signal_handled';
    const who = coachOnly(ctx);
    const parsed = SignalStored.safeParse(proposal.input);
    if (!parsed.success) return failed(name, 'This card could not be read back, so it was not run. Nothing was changed.', false);
    const s = parsed.data;
    return settle({
      action: name,
      nothing: 'Nothing was changed.',
      where: 'the CoachHelm board',
      look: async () => {
        const row = await signalRow(ctx, who, s.insight_id).catch(() => undefined);
        return row === undefined ? null : row?.status === 'acknowledged';
      },
      write: () => acknowledgeInsight(s.insight_id),
      receipt: () => done(name, `“${s.title}” is marked handled. ${NO_NOTICE}`, [{ kind: 'signal', count: 1, href: '/golf/dashboard/coachhelm', label: s.title }]),
    });
  },
};

/** In a fixed order (the order is part of the cached prefix). Coach surfaces only. */
export function developmentTools(): ChatTool[] {
  return [setFocusAreaStatus, setGoalState, markSignalHandled] as ChatTool[];
}
