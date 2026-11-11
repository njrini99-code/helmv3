/**
 * CoachHelm chat: the tasks, on the engine's contract.
 *
 * `plan` builds the card with the planner that will run it and writes nothing. The engine records the proposal, shows
 * the card and waits for the coach; after Confirm and the Undo window it calls `commit` with the stored proposal,
 * whose `idempotency_key` it has made unique to that one request by the model (engine/CONTRACT_NOTES.md).
 *
 * What `commit` guarantees:
 *   1. Every downstream request id is derived from the proposal's key, so a retry of this card lands on the same row
 *      and the same request made again later is a new row.
 *   2. Before writing it looks for the row an earlier attempt of this card may have left, and reports that instead of
 *      writing twice. Where the server action takes a request id that look is exact; where it does not (see
 *      `written` on the flow) it is the card's own natural key among rows made since the card was planned.
 *   3. A failed write is read back before the receipt says nothing was saved. If the look finds the row the receipt
 *      is `completed`; if the look could not be made the receipt says so and is not offered for retry.
 *
 * The receipt's `summary` is one plain sentence the model can repeat. The held runner, Open and the sweep rebuild a write
 * from the stored proposal with the same `commit` (held-runner.ts), so there is one path to every write.
 */
import 'server-only';
import { z } from 'zod';
import { isFlagEnabled } from '@/lib/flags/is-enabled';
import { logServerError } from '@/lib/server-error-logger';
import { isPlayerContext, type ChatTool, type TaskTool, type ToolContext } from './engine/tool';
import { askTables } from './ask-db';
import { executeAnnouncement, executeFocusArea, executeTask, keyOf, planAnnouncement, planFocusArea, planTask, type AnnouncementPlan, type FocusAreaPlan, type TaskPlan } from './action-planners';
import type { ActionProposal, ActionReceipt, RecurringPracticePlan } from './action-types';
import { CoachContextError, type CoachChatContext } from './context';
import { CREATE_FLOWS, LINEUP_FLOWS, drillFlow, flowRequestId, rowSince, type FlowDef, type FlowDone } from './create-tools';
import { landingRows } from './landing-rows';
import { publishFlow } from './practice-draft';
import { executeRecurringPractice, planRecurringPractice } from './practice-planner';

/** What every task tool here returns from `plan`: the card, the tool it belongs to, the input the write will use, and when it was planned. JSON-safe. */
export type TaskProposal = ActionProposal & { tool: string; input: unknown; planned_at: string };

type Looked = 'there' | 'not_there' | 'unknown';
const now = () => new Date().toISOString();
/** The card was planned a little before any row it wrote; the margin covers clock difference between the app and the database. */
const sinceOf = (proposal: TaskProposal): string => new Date(Date.parse(proposal.planned_at || now()) - 120_000).toISOString();

function coachOnly(ctx: ToolContext): CoachChatContext {
  if (isPlayerContext(ctx.who)) throw new CoachContextError('Only a coach can do that.', 403);
  return ctx.who;
}

const completed = (action: string, d: FlowDone, notifications: ActionReceipt['notifications'] = []): ActionReceipt => ({ status: 'completed', action, summary: d.summary, created: [{ kind: d.kind, count: 1, ...(d.href ? { href: d.href } : {}), ...(d.label ? { label: d.label } : {}) }], notifications, partial_failures: [], retryable: false, at: now() });

/** The receipt of a write that did not go through, saying only what was checked. */
export function failedReceipt(action: string, looked: Looked, error: string | undefined, where: string): ActionReceipt {
  const reason = error?.trim() || 'That didn’t go through.';
  if (looked === 'not_there') return { status: 'failed', action, summary: `${reason.replace(/\s*Nothing was (saved|changed|delivered)\.?$/i, '')} Nothing was saved.`.trim(), created: [], notifications: [], partial_failures: [], ...(error ? { error } : {}), retryable: true, at: now() };
  return { status: 'failed', action, summary: `${reason.replace(/\s*Nothing was (saved|changed|delivered)\.?$/i, '')} I could not check whether anything was saved: look in ${where} before trying again.`.trim(), created: [], notifications: [], partial_failures: [], ...(error ? { error } : {}), retryable: false, at: now() };
}

