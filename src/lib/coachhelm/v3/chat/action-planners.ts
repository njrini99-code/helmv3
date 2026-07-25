/**
 * ============================================================================
 * CoachHelm · chat · action planners — focus area, task, team update
 * ----------------------------------------------------------------------------
 * The remaining confirm-required actions, built on the same two-function shape
 * the practice slice established:
 *
 *   plan…()     resolves the proposal a coach reads. Writes nothing.
 *   execute…()  calls the EXISTING server action. Reimplements nothing.
 *
 * Each `execute` delegates to `createFocusArea`, `createTask` or
 * `createEnrichedAnnouncement`, so authorization, validation, notification
 * fan-out and lifecycle rules stay in exactly one place. If those rules change,
 * the agent path changes with them — which is the entire reason for calling
 * rather than copying.
 *
 * The idempotency keys are derived from the plan, not randomly generated, for
 * the same reason as the practice key: a retried confirm must look like the
 * SAME intent, or the ledger cannot dedupe it.
 * ========================================================================== */

import type { CoachChatContext } from './context';
import { requireRosterPlayer } from './context';
import type { ActionProposal, ActionReceipt } from './action-types';

export class ActionPlanError extends Error {}

/** Stable, plan-derived key. Two identical intents produce one write. */
function keyOf(parts: (string | number)[]): string {
  return parts
    .map((p) => String(p).toLowerCase().replace(/\s+/g, '-'))
    .join(':')
    .slice(0, 128);
}

function humanDate(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: timezone,
  }).format(new Date(`${iso.slice(0, 10)}T12:00:00Z`));
}

// ===========================================================================
// Focus area
// ===========================================================================

export interface FocusAreaPlanInput {
  player_id: string;
  title: string;
  area_type: string;
  description?: string;
  target_metric?: string;
  current_value?: number;
  target_value?: number;
  /** ISO `YYYY-MM-DD`, or a round count — never both. */
  target_date?: string;
  target_rounds?: number;
  /** The signal this came from, so the effectiveness ledger can close the loop. */
  from_insight_id?: string;
}

export interface FocusAreaPlan extends FocusAreaPlanInput {
  player_name: string;
  coach_id: string;
}

/**
 * A focus area a coach can read before it exists.
 *
 * Note the lifecycle fact stated on the card: a coach-created area is
 * PROPOSED, and the player has to accept it before the improvement window
 * opens. Leaving that off the preview would let a coach believe work had
 * started when it had not — the kind of quiet mismatch that makes people stop
 * trusting a development plan.
 */
export function planFocusArea(
  ctx: CoachChatContext,
  input: FocusAreaPlanInput,
): { plan: FocusAreaPlan; proposal: ActionProposal } {
  const player = requireRosterPlayer(ctx, input.player_id);
  const title = input.title?.trim();
  if (!title) throw new ActionPlanError('What should this focus area be called?');
  if (input.target_date && input.target_rounds) {
    throw new ActionPlanError('A focus area has either a target date or a round count, not both.');
  }

  const plan: FocusAreaPlan = { ...input, title, player_name: player.name, coach_id: ctx.coach_id };

  const facts = [
    { label: 'Player', value: player.name },
    { label: 'Focus', value: title },
    { label: 'Area', value: input.area_type.replace(/_/g, ' ') },
  ];
  if (input.target_metric) {
    facts.push({
      label: 'Target',
      value:
        input.target_value !== undefined
          ? `${input.target_metric.replace(/_/g, ' ')} → ${input.target_value}${
              input.current_value !== undefined ? ` (from ${input.current_value})` : ''
            }`
          : input.target_metric.replace(/_/g, ' '),
    });
  }
  if (input.target_date) {
    facts.push({ label: 'By', value: humanDate(input.target_date, ctx.timezone) });
  } else if (input.target_rounds) {
    facts.push({ label: 'Over', value: `${input.target_rounds} rounds` });
  }
  facts.push({
    label: 'Status',
    value: `Proposed — ${player.name} accepts before the window starts`,
  });

  const missing: string[] = [];
  if (!input.target_metric) missing.push('Measurable target');

  return {
    plan,
    proposal: {
      action: 'Create a focus area',
      summary: `${title} for ${player.name}.`,
      facts,
      affects: [{ kind: 'player', id: player.id, label: player.name }],
      notifications: [`${player.name} is notified and asked to accept it`],
      missing,
      idempotency_key: keyOf(['focus', ctx.team_id, player.id, title]),
    },
  };
}

