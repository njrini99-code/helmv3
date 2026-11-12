/**
 * CoachHelm chat: what a coach does to a focus area, a goal or a signal after it exists.
 *
 *   set_focus_area_status   mark a focus area achieved, or reopen it: `completeFocusArea`, `reactivateFocusArea`.
 *   set_goal_state          pause, resume or close a goal: `pauseGoal`, `resumeGoal`, `abandonGoal`.
 *   mark_signal_handled     mark a CoachHelm signal as dealt with: `acknowledgeInsight`.
 *   dismiss_signal          take a signal the coach does not want off the boards: `dismissInsight`.
 *   log_focus_progress      a new value, a note, or both, on a focus area: `updateFocusAreaProgress`.
 *   record_focus_outcome    how a focus area ended (improved, no change, got worse): `recordFocusAreaOutcome`.
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
 * (`verifyPlayerAccess`, `verifyInsightAccess`), so no card is shown to someone the action would refuse.
 *
 * A focus area's value shows on the player's own page ("Now 31" on the plan board, `HubPlanBoard.tsx`; `current` in
 * Clubhouse's `stats-player.ts`). A progress note is stored with its entry and the focus area card draws the entry's
 * value and date only (`FocusAreaCard.tsx`), so the card says the note's words are not shown. Where the app measures the
 * area's metric from rounds (`isTrackableFocusMetric`), its own driver writes the value on page view and nightly
 * (`lib/golf/progress-drivers.ts`), and the card says a typed value can be replaced.
 *
 * An outcome completes the focus area and is also written on the signal it came from, where the player's own Deep dive
 * shows it as a word with its date (`DeepDive.tsx`, words from `coachhelm-dive-shape.ts`). If the signal half fails the
 * action says so, and the receipt is `partial`: confirming again runs the action again, which is safe.
 *
 * A dismissed signal is shown to nobody: the app's one visibility rule (`lib/coachhelm/v3/insight-visibility.ts`) drops
 * `status = 'dismissed'` for every reader, the player's own page included, and that card says so.
 */
import 'server-only';
import { z } from 'zod';
import { completeFocusArea, reactivateFocusArea, recordFocusAreaOutcome, updateFocusAreaProgress } from '@/app/golf/actions/development';
import { acknowledgeInsight, dismissInsight } from '@/app/golf/actions/insights-feed';
import { abandonGoal, pauseGoal, resumeGoal } from '@/app/golf/actions/v3/goals';
import { verifyInsightAccess, verifyPlayerAccess } from '@/lib/auth/verify-player-access';
import { isTrackableFocusMetric } from '@/lib/coachhelm/focus-areas/target-metric';
import { keyOf } from '../action-planners';
import type { ProposalFact } from '../action-types';
import { CoachContextError, type CoachChatContext } from '../context';
import type { ChatTool, TaskTool, ToolContext } from '../engine/tool';
import { NOTHING_SENT, coachOnly, done, editing, failed, now, rosterPlayer, settle, type StoredProposal } from './kit';

/** The action's own gate for anything about one player, asked the way the action asks it. */
async function requirePlayerAccess(ctx: ToolContext, who: CoachChatContext, playerId: string): Promise<void> {
  const access = await verifyPlayerAccess(playerId, who.user_id, ctx.sb as never);
  if (access.allowed) return;
  if (access.reason === 'unavailable') throw new Error('Your access to this player could not be checked just now. Try again in a moment.');
  throw new CoachContextError('You do not have access to that player.', 403);
}

const NO_NOTICE = 'No notification is sent.';
/** What is true of a signal dismissed from the chat once the Undo window has closed. */
const BRING_BACK = 'Only with Undo, in the few seconds after you confirm. After that no screen brings it back: the CoachHelm board’s own Undo works only for a signal dismissed on that board.';

// ---------------------------------------------------------------------------------------------------------------------
// set_focus_area_status
// ---------------------------------------------------------------------------------------------------------------------

