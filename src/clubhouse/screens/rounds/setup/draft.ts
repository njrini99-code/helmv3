'use client';

import { useContext } from 'react';
import { RouteScope } from '../../../lib/session-state';
import type { ChSetupForm, ChSetupQualifier } from './shape';

/**
 * New round's setup, kept for this tab while the player is on it, so Back (or a look at another page) and a return
 * never loses the course, tees and edited pars. Keyed by the page's route and team (`RouteScope`) and the signed-in
 * player, so another team or another person in the same tab never opens on it; no draft without both. Cleared once a
 * round starts (and again once it posts). Storage can be absent or refuse writes: every access is guarded and setup
 * still works. The photo of a course typed in by hand is a File and is not kept.
 */
const PREFIX = 'ch:rsu:draft:';

export function setupDraftKey(scope: string, viewerId: string | null | undefined): string | null {
  return scope && viewerId ? `${PREFIX}${scope}\u0000${viewerId}` : null;
}

/** This page's draft key for the signed-in player (null in the preview, which has none). */
export function useSetupDraftKey(viewerId: string | null | undefined): string | null {
  return setupDraftKey(useContext(RouteScope), viewerId);
}

export function readSetupDraft(key: string | null): ChSetupForm | null {
  if (!key) return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const f = JSON.parse(raw) as Partial<ChSetupForm> | null;
    if (!f || typeof f.date !== 'string' || (f.count !== 9 && f.count !== 18) || !Array.isArray(f.holes)) return null;
    return f as ChSetupForm;
  } catch {
    return null;
  }
}

/** Keeps the form; a course whose scorecard hasn't landed is not kept (it would come back with no holes to start). */
export function writeSetupDraft(key: string | null, form: ChSetupForm): void {
  if (!key) return;
  const rest: ChSetupForm = { ...form, coursePhoto: undefined };
  const kept: ChSetupForm = rest.pick && !rest.holes.length ? { ...rest, pick: null, baseline: null } : rest;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(kept));
  } catch {
    // Storage blocked or full: setup still works for this visit.
  }
}

export function clearSetupDraft(key: string | null): void {
  if (!key) return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Nothing to clear.
  }
}

/** A kept form against today's qualifiers: one that is no longer open goes back to a practice round. */
export function restoreSetupDraft(draft: ChSetupForm, qualifiers: ChSetupQualifier[] | null): ChSetupForm {
  if (draft.type !== 'qualifier' || !draft.qualifierId) return draft;
  const q = qualifiers?.find((x) => x.id === draft.qualifierId && x.nextRound != null);
  return q ? { ...draft, qualifierRound: q.nextRound } : { ...draft, type: 'practice', qualifierId: null, qualifierRound: null };
}