export async function executeFocusArea(plan: FocusAreaPlan): Promise<ActionReceipt> {
  const at = new Date().toISOString();
  const { createFocusArea } = await import('@/app/golf/actions/development');

  const result = await createFocusArea({
    player_id: plan.player_id,
    coach_id: plan.coach_id,
    area_type: plan.area_type,
    title: plan.title,
    description: plan.description ?? null,
    target_metric: plan.target_metric ?? null,
    current_value: plan.current_value ?? null,
    target_value: plan.target_value ?? null,
    from_insight_id: plan.from_insight_id ?? null,
    target_kind: plan.target_date ? 'date' : plan.target_rounds ? 'rounds' : null,
    target_date: plan.target_date ?? null,
    target_rounds: plan.target_rounds ?? null,
  });

  if (!result.success) {
    return {
      status: 'failed',
      action: 'Create a focus area',
      summary: 'The focus area was not created.',
      created: [],
      notifications: [],
      partial_failures: [],
      error: result.error ?? 'The development plan rejected it.',
      retryable: true,
      at,
    };
  }

  return {
    status: 'completed',
    action: 'Create a focus area',
    summary: `${plan.title} is proposed to ${plan.player_name}.`,
    created: [
      {
        kind: 'focus area',
        count: 1,
        href: '/golf/dashboard/intelligence?view=players',
        label: plan.title,
      },
    ],
    notifications: [{ channel: 'In-app', recipients: 1, status: 'sent' }],
    partial_failures: [],
    retryable: false,
    at,
  };
}

// ===========================================================================
// Task
// ===========================================================================

export interface TaskPlanInput {
  title: string;
  description?: string;
  /** ISO `YYYY-MM-DD`. */
  due_date?: string;
  priority?: 'low' | 'medium' | 'high';
  /** Omit to assign to the whole active roster. */
  assign_to_player_ids?: string[];
}

export interface TaskPlan extends TaskPlanInput {
  team_id: string;
  assignee_names: string[];
  assignee_ids: string[];
}

export function planTask(
  ctx: CoachChatContext,
  input: TaskPlanInput,
): { plan: TaskPlan; proposal: ActionProposal } {
  const title = input.title?.trim();
  if (!title) throw new ActionPlanError('What should the task say?');

  const ids =
    input.assign_to_player_ids && input.assign_to_player_ids.length > 0
      ? input.assign_to_player_ids.map((id) => requireRosterPlayer(ctx, id).id)
      : ctx.roster.map((p) => p.id);
  const names = ids.map((id) => ctx.roster.find((p) => p.id === id)?.name ?? 'Player');

  const plan: TaskPlan = { ...input, title, team_id: ctx.team_id, assignee_ids: ids, assignee_names: names };

  const facts = [
    { label: 'Task', value: title },
    {
      label: 'Assigned to',
      value:
        ids.length === ctx.roster.length
          ? `All ${ids.length} active player${ids.length === 1 ? '' : 's'}`
          : names.join(', '),
    },
    {
      label: 'Due',
      value: input.due_date ? humanDate(input.due_date, ctx.timezone) : 'No due date',
      missing: !input.due_date,
    },
    { label: 'Priority', value: input.priority ?? 'medium' },
  ];

  return {
    plan,
    proposal: {
      action: 'Assign a task',
      summary: `${title} — ${ids.length} player${ids.length === 1 ? '' : 's'}.`,
      facts,
      affects: ids.map((id, i) => ({ kind: 'player' as const, id, label: names[i] ?? 'Player' })),
      notifications: [`${ids.length} player${ids.length === 1 ? ' is' : 's are'} notified in-app`],
      missing: input.due_date ? [] : ['Due date'],
      idempotency_key: keyOf(['task', ctx.team_id, title, input.due_date ?? 'nodate']),
    },
  };
}

export async function executeTask(plan: TaskPlan): Promise<ActionReceipt> {
  const at = new Date().toISOString();
  const { createTask } = await import('@/app/golf/actions/tasks');

  const result = await createTask(
    plan.team_id,
    plan.title,
    plan.description,
    plan.due_date,
    plan.priority ?? 'medium',
    plan.assignee_ids,
  );

  if (!result.success) {
    return {
      status: 'failed',
      action: 'Assign a task',
      summary: 'The task was not created.',
      created: [],
      notifications: [],
      partial_failures: [],
      error: result.error ?? 'Tasks rejected it.',
      retryable: true,
      at,
    };
  }

  return {
    status: 'completed',
    action: 'Assign a task',
    summary: `${plan.title} assigned to ${plan.assignee_ids.length} player${plan.assignee_ids.length === 1 ? '' : 's'}.`,
    created: [
      { kind: 'task', count: 1, href: '/golf/dashboard/tasks', label: plan.title },
      { kind: 'assignment', count: plan.assignee_ids.length },
    ],
    notifications: [{ channel: 'In-app', recipients: plan.assignee_ids.length, status: 'sent' }],
    partial_failures: [],
    retryable: false,
    at,
  };
}