const WHERE: Record<string, string> = {
  create_event: 'the Calendar',
  create_recurring_practice: 'the Calendar',
  add_blocked_time: 'the Calendar',
  add_team_break: 'the Calendar',
  save_team_term: 'Settings',
  create_trip: 'Travel',
  create_qualifier: 'Qualifiers',
  create_goal: 'the player’s goals',
  create_focus_area: 'the player’s focus areas',
  create_task: 'Tasks',
  create_team_announcement: 'Announcements',
  add_round_note: 'the round',
  set_availability_note: 'the Roster',
  create_recruit: 'Recruiting',
  set_lineup: 'the tournament',
  lock_lineup: 'the tournament',
  create_drill: 'the drill bank',
  publish_artifact: 'Documents',
  publish_practice_plan: 'the practice plan',
  send_message: 'Messages',
};

async function attempt(action: string, run: () => Promise<ActionReceipt>): Promise<ActionReceipt> {
  try {
    return await run();
  } catch (err) {
    void logServerError(`coachhelm task write threw: ${action}`, { action: `coachhelm.tool.${action}.commit`, feature: 'coachhelm_chat', handled: true }, 'warning');
    return { status: 'failed', action, summary: 'That didn’t go through.', created: [], notifications: [], partial_failures: [], error: err instanceof Error ? err.message : String(err), retryable: false, at: now() };
  }
}

/**
 * The write, guarded both ways: look first (an earlier attempt of this card), write, and on failure look again.
 * `look` returns the receipt of the row it found, `not_there`, or `unknown`.
 */
export async function commitOnce(action: string, look: () => Promise<ActionReceipt | Exclude<Looked, 'there'>>, write: () => Promise<ActionReceipt>): Promise<ActionReceipt> {
  const before = await look().catch(() => 'unknown' as const);
  if (typeof before === 'object') return before;
  const receipt = await attempt(action, write);
  if (receipt.status !== 'failed') return receipt;
  const after = await look().catch(() => 'unknown' as const);
  if (typeof after === 'object') return after;
  return failedReceipt(action, after, receipt.error ?? receipt.summary, WHERE[action] ?? 'the app');
}

// ---------------------------------------------------------------------------------------------------------------------
// The create flows (create-tools.ts, practice-draft.ts)
// ---------------------------------------------------------------------------------------------------------------------

function flowTask<I>(f: FlowDef<I>): TaskTool<I, TaskProposal> {
  return {
    kind: 'task',
    name: f.name,
    description: f.description,
    input: f.input,
    progress: () => PROGRESS[f.name] ?? 'Preparing that',
    ...(f.immediate ? { immediate: true } : {}),
    plan: async (ctx, input) => {
      const who = coachOnly(ctx);
      const prepared = f.prepare ? await f.prepare(ctx.sb, who, input) : input;
      const d = f.plan(who, prepared);
      // The rows this lands between, for the card. A failed look draws the new row alone; it is never a reason to refuse the card.
      const neighbours = await landingRows(ctx.sb, who, f.name, input).catch(() => null);
      return { ...(d.visual ? { visual: d.visual } : {}), ...(d.publish ? { publish: d.publish } : {}), ...(neighbours?.length ? { neighbours } : {}), action: d.action, summary: d.summary, facts: d.facts, affects: d.affects ?? [], notifications: d.notifications, missing: d.facts.filter((x) => x.missing).map((x) => x.label), idempotency_key: keyOf(d.key), tool: f.name, input: prepared, planned_at: now() };
    },
    commit: async (ctx, proposal) => {
      const who = coachOnly(ctx);
      const parsed = f.input.safeParse(proposal.input);
      if (!parsed.success) return failedReceipt(f.name, 'not_there', 'This card could not be read back, so it was not run.', WHERE[f.name] ?? 'the app');
      const input = parsed.data;
      const requestId = flowRequestId(who.coach_id, who.team_id, proposal.idempotency_key);
      const look = async (): Promise<ActionReceipt | 'not_there' | 'unknown'> => {
        if (f.landed) {
          const { data, error } = await askTables(ctx.sb).from(f.landed.table).select('id').eq('id', requestId).maybeSingle();
          return error ? 'unknown' : data ? completed(f.name, f.landed.done(input)) : 'not_there';
        }
        if (f.written && f.done) {
          const found = await f.written(ctx.sb, who, input, { since: sinceOf(proposal), requestId });
          return found === null ? 'unknown' : found ? completed(f.name, f.done(who, input)) : 'not_there';
        }
        return 'unknown';
      };
      return commitOnce(
        f.name,
        // With nothing to look by, the first look must not block the write: only a found row short-circuits it.
        look,
        async () => {
          const r = await f.run(who, input, { sb: ctx.sb, requestId });
          return r.ok ? completed(f.name, r, r.notifications) : { status: 'failed', action: f.name, summary: r.error ?? 'That didn’t go through.', created: [], notifications: [], partial_failures: [], ...(r.error ? { error: r.error } : {}), retryable: false, at: now() };
        },
      );
    },
  };
}

