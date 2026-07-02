'use server';

/**
 * Server Actions for Recurring Events
 *
 * Handles:
 * - Creating recurring events with RRULE
 * - Editing recurring events (this/thisAndFuture/all)
 * - Deleting recurring events with scope
 * - Expanding recurring events for display
 * - Managing event exclusions and academic exclusions
 *
 * SERIES MODEL: golf_events has `recurrence_rule` (text) and `parent_event_id`
 * (uuid) columns. A series root has `recurrence_rule` populated and
 * `parent_event_id = NULL`. Sibling occurrences have `parent_event_id =
 * <root.id>` and `recurrence_rule = NULL`. The pre-existing
 * idx_golf_events_parent_event_id partial index makes sibling lookups cheap.
 *
 * Legacy recurring events created before this columns existed had neither
 * field set; series matching for those falls through to a title/team/type
 * heuristic for backward compatibility.
 */

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { revalidatePath } from 'next/cache';
import { formatSafeErrorResponse } from '@/lib/validation/server-action-validator';

/** Build timezone offset string from minutes (e.g. 360 → "-06:00") */
function formatTimezoneOffset(offsetMinutes: number): string {
  const sign = offsetMinutes <= 0 ? '+' : '-';
  const absMinutes = Math.abs(offsetMinutes);
  const hours = Math.floor(absMinutes / 60);
  const minutes = absMinutes % 60;
  return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
import { type ExpandedEvent } from '@/lib/calendar/recurrence';
import { format, parseISO } from 'date-fns';
import {
  generateOccurrences,
  parseRecurrenceRule,
  serializeRecurrenceRule,
  MAX_SERIES_OCCURRENCES,
  type RecurrenceRule,
} from '@/lib/golf/recurrence';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { logServerError } from '@/lib/server-error-logger';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { withAdminObserved } from '@/lib/admin/observed-action';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get team_id for a coach via organization lookup
 * Note: golf_coaches doesn't have team_id directly - we get it from golf_teams via organization_id
 */
async function getCoachTeamId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string | null,
  coachId: string | null
): Promise<string | null> {
  // Cookie-aware: honours the program head's golf_active_team selection
  // (validated server-side) so coach WRITES target the toggled team.
  return resolveCoachTeamIdWithCookie(supabase, organizationId, coachId);
}

// ============================================================================
// TYPES
// ============================================================================

export type RecurringEditScope = 'this' | 'thisAndFuture' | 'all';

const RECURRING_EDIT_SCOPES: readonly RecurringEditScope[] = ['this', 'thisAndFuture', 'all'];

function isRecurringEditScope(value: unknown): value is RecurringEditScope {
  return typeof value === 'string' && (RECURRING_EDIT_SCOPES as readonly string[]).includes(value);
}

interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

interface CreateRecurringEventInput {
  title: string;
  description?: string;
  eventType: string;
  startDate: string; // ISO date
  endDate?: string; // ISO date
  startTime?: string; // HH:mm
  endTime?: string; // HH:mm
  location?: string;
  recurrenceRule: string; // RRULE string
  requiresRsvp?: boolean;
  rsvpDeadline?: string;
  maxAttendees?: number;
  teamId?: string;
  timezoneOffset?: number; // Minutes from UTC (from Date.getTimezoneOffset())
}

interface EditRecurringEventInput {
  eventId: string;
  originalStartDate: string; // ISO date - identifies which instance
  scope: RecurringEditScope;
  timezoneOffset?: number; // Minutes from UTC (from Date.getTimezoneOffset())
  updates: {
    title?: string;
    description?: string;
    startDate?: string;
    endDate?: string;
    startTime?: string;
    endTime?: string;
    location?: string;
    recurrenceRule?: string;
  };
}

// ============================================================================
// HELPER: Series row utilities (scoped edit/delete + root promotion)
// ============================================================================

/** Lightweight series row used by scoped edit/delete logic. */
interface SeriesRowLite {
  id: string;
  start_time: string | null;
  end_time: string | null;
}

/** Split an array into chunks of at most `size` items. */
function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/** Keep `.in('id', …)` URLs short and per-row write bursts polite. */
const ID_CHUNK_SIZE = 200;
const ROW_UPDATE_CONCURRENCY = 20;

/**
 * Fetch the members of a series, paginated past the PostgREST 1000-row cap.
 * (Generation is capped at MAX_SERIES_OCCURRENCES, but extensions and legacy
 * data mean we never assume a single page.)
 */
async function fetchSeriesRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  opts: {
    teamId: string | null;
    /** Modern series: match `parent_event_id = rootId OR id = rootId`. */
    rootId?: string | null;
    /** Legacy series (pre parent_event_id): title/type heuristic. */
    legacy?: { title: string; eventType: string };
    /** Only rows with `start_time >= fromStart`. */
    fromStart?: string;
    /** Only children (excludes the root row itself). */
    childrenOfRootOnly?: boolean;
  },
): Promise<{ data: SeriesRowLite[] | null; error: { message: string } | null }> {
  return fetchAllRowsResult<SeriesRowLite>((from, to) => {
    let query = fromUntyped(supabase, 'golf_events')
      .select('id, start_time, end_time')
      .eq('team_id', opts.teamId);
    if (opts.rootId && opts.childrenOfRootOnly) {
      query = query.eq('parent_event_id', opts.rootId);
    } else if (opts.rootId) {
      query = query.or(`parent_event_id.eq.${opts.rootId},id.eq.${opts.rootId}`);
    } else if (opts.legacy) {
      query = query.eq('title', opts.legacy.title).eq('event_type', opts.legacy.eventType);
    }
    if (opts.fromStart) query = query.gte('start_time', opts.fromStart);
    return query.order('id', { ascending: true }).range(from, to);
  }, undefined, { table: 'golf_events', action: 'recurringEventsSeriesLookup', feature: 'calendar_events', sport: 'golf' });
}

/**
 * ROOT PROMOTION (2026-06-10 calendar audit, P0 #1).
 *
 * The series root row carries `recurrence_rule`, and every child references
 * it via `parent_event_id … ON DELETE CASCADE` — so deleting the root
 * cascade-wipes the entire series. Before any delete whose target set
 * includes the root, promote the earliest SURVIVING child to be the new
 * root: copy the recurrence rule onto it, null its parent pointer, and
 * repoint the remaining children. Only then may the old root be deleted.
 *
 * Ordered so a crash at any point never leaves the series headless:
 *   1. promote new root  (failure → abort, nothing deleted yet)
 *   2. repoint children  (single atomic UPDATE; failure → abort)
 *   3. caller deletes    (old root has no dependents left)
 *
 * Returns `promoted: false` when there is nothing to save (no children, or
 * every child is itself in the delete set — the cascade is then harmless
 * because everything it could touch is being deleted explicitly anyway).
 */
