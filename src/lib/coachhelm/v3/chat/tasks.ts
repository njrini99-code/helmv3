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
import type { ActionLanding, ActionProposal, ActionReceipt, CardDelivery, CardVisibility, ProposalFact, RecurringPracticePlan } from './action-types';
import { announcementDelivery, coachNameOf, focusDelivery, nameList, peopleChanged, plural, reachOf, seenPlayers, seriesInviteDelivery, taskDelivery, undoFor, type SeenPlayer } from './card-truth';
import { CoachContextError, type CoachChatContext } from './context';
import { CREATE_FLOWS, CardFromBefore, LINEUP_FLOWS, createdOf, drillFlow, flowRequestId, rowSince, type FlowCard, type FlowDef, type FlowDone, type FlowResult } from './create-tools';
import { editableFields, reviseInput } from './editable';
import { landingRows } from './landing-rows';
import { publishFlow } from './practice-draft';
import { executeRecurringPractice, planRecurringPractice } from './practice-planner';

/** What every task tool here returns from `plan`: the card, the tool it belongs to, the input the write will use, and when it was planned. JSON-safe. */
export type TaskProposal = ActionProposal & { tool: string; input: unknown; planned_at: string };

/**
 * A task whose card the coach can edit before confirming. `revise` takes the stored proposal and the coach's edits
 * (`{ [EditableField.key]: value }`, `null` to clear) and answers with a new proposal, built by the same planner with
 * the same reads and checks as `plan`. It calls no model and writes nothing. It throws an `Error` whose message the
 * coach can read when an edit is not allowed or not valid; the card then stays as it was. The new proposal's
 * `idempotency_key` is the planner's: the engine keeps the card's own key and seals the new plan (CONTRACT_NOTES, PLANS P11).
 */
export type RevisableTask<I> = TaskTool<I, TaskProposal> & { revise: (ctx: ToolContext, proposal: TaskProposal, edits: Record<string, unknown>) => Promise<TaskProposal> };

type Looked = 'there' | 'not_there' | 'unknown';
const now = () => new Date().toISOString();
/** The card was planned a little before any row it wrote; the margin covers clock difference between the app and the database. */
const sinceOf = (proposal: TaskProposal): string => new Date(Date.parse(proposal.planned_at || now()) - 120_000).toISOString();

function coachOnly(ctx: ToolContext): CoachChatContext {
  if (isPlayerContext(ctx.who)) throw new CoachContextError('Only a coach can do that.', 403);
  return ctx.who;
}

/** A write that landed, as the receipt says it: the row and its address, what went out and to whom, and who it missed. `partial` lines make it a partial receipt. */
const completed = (action: string, d: FlowDone & Pick<FlowResult, 'missed' | 'partial'>, notifications: ActionReceipt['notifications'] = []): ActionReceipt => ({
  status: d.partial?.length ? 'partial' : 'completed',
  action,
  summary: d.summary,
  created: createdOf(d),
  notifications,
  ...(d.href ? { href: d.href } : {}),
  ...(d.missed?.length ? { missed: d.missed } : {}),
  partial_failures: d.partial ?? [],
  retryable: false,
  at: now(),
});

/** The card is no longer true: nothing was written, and the same card must not be offered again. The coach asks for a fresh one. */
export const staleReceipt = (action: string, said: string): ActionReceipt => ({ status: 'failed', action, summary: said, created: [], notifications: [], partial_failures: [], error: 'card_out_of_date', retryable: false, at: now() });
const UNCHECKED = 'This card could not be checked against the app just now, so it was not run. Nothing was saved. Try again in a moment.';