const FOCUS_WORDS: Record<string, string> = { active: 'Active', in_progress: 'In progress', paused: 'Paused', completed: 'Completed', proposed: 'Proposed to the player', declined: 'Declined by the player', archived: 'Archived' };
const FocusInput = z.strictObject({
  focus_area_id: z.string().uuid(),
  status: z.enum(['completed', 'active']),
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
    'Mark one of a player’s focus areas completed when the coach says it is achieved, or active to reopen a completed one. Nothing is sent.',
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
      ...NOTHING_SENT,
      visible_note: facts[facts.length - 1]!.value,
      undo: { window: true, after: input.status === 'completed' ? 'Reopen it here or on the player’s development page.' : 'Mark it completed again.' },
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
      receipt: () => done(name, `${s.player}’s focus area “${s.title}” is ${s.status === 'completed' ? 'completed' : 'active again'}. ${NO_NOTICE}`, [{ kind: 'focus_area', count: 1, id: s.focus_area_id, label: s.title }]),
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
  goal_id: z.string().uuid(),
  state: z.enum(GOAL_STATES),
  reason: z.string().min(1).max(300).nullable(),
});
type GoalInput = z.infer<typeof GoalInput>;
/** What the coach can change on the card itself: the reason kept with the goal. The state is the request, so it is not a field. */
const goalEdits = editing(GoalInput, { reason: 'Reason kept with the goal' });
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
    'Pause a player’s goal, make a paused one active again, or abandon it (close it without it being reached; pass the coach’s reason if given, else null). A goal that was reached is marked by the app from the rounds. Nothing is sent.',
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
      ...NOTHING_SENT,
      visible_note: facts[facts.length - 1]!.value,
      undo: { window: true, after: input.state === 'abandoned' ? 'A closed goal is not reopened here; set a new goal.' : input.state === 'paused' ? 'Resume it.' : 'Pause it again.' },
      // The reason is only kept, and only shown, when a goal is closed.
      ...(input.state === 'abandoned' ? { editable: goalEdits.fields(input, { reason }) } : {}),
      tool: 'set_goal_state',
      input: { goal_id: row.id, state: input.state, reason, title, player: player.name, asked: input },
      planned_at: now(),
    };
  },
  revise: async (ctx, proposal, edits) => {
    coachOnly(ctx);
    return setGoalState.plan(ctx, goalEdits.merge(proposal, edits));
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
      receipt: () => done(name, `${s.player}’s goal “${s.title}” is ${s.state === 'paused' ? 'paused' : s.state === 'active' ? 'active again' : 'closed'}. ${NO_NOTICE}`, [{ kind: 'goal', count: 1, id: s.goal_id, label: s.title }]),
    });
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// mark_signal_handled
// ---------------------------------------------------------------------------------------------------------------------

const SignalInput = z.strictObject({ insight_id: z.string().uuid() });
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
    'Mark one CoachHelm signal handled when the coach says they have dealt with it. It stops reading as an open priority; it is not dismissed. Nothing is sent.',
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
      ...NOTHING_SENT,
      visible_note: facts[facts.length - 1]!.value,
      undo: { window: true, after: 'It is not reopened from the chat; the CoachHelm board shows it as handled.' },
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
      receipt: () => done(name, `“${s.title}” is marked handled. ${NO_NOTICE}`, [{ kind: 'signal', count: 1, id: s.insight_id, href: '/golf/dashboard/coachhelm', label: s.title }]),
    });
  },
};