const PROGRESS: Record<string, string> = {
  create_event: 'Preparing the event',
  create_trip: 'Preparing the trip',
  create_qualifier: 'Preparing the qualifier',
  create_goal: 'Drafting the goal',
  add_round_note: 'Reading the note on that round',
  add_blocked_time: 'Preparing the blocked time',
  add_team_break: 'Preparing the break',
  save_team_term: 'Preparing the term',
  set_availability_note: 'Drafting the note',
  create_recruit: 'Preparing the recruit',
  set_lineup: 'Preparing the lineup',
  lock_lineup: 'Preparing to lock the lineup',
  create_drill: 'Drafting the drill',
  publish_artifact: 'Preparing to publish',
  publish_practice_plan: 'Preparing to publish the plan',
  send_message: 'Drafting the message',
};

// ---------------------------------------------------------------------------------------------------------------------
// The four that write through the older planners: no request id downstream, so the look is the natural key
// ---------------------------------------------------------------------------------------------------------------------

const PlayerId = z.string().uuid();
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function plannedTask<I, TPlan>(def: {
  name: string;
  description: string;
  input: z.ZodType<I>;
  progress: string;
  plan: (who: CoachChatContext, input: I) => { plan: TPlan; proposal: ActionProposal };
  run: (who: CoachChatContext, plan: TPlan) => Promise<ActionReceipt>;
  /** The row this card writes, among rows made since it was planned. */
  written: (ctx: ToolContext, who: CoachChatContext, plan: TPlan, since: string) => Promise<boolean | null>;
  done: (plan: TPlan) => FlowDone;
}): TaskTool<I, TaskProposal> {
  return {
    kind: 'task',
    name: def.name,
    description: def.description,
    input: def.input,
    progress: () => def.progress,
    plan: async (ctx, input) => {
      const who = coachOnly(ctx);
      const built = def.plan(who, input);
      return { ...built.proposal, tool: def.name, input: built.plan, planned_at: now() };
    },
    commit: async (ctx, proposal) => {
      const who = coachOnly(ctx);
      const plan = proposal.input as TPlan;
      return commitOnce(
        def.name,
        async () => {
          const found = await def.written(ctx, who, plan, sinceOf(proposal));
          return found === null ? 'unknown' : found ? completed(def.name, def.done(plan)) : 'not_there';
        },
        () => def.run(who, plan),
      );
    },
  };
}

const createFocusArea = plannedTask<Parameters<typeof planFocusArea>[1], FocusAreaPlan>({
  name: 'create_focus_area',
  description: 'Give one player a development focus area. Pass from_insight_id when it comes from a signal you read, so its effect can be tracked. The player accepts it before the improvement window opens; the card says so.',
  input: z.object({
    player_id: PlayerId,
    title: z.string().min(1).max(120),
    area_type: z.enum(['putting', 'driving', 'iron_play', 'short_game', 'course_management', 'mental_game', 'fitness', 'other']),
    description: z.string().max(600).optional(),
    target_metric: z.string().max(60).optional().describe('The metric it will be judged on.'),
    current_value: z.number().optional(),
    target_value: z.number().optional(),
    target_date: Day.optional(),
    target_rounds: z.number().int().min(1).max(60).optional(),
    from_insight_id: z.string().uuid().optional(),
  }),
  progress: 'Drafting a focus area',
  plan: planFocusArea,
  run: (_who, plan) => executeFocusArea(plan),
  written: (ctx, _who, plan, since) => rowSince(ctx.sb, 'golf_player_focus_areas', { player_id: plan.player_id, title: plan.title.trim() }, since),
  done: (plan) => ({ summary: `The focus area for ${plan.player_name} is created.`, kind: 'focus_area', label: plan.title }),
});

const createTask = plannedTask<Parameters<typeof planTask>[1], TaskPlan>({
  name: 'create_task',
  description: 'Assign a task to players. Leave assign_to_player_ids out to assign it to the whole active roster.',
  input: z.object({ title: z.string().min(1).max(160), description: z.string().max(600).optional(), due_date: Day.optional(), priority: z.enum(['low', 'medium', 'high']).optional(), assign_to_player_ids: z.array(PlayerId).optional() }),
  progress: 'Drafting a task',
  plan: planTask,
  run: (_who, plan) => executeTask(plan),
  written: (ctx, who, plan, since) => rowSince(ctx.sb, 'golf_tasks', { team_id: who.team_id, title: plan.title.trim() }, since),
  done: (plan) => ({ summary: `The task is assigned to ${plan.assignee_ids.length} ${plan.assignee_ids.length === 1 ? 'player' : 'players'}.`, kind: 'task', label: plan.title }),
});