async function promoteSeriesRoot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  root: { id: string; team_id: string | null; recurrence_rule: string | null },
  deleteIds: ReadonlySet<string>,
): Promise<{ success: boolean; promoted: boolean; error?: string }> {
  const failure = {
    success: false,
    promoted: false,
    error: 'Failed to delete event occurrence. Please try again.',
  };

  const { data: children, error: childrenError } = await fetchSeriesRows(supabase, {
    teamId: root.team_id,
    rootId: root.id,
    childrenOfRootOnly: true,
  });

  if (childrenError) {
    await logServerError(`[promoteSeriesRoot fetch Error]: ${childrenError.message}`, {
      action: 'recurring_events.promoteSeriesRoot',
      extra: { rootId: root.id },
    });
    return failure;
  }

  const survivors = (children ?? []).filter((child) => !deleteIds.has(child.id));
  if (survivors.length === 0) {
    return { success: true, promoted: false };
  }

  // The earliest remaining occurrence becomes the new root (stable id tiebreak).
  survivors.sort((a, b) => {
    const aMs = a.start_time ? Date.parse(a.start_time) : Number.POSITIVE_INFINITY;
    const bMs = b.start_time ? Date.parse(b.start_time) : Number.POSITIVE_INFINITY;
    if (aMs !== bMs) return aMs - bMs;
    return a.id.localeCompare(b.id);
  });
  const newRoot = survivors[0]!;

  // Step 1: promote — transfer the series metadata, detach from the old root.
  const { data: promotedRows, error: promoteError } = await fromUntyped(supabase, 'golf_events')
    .update({ recurrence_rule: root.recurrence_rule, parent_event_id: null })
    .eq('id', newRoot.id)
    .select('id');

  if (promoteError || !promotedRows || promotedRows.length === 0) {
    await logServerError(
      `[promoteSeriesRoot promote Error]: ${promoteError ? String(promoteError.message ?? promoteError) : 'matched 0 rows'}`,
      { action: 'recurring_events.promoteSeriesRoot', extra: { rootId: root.id, newRootId: newRoot.id } },
    );
    return failure;
  }

  // Step 2: repoint every remaining child at the new root (atomic UPDATE).
  // Children that are themselves about to be deleted get repointed too —
  // they are deleted explicitly by id right after, so nothing relies on the
  // old root's cascade.
  const { error: repointError } = await fromUntyped(supabase, 'golf_events')
    .update({ parent_event_id: newRoot.id })
    .eq('parent_event_id', root.id)
    .neq('id', newRoot.id);

  if (repointError) {
    await logServerError(`[promoteSeriesRoot repoint Error]: ${String(repointError.message ?? repointError)}`, {
      action: 'recurring_events.promoteSeriesRoot',
      extra: { rootId: root.id, newRootId: newRoot.id },
    });
    return failure;
  }

  return { success: true, promoted: true };
}

/**
 * Event-local calendar date + wall time for a stored timestamptz.
 *
 * `offsetMinutes` is `Date.getTimezoneOffset()` semantics (minutes from UTC,
 * positive west) — the same value both calendar callers send. When it is
 * undefined we fall back to the server's local frame, matching how the
 * create path interprets a `${date}T${time}` string without a tz suffix.
 */
function localParts(iso: string, offsetMinutes: number | undefined): { date: string; time: string } {
  if (offsetMinutes === undefined) {
    const d = parseISO(iso);
    return { date: format(d, 'yyyy-MM-dd'), time: format(d, 'HH:mm:ss') };
  }
  const shifted = new Date(Date.parse(iso) - offsetMinutes * 60_000);
  const s = shifted.toISOString();
  return { date: s.slice(0, 10), time: s.slice(11, 19) };
}

/**
 * SERIES RULE UPDATE + EXTENSION (2026-06-10 calendar audit, P2).
 *
 * Applied for scope 'all' edits that carry `updates.recurrenceRule`. The
 * parsed rule is canonicalized and stored on the series root; when the new
 * rule reaches PAST the series' last materialized occurrence (bigger COUNT,
 * later UNTIL, extra weekdays), the missing occurrences are appended as new
 * child rows cloned from the root.
 *
 * Deliberate semantics:
 * - Extension dates anchor on the series' FIRST occurrence and only dates
 *   strictly after the LAST existing occurrence are added — occurrences the
 *   coach deleted or rescheduled mid-series are never resurrected.
 * - Shrinking a rule never deletes rows (house rule: no destructive writes
 *   in save paths) — the coach removes occurrences via explicit deletes.
 * - Total materialized series size stays under MAX_SERIES_OCCURRENCES.
 * - Ordering: children are inserted (one atomic INSERT) BEFORE the root's
 *   rule is rewritten, so a failure can never leave a rule that promises
 *   occurrences which were silently dropped… the rows are the ground truth.
 */
