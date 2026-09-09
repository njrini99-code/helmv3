'use client';

/**
 * ============================================================================
 * Fairway · Calendar · useBlockedTime — S7 "My availability" data layer
 * ----------------------------------------------------------------------------
 * SCREEN-BUILD-PLAN.md §2.7. Coach-only: wraps the EXISTING
 * `getCoachBlockedTime` / `addCoachBlockedTime` / `updateCoachBlockedTime` /
 * `deleteCoachBlockedTime` server actions (`src/app/golf/actions/golf.ts`,
 * unchanged) with a fetch/mutate/retry state machine. No new server action,
 * no new table — this screen is exactly what the coach-only
 * `golf_coach_blocked_time` RLS ("Coaches can manage their own blocked time",
 * baseline 16851) already allows.
 *
 * NEVER call this for a player: the player side of S7 renders
 * `FeatureUnavailable` instead (`golf_player_availability_blocks` does not
 * exist — gate G1). `MyAvailabilityScreen` enforces that by only mounting
 * this hook with `enabled: role === 'coach' && ...`.
 *
 * The window is a fixed, generous range (90 days back, 400 days ahead of the
 * moment the hook is created) rather than following the calendar's visible
 * range — this is a settings-style "all my busy time" list, not a calendar
 * view, and the table holds few enough rows per coach that one wide window
 * beats re-fetching per scroll.
 *
 * Mutations always refetch the list on success rather than patching local
 * state from the submitted draft: `updateCoachBlockedTime` returns
 * `ActionResult<void>`, not the saved row, and the server normalizes
 * `end_date` / `is_recurring` in ways the draft does not know about. Patching
 * from the draft would risk showing a state the server never actually wrote —
 * exactly the "no fabricated availability" rule this plan is built around.
 */

import * as React from 'react';
import type { ActionResult, BlockedTimePeriod } from '@/app/golf/actions/golf';

/**
 * `BlockedTimePeriod` (golf.ts's exported type) omits `title`, `all_day`, and
 * `description` — three columns `golf_coach_blocked_time` demonstrably has
 * (baseline migration DDL) and that `addCoachBlockedTimeImpl` /
 * `updateCoachBlockedTimeImpl` write to on every call. `getCoachBlockedTimeImpl`
 * selects `'*'`, so the real runtime row always carries them; this widens the
 * type to match what the server actually returns, without editing golf.ts
 * (outside this worker's exclusive paths) or fabricating data that isn't
 * there. `reason` stays `string | null` per the exported type — nothing ever
 * writes it (only `description`), so it is expected to read as `null`.
 */
export interface CoachBlockedTimeRow extends BlockedTimePeriod {
  title: string | null;
  all_day: boolean | null;
  description: string | null;
}

/** Days behind "now" the fetch window starts. */
const WINDOW_BACK_DAYS = 90;
/** Days ahead of "now" the fetch window ends. */
const WINDOW_FORWARD_DAYS = 400;

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Structural shape of `blockedTimeSchema`'s parsed input — that zod schema
 *  is private to golf.ts, so this is a duck-typed mirror, not an import. Both
 *  `addCoachBlockedTime` and `updateCoachBlockedTime` accept this shape
 *  structurally; a real drift in the server schema fails at the call site
 *  inside this file, not silently. */
export interface BlockedTimeInput {
  title: string;
  startDate: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
  /** Empty string explicitly clears an existing rule on update — see
   *  `updateCoachBlockedTimeImpl`'s `data.recurrenceRule !== undefined` gate. */
  recurrenceRule?: string;
  /** Empty string explicitly clears an existing note on update, same reason. */
  description?: string;
}

export interface BlockedTimeActions {
  list: (startDate: string, endDate: string) => Promise<ActionResult<CoachBlockedTimeRow[]>>;
  create: (data: BlockedTimeInput) => Promise<ActionResult<{ id: string }>>;
  update: (id: string, data: Partial<BlockedTimeInput>) => Promise<ActionResult<void>>;
  remove: (id: string) => Promise<ActionResult<void>>;
}

let cachedActions: Promise<BlockedTimeActions> | null = null;

/** Code-split: golf.ts is a large shared action module — only load it once
 *  the coach actually opens the Busy time tab. Cached across calls/instances
 *  so re-opening the sheet doesn't re-import. */
