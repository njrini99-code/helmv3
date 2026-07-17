'use client';

// =============================================================================
// src/components/baseball/stat-visuals/use-stat-visual-views.ts
//
// Packet: stat-visuals (BaseballHelm — stats-integrations)
//
// Client hook that WIRES the V10 stat-visual gallery to its persistence layer:
// the baseball_stat_visual_views table via the stat-visual-views server actions
// (getStatVisualViews / saveStatVisualView / setStatVisualPinned). It loads the
// current user's saved views for a scope on mount, exposes them for tab/pin
// restore, and returns optimistic save/pin handlers the gallery accepts as
// props. Surfaces (StatsCenterClient team scope, PlayerProfileClient player
// scope) drop this in with one line instead of re-implementing the round-trip.
//
// The gallery stays presentational — all DB access lives in the server actions;
// this hook only orchestrates calls + local optimistic state. RLS (owner +
// team-scoped) is the authorization boundary; the actions stamp owner/team from
// the server context, so the client can never write another user's rows.
//
// ERROR HANDLING
//   * Load failures toast a non-fatal warning and leave the gallery functional
//     (charts render; saved state just isn't restored).
//   * Save/pin failures toast an error, roll back the optimistic update, and
//     rethrow so callers can handle if needed — nothing is silently swallowed.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';

import { toast } from '@/components/ui/sonner';
import type { Json } from '@/lib/types';
import {
  getStatVisualViews,
  saveStatVisualView,
  setStatVisualPinned,
} from '@/app/baseball/actions/stat-visual-views';
import type { StatVisualSavedView } from './StatVisualsSection';

/**
 * A load failure is expected/non-actionable — not "your saved views are
 * broken" — when it's a permission denial (sanitizeDbError's RLS-denial
 * message) or the shared demo-account read-only guard. Neither is something
 * the viewer can act on, so it stays silent; a genuine load failure (network,
 * unexpected DB error) still toasts for the owner. Matched case-insensitively
 * against a substring since a thrown server-action error crossing the RSC
 * boundary can lose its exact message in production.
 */
function isSilentLoadFailure(message: string | null | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return m.includes('permission') || m.includes('live demo');
}

export interface UseStatVisualViewsResult {
  savedViews: StatVisualSavedView[];
  onSaveView: (input: {
    visualKey: string;
    viewState: Json;
    playerId?: string | null;
    isPinned?: boolean;
  }) => Promise<void>;
  onSetPinned: (input: {
    visualKey: string;
    isPinned: boolean;
    playerId?: string | null;
  }) => Promise<void>;
}

/**
 * Load + persist the current user's stat-visual saved views for a scope.
 * Pass `playerId` for the player-profile scope; omit it for the team scope.
 */
export function useStatVisualViews(playerId?: string | null): UseStatVisualViewsResult {
  const [savedViews, setSavedViews] = useState<StatVisualSavedView[]>([]);

  // Stable ref so rollback closures always see the current list without
  // capturing a stale closure over `savedViews`.
  const savedViewsRef = useRef<StatVisualSavedView[]>(savedViews);
  useEffect(() => {
    savedViewsRef.current = savedViews;
  });

  useEffect(() => {
    let cancelled = false;
    // Toast id of any "load failed" warning this effect fired, so the
    // cleanup below can dismiss it — a route change unmounts this hook's
    // owner but sonner's Toaster is mounted once at the app root, so a
    // toast fired on the way out would otherwise sit on screen through the
    // navigation instead of disappearing with the surface that raised it.
    let pendingToastId: string | number | null = null;

    void getStatVisualViews({ playerId: playerId ?? null })
      .then((res) => {
        if (cancelled) return;
        if (!res.success || !res.data) {
          if (!isSilentLoadFailure(res.error)) {
            pendingToastId = toast.warning(
              'Saved views unavailable',
              res.error ?? 'Could not load your saved chart settings.',
            );
          }
          return;
        }
        const loaded: StatVisualSavedView[] = res.data.map((v) => ({
          visual_key: v.visual_key,
          view_state: v.view_state,
          is_pinned: v.is_pinned,
        }));
        setSavedViews(loaded);
        savedViewsRef.current = loaded;
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Network-level or unexpected throw — non-fatal, gallery still renders.
        const message = err instanceof Error ? err.message : null;
        if (!isSilentLoadFailure(message)) {
          pendingToastId = toast.warning(
            'Saved views unavailable',
            'Could not load your saved chart settings.',
          );
        }
      });
    return () => {
      cancelled = true;
      if (pendingToastId !== null) toast.dismiss(pendingToastId);
    };
  }, [playerId]);

  /** Merge a row into local state by visual_key (mirrors the upsert server-side). */
  const upsertLocal = useCallback(
    (visualKey: string, patch: Partial<StatVisualSavedView>): void => {
      setSavedViews((prev) => {
        const idx = prev.findIndex((v) => v.visual_key === visualKey);
        if (idx === -1) {
          const fresh: StatVisualSavedView = {
            visual_key: visualKey,
            view_state: patch.view_state ?? {},
            is_pinned: patch.is_pinned ?? false,
          };
          return [...prev, fresh];
        }
        const existing = prev[idx];
        if (!existing) return prev;
        const next = [...prev];
        next[idx] = { ...existing, ...patch };
        return next;
      });
    },
    [],
  );

  /**
   * Roll back an optimistic update to `visualKey` using a snapshot taken
   * synchronously *before* the optimistic write.
   */
  const rollbackTo = useCallback(
    (visualKey: string, snapshot: StatVisualSavedView | undefined): void => {
      setSavedViews((curr) => {
        if (!snapshot) {
          // Row did not exist before — remove the optimistic entry.
          return curr.filter((v) => v.visual_key !== visualKey);
        }
        const i = curr.findIndex((v) => v.visual_key === visualKey);
        if (i === -1) return curr;
        const next = [...curr];
        next[i] = snapshot;
        return next;
      });
    },
    [],
  );

  const onSaveView = useCallback<UseStatVisualViewsResult['onSaveView']>(
    async (input) => {
      // Capture the pre-optimistic snapshot via the stable ref (synchronous).
      const snapshot = savedViewsRef.current.find((v) => v.visual_key === input.visualKey);
      upsertLocal(input.visualKey, {
        view_state: input.viewState,
        ...(input.isPinned !== undefined ? { is_pinned: input.isPinned } : {}),
      });
      const res = await saveStatVisualView(input);
      if (!res.success) {
        rollbackTo(input.visualKey, snapshot);
        toast.error('Could not save chart view', res.error ?? 'Please try again.');
        throw new Error(res.error ?? 'saveStatVisualView failed');
      }
    },
    [upsertLocal, rollbackTo],
  );

  const onSetPinned = useCallback<UseStatVisualViewsResult['onSetPinned']>(
    async (input) => {
      // Capture the pre-optimistic snapshot via the stable ref (synchronous).
      const snapshot = savedViewsRef.current.find((v) => v.visual_key === input.visualKey);
      upsertLocal(input.visualKey, { is_pinned: input.isPinned });
      const res = await setStatVisualPinned(input);
      if (!res.success) {
        rollbackTo(input.visualKey, snapshot);
        toast.error(
          input.isPinned ? 'Could not pin chart' : 'Could not unpin chart',
          res.error ?? 'Please try again.',
        );
        throw new Error(res.error ?? 'setStatVisualPinned failed');
      }
    },
    [upsertLocal, rollbackTo],
  );

  return { savedViews, onSaveView, onSetPinned };
}