async function applySeriesRuleUpdate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  opts: {
    rootId: string;
    teamId: string | null;
    newRuleString: string;
    timezoneOffset?: number;
  },
): Promise<ActionResult> {
  const failure = { success: false, error: 'Failed to update the recurrence rule. Please try again.' };

  const newRule: RecurrenceRule | null = parseRecurrenceRule(opts.newRuleString);
  if (!newRule) {
    return { success: false, error: 'Invalid recurrence rule' };
  }
  const canonicalRule = serializeRecurrenceRule(newRule);

  // Current materialized series (paginated — never assume a single page).
  const { data: seriesRows, error: seriesError } = await fetchSeriesRows(supabase, {
    teamId: opts.teamId,
    rootId: opts.rootId,
  });
  if (seriesError || !seriesRows || seriesRows.length === 0) {
    await logServerError(
      `[applySeriesRuleUpdate fetch Error]: ${seriesError ? seriesError.message : 'series matched 0 rows'}`,
      { action: 'recurring_events.applySeriesRuleUpdate', extra: { rootId: opts.rootId } },
    );
    return failure;
  }

  // Root row is the template for any appended occurrences.
  const { data: rootRow, error: rootError } = await supabase
    .from('golf_events')
    .select('*')
    .eq('id', opts.rootId)
    .single();
  if (rootError || !rootRow) {
    await logServerError(
      `[applySeriesRuleUpdate root Error]: ${rootError ? String(rootError.message ?? rootError) : 'root not found'}`,
      { action: 'recurring_events.applySeriesRuleUpdate', extra: { rootId: opts.rootId } },
    );
    return failure;
  }

  const timed = seriesRows.filter((row): row is SeriesRowLite & { start_time: string } => !!row.start_time);
  if (timed.length > 0) {
    timed.sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time));
    const anchorDate = localParts(timed[0]!.start_time, opts.timezoneOffset).date;
    const lastDate = localParts(timed[timed.length - 1]!.start_time, opts.timezoneOffset).date;

    const capacity = Math.max(0, MAX_SERIES_OCCURRENCES - seriesRows.length);
    const newDates = generateOccurrences(anchorDate, newRule)
      .filter((date) => date > lastDate)
      .slice(0, capacity);

    if (newDates.length > 0) {
      const tz = opts.timezoneOffset !== undefined ? formatTimezoneOffset(opts.timezoneOffset) : '';
      const startTime = rootRow.start_time ? localParts(rootRow.start_time, opts.timezoneOffset).time : '00:00:00';
      const endTime = rootRow.end_time ? localParts(rootRow.end_time, opts.timezoneOffset).time : null;

      const childRows = newDates.map((date) => ({
        title: rootRow.title,
        description: rootRow.description ?? null,
        event_type: rootRow.event_type,
        start_time: `${date}T${startTime}${tz}`,
        end_time: endTime ? `${date}T${endTime}${tz}` : null,
        location: rootRow.location ?? null,
        created_by: rootRow.created_by,
        team_id: rootRow.team_id,
        status: 'confirmed',
        requires_rsvp: rootRow.requires_rsvp ?? false,
        rsvp_deadline: rootRow.rsvp_deadline ?? null,
        max_attendees: rootRow.max_attendees ?? null,
        recurrence_rule: null,
        parent_event_id: opts.rootId,
      }));

      // Single INSERT statement — atomic, so a failure appends nothing.
      const { error: insertError } = await fromUntyped(supabase, 'golf_events').insert(childRows);
      if (insertError) {
        await logServerError(
          `[applySeriesRuleUpdate insert Error]: ${String(insertError.message ?? insertError)}`,
          { action: 'recurring_events.applySeriesRuleUpdate', extra: { rootId: opts.rootId, newCount: newDates.length } },
        );
        return failure;
      }
    }
  }

  if (rootRow.recurrence_rule !== canonicalRule) {
    const { error: ruleError } = await fromUntyped(supabase, 'golf_events')
      .update({ recurrence_rule: canonicalRule })
      .eq('id', opts.rootId);
    if (ruleError) {
      await logServerError(
        `[applySeriesRuleUpdate rule Error]: ${String(ruleError.message ?? ruleError)}`,
        { action: 'recurring_events.applySeriesRuleUpdate', extra: { rootId: opts.rootId } },
      );
      return failure;
    }
  }

  return { success: true };
}

// ============================================================================
// CREATE RECURRING EVENT
// ============================================================================

