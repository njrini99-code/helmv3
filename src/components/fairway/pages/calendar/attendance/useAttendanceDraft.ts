'use client';

/**
 * useAttendanceDraft — pending-mark bookkeeping + save reconciliation for the
 * attendance screen (SCREEN-BUILD-PLAN.md §2.5).
 *
 * The roster's DISPLAY ORDER never changes while the coach is working — this
 * hook only tracks marks, never reorders anything. Marking a player pending
 * is purely local until `save()` runs.
 *
 * Save is honestly non-atomic (plan §2.5, §6): present marks batch through
 * `bulkCheckIn` in one call; late/no-show/clear marks go row by row through
 * `markAttendance`. `bulkCheckIn` only returns aggregate counts, not which
 * player(s) failed — so on a partial bulk failure this hook does NOT guess
 * which rows succeeded. Every player in that bulk batch stays pending with a
 * shared reason, rather than clearing some at random. `markAttendance`
 * failures ARE attributable and get a per-row reason.
 */

import * as React from 'react';
import { fwHaptic } from '@/lib/fairway/haptics';
import {
  bulkCheckIn,
  markAttendance,
  type AttendanceMark,
  type AttendanceRecord,
} from '@/app/golf/actions/attendance';

export type DraftMark = AttendanceMark | 'clear';

export interface AttendanceSaveSummary {
  saved: number;
  failed: number;
}

export interface UseAttendanceDraftResult {
  /** playerId -> pending mark not yet confirmed saved. */
  pending: ReadonlyMap<string, DraftMark>;
  /** playerId -> reason the last save attempt for this row failed. */
  rowErrors: ReadonlyMap<string, string>;
  /** playerId -> currently persisted mark (server + optimistic overlay resolved). */
  markFor: (playerId: string) => DraftMark | null;
  setMark: (playerId: string, mark: DraftMark) => void;
  /** Selection used by "Mark selected present" — independent of saved state. */
  selected: ReadonlySet<string>;
  toggleSelected: (playerId: string) => void;
  clearSelection: () => void;
  /** Stages every selected player's pending mark to `present` (still requires Save). */
  markSelectedPresent: () => void;
  pendingCount: number;
  saving: boolean;
  lastSummary: AttendanceSaveSummary | null;
  save: () => Promise<AttendanceSaveSummary>;
}

export function useAttendanceDraft(
  eventId: string,
  roster: readonly AttendanceRecord[],
): UseAttendanceDraftResult {
  const [pending, setPending] = React.useState<Map<string, DraftMark>>(new Map());
  const [rowErrors, setRowErrors] = React.useState<Map<string, string>>(new Map());
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [saving, setSaving] = React.useState(false);
  const [lastSummary, setLastSummary] = React.useState<AttendanceSaveSummary | null>(null);

  const persistedByPlayer = React.useMemo(() => {
    const map = new Map<string, DraftMark>();
    for (const row of roster) {
      map.set(row.player_id, row.attendance_status ?? 'clear');
    }
    return map;
  }, [roster]);

  const markFor = React.useCallback(
    (playerId: string): DraftMark | null => {
      if (pending.has(playerId)) return pending.get(playerId) ?? null;
      return persistedByPlayer.get(playerId) ?? null;
    },
    [pending, persistedByPlayer],
  );

  const setMark = React.useCallback((playerId: string, mark: DraftMark) => {
    setPending((prev) => {
      const next = new Map(prev);
      next.set(playerId, mark);
      return next;
    });
    setRowErrors((prev) => {
      if (!prev.has(playerId)) return prev;
      const next = new Map(prev);
      next.delete(playerId);
      return next;
    });
  }, []);

  const toggleSelected = React.useCallback((playerId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  }, []);

  const clearSelection = React.useCallback(() => setSelected(new Set()), []);

  const markSelectedPresent = React.useCallback(() => {
    setPending((prev) => {
      const next = new Map(prev);
      for (const playerId of selected) next.set(playerId, 'present');
      return next;
    });
    setRowErrors((prev) => {
      if (selected.size === 0) return prev;
      const next = new Map(prev);
      for (const playerId of selected) next.delete(playerId);
      return next;
    });
  }, [selected]);

  const save = React.useCallback(async (): Promise<AttendanceSaveSummary> => {
    const entries = Array.from(pending.entries());
    if (entries.length === 0) {
      const summary = { saved: 0, failed: 0 };
      setLastSummary(summary);
      return summary;
    }

    setSaving(true);
    const nextErrors = new Map<string, string>();
    let saved = 0;
    let failed = 0;

    try {
      const presentIds = entries.filter(([, mark]) => mark === 'present').map(([playerId]) => playerId);
      const rowEntries = entries.filter(([, mark]) => mark !== 'present');

      const [bulkResult, ...rowResults] = await Promise.all([
        presentIds.length > 0
          ? bulkCheckIn(eventId, presentIds)
          : Promise.resolve<{ success: boolean; data?: { successCount: number; failureCount: number }; error?: string } | null>(null),
        ...rowEntries.map(([playerId, mark]) => markAttendance(eventId, playerId, mark)),
      ]);

      const savedPlayerIds = new Set<string>();

      if (presentIds.length > 0) {
        // Attribution limit: bulkCheckIn reports counts only. A clean success
        // (failureCount === 0) confirms every id; anything else leaves EVERY
        // id in that batch pending rather than guessing which ones landed.
        if (bulkResult?.success && (bulkResult.data?.failureCount ?? 1) === 0) {
          for (const playerId of presentIds) savedPlayerIds.add(playerId);
          saved += presentIds.length;
        } else {
          failed += presentIds.length;
          const reason = !bulkResult?.success
            ? bulkResult?.error ?? 'Could not save. Try again.'
            : `Confirmed ${presentIds.length - (bulkResult.data?.failureCount ?? presentIds.length)} of ${presentIds.length} — try Save again.`;
          for (const playerId of presentIds) nextErrors.set(playerId, reason);
        }
      }

      rowEntries.forEach(([playerId], index) => {
        const result = rowResults[index];
        if (result?.success) {
          savedPlayerIds.add(playerId);
          saved += 1;
        } else {
          failed += 1;
          nextErrors.set(playerId, result?.error ?? 'Could not save. Try again.');
        }
      });

      setPending((prev) => {
        if (savedPlayerIds.size === 0) return prev;
        const next = new Map(prev);
        for (const playerId of savedPlayerIds) next.delete(playerId);
        return next;
      });
      setRowErrors(nextErrors);
      if (savedPlayerIds.size > 0) {
        setSelected((prev) => {
          if (prev.size === 0) return prev;
          const next = new Set(prev);
          for (const playerId of savedPlayerIds) next.delete(playerId);
          return next;
        });
      }
    } catch {
      // A thrown network error leaves every pending row exactly as it was —
      // nothing here is optimistically cleared before a result is known.
      failed = entries.length;
      for (const [playerId] of entries) {
        if (!nextErrors.has(playerId)) nextErrors.set(playerId, 'Offline — try again when reconnected.');
      }
      setRowErrors(nextErrors);
    } finally {
      setSaving(false);
    }

    const summary = { saved, failed };
    if (failed === 0 && saved > 0) fwHaptic('success');
    setLastSummary(summary);
    return summary;
  }, [eventId, pending]);

  return {
    pending,
    rowErrors,
    markFor,
    setMark,
    selected,
    toggleSelected,
    clearSelection,
    markSelectedPresent,
    pendingCount: pending.size,
    saving,
    lastSummary,
    save,
  };
}