/** The fields of a card that the server resolved, carried onto the proposal. Every task says whether it can be undone. */
const truthOf = (tool: string, d: Pick<FlowCard, 'recipients' | 'not_reached' | 'delivery' | 'visible_to' | 'visible_note' | 'undo' | 'impact'>) => ({
  ...(d.recipients ? { recipients: d.recipients } : {}),
  ...(d.not_reached?.length ? { not_reached: d.not_reached } : {}),
  ...(d.delivery !== undefined ? { delivery: d.delivery } : {}),
  ...(d.visible_to ? { visible_to: d.visible_to } : {}),
  ...(d.visible_note ? { visible_note: d.visible_note } : {}),
  ...(d.impact ? { impact: d.impact } : {}),
  undo: d.undo ?? undoFor(tool),
});

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

/**
 * Where each task's row appears once it is written (`ActionProposal.lands`): the page's kind for it and the page it
 * lives on. Known when the card is planned, from the tool and its own input, so the page behind the chat can keep a
 * place for it while the write is held. A task that adds no row to a list (a note, a term, a lock) has none.
 */
const DASH = '/golf/dashboard';
const day = (value: unknown): string | undefined => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : undefined);
const uuid = (value: unknown): string | undefined => (typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value) ? value : undefined);
export function landsFor(tool: string, input: unknown): ActionLanding | undefined {
  const i = (input ?? {}) as Record<string, unknown>;
  const on = (kind: string, home: string, date?: string): ActionLanding => ({ kind, home, ...(date ? { day: date } : {}) });
  switch (tool) {
    case 'create_event':
      return on('event', `${DASH}/calendar`, day(i.date));
    case 'create_recurring_practice':
      return on('event', `${DASH}/calendar`, day(i.start_date) ?? day(i.first_date));
    case 'add_blocked_time':
      return on('blocked_time', `${DASH}/calendar`, day(i.date));
    case 'create_task':
      return on('task', `${DASH}/tasks`);
    case 'create_team_announcement':
      return on('announcement', `${DASH}/announcements`);
    case 'create_trip':
      return on('trip', `${DASH}/travel`, day(i.departure_date));
    case 'create_qualifier':
      return on('qualifier', `${DASH}/qualifiers`, day(i.start_date));
    case 'create_recruit':
      return on('recruit', `${DASH}/recruiting`);
    case 'create_focus_area':
      return uuid(i.player_id) ? on('focus_area', `${DASH}/roster?player=${uuid(i.player_id)}`) : undefined;
    case 'send_message':
      return uuid(i.conversation_id) ? on('message', `${DASH}/messages?conversation=${uuid(i.conversation_id)}`) : undefined;
    case 'set_lineup':
      return uuid(i.tournament_id) ? on('lineup', `${DASH}/tournaments/${uuid(i.tournament_id)}`) : undefined;
    case 'publish_practice_plan':
      return uuid(i.plan_id) ? on('plan', `${DASH}/practice/plan/${uuid(i.plan_id)}`) : undefined;
    default:
      return undefined;
  }
}
const withLanding = (tool: string, input: unknown): { lands?: ActionLanding } => {
  const lands = landsFor(tool, input);
  return lands ? { lands } : {};
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
export async function commitOnce(action: string, look: () => Promise<ActionReceipt | Exclude<Looked, 'there'>>, write: () => Promise<ActionReceipt>, stale?: () => Promise<string | null>): Promise<ActionReceipt> {
  const before = await look().catch(() => 'unknown' as const);
  if (typeof before === 'object') return before;
  // Not written yet. Is the card still true? If the world moved under it, nothing is written and the coach gets a fresh card.
  // (After the look, so a second run of a card that already landed is reported done, not stale.)
  if (stale) {
    let said: string | null;
    try {
      said = await stale();
    } catch (err) {
      // A card from before cards carried what the server read: it cannot be held to the app, so it is not run.
      if (err instanceof CardFromBefore) return staleReceipt(action, 'This card was made before an update to the app and can no longer be checked, so it was not run. Nothing was saved. Ask for it again.');
      // The check could not be made, so nothing is written. Whether an earlier run of this card wrote anything is only known if the look worked.
      return before === 'not_there' ? { ...staleReceipt(action, UNCHECKED), error: 'card_not_checked', retryable: true } : failedReceipt(action, 'unknown', 'This card could not be checked against the app just now, so it was not run.', WHERE[action] ?? 'the app');
    }
    if (said) return staleReceipt(action, said);
  }
  const receipt = await attempt(action, write);
  if (receipt.status !== 'failed') return receipt;
  const after = await look().catch(() => 'unknown' as const);
  if (typeof after === 'object') return after;
  return failedReceipt(action, after, receipt.error ?? receipt.summary, WHERE[action] ?? 'the app');
}

// ---------------------------------------------------------------------------------------------------------------------
// The create flows (create-tools.ts, practice-draft.ts)
// ---------------------------------------------------------------------------------------------------------------------

function flowTask<I>(f: FlowDef<I>): RevisableTask<I> {
  const plan = async (ctx: ToolContext, input: I): Promise<TaskProposal> => {
      const who = coachOnly(ctx);
      const prepared = f.prepare ? await f.prepare(ctx.sb, who, input) : input;
      const d = f.plan(who, prepared);
      // The rows this lands between, for the card. A failed look draws the new row alone; it is never a reason to refuse the card.
      const neighbours = await landingRows(ctx.sb, who, f.name, input).catch(() => null);
      return { ...(d.visual ? { visual: d.visual } : {}), ...(d.publish ? { publish: d.publish } : {}), ...(neighbours?.length ? { neighbours } : {}), ...withLanding(f.name, prepared), ...truthOf(f.name, d), ...(f.editable?.length ? { editable: editableFields(f.input, f.editable, prepared, { labels: f.editLabels, people: who.roster }) } : {}), action: d.action, summary: d.summary, facts: d.facts, affects: d.affects ?? [], notifications: d.notifications, missing: d.facts.filter((x) => x.missing).map((x) => x.label), idempotency_key: keyOf(d.key), tool: f.name, input: prepared, planned_at: now() };
  };
  return {
    kind: 'task',
    name: f.name,
    description: f.description,
    input: f.input,
    progress: () => PROGRESS[f.name] ?? 'Preparing that',
    ...(f.immediate ? { immediate: true } : {}),
    plan,
    // The coach's edits on the card: the stored input with them, held to the task's own schema, then planned again with every read and check `plan` makes.
    revise: async (ctx, proposal, edits) => {
      coachOnly(ctx);
      return plan(ctx, reviseInput(f.input, proposal.input, edits, f.editable ?? []));
    },
    commit: async (ctx, proposal) => {
      const who = coachOnly(ctx);
      // The stored input carries what the server read for the card (`seen`); `stored` keeps it, where `input` would drop it.
      const parsed = (f.stored ?? f.input).safeParse(proposal.input);
      if (!parsed.success) return failedReceipt(f.name, 'not_there', 'This card could not be read back, so it was not run.', WHERE[f.name] ?? 'the app');
      const input = parsed.data;
      const requestId = flowRequestId(who.coach_id, who.team_id, proposal.idempotency_key);
      // Where the row's id is the request id (the calendar's rows, a recruit), the receipt can say which row it wrote, and an
      // event's link opens that event on its day.
      const row = <D extends FlowDone>(d: D): D => (f.landed ? { ...d, id: requestId, ...(f.landed.table === 'golf_events' && d.href ? { href: `${d.href}${d.href.includes('?') ? '&' : '?'}event=${requestId}` } : {}) } : d);
      const look = async (): Promise<ActionReceipt | 'not_there' | 'unknown'> => {
        if (f.landed) {
          const { data, error } = await askTables(ctx.sb).from(f.landed.table).select('id').eq('id', requestId).maybeSingle();
          return error ? 'unknown' : data ? completed(f.name, row(f.landed.done(input))) : 'not_there';
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
          return r.ok ? completed(f.name, row(r), r.notifications) : { status: 'failed', action: f.name, summary: r.error ?? 'That didn’t go through.', created: [], notifications: [], partial_failures: [], ...(r.error ? { error: r.error } : {}), retryable: false, at: now() };
        },
        f.stale ? () => f.stale!(ctx.sb, who, input) : undefined,
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

/** What the server reads for a planned task's card after its planner ran: who it reaches and what they get. */
interface PlannedTruth {
  /** The players the card names (roster ids). */
  ids: readonly string[];
  /** False: nothing is sent to anyone, whoever is named. */
  sends: boolean;
  /** How it arrives, for the receipt. */
  channels: string[];
  delivery: () => CardDelivery | Promise<CardDelivery>;
  /** The card's "what is sent" lines, given the words and how many are reached. */
  told: (delivery: CardDelivery, reached: number) => string[];
  /** The same lines when nothing is sent. */
  nobody: string[];
  visible_to: CardVisibility;
  visible_note: string;
  /** Values the write carries that the planner's facts do not show. */
  facts?: ProposalFact[];
  visual?: ActionProposal['visual'];
}
type WithPeople = { seen_people?: SeenPlayer[] };

function plannedTask<I, TPlan extends WithPeople>(def: {
  name: string;
  description: string;
  input: z.ZodType<I>;
  progress: string;
  plan: (who: CoachChatContext, input: I) => { plan: TPlan; proposal: ActionProposal };
  truth: (ctx: ToolContext, who: CoachChatContext, plan: TPlan) => PlannedTruth;
  /** How the notice arrives, from the stored plan, for the receipt. Empty: nothing was sent. */
  channels: (plan: TPlan) => string[];
  run: (who: CoachChatContext, plan: TPlan, requestId: string) => Promise<ActionReceipt>;
  /** The row this card writes: by its request id where the action keeps one, else among rows made since it was planned. */
  written: (ctx: ToolContext, who: CoachChatContext, plan: TPlan, at: { since: string; requestId: string }) => Promise<boolean | null>;
  done: (plan: TPlan) => FlowDone;
  /** A further check at commit that the card is still true, beyond the people on it. */
  stale?: (ctx: ToolContext, who: CoachChatContext, plan: TPlan) => Promise<string | null>;
  /** The keys of `input` a coach may change on the card, and the card's label for each. */
  editable: readonly string[];
  editLabels?: Record<string, string>;
  /** The model's input back from a stored plan, where the plan is not the input with more on it. */
  toInput?: (plan: TPlan) => unknown;
}): RevisableTask<I> {
  const plan = async (ctx: ToolContext, input: I): Promise<TaskProposal> => {
      const who = coachOnly(ctx);
      const built = def.plan(who, input);
      // Who is reached is read here, not taken from the planner's count: a player with no account is named as not reached.
      const truth = def.truth(ctx, who, built.plan);
      const people = await seenPlayers(ctx.sb, who, truth.ids);
      const { recipients, not_reached } = reachOf(people, truth.sends);
      const delivery = recipients.length ? await truth.delivery() : null;
      const stored: TPlan = { ...built.plan, seen_people: people };
      const neighbours = await landingRows(ctx.sb, who, def.name, input).catch(() => null);
      return {
        ...built.proposal,
        ...(truth.visual ? { visual: truth.visual } : {}),
        facts: [...built.proposal.facts, ...(truth.facts ?? []), ...(not_reached.length ? [{ label: 'Will not get it', value: `${nameList(not_reached.map((p) => p.name))} (${not_reached[0]!.reason})` }] : [])],
        notifications: delivery ? truth.told(delivery, recipients.length) : truth.nobody,
        ...(neighbours?.length ? { neighbours } : {}),
        ...withLanding(def.name, { ...(input as object), ...(stored as object) }),
        ...truthOf(def.name, { recipients, not_reached, delivery, visible_to: truth.visible_to, visible_note: truth.visible_note }),
        ...(def.editable.length ? { editable: editableFields(def.input, def.editable, def.toInput ? def.toInput(stored) : stored, { labels: def.editLabels, people: who.roster }) } : {}),
        tool: def.name,
        input: stored,
        planned_at: now(),
      };
  };
  return {
    kind: 'task',
    name: def.name,
    description: def.description,
    input: def.input,
    progress: () => def.progress,
    plan,
    revise: async (ctx, proposal, edits) => {
      coachOnly(ctx);
      const plan0 = proposal.input as TPlan;
      return plan(ctx, reviseInput(def.input, def.toInput ? def.toInput(plan0) : plan0, edits, def.editable));
    },
    commit: async (ctx, proposal) => {
      const who = coachOnly(ctx);
      const plan = proposal.input as TPlan;
      const requestId = flowRequestId(who.coach_id, who.team_id, proposal.idempotency_key);
      const seen = plan.seen_people ?? [];
      const channels = def.channels(plan);
      const { recipients, not_reached } = reachOf(seen, channels.length > 0);
      // What went out, by name. Queued: the app's actions hand notices off after they answer, so "sent" would be a claim nobody checked.
      const told = (receipt: ActionReceipt): ActionReceipt =>
        receipt.status !== 'completed' || !plan.seen_people
          ? receipt
          : {
              ...receipt,
              notifications: recipients.length ? channels.map((channel) => ({ channel, recipients: recipients.length, status: 'queued' as const, to: recipients.map((p) => p.name) })) : [],
              ...(not_reached.length ? { missed: not_reached.map((p) => ({ name: p.name, reason: p.reason })) } : {}),
              ...(receipt.created[0]?.href ? { href: receipt.created[0].href } : {}),
            };
      return commitOnce(
        def.name,
        async () => {
          const found = await def.written(ctx, who, plan, { since: sinceOf(proposal), requestId });
          return found === null ? 'unknown' : found ? told(completed(def.name, def.done(plan))) : 'not_there';
        },
        async () => told(await def.run(who, plan, requestId)),
        async () => (await peopleChanged(ctx.sb, who, seen, 'Nothing was saved.')) ?? (def.stale ? def.stale(ctx, who, plan) : null),
      );
    },
  };
}

const createFocusArea = plannedTask<Parameters<typeof planFocusArea>[1], FocusAreaPlan>({
  name: 'create_focus_area',
  description: 'Give one player a development focus area. Pass from_insight_id when it comes from a signal you read, so its effect can be tracked.',
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
  editable: ['title', 'description', 'target_value', 'target_date', 'target_rounds'],
  editLabels: { title: 'Focus', description: 'Details', target_value: 'Target', target_date: 'By', target_rounds: 'Over' },
  plan: planFocusArea,
  truth: (ctx, who, plan) => ({
    ids: [plan.player_id],
    sends: true,
    channels: ['in_app', 'email'],
    delivery: async () => focusDelivery(await coachNameOf(ctx.sb, who), plan.title),
    told: (d) => [`${plan.player_name} is told once Undo closes and asked to accept it: “${d.title}”, “${d.body}”.`],
    nobody: [`Nobody is told: ${plan.player_name} has no account yet, so nobody can accept it.`],
    visible_to: 'recipients',
    visible_note: `${plan.player_name} and this team’s coaches see it.`,
    // Saved with the focus area, so shown with it.
    facts: plan.description ? [{ label: 'Details', value: plan.description }] : [],
  }),
  channels: () => ['in_app', 'email'],
  run: (_who, plan) => executeFocusArea(plan),
  written: (ctx, _who, plan, { since }) => rowSince(ctx.sb, 'golf_player_focus_areas', { player_id: plan.player_id, title: plan.title.trim() }, since),
  done: (plan) => ({ summary: `The focus area for ${plan.player_name} is created.`, kind: 'focus_area', label: plan.title, href: `${DASH}/roster?player=${plan.player_id}` }),
});

const createTask = plannedTask<Parameters<typeof planTask>[1], TaskPlan>({
  name: 'create_task',
  description: 'Assign a task to players. Leave assign_to_player_ids out to assign it to the whole active roster.',
  input: z.object({ title: z.string().min(1).max(160), description: z.string().max(600).optional(), due_date: Day.optional(), priority: z.enum(['low', 'medium', 'high']).optional(), assign_to_player_ids: z.array(PlayerId).optional() }),
  progress: 'Drafting a task',
  editable: ['title', 'description', 'due_date', 'priority', 'assign_to_player_ids'],
  editLabels: { title: 'Task', description: 'Details', due_date: 'Due', assign_to_player_ids: 'Assigned to' },
  // The card names every assignee, so the field holds them, whole roster or not.
  toInput: (plan) => ({ ...plan, assign_to_player_ids: plan.assignee_ids }),
  plan: planTask,
  truth: (_ctx, _who, plan) => ({
    ids: plan.assignee_ids,
    sends: true,
    channels: ['in_app', 'email'],
    delivery: () => taskDelivery(plan.title, plan.due_date),
    told: (d, n) => [`${plural(n, 'player')} ${n === 1 ? 'is' : 'are'} told in the app and by email once Undo closes: “${d.title}”, “${d.body}”.`],
    nobody: ['Nobody is told: none of these players has an account yet.'],
    visible_to: 'recipients',
    visible_note: 'The players it is assigned to and this team’s coaches see it in Tasks.',
    facts: plan.description ? [{ label: 'Details', value: plan.description }] : [],
  }),
  channels: () => ['in_app', 'email'],
  run: (_who, plan) => executeTask(plan),
  written: (ctx, who, plan, { since }) => rowSince(ctx.sb, 'golf_tasks', { team_id: who.team_id, title: plan.title.trim() }, since),
  done: (plan) => ({ summary: `The task is assigned to ${plan.assignee_ids.length} ${plan.assignee_ids.length === 1 ? 'player' : 'players'}.`, kind: 'task', label: plan.title, href: `${DASH}/tasks` }),
});

const createTeamAnnouncement = plannedTask<Parameters<typeof planAnnouncement>[1], AnnouncementPlan>({
  name: 'create_team_announcement',
  description: 'Send a team update. The full text is on the card before anything goes out. Leave recipient_player_ids out to send to the whole team.',
  input: z.object({ title: z.string().min(1).max(120), body: z.string().min(1).max(2000), urgency: z.enum(['low', 'normal', 'high', 'urgent']).optional(), requires_acknowledgement: z.boolean().optional(), recipient_player_ids: z.array(PlayerId).optional() }),
  progress: 'Drafting a team update',
  editable: ['title', 'body', 'urgency', 'requires_acknowledgement', 'recipient_player_ids'],
  editLabels: { body: 'Message', requires_acknowledgement: 'Acknowledgement', recipient_player_ids: 'To' },
  // "The whole team" is shown as the people it was when the card was made; an edited card sends to exactly the people it lists.
  toInput: (plan) => ({ ...plan, recipient_player_ids: plan.recipient_ids ?? plan.seen_people?.map((p) => p.id) }),
  plan: planAnnouncement,
  truth: (_ctx, who, plan) => ({
    ids: plan.recipient_ids ?? who.roster.map((p) => p.id),
    sends: true,
    channels: ['push', 'in_app', 'email'],
    delivery: () => announcementDelivery(plan.title, plan.body),
    told: (d, n) => [`${plural(n, 'player')} ${n === 1 ? 'gets' : 'get'} it in the app, as a push (“${d.title}”, “${d.body}”) and by email once Undo closes.`, ...(plan.requires_acknowledgement ? ['Each player must acknowledge it.'] : [])],
    nobody: ['Nobody is told: none of these players has an account yet.'],
    visible_to: 'recipients',
    visible_note: plan.recipient_ids ? 'The players it is sent to and this team’s coaches see it in Announcements.' : `Every player and coach on ${who.team_name} sees it in Announcements.`,
  }),
  channels: () => ['push', 'in_app', 'email'],
  run: (_who, plan) => executeAnnouncement(plan),
  written: (ctx, who, plan, { since }) => rowSince(ctx.sb, 'golf_announcements', { team_id: who.team_id, title: plan.title.trim() }, since),
  done: (plan) => ({ summary: `The update "${plan.title.trim()}" is sent.`, kind: 'announcement', label: plan.title, href: `${DASH}/announcements` }),
  // "The whole team" is sent to the team as it is when it sends: if someone joined since the card, the card's list is short.
  stale: async (_ctx, who, plan) => {
    if (plan.recipient_ids || !plan.seen_people) return null;
    const seen = new Set(plan.seen_people.map((p) => p.id));
    const joined = who.roster.filter((p) => !seen.has(p.id));
    return joined.length ? `${nameList(joined.map((p) => p.name))} joined the roster after this card was made and would get it too. Nothing was sent. Ask for the update again.` : null;
  },
});

const createRecurringPractice = plannedTask<Parameters<typeof planRecurringPractice>[1], RecurringPracticePlan>({
  name: 'create_recurring_practice',
  description: 'Put a repeating practice on the calendar and invite players. Ask how many if the coach did not say; a series is never open-ended. requires_rsvp stays off unless the coach asks for replies (off means players get no notification). The card lists every date.',
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
  editable: ['title', 'description', 'start_time', 'end_time', 'location', 'occurrence_count', 'first_date', 'requires_rsvp', 'rsvp_deadline', 'invited_player_ids'],
  editLabels: { start_time: 'Starts', end_time: 'Ends', occurrence_count: 'Occurrences', first_date: 'First date', requires_rsvp: 'RSVP', rsvp_deadline: 'Reply by', invited_player_ids: 'Invites' },
  // The stored plan holds the resolved dates; the input it came from is these fields.
  toInput: (plan) => ({ title: plan.title, ...(plan.description ? { description: plan.description } : {}), weekdays: plan.weekdays, start_time: plan.start_time, ...(plan.end_time ? { end_time: plan.end_time } : {}), ...(plan.location ? { location: plan.location } : {}), occurrence_count: plan.occurrence_count, first_date: plan.start_date, requires_rsvp: plan.requires_rsvp, rsvp_deadline: plan.rsvp_deadline, invited_player_ids: plan.invited_player_ids }),
  plan: planRecurringPractice,
  truth: (_ctx, who, plan) => ({
    ids: plan.invited_player_ids,
    // A series that does not ask for replies tells nobody (owner, 2026-10-08).
    sends: plan.requires_rsvp,
    channels: ['push', 'in_app', 'email'],
    delivery: () => seriesInviteDelivery(plan),
    told: (d, n) => [`${plural(n, 'player')} ${n === 1 ? 'gets' : 'get'} one push, one bell row and one email for the series once Undo closes: “${d.title}”, “${d.body}”.`, 'Each is asked to reply.'],
    nobody: [plan.requires_rsvp ? 'Nobody is told: none of the invited players has an account yet.' : 'Nobody is told.'],
    visible_to: 'team',
    visible_note: `On the team calendar: every player and coach on ${who.team_name} can see the practices.`,
    // Written with every practice, so on the card: the end time, and the description when there is one.
    facts: [{ label: 'Ends', value: plan.end_time ?? 'Not set' }, ...(plan.description ? [{ label: 'Description', value: plan.description }] : [])],
    visual: { kind: 'series', title: plan.title, dates: plan.occurrence_dates, start: plan.start_time, end: plan.end_time, where: plan.location },
  }),
  channels: (plan) => (plan.requires_rsvp ? ['push', 'in_app', 'email'] : []),
  run: (who, plan, requestId) => executeRecurringPractice(who, plan, requestId),
  // The series' row id is this card's request id (the action keeps it), so the look is exact.
  written: (ctx, _who, _plan, { requestId }) => rowSince(ctx.sb, 'golf_events', { id: requestId }, null),
  done: (plan) => ({ summary: `${plan.title} is on the calendar. Check the dates there: an earlier attempt created them and I did not create them again.`, kind: 'event', label: plan.title, href: `/golf/dashboard/calendar?date=${plan.start_date}` }),
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