async function createRecurringEventImpl(
  input: CreateRecurringEventInput
): Promise<ActionResult<{ eventId: string }>> {
  try {
    const supabase = await createClient();

    // Get current coach
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { data: coach, error: coachError } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single();

    if (coachError || !coach) {
      return { success: false, error: 'Coach not found' };
    }

    // Get team_id via organization
    const coachTeamId = await getCoachTeamId(supabase, coach.organization_id, coach.id);

    // Validate recurrence rule (shared parser — supports multi-weekday BYDAY,
    // biweekly INTERVAL=2, COUNT, and inclusive UNTIL; legacy stored strings
    // parse unchanged).
    const parsedRule = parseRecurrenceRule(input.recurrenceRule);
    if (!parsedRule) {
      return { success: false, error: 'Invalid recurrence rule' };
    }

    // Generate occurrence dates (hard-capped at MAX_SERIES_OCCURRENCES).
    const occurrenceDates = generateOccurrences(input.startDate, parsedRule);

    if (occurrenceDates.length === 0) {
      return { success: false, error: 'No occurrences generated from recurrence rule' };
    }

    // Create the series root first so we can stamp parent_event_id on the
    // remaining occurrences. Two queries instead of one buys a clean,
    // queryable series identity (`WHERE parent_event_id = root.id OR id =
    // root.id`) that the edit + delete scope dialogs lean on.
    const teamId = input.teamId || coachTeamId;
    const tz = input.timezoneOffset !== undefined ? formatTimezoneOffset(input.timezoneOffset) : '';

    const rootDate = occurrenceDates[0]!;
    const rootRow = {
      title: input.title,
      description: input.description || null,
      event_type: input.eventType,
      start_time: input.startTime ? `${rootDate}T${input.startTime}${tz}` : `${rootDate}T00:00:00${tz}`,
      end_time: input.endTime ? `${rootDate}T${input.endTime}${tz}` : null,
      location: input.location || null,
      created_by: coach.id,
      team_id: teamId,
      status: 'confirmed',
      requires_rsvp: input.requiresRsvp || false,
      rsvp_deadline: input.rsvpDeadline || null,
      max_attendees: input.maxAttendees || null,
      recurrence_rule: input.recurrenceRule,
      parent_event_id: null,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rootInsert, error: rootError } = await (supabase as any)
      .from('golf_events')
      .insert(rootRow)
      .select('id')
      .single();

    if (rootError || !rootInsert?.id) {
      await logServerError(`[createRecurringEvent Error]: ${rootError instanceof Error ? rootError.message : String(rootError)}`, { action: 'recurring_events.createRecurringEvent' });
      return { success: false, error: 'Failed to create recurring event. Please try again.' };
    }

    const rootId = rootInsert.id as string;

    if (occurrenceDates.length > 1) {
      const childRows = occurrenceDates.slice(1).map((date) => ({
        title: input.title,
        description: input.description || null,
        event_type: input.eventType,
        start_time: input.startTime ? `${date}T${input.startTime}${tz}` : `${date}T00:00:00${tz}`,
        end_time: input.endTime ? `${date}T${input.endTime}${tz}` : null,
        location: input.location || null,
        created_by: coach.id,
        team_id: teamId,
        status: 'confirmed',
        requires_rsvp: input.requiresRsvp || false,
        rsvp_deadline: input.rsvpDeadline || null,
        max_attendees: input.maxAttendees || null,
        recurrence_rule: null,
        parent_event_id: rootId,
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: childError } = await (supabase as any)
        .from('golf_events')
        .insert(childRows);

      if (childError) {
        // Roll back the root so we don't leave a half-built series. Log
        // separately if the rollback itself fails so we can find the
        // orphan root id from observability instead of from a database scan.
        const { error: rollbackError } = await supabase
          .from('golf_events')
          .delete()
          .eq('id', rootId);
        if (rollbackError) {
          await logServerError(
            `[createRecurringEvent rollbackFailed]: orphan root id=${rootId}; ${rollbackError.message}`,
            {
              action: 'recurring_events.createRecurringEvent.rollbackFailed',
              featureArea: 'calendar',
              extra: { rootId, code: rollbackError.code },
            },
          );
        }
        await logServerError(`[createRecurringEvent child Error]: ${childError instanceof Error ? childError.message : String(childError)}`, { action: 'recurring_events.createRecurringEvent' });
        return { success: false, error: 'Failed to create recurring event. Please try again.' };
      }
    }

    revalidatePath('/golf/dashboard/calendar');
    return { success: true, data: { eventId: rootId } };
  } catch (error) {
    await logServerError(`[createRecurringEvent Error]: ${error instanceof Error ? error.message : String(error)}`, { action: 'recurring_events.createRecurringEvent' });
    return formatSafeErrorResponse(error);
  }
}

const observedCreateRecurringEvent = withAdminObserved(
  'createRecurringEvent',
  { sport: 'golf', feature: 'calendar_events' },
  createRecurringEventImpl,
);

export async function createRecurringEvent(
  input: CreateRecurringEventInput
): Promise<ActionResult<{ eventId: string }>> {
  return observedCreateRecurringEvent(input);
}

// ============================================================================
// EDIT RECURRING EVENT
// ============================================================================

async function editRecurringEventImpl(
  input: EditRecurringEventInput
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    // Get current coach
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Coach not found' };
    }

    // Get the target event
    const { data: targetEvent, error: fetchError } = await supabase
      .from('golf_events')
      .select('*')
      .eq('id', input.eventId)
      .single();

    if (fetchError || !targetEvent) {
      return { success: false, error: 'Event not found' };
    }

    // Verify ownership
    if (targetEvent.created_by !== coach.id) {
      return { success: false, error: 'Not authorized' };
    }

    // Resolve the series root id. Modern recurring rows have either
    // recurrence_rule (root) or parent_event_id (child). Legacy rows have
    // neither — those fall back to the title/team/type heuristic below.
    const rootId: string | null =
      targetEvent.parent_event_id ?? (targetEvent.recurrence_rule ? targetEvent.id : null);

    // ------------------------------------------------------------------
    // Build update payloads (2026-06-10 calendar audit, P0 #2).
    //
    // Non-date fields apply LITERALLY to every matched row. Date fields use
    // PER-ROW DELTA semantics for series scopes: both calendar callers always
    // send startDate/startTime, so we compare the requested start against the
    // edited occurrence's CURRENT start to decide whether dates changed at
    // all. Unchanged → date columns are omitted entirely (a title-only edit
    // never touches dates). Changed → every matched row is shifted by the
    // same delta, preserving each occurrence's own date, instead of writing
    // one literal timestamp that collapses the series onto a single day.
    //
    // golf_events uses start_time/end_time (timestamptz), no start_date.
    // ------------------------------------------------------------------
    const tz = input.timezoneOffset !== undefined ? formatTimezoneOffset(input.timezoneOffset) : '';
    const literalUpdates: Record<string, unknown> = {};
    if (input.updates.title) literalUpdates.title = input.updates.title;
    if (input.updates.description !== undefined) literalUpdates.description = input.updates.description;
    if (input.updates.location !== undefined) literalUpdates.location = input.updates.location;

    const targetDate = (targetEvent.start_time ?? '').slice(0, 10);
    const oldStartMs = targetEvent.start_time ? Date.parse(targetEvent.start_time) : NaN;
    const oldEndMs = targetEvent.end_time ? Date.parse(targetEvent.end_time) : null;

    // Requested new start for the EDITED occurrence (same construction the
    // previous single-event path used: a date without a time means midnight).
    let newStartMs: number | null = null;
    if (input.updates.startDate && input.updates.startTime) {
      newStartMs = Date.parse(`${input.updates.startDate}T${input.updates.startTime}${tz}`);
    } else if (input.updates.startDate) {
      newStartMs = Date.parse(`${input.updates.startDate}T00:00:00${tz}`);
    } else if (input.updates.startTime && targetDate) {
      newStartMs = Date.parse(`${targetDate}T${input.updates.startTime}${tz}`);
    }

    // Requested new end for the EDITED occurrence. The end only moves when an
    // end time is provided (a bare endDate has never been applied here).
    let newEndMs: number | null = null;
    if (input.updates.endTime) {
      const endDate = input.updates.endDate ?? input.updates.startDate ?? targetDate;
      if (endDate) newEndMs = Date.parse(`${endDate}T${input.updates.endTime}${tz}`);
    }

    const startChanged =
      newStartMs !== null &&
      Number.isFinite(newStartMs) &&
      (!Number.isFinite(oldStartMs) || newStartMs !== oldStartMs);
    const endChanged = newEndMs !== null && Number.isFinite(newEndMs) && newEndMs !== oldEndMs;
    const startDeltaMs =
      startChanged && newStartMs !== null && Number.isFinite(oldStartMs) ? newStartMs - oldStartMs : 0;

    switch (input.scope) {
      case 'this': {
        // Edit just this single event — literal semantics are correct here,
        // but unchanged date fields are still omitted.
        const updates: Record<string, unknown> = { ...literalUpdates };
        if (startChanged && newStartMs !== null) updates.start_time = new Date(newStartMs).toISOString();
        if (endChanged && newEndMs !== null) updates.end_time = new Date(newEndMs).toISOString();
        if (Object.keys(updates).length === 0) break; // nothing changed — no-op success

        // 2026-05-17: audit Q-NEW-7. .select('id') so we can count
        // affected rows; return a real error when the scope filter
        // matches nothing instead of returning success: true.
        const { data: affected, error: updateError } = await fromUntyped(supabase, 'golf_events')
          .update(updates)
          .eq('id', input.eventId)
          .select('id');

        if (updateError) {
          await logServerError(`[editRecurringEvent Error]: ${updateError instanceof Error ? updateError.message : String(updateError)}`, { action: 'recurring_events.editRecurringEvent' });
          return { success: false, error: 'Failed to edit event occurrence. Please try again.' };
        }
        if (!affected || affected.length === 0) {
          await logServerError(`editRecurringEvent.this matched 0 rows for eventId=${input.eventId}`, { action: 'recurring_events.editRecurringEvent.zeroRows' });
          return { success: false, error: 'No matching event was found to update.' };
        }
        break;
      }

      case 'thisAndFuture':
      case 'all': {
        const fromStart = input.scope === 'thisAndFuture' ? input.originalStartDate : undefined;
        const failMessage =
          input.scope === 'all'
            ? 'Failed to update all event occurrences. Please try again.'
            : 'Failed to update future event occurrences. Please try again.';
        const zeroMessage =
          input.scope === 'all'
            ? 'No matching events were found to update.'
            : 'No matching future events were found to update.';

        if (!startChanged && !endChanged) {
          // Non-date edit: one batched UPDATE across the series — literal
          // fields apply uniformly, date columns are never touched.
          if (Object.keys(literalUpdates).length === 0) break; // nothing to change

          let query = fromUntyped(supabase, 'golf_events').update(literalUpdates);
          if (rootId) {
            // Walk by parent_event_id, but ALSO scope by team_id as
            // defense-in-depth: even if a sibling row's parent_event_id was
            // ever forged, we'd never bleed updates across teams.
            query = query
              .eq('team_id', targetEvent.team_id)
              .or(`parent_event_id.eq.${rootId},id.eq.${rootId}`);
          } else {
            // Legacy fallback for rows created before parent_event_id existed.
            query = query
              .eq('team_id', targetEvent.team_id)
              .eq('title', targetEvent.title)
              .eq('event_type', targetEvent.event_type);
          }
          if (fromStart) query = query.gte('start_time', fromStart);

          // 2026-05-17: audit Q-NEW-7. Select + count.
          const { data: affected, error: updateError } = await query.select('id');

          if (updateError) {
            await logServerError(`[editRecurringEvent Error]: ${updateError instanceof Error ? updateError.message : String(updateError)}`, { action: 'recurring_events.editRecurringEvent' });
            return { success: false, error: failMessage };
          }
          if (!affected || affected.length === 0) {
            await logServerError(`editRecurringEvent.${input.scope} matched 0 rows`, {
              action: 'recurring_events.editRecurringEvent.zeroRows',
              extra: { eventId: input.eventId, rootId, fromDate: fromStart ?? null },
            });
            return { success: false, error: zeroMessage };
          }
          break;
        }

        // DATE EDIT — per-row delta. Fetch the matched rows (paginated past
        // the PostgREST 1000-row cap), then shift each row's OWN start/end by
        // the delta instead of collapsing the series onto one timestamp.
        const { data: matchedRows, error: matchError } = await fetchSeriesRows(supabase, {
          teamId: targetEvent.team_id,
          rootId,
          legacy: rootId ? undefined : { title: targetEvent.title, eventType: targetEvent.event_type },
          fromStart,
        });

        if (matchError) {
          await logServerError(`[editRecurringEvent fetch Error]: ${matchError.message}`, { action: 'recurring_events.editRecurringEvent' });
          return { success: false, error: failMessage };
        }
        if (!matchedRows || matchedRows.length === 0) {
          await logServerError(`editRecurringEvent.${input.scope} matched 0 rows`, {
            action: 'recurring_events.editRecurringEvent.zeroRows',
            extra: { eventId: input.eventId, rootId, fromDate: fromStart ?? null },
          });
          return { success: false, error: zeroMessage };
        }

        // Duration is anchored on the edited occurrence's NEW start so a
        // duration change propagates: each row's end = its (new) start +
        // the new duration. When only the start moved, ends shift by the
        // same delta.
        const anchorStartMs = startChanged && newStartMs !== null ? newStartMs : oldStartMs;
        const newDurationMs =
          endChanged && newEndMs !== null && Number.isFinite(anchorStartMs) ? newEndMs - anchorStartMs : null;

        for (const rows of chunkArray(matchedRows, ROW_UPDATE_CONCURRENCY)) {
          const results: { error: { message?: string } | null }[] = await Promise.all(
            rows.map((row) => {
              const rowStartMs = row.start_time ? Date.parse(row.start_time) : NaN;
              const payload: Record<string, unknown> = { ...literalUpdates };

              let newRowStartMs: number | null = Number.isFinite(rowStartMs) ? rowStartMs : null;
              if (startChanged && newStartMs !== null) {
                newRowStartMs = Number.isFinite(rowStartMs) ? rowStartMs + startDeltaMs : newStartMs;
                payload.start_time = new Date(newRowStartMs).toISOString();
              }

              if (newDurationMs !== null && newRowStartMs !== null) {
                payload.end_time = new Date(newRowStartMs + newDurationMs).toISOString();
              } else if (startChanged && row.end_time) {
                const rowEndMs = Date.parse(row.end_time);
                if (Number.isFinite(rowEndMs)) {
                  payload.end_time = new Date(rowEndMs + startDeltaMs).toISOString();
                }
              }

              return fromUntyped(supabase, 'golf_events').update(payload).eq('id', row.id).select('id');
            }),
          );

          const failed = results.find((result) => result.error);
          if (failed?.error) {
            await logServerError(
              `[editRecurringEvent perRow Error]: ${String(failed.error.message ?? failed.error)} (series update may be partially applied)`,
              {
                action: 'recurring_events.editRecurringEvent.perRow',
                extra: { eventId: input.eventId, rootId, scope: input.scope },
              },
            );
            return { success: false, error: failMessage };
          }
        }
        break;
      }
    }

    // Rule change / series extension — scope 'all' only (a recurrence rule
    // describes the whole series). Runs AFTER the row updates above so any
    // appended occurrences clone the post-edit schedule. Legacy rootless
    // series have nowhere to store a rule — skip with a log rather than
    // failing an edit whose row updates already succeeded.
    if (input.scope === 'all' && input.updates.recurrenceRule !== undefined) {
      if (rootId) {
        const ruleResult = await applySeriesRuleUpdate(supabase, {
          rootId,
          teamId: targetEvent.team_id,
          newRuleString: input.updates.recurrenceRule,
          timezoneOffset: input.timezoneOffset,
        });
        if (!ruleResult.success) return ruleResult;
      } else {
        await logServerError(
          `editRecurringEvent: recurrenceRule update ignored for legacy rootless series (eventId=${input.eventId})`,
          { action: 'recurring_events.editRecurringEvent.legacyRuleIgnored' },
        );
      }
    }

    revalidatePath('/golf/dashboard/calendar');
    return { success: true };
  } catch (error) {
    await logServerError(`[editRecurringEvent Error]: ${error instanceof Error ? error.message : String(error)}`, { action: 'recurring_events.editRecurringEvent' });
    return formatSafeErrorResponse(error);
  }
}