// ===========================================================================
// Team update
// ===========================================================================

export interface AnnouncementPlanInput {
  title: string;
  body: string;
  urgency?: 'low' | 'normal' | 'high' | 'urgent';
  requires_acknowledgement?: boolean;
  /** Omit to send to the whole team. */
  recipient_player_ids?: string[];
}

export interface AnnouncementPlan extends AnnouncementPlanInput {
  recipient_names: string[];
  recipient_ids: string[] | null;
}

/**
 * A team update the coach reads in full before it goes out.
 *
 * The BODY is on the card verbatim. An announcement is the one action here
 * whose content is written by the model and read by nineteen-year-olds — a
 * preview that summarised it ("a message about Tuesday's practice") would be
 * asking a coach to approve words they have not seen.
 */
export function planAnnouncement(
  ctx: CoachChatContext,
  input: AnnouncementPlanInput,
): { plan: AnnouncementPlan; proposal: ActionProposal } {
  const title = input.title?.trim();
  const body = input.body?.trim();
  if (!title) throw new ActionPlanError('What should the update be titled?');
  if (!body) throw new ActionPlanError('What should the update say?');

  const explicit = input.recipient_player_ids && input.recipient_player_ids.length > 0;
  const ids = explicit ? input.recipient_player_ids!.map((id) => requireRosterPlayer(ctx, id).id) : null;
  const names = ids
    ? ids.map((id) => ctx.roster.find((p) => p.id === id)?.name ?? 'Player')
    : ctx.roster.map((p) => p.name);

  const plan: AnnouncementPlan = { ...input, title, body, recipient_ids: ids, recipient_names: names };
  const count = ids ? ids.length : ctx.roster.length;

  return {
    plan,
    proposal: {
      action: 'Send a team update',
      summary: title,
      facts: [
        { label: 'Title', value: title },
        // Verbatim — see the doc comment above.
        { label: 'Message', value: body },
        { label: 'To', value: ids ? names.join(', ') : `Everyone on ${ctx.team_name} (${count})` },
        { label: 'Urgency', value: input.urgency ?? 'normal' },
        {
          label: 'Acknowledgement',
          value: input.requires_acknowledgement ? 'Required' : 'Not required',
        },
      ],
      affects: (ids ?? ctx.roster.map((p) => p.id)).map((id, i) => ({
        kind: 'player' as const,
        id,
        label: names[i] ?? 'Player',
      })),
      notifications: [
        `${count} player${count === 1 ? '' : 's'} notified in-app`,
        ...(input.requires_acknowledgement ? ['Each player must acknowledge it'] : []),
      ],
      missing: [],
      idempotency_key: keyOf(['announce', ctx.team_id, title, body.slice(0, 40)]),
    },
  };
}

export async function executeAnnouncement(plan: AnnouncementPlan): Promise<ActionReceipt> {
  const at = new Date().toISOString();
  const { createEnrichedAnnouncement } = await import('@/app/golf/actions/announcements');

  const result = await createEnrichedAnnouncement({
    title: plan.title,
    body: plan.body,
    urgency: plan.urgency ?? 'normal',
    requiresAcknowledgement: plan.requires_acknowledgement ?? false,
    recipientPlayerIds: plan.recipient_ids,
    documentIds: [],
    inlineTasks: [],
  });

  if (!result.success) {
    return {
      status: 'failed',
      action: 'Send a team update',
      summary: 'The update was not sent.',
      created: [],
      notifications: [],
      partial_failures: [],
      error: result.error ?? 'Announcements rejected it.',
      retryable: true,
      at,
    };
  }

  const count = plan.recipient_ids?.length ?? plan.recipient_names.length;
  return {
    status: 'completed',
    action: 'Send a team update',
    summary: `${plan.title} sent to ${count} player${count === 1 ? '' : 's'}.`,
    created: [
      {
        kind: 'team update',
        count: 1,
        href: '/golf/dashboard/announcements',
        label: plan.title,
      },
    ],
    notifications: [{ channel: 'In-app', recipients: count, status: 'sent' }],
    partial_failures: [],
    retryable: false,
    at,
  };
}