const createTeamAnnouncement = plannedTask<Parameters<typeof planAnnouncement>[1], AnnouncementPlan>({
  name: 'create_team_announcement',
  description: 'Send a team update. The full text is on the card before anything goes out. Leave recipient_player_ids out to send to the whole team.',
  input: z.object({ title: z.string().min(1).max(120), body: z.string().min(1).max(2000), urgency: z.enum(['low', 'normal', 'high', 'urgent']).optional(), requires_acknowledgement: z.boolean().optional(), recipient_player_ids: z.array(PlayerId).optional() }),
  progress: 'Drafting a team update',
  plan: planAnnouncement,
  run: (_who, plan) => executeAnnouncement(plan),
  written: (ctx, who, plan, since) => rowSince(ctx.sb, 'golf_announcements', { team_id: who.team_id, title: plan.title.trim() }, since),
  done: (plan) => ({ summary: `The update "${plan.title.trim()}" is sent.`, kind: 'announcement', label: plan.title }),
});

const createRecurringPractice = plannedTask<Parameters<typeof planRecurringPractice>[1], RecurringPracticePlan>({
  name: 'create_recurring_practice',
  description: 'Put a repeating practice on the calendar and invite players. occurrence_count is required: ask if the coach did not say how many, never create an open-ended series. requires_rsvp is off unless the coach asks for replies; with it off players get no notification. The card lists every date.',
  input: z.object({
    title: z.string().max(120).optional().describe('Default "Team practice".'),
    description: z.string().max(500).optional(),
    weekdays: z.array(z.number().int().min(0).max(6)).min(1).describe('0 is Sunday; Tuesday is 2.'),
    start_time: z.string().regex(/^\d{1,2}:\d{2}$/).describe('24-hour HH:mm, the team\'s local time.'),
    end_time: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
    location: z.string().max(200).optional(),
    occurrence_count: z.number().int().min(1).max(26),
    first_date: Day.optional(),
    requires_rsvp: z.boolean().default(false),
    rsvp_deadline: z.string().datetime().nullable().optional(),
    invited_player_ids: z.array(PlayerId).optional().describe('Leave out to invite the whole active roster.'),
  }),
  progress: 'Preparing the practice dates',
  plan: planRecurringPractice,
  run: (who, plan) => executeRecurringPractice(who, plan),
  written: (ctx, who, plan, since) => rowSince(ctx.sb, 'golf_events', { team_id: who.team_id, title: plan.title }, since),
  done: (plan) => ({ summary: `${plan.title} is on the calendar. Check the dates there: an earlier attempt created them and I did not create them again.`, kind: 'event', label: plan.title, href: '/golf/dashboard/calendar' }),
});

// ---------------------------------------------------------------------------------------------------------------------
// The list, and the way back from a ledger row
// ---------------------------------------------------------------------------------------------------------------------

const flows = (names: readonly string[]) => (CREATE_FLOWS as ReadonlyArray<FlowDef<never>>).filter((f) => names.includes(f.name)).map((f) => flowTask(f));
const QUIET = ['create_event', 'create_trip', 'create_qualifier', 'create_goal', 'add_round_note', 'add_blocked_time', 'add_team_break', 'save_team_term', 'set_availability_note', 'create_recruit'];

// Built once: the tools hold no request state, and a stable list is a stable cached prefix.
const EVENT_FLOWS = flows(QUIET);
const PUBLISH_ARTIFACT = flows(['publish_artifact']);
const SEND_MESSAGE = flows(['send_message']);
const LINEUP = (LINEUP_FLOWS as ReadonlyArray<FlowDef<never>>).map((f) => flowTask(f));
const DRILL = flowTask(drillFlow);
const PUBLISH_PLAN = flowTask(publishFlow);

/** Every task a coach surface offers, in a fixed order. `quickChat`: the card's Send is the coach's, so it has send_message and no publish_artifact. */
export function taskTools(opts: { quickChat: boolean }): ChatTool[] {
  return [...EVENT_FLOWS, createRecurringPractice, createFocusArea, createTask, createTeamAnnouncement, DRILL, PUBLISH_PLAN, ...(opts.quickChat ? SEND_MESSAGE : PUBLISH_ARTIFACT), ...(isFlagEnabled('golf_tournaments_v1') ? LINEUP : [])] as ChatTool[];
}