const observedEditRecurringEvent = withAdminObserved(
  'editRecurringEvent',
  { sport: 'golf', feature: 'calendar_events' },
  editRecurringEventImpl,
);

export async function editRecurringEvent(
  input: EditRecurringEventInput
): Promise<ActionResult> {
  return observedEditRecurringEvent(input);
}

// ============================================================================
// DELETE RECURRING EVENT
// ============================================================================

/**
 * Delete occurrences of a recurring series. Both call forms are supported:
 *
 *   deleteRecurringEvent(eventId, scope)                      // preferred
 *   deleteRecurringEvent(eventId, originalStartDate, scope)   // legacy
 *
 * For 'thisAndFuture' the cutoff is the explicit `originalStartDate` when the
 * legacy form is used, otherwise the target occurrence's own start_time.
 *
 * ROOT PROMOTION (2026-06-10 calendar audit, P0 #1): whenever the delete set
 * contains the series ROOT but not the whole series, the earliest surviving
 * child is promoted to root first — so the parent_event_id ON DELETE CASCADE
 * can never wipe occurrences the coach asked to keep.
 */
async function deleteRecurringEventImpl(
  eventId: string,
  scopeOrOriginalStartDate: RecurringEditScope | string,
  maybeScope?: RecurringEditScope
): Promise<ActionResult> {
  try {
    const scope: RecurringEditScope | null =
      maybeScope ?? (isRecurringEditScope(scopeOrOriginalStartDate) ? scopeOrOriginalStartDate : null);
    if (!scope) {
      return { success: false, error: 'Invalid delete scope' };
    }
    const explicitFromDate =
      maybeScope !== undefined && !isRecurringEditScope(scopeOrOriginalStartDate)
        ? scopeOrOriginalStartDate
        : null;

    const supabase = await createClient();

    // Get current coach
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Coach not found' };
    }

    // Get the target event
    const { data: targetEvent, error: fetchError } = await supabase
      .from('golf_events')
      .select('*')
      .eq('id', eventId)
      .single();

    if (fetchError || !targetEvent) {
      return { success: false, error: 'Event not found' };
    }

    // Verify ownership
    if (targetEvent.created_by !== coach.id) {
      return { success: false, error: 'Not authorized' };
    }

    const rootId: string | null =
      targetEvent.parent_event_id ?? (targetEvent.recurrence_rule ? targetEvent.id : null);
    const targetIsRoot = !targetEvent.parent_event_id && !!targetEvent.recurrence_rule;

    switch (scope) {
      case 'this': {
        // P0 #1: deleting the ROOT row would cascade-wipe every child via
        // the parent_event_id FK. Promote the earliest child to root FIRST;
        // only a childless root is deleted directly.
        if (targetIsRoot) {
          const promo = await promoteSeriesRoot(
            supabase,
            { id: targetEvent.id, team_id: targetEvent.team_id, recurrence_rule: targetEvent.recurrence_rule },
            new Set([eventId]),
          );
          if (!promo.success) {
            return { success: false, error: 'Failed to delete event occurrence. Please try again.' };
          }
        }

        // 2026-05-17: audit Q-NEW-7. Select + count.
        const { data: affected, error: deleteError } = await supabase
          .from('golf_events')
          .delete()
          .eq('id', eventId)
          .select('id');

        if (deleteError) {
          await logServerError(`[deleteRecurringEvent Error]: ${deleteError instanceof Error ? deleteError.message : String(deleteError)}`, { action: 'recurring_events.deleteRecurringEvent' });
          return { success: false, error: 'Failed to delete event occurrence. Please try again.' };
        }
        if (!affected || affected.length === 0) {
          await logServerError(`deleteRecurringEvent.this matched 0 rows for eventId=${eventId}`, { action: 'recurring_events.deleteRecurringEvent.zeroRows' });
          return { success: false, error: 'No matching event was found to delete.' };
        }
        break;
      }

      case 'thisAndFuture': {
        const fromStart = explicitFromDate ?? targetEvent.start_time;
        if (!fromStart) {
          return { success: false, error: 'Could not determine the occurrence date for this delete.' };
        }

        if (rootId) {
          // Resolve the exact delete set first — if the ROOT falls inside it
          // while earlier children survive (possible once single occurrences
          // have been rescheduled), the root must be promoted away before
          // anything is deleted. Paginated: a series can exceed one page.
          const { data: matchedRows, error: matchError } = await fetchSeriesRows(supabase, {
            teamId: targetEvent.team_id,
            rootId,
            fromStart,
          });

          if (matchError) {
            await logServerError(`[deleteRecurringEvent fetch Error]: ${matchError.message}`, { action: 'recurring_events.deleteRecurringEvent' });
            return { success: false, error: 'Failed to delete future event occurrences. Please try again.' };
          }
          if (!matchedRows || matchedRows.length === 0) {
            await logServerError(`deleteRecurringEvent.thisAndFuture matched 0 rows`, {
              action: 'recurring_events.deleteRecurringEvent.zeroRows',
              extra: { eventId, rootId, fromDate: fromStart },
            });
            return { success: false, error: 'No matching future events were found to delete.' };
          }

          const deleteIds = new Set(matchedRows.map((row) => row.id));

          if (deleteIds.has(rootId)) {
            // Need the root's rule to transfer onto the promoted child.
            let rootRecurrenceRule: string | null = targetEvent.recurrence_rule;
            if (targetEvent.id !== rootId) {
              const { data: rootRow } = await supabase
                .from('golf_events')
                .select('recurrence_rule')
                .eq('id', rootId)
                .single();
              rootRecurrenceRule = rootRow?.recurrence_rule ?? null;
            }

            const promo = await promoteSeriesRoot(
              supabase,
              { id: rootId, team_id: targetEvent.team_id, recurrence_rule: rootRecurrenceRule },
              deleteIds,
            );
            if (!promo.success) {
              return { success: false, error: 'Failed to delete future event occurrences. Please try again.' };
            }

            if (promo.promoted) {
              // Promotion repointed every child at the new root, so the
              // parent_event_id filter no longer matches the delete set —
              // delete the captured ids explicitly (chunked: short URLs).
              let affectedCount = 0;
              for (const ids of chunkArray([...deleteIds], ID_CHUNK_SIZE)) {
                const { data: affected, error: deleteError } = await supabase
                  .from('golf_events')
                  .delete()
                  .in('id', ids)
                  .eq('team_id', targetEvent.team_id)
                  .select('id');

                if (deleteError) {
                  await logServerError(`[deleteRecurringEvent Error]: ${deleteError instanceof Error ? deleteError.message : String(deleteError)}`, { action: 'recurring_events.deleteRecurringEvent' });
                  return { success: false, error: 'Failed to delete future event occurrences. Please try again.' };
                }
                affectedCount += affected?.length ?? 0;
              }
              if (affectedCount === 0) {
                await logServerError(`deleteRecurringEvent.thisAndFuture matched 0 rows`, {
                  action: 'recurring_events.deleteRecurringEvent.zeroRows',
                  extra: { eventId, rootId, fromDate: fromStart },
                });
                return { success: false, error: 'No matching future events were found to delete.' };
              }
              break;
            }
            // promoted === false → no child survives the cutoff: the whole
            // series is going away, so the cascade is harmless. Fall through
            // to the single filtered DELETE below.
          }

          const { data: affected, error: deleteError } = await supabase
            .from('golf_events')
            .delete()
            .eq('team_id', targetEvent.team_id)
            .or(`parent_event_id.eq.${rootId},id.eq.${rootId}`)
            .gte('start_time', fromStart)
            .select('id');

          if (deleteError) {
            await logServerError(`[deleteRecurringEvent Error]: ${deleteError instanceof Error ? deleteError.message : String(deleteError)}`, { action: 'recurring_events.deleteRecurringEvent' });
            return { success: false, error: 'Failed to delete future event occurrences. Please try again.' };
          }
          if (!affected || affected.length === 0) {
            await logServerError(`deleteRecurringEvent.thisAndFuture matched 0 rows`, {
              action: 'recurring_events.deleteRecurringEvent.zeroRows',
              extra: { eventId, rootId, fromDate: fromStart },
            });
            return { success: false, error: 'No matching future events were found to delete.' };
          }
          break;
        }

        // Legacy series (pre parent_event_id): heuristic filter, no cascade risk.
        const { data: affected, error: deleteError } = await supabase
          .from('golf_events')
          .delete()
          .eq('team_id', targetEvent.team_id)
          .eq('title', targetEvent.title)
          .eq('event_type', targetEvent.event_type)
          .gte('start_time', fromStart)
          .select('id');

        if (deleteError) {
          await logServerError(`[deleteRecurringEvent Error]: ${deleteError instanceof Error ? deleteError.message : String(deleteError)}`, { action: 'recurring_events.deleteRecurringEvent' });
          return { success: false, error: 'Failed to delete future event occurrences. Please try again.' };
        }
        if (!affected || affected.length === 0) {
          await logServerError(`deleteRecurringEvent.thisAndFuture matched 0 rows`, {
            action: 'recurring_events.deleteRecurringEvent.zeroRows',
            extra: { eventId, rootId, fromDate: fromStart },
          });
          return { success: false, error: 'No matching future events were found to delete.' };
        }
        break;
      }

      case 'all': {
        let query = supabase.from('golf_events').delete();
        if (rootId) {
          query = query
            .eq('team_id', targetEvent.team_id)
            .or(`parent_event_id.eq.${rootId},id.eq.${rootId}`);
        } else {
          query = query
            .eq('team_id', targetEvent.team_id)
            .eq('title', targetEvent.title)
            .eq('event_type', targetEvent.event_type);
        }
        // 2026-05-17: audit Q-NEW-7. Select + count.
        const { data: affected, error: deleteError } = await query.select('id');

        if (deleteError) {
          await logServerError(`[deleteRecurringEvent Error]: ${deleteError instanceof Error ? deleteError.message : String(deleteError)}`, { action: 'recurring_events.deleteRecurringEvent' });
          return { success: false, error: 'Failed to delete event series. Please try again.' };
        }
        if (!affected || affected.length === 0) {
          await logServerError(`deleteRecurringEvent.all matched 0 rows`, {
            action: 'recurring_events.deleteRecurringEvent.zeroRows',
            extra: { eventId, rootId },
          });
          return { success: false, error: 'No matching events were found to delete.' };
        }
        break;
      }
    }

    revalidatePath('/golf/dashboard/calendar');
    return { success: true };
  } catch (error) {
    await logServerError(`[deleteRecurringEvent Error]: ${error instanceof Error ? error.message : String(error)}`, { action: 'recurring_events.deleteRecurringEvent' });
    return formatSafeErrorResponse(error);
  }
}