export const dismissSignal: TaskTool<SignalInput, StoredProposal> = {
  kind: 'task',
  name: 'dismiss_signal',
  description: 'Dismiss one CoachHelm signal the coach says is wrong or not wanted. It leaves the coach’s board and the player’s own page; the record is kept. Use mark_signal_handled instead when the coach has dealt with it. Nothing is sent.',
  input: SignalInput,
  progress: () => 'Preparing to dismiss the signal',
  plan: async (ctx, input) => {
    const who = coachOnly(ctx);
    const access = await verifyInsightAccess(input.insight_id, who.user_id, ctx.sb as never);
    if (!access.allowed) {
      if (access.reason === 'unavailable') throw new Error('Your access to this signal could not be checked just now. Try again in a moment.');
      throw new CoachContextError('That signal is not one of your team’s.', 403);
    }
    const row = await signalRow(ctx, who, input.insight_id);
    if (!row) throw new CoachContextError('That signal is not one of your team’s.', 403);
    if (row.status === 'dismissed') throw new Error('That signal is already dismissed.');
    const player = row.player_id ? who.roster.find((p) => p.id === row.player_id) : null;
    if (row.player_id && !player) throw new Error('That signal is about a player who is not on your active roster.');
    const about = player?.name ?? 'The team';
    // The app has one visibility rule for signals (`lib/coachhelm/v3/insight-visibility.ts`): a dismissed one is shown to nobody, coach or player.
    const sees = player ? `It also disappears from ${player.name}’s own CoachHelm page. ${NO_NOTICE}` : `It disappears for everyone who could see it. ${NO_NOTICE}`;
    const facts: ProposalFact[] = [
      { label: 'Signal', value: row.title },
      { label: 'About', value: about },
      { label: 'After', value: 'Dismissed. It leaves your board and is not counted as acted on.' },
      { label: player ? 'The player sees' : 'Players see', value: sees },
      { label: 'The record', value: 'The signal is kept, not deleted.' },
      // The app's restore (`reactivateInsight`) is called from one place: the Undo beside a signal just dismissed on the CoachHelm board, in that visit (`src/clubhouse/screens/coachhelm/parts.tsx`). No screen lists dismissed signals.
      { label: 'Bringing it back', value: BRING_BACK },
    ];
    return {
      action: 'Dismiss a signal',
      summary: `Dismiss “${row.title}”.`,
      facts,
      affects: player ? [{ kind: 'player', id: player.id, label: player.name }] : [{ kind: 'team', id: who.team_id, label: who.team_name }],
      notifications: [],
      missing: [],
      ...NOTHING_SENT,
      visible_note: sees,
      undo: { window: true, after: BRING_BACK },
      idempotency_key: keyOf(['dismiss_signal', row.id]),
      tool: 'dismiss_signal',
      input: { insight_id: row.id, title: row.title, about },
      planned_at: now(),
    };
  },
  commit: async (ctx, proposal) => {
    const name = 'dismiss_signal';
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
        return row === undefined ? null : row?.status === 'dismissed';
      },
      write: () => dismissInsight(s.insight_id),
      receipt: () => done(name, `“${s.title}” is dismissed. ${NO_NOTICE}`, [{ kind: 'signal', count: 1, id: s.insight_id, label: s.title }]),
    });
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// log_focus_progress, record_focus_outcome
// ---------------------------------------------------------------------------------------------------------------------

