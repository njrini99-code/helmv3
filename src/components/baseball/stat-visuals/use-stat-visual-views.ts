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
// =============================================================================

import { useCallback, useEffect, useState } from 'react';

import type { Json } from '@/lib/types';
import {
  getStatVisualViews,
  saveStatVisualView,
  setStatVisualPinned,
} from '@/app/baseball/actions/stat-visual-views';
import type { StatVisualSavedView } from './StatVisualsSection';

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

  useEffect(() => {
    let cancelled = false;
    void getStatVisualViews({ playerId: playerId ?? null })
      .then((res) => {
        if (cancelled || !res.success || !res.data) return;
        setSavedViews(
          res.data.map((v) => ({
            visual_key: v.visual_key,
            view_state: v.view_state,
            is_pinned: v.is_pinned,
          })),
        );
      })
      .catch(() => {
        // Non-fatal: the gallery still renders, just without restored tabs/pins.
      });
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  /** Merge a row into local state by visual_key (mirrors the upsert server-side). */
  const upsertLocal = useCallback(
    (visualKey: string, patch: Partial<StatVisualSavedView>) => {
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

  const onSaveView = useCallback<UseStatVisualViewsResult['onSaveView']>(
    async (input) => {
      upsertLocal(input.visualKey, {
        view_state: input.viewState,
        ...(input.isPinned !== undefined ? { is_pinned: input.isPinned } : {}),
      });
      await saveStatVisualView(input);
    },
    [upsertLocal],
  );

  const onSetPinned = useCallback<UseStatVisualViewsResult['onSetPinned']>(
    async (input) => {
      upsertLocal(input.visualKey, { is_pinned: input.isPinned });
      await setStatVisualPinned(input);
    },
    [upsertLocal],
  );

  return { savedViews, onSaveView, onSetPinned };
}