const observedDeleteRecurringEvent = withAdminObserved(
  'deleteRecurringEvent',
  { sport: 'golf', feature: 'calendar_events' },
  deleteRecurringEventImpl,
);

export async function deleteRecurringEvent(
  eventId: string,
  scopeOrOriginalStartDate: RecurringEditScope | string,
  maybeScope?: RecurringEditScope
): Promise<ActionResult> {
  return observedDeleteRecurringEvent(eventId, scopeOrOriginalStartDate, maybeScope);
}

// ============================================================================
// GET EXPANDED EVENTS
// ============================================================================

/**
 * Get events for a date range.
 * Since we store individual occurrences (no recurrence_rule column),
 * this is a simple date-range query.
 */
async function getExpandedEventsImpl(
  startDate: string,
  endDate: string,
  teamId?: string
): Promise<ActionResult<ExpandedEvent[]>> {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Build query for events in date range
    // golf_events uses start_time (ISO timestamp), not start_date
    let query = supabase
      .from('golf_events')
      .select('*')
      .gte('start_time', startDate)
      .lte('start_time', endDate)
      .neq('status', 'cancelled');

    if (teamId) {
      query = query.eq('team_id', teamId);
    }

    const { data: events, error: eventsError } = await query.order('start_time', { ascending: true });

    if (eventsError) {
      await logServerError(`[getExpandedEvents Error]: ${eventsError instanceof Error ? eventsError.message : String(eventsError)}`, { action: 'recurring_events.getExpandedEvents' });
      return { success: false, error: 'Failed to fetch events. Please try again.' };
    }

    // Map to ExpandedEvent format
    const expandedEvents: ExpandedEvent[] = (events || []).map(event => {
      const eventStartDate = event.start_time ? parseISO(event.start_time) : new Date();
      return {
        id: event.id,
        parentId: event.parent_event_id || null,
        title: event.title,
        eventType: event.event_type,
        startDate: eventStartDate,
        endDate: event.end_time ? parseISO(event.end_time) : null,
        startTime: event.start_time || null,
        endTime: event.end_time || null,
        isRecurringInstance: false,
        originalStartDate: eventStartDate,
      };
    });

    return { success: true, data: expandedEvents };
  } catch (error) {
    await logServerError(`[getExpandedEvents Error]: ${error instanceof Error ? error.message : String(error)}`, { action: 'recurring_events.getExpandedEvents' });
    return formatSafeErrorResponse(error);
  }
}