/** The action's own lifecycle sentences (`focusAreaLifecycleError`, `outcomeLifecycleError` in `development.ts`), so a card is refused in the words the action would use. */
const FOCUS_ACTIONABLE = ['active', 'in_progress', 'paused'];
const FOCUS_REFUSALS: Record<string, string> = {
  proposed: 'This focus area hasn’t been accepted by the player yet.',
  declined: 'This focus area was declined by the player.',
  completed: 'This focus area is already completed.',
};
const FOCUS_REFUSAL_OTHER = 'This focus area cannot be updated in its current state.';
/** What the action answers when it refuses on purpose: said as it is, with no invitation to try again. */
const refusedOnPurpose = (error: string | null | undefined): string | null =>
  error && (/^This focus area /.test(error.replace(/'/g, '’')) || /^(Forbidden|Focus area not found)/.test(error)) ? (error === 'Forbidden' ? 'You do not have access to that player' : error) : null;

type FocusDetail = { id: string; player_id: string; title: string; status: string | null; current_value: number | null; target_value: number | null; target_metric: string | null; progress_notes: unknown; outcome_status: string | null; from_insight_id: string | null };
async function focusDetail(ctx: ToolContext, id: string): Promise<FocusDetail | null> {
  const { data, error } = await ctx.sb.from('golf_player_focus_areas').select('id, player_id, title, status, current_value, target_value, target_metric, progress_notes, outcome_status, from_insight_id').eq('id', id).maybeSingle();
  if (error) throw new Error('The focus area could not be read just now. Try again in a moment.');
  return data as FocusDetail | null;
}
/** The player's focus area, after the roster check and the action's own gate. */
async function ownedFocus(ctx: ToolContext, id: string) {
  const who = coachOnly(ctx);
  const row = await focusDetail(ctx, id);
  if (!row || !who.roster.some((p) => p.id === row.player_id)) throw new Error('That focus area is not one of your players’. Read the player’s focus areas first.');
  const player = rosterPlayer(who, row.player_id);
  await requirePlayerAccess(ctx, who, player.id);
  return { row, player };
}
const lastEntry = (raw: unknown): { value?: unknown; note?: unknown } | null => {
  const entries = (raw as { entries?: unknown } | null)?.entries;
  return Array.isArray(entries) && entries.length > 0 ? (entries[entries.length - 1] as { value?: unknown; note?: unknown }) : null;
};

const ProgressInput = z.strictObject({
  focus_area_id: z.string().uuid(),
  value: z.number().nullable().describe('The new value, as the coach said it. Null keeps the current value when only a note is added.'),
  note: z.string().min(1).max(500).nullable().describe('The coach’s note in their words, or null.'),
});
type ProgressInput = z.infer<typeof ProgressInput>;
/** What the coach can change on the card itself: the value and the note. */
const progressEdits = editing(ProgressInput, { value: 'After', note: 'Note' });
const ProgressStored = z.object({ focus_area_id: z.string().uuid(), value: z.number(), note: z.string().nullable(), title: z.string(), player: z.string() });

export const logFocusProgress: TaskTool<ProgressInput, StoredProposal> = {
  kind: 'task',
  name: 'log_focus_progress',
  description: 'Log progress on one of a player’s focus areas: a new value, a note, or both. Never work a value out yourself; use the number the coach gave. Nothing is sent.',
  input: ProgressInput,
  progress: () => 'Preparing the progress entry',
  plan: async (ctx, input) => {
    const { row, player } = await ownedFocus(ctx, input.focus_area_id);
    const status = row.status ?? '';
    if (!FOCUS_ACTIONABLE.includes(status)) throw new Error(FOCUS_REFUSALS[status] ?? FOCUS_REFUSAL_OTHER);
    const note = input.note?.trim() || null;
    if (input.value === null && !note) throw new Error('Give a value, a note, or both.');
    const value = input.value ?? row.current_value;
    if (value === null) throw new Error('That focus area has no value yet, and a note is saved with a value. Ask the coach for the number.');
    if (!Number.isFinite(value)) throw new Error('The value must be a number.');
    if (!note && value === row.current_value) throw new Error(`That focus area is already at ${value}.`);
    const tracked = isTrackableFocusMetric(row.target_metric);
    const sees = `The value ${value} on this focus area on their own page.${note ? ' The note is saved with the entry; the focus area card shows an entry’s value and date, not its note.' : ''} ${NO_NOTICE}`;
    const facts: ProposalFact[] = [
      { label: 'Player', value: player.name },
      { label: 'Focus area', value: row.title },
      { label: 'Now', value: row.current_value === null ? 'No value yet' : String(row.current_value) },
      { label: 'After', value: String(value) },
      ...(row.target_value === null ? [] : [{ label: 'Target', value: String(row.target_value) }]),
      ...(note ? [{ label: 'Note', value: note }] : []),
      {
        label: 'Tracking',
        value: tracked
          ? 'From the player’s rounds. The app writes this value itself when it has rounds to measure, so the one entered here can be replaced the next time the page is opened.'
          : 'By hand. The value stays until someone changes it.',
      },
      { label: 'The player sees', value: sees },
    ];
    return {
      action: 'Log progress on a focus area',
      summary: value === row.current_value ? `Add a note to ${player.name}’s focus area “${row.title}”.` : `Set ${player.name}’s focus area “${row.title}” to ${value}${note ? ', with a note' : ''}.`,
      facts,
      affects: [{ kind: 'player', id: player.id, label: player.name }],
      notifications: [],
      missing: [],
      idempotency_key: keyOf(['log_focus_progress', row.id, String(value), note ?? '']),
      ...NOTHING_SENT,
      visible_note: sees,
      undo: { window: true, after: 'Log the earlier value again. A saved note is not removed from the chat.' },
      editable: progressEdits.fields(input, { value, note }),
      tool: 'log_focus_progress',
      input: { focus_area_id: row.id, value, note, title: row.title, player: player.name, asked: input },
      planned_at: now(),
    };
  },
  revise: async (ctx, proposal, edits) => {
    coachOnly(ctx);
    return logFocusProgress.plan(ctx, progressEdits.merge(proposal, edits));
  },
  commit: async (ctx, proposal) => {
    const name = 'log_focus_progress';
    coachOnly(ctx);
    const parsed = ProgressStored.safeParse(proposal.input);
    if (!parsed.success) return failed(name, 'This card could not be read back, so it was not run. Nothing was changed.', false);
    const s = parsed.data;
    return settle({
      action: name,
      nothing: 'Nothing was changed.',
      where: 'the player’s focus areas',
      look: async () => {
        const row = await focusDetail(ctx, s.focus_area_id).catch(() => undefined);
        if (row === undefined) return null;
        if (!row || row.current_value !== s.value) return false;
        if (s.note === null) return true;
        const last = lastEntry(row.progress_notes);
        return last?.note === s.note && last?.value === s.value;
      },
      write: () => updateFocusAreaProgress(s.focus_area_id, s.value, s.note ? { note: s.note } : undefined),
      refusal: (answer) => refusedOnPurpose(answer.error),
      receipt: () => done(name, `${s.player}’s focus area “${s.title}” is at ${s.value}.${s.note ? ' The note is saved with it.' : ''} ${NO_NOTICE}`, [{ kind: 'focus_area', count: 1, id: s.focus_area_id, label: s.title }]),
    });
  },
};

const OUTCOMES = ['improved', 'no_change', 'worsened'] as const;
type Outcome = (typeof OUTCOMES)[number];
/** The words the player's Deep dive uses for a recorded outcome (`OUTCOME` in `src/clubhouse/data/coachhelm-dive-shape.ts`). */
const OUTCOME_WORDS: Record<Outcome, string> = { improved: 'Improved', no_change: 'No change', worsened: 'Got worse' };
const OutcomeInput = z.strictObject({
  focus_area_id: z.string().uuid(),
  outcome: z.enum(OUTCOMES),
});
type OutcomeInput = z.infer<typeof OutcomeInput>;
const OutcomeStored = z.object({ focus_area_id: z.string().uuid(), outcome: z.enum(OUTCOMES), title: z.string(), player: z.string(), from_insight_id: z.string().uuid().nullable() });

export const recordFocusOutcome: TaskTool<OutcomeInput, StoredProposal> = {
  kind: 'task',
  name: 'record_focus_outcome',
  description: 'Record how one of a player’s focus areas ended, in the coach’s judgement: improved, no_change or worsened. It also completes the focus area. Use set_focus_area_status to complete one with no outcome. Nothing is sent.',
  input: OutcomeInput,
  progress: () => 'Preparing the outcome',
  plan: async (ctx, input) => {
    const { row, player } = await ownedFocus(ctx, input.focus_area_id);
    const status = row.status ?? '';
    if (![...FOCUS_ACTIONABLE, 'completed'].includes(status)) throw new Error(FOCUS_REFUSALS[status] ?? FOCUS_REFUSAL_OTHER);
    // The app's card offers the three choices only until one is recorded; the chat does not change a recorded one either.
    if (row.outcome_status) throw new Error(`An outcome is already recorded for that focus area: ${OUTCOME_WORDS[row.outcome_status as Outcome] ?? row.outcome_status}.`);
    const word = OUTCOME_WORDS[input.outcome];
    const sees = `${status === 'completed' ? 'The focus area already shows as completed' : 'The focus area shows as completed'} on their development page.${row.from_insight_id ? ` The signal it came from can read “${word}” on their own CoachHelm page.` : ''} ${NO_NOTICE}`;
    const facts: ProposalFact[] = [
      { label: 'Player', value: player.name },
      { label: 'Focus area', value: row.title },
      { label: 'Outcome', value: word },
      { label: 'Status', value: status === 'completed' ? 'Already completed. Only the outcome is added.' : `${FOCUS_WORDS[status] ?? status} now. Recording an outcome marks it completed.` },
      {
        label: 'CoachHelm',
        value: row.from_insight_id
          ? 'The outcome is also recorded on the signal this focus area came from, and the signal is counted as acted on. CoachHelm uses recorded outcomes to show what has worked.'
          : 'This focus area did not come from a signal, so only the focus area carries the outcome.',
      },
      { label: 'The player sees', value: sees },
    ];
    return {
      action: 'Record a focus area’s outcome',
      summary: `Record “${word}” for ${player.name}’s focus area “${row.title}”${status === 'completed' ? '' : ' and mark it completed'}.`,
      facts,
      affects: [{ kind: 'player', id: player.id, label: player.name }],
      notifications: [],
      missing: [],
      idempotency_key: keyOf(['record_focus_outcome', row.id, input.outcome]),
      ...NOTHING_SENT,
      visible_note: sees,
      undo: { window: true, after: 'A recorded outcome is not changed from the chat. The focus area can be reopened.' },
      tool: 'record_focus_outcome',
      input: { focus_area_id: row.id, outcome: input.outcome, title: row.title, player: player.name, from_insight_id: row.from_insight_id },
      planned_at: now(),
    };
  },
  commit: async (ctx, proposal) => {
    const name = 'record_focus_outcome';
    coachOnly(ctx);
    const parsed = OutcomeStored.safeParse(proposal.input);
    if (!parsed.success) return failed(name, 'This card could not be read back, so it was not run. Nothing was changed.', false);
    const s = parsed.data;
    const word = OUTCOME_WORDS[s.outcome];
    const created = [{ kind: 'focus_area', count: 1, id: s.focus_area_id, label: s.title }];
    /** Null when it could not look; the focus area's half and the signal's half, each as found. */
    const halves = async (): Promise<{ area: boolean; signal: boolean } | null> => {
      const row = await focusDetail(ctx, s.focus_area_id).catch(() => undefined);
      if (row === undefined) return null;
      const area = row?.outcome_status === s.outcome && row.status === 'completed';
      if (!s.from_insight_id) return { area, signal: true };
      const { data, error } = await ctx.sb.from('golf_coach_insights').select('id, outcome_status').eq('id', s.from_insight_id).maybeSingle();
      if (error) return null;
      return { area, signal: (data as { outcome_status: string | null } | null)?.outcome_status === s.outcome };
    };
    const receipt = await settle({
      action: name,
      nothing: 'Nothing was changed.',
      where: 'the player’s focus areas',
      look: async () => {
        const h = await halves();
        return h === null ? null : h.area && h.signal;
      },
      write: () => recordFocusAreaOutcome(s.focus_area_id, s.outcome),
      refusal: (answer) => refusedOnPurpose(answer.error),
      receipt: () => done(name, `“${word}” is recorded for ${s.player}’s focus area “${s.title}”, and it is completed. ${NO_NOTICE}`, created),
    });
    if (receipt.status !== 'failed') return receipt;
    // The action writes the focus area first and the signal second, and reports the second failing. Say which half is there.
    const h = await halves().catch(() => null);
    if (h?.area && !h.signal) {
      return {
        ...done(name, `“${word}” is recorded on ${s.player}’s focus area “${s.title}”, and it is completed, but it could not be added to the signal it came from. Confirm again to add it there.`, created),
        status: 'partial',
        partial_failures: ['The outcome was not added to the signal this focus area came from.'],
      };
    }
    return receipt;
  },
};

/**
 * In a fixed order (the order is part of the cached prefix). Coach surfaces only. `dismiss_signal` was added after the
 * others were registered, so it is listed apart and appended last by `list.ts`.
 */
export function developmentTools(): ChatTool[] {
  return [setFocusAreaStatus, setGoalState, markSignalHandled] as ChatTool[];
}