function loadBlockedTimeActions(): Promise<BlockedTimeActions> {
  if (!cachedActions) {
    cachedActions = import('@/app/golf/actions/golf').then((mod) => ({
      // See `CoachBlockedTimeRow`'s docblock — `getCoachBlockedTime` selects
      // `'*'`, so the row genuinely carries title/all_day/description; this
      // only widens the STATIC type to match that runtime reality.
      list: async (start: string, end: string) => {
        const result = await mod.getCoachBlockedTime(start, end);
        return result.success ? { success: true, data: result.data as CoachBlockedTimeRow[] } : result;
      },
      create: mod.addCoachBlockedTime,
      update: mod.updateCoachBlockedTime,
      remove: mod.deleteCoachBlockedTime,
    }));
  }
  return cachedActions;
}

export interface UseBlockedTimeOptions {
  /** Only fetch/mutate while true — gate on the tab being open AND the
   *  viewer being a coach. Never flip this on for a player. */
  enabled: boolean;
  /** Injectable for tests. Defaults to the real, lazy-loaded server actions. */
  actions?: BlockedTimeActions;
}

export type BlockedTimeMutationResult = { success: true } | { success: false; error: string };

export interface UseBlockedTimeResult {
  blocks: CoachBlockedTimeRow[];
  loading: boolean;
  error: string | null;
  retry: () => void;
  /** ids currently saving (create shows a synthetic 'new' id) or deleting —
   *  drives per-row/per-form busy state without a global spinner. */
  pendingIds: ReadonlySet<string>;
  create: (data: BlockedTimeInput) => Promise<BlockedTimeMutationResult>;
  update: (id: string, data: Partial<BlockedTimeInput>) => Promise<BlockedTimeMutationResult>;
  remove: (id: string) => Promise<BlockedTimeMutationResult>;
}

function errorMessage(result: { success: false; error?: string }, fallback: string): string {
  return result.error || fallback;
}

export function useBlockedTime({ enabled, actions }: UseBlockedTimeOptions): UseBlockedTimeResult {
  const windowRef = React.useRef<{ start: string; end: string } | null>(null);
  if (!windowRef.current) {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - WINDOW_BACK_DAYS);
    const end = new Date(now);
    end.setDate(end.getDate() + WINDOW_FORWARD_DAYS);
    windowRef.current = { start: isoDate(start), end: isoDate(end) };
  }

  const [blocks, setBlocks] = React.useState<CoachBlockedTimeRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [retryNonce, setRetryNonce] = React.useState(0);
  const [pendingIds, setPendingIds] = React.useState<ReadonlySet<string>>(new Set());

  const actionsRef = React.useRef(actions);
  actionsRef.current = actions;

  const resolveActions = React.useCallback(async (): Promise<BlockedTimeActions> => {
    return actionsRef.current ?? loadBlockedTimeActions();
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const impl = await resolveActions();
      const { start, end } = windowRef.current!;
      const result = await impl.list(start, end);
      if (result.success) {
        setBlocks(result.data);
      } else {
        setBlocks([]);
        setError(errorMessage(result, 'Could not load your busy time.'));
      }
    } catch {
      setBlocks([]);
      setError('Could not load your busy time. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [resolveActions]);

  React.useEffect(() => {
    if (!enabled) return;
    void load();
    // `retryNonce` intentionally re-triggers this effect; `load` is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, retryNonce, load]);

  const retry = React.useCallback(() => setRetryNonce((n) => n + 1), []);

  const withPending = React.useCallback(async function withPending(
    id: string,
    run: () => Promise<BlockedTimeMutationResult>,
  ): Promise<BlockedTimeMutationResult> {
    setPendingIds((prev) => new Set(prev).add(id));
    try {
      const outcome = await run();
      if (outcome.success) await load();
      return outcome;
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, [load]);

  const create = React.useCallback(
    (data: BlockedTimeInput) =>
      withPending('new', async () => {
        const impl = await resolveActions();
        const result = await impl.create(data);
        if (!result.success) return { success: false, error: errorMessage(result, 'Could not save this busy time.') };
        return { success: true };
      }),
    [resolveActions, withPending],
  );

  const update = React.useCallback(
    (id: string, data: Partial<BlockedTimeInput>) =>
      withPending(id, async () => {
        const impl = await resolveActions();
        const result = await impl.update(id, data);
        if (!result.success) return { success: false, error: errorMessage(result, 'Could not save this busy time.') };
        return { success: true };
      }),
    [resolveActions, withPending],
  );

  const remove = React.useCallback(
    (id: string) =>
      withPending(id, async () => {
        const impl = await resolveActions();
        const result = await impl.remove(id);
        if (!result.success) return { success: false, error: errorMessage(result, 'Could not delete this busy time.') };
        return { success: true };
      }),
    [resolveActions, withPending],
  );

  return { blocks, loading, error, retry, pendingIds, create, update, remove };
}