const observedGetExpandedEvents = withAdminObserved(
  'getExpandedEvents',
  { sport: 'golf', feature: 'calendar_events' },
  getExpandedEventsImpl,
);

export async function getExpandedEvents(
  startDate: string,
  endDate: string,
  teamId?: string
): Promise<ActionResult<ExpandedEvent[]>> {
  return observedGetExpandedEvents(startDate, endDate, teamId);
}

// ============================================================================
// ACADEMIC EXCLUSIONS
// ============================================================================

/**
 * Create an academic exclusion period.
 * golf_academic_exclusions schema: player_id, start_date, end_date, reason, excluded_by
 */
async function createAcademicExclusionImpl(input: {
  name: string;
  startDate: string;
  endDate: string;
  excludePractices: boolean;
  excludeMatches: boolean;
  excludeAllEvents: boolean;
  teamId?: string;
  playerIds?: string[]; // Players to exclude
}): Promise<ActionResult<{ id: string }>> {
  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single();

    if (!coach) {
      return { success: false, error: 'Coach not found' };
    }

    const coachTeamId = await getCoachTeamId(supabase, coach.organization_id, coach.id);
    const teamId = input.teamId || coachTeamId;
    if (!teamId) {
      return { success: false, error: 'Team ID is required' };
    }

    // If specific playerIds provided, create exclusions for each
    // Otherwise, get all team members and create exclusions for all
    let playerIds = input.playerIds;
    if (!playerIds || playerIds.length === 0) {
      const { data: members } = await supabase
        .from('golf_team_members')
        .select('player_id')
        .eq('team_id', teamId);
      playerIds = (members || []).map(m => m.player_id);
    }

    if (playerIds.length === 0) {
      return { success: false, error: 'No players found to exclude' };
    }

    // Build reason from exclusion settings
    const reasonParts = [input.name];
    if (!input.excludeAllEvents) {
      if (input.excludePractices) reasonParts.push('(practices)');
      if (input.excludeMatches) reasonParts.push('(matches)');
    }
    const reason = reasonParts.join(' ');

    // Insert academic exclusions - one per player
    // Schema: player_id (NOT NULL), start_date, end_date, reason, excluded_by
    const exclusions = playerIds.map(playerId => ({
      player_id: playerId,
      start_date: input.startDate,
      end_date: input.endDate,
      reason,
      excluded_by: coach.id,
    }));

    const { data: result, error: insertError } = await supabase
      .from('golf_academic_exclusions')
      .insert(exclusions)
      .select('id');

    if (insertError) {
      await logServerError(`[createAcademicExclusion Error]: ${insertError instanceof Error ? insertError.message : String(insertError)}`, { action: 'recurring_events.createAcademicExclusion' });
      return { success: false, error: 'Failed to create academic exclusion. Please try again.' };
    }

    revalidatePath('/golf/dashboard/calendar');
    return { success: true, data: { id: result?.[0]?.id || '' } };
  } catch (error) {
    await logServerError(`[createAcademicExclusion Error]: ${error instanceof Error ? error.message : String(error)}`, { action: 'recurring_events.createAcademicExclusion' });
    return formatSafeErrorResponse(error);
  }
}

const observedCreateAcademicExclusion = withAdminObserved(
  'createAcademicExclusion',
  { sport: 'golf', feature: 'academics_classes' },
  createAcademicExclusionImpl,
);

export async function createAcademicExclusion(input: {
  name: string;
  startDate: string;
  endDate: string;
  excludePractices: boolean;
  excludeMatches: boolean;
  excludeAllEvents: boolean;
  teamId?: string;
  playerIds?: string[]; // Players to exclude
}): Promise<ActionResult<{ id: string }>> {
  return observedCreateAcademicExclusion(input);
}

async function deleteAcademicExclusionImpl(id: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { error: deleteError } = await supabase
      .from('golf_academic_exclusions')
      .delete()
      .eq('id', id);

    if (deleteError) {
      await logServerError(`[deleteAcademicExclusion Error]: ${deleteError instanceof Error ? deleteError.message : String(deleteError)}`, { action: 'recurring_events.deleteAcademicExclusion' });
      return { success: false, error: 'Failed to delete academic exclusion. Please try again.' };
    }

    revalidatePath('/golf/dashboard/calendar');
    return { success: true };
  } catch (error) {
    await logServerError(`[deleteAcademicExclusion Error]: ${error instanceof Error ? error.message : String(error)}`, { action: 'recurring_events.deleteAcademicExclusion' });
    return formatSafeErrorResponse(error);
  }
}

const observedDeleteAcademicExclusion = withAdminObserved(
  'deleteAcademicExclusion',
  { sport: 'golf', feature: 'academics_classes' },
  deleteAcademicExclusionImpl,
);

export async function deleteAcademicExclusion(id: string): Promise<ActionResult> {
  return observedDeleteAcademicExclusion(id);
}
