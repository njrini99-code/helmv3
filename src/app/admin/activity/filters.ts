import type { ActivityKind } from '@/lib/admin/data/activity';
import { isActivityKind } from './kind-meta';

/**
 * Pure searchParams <-> filter-state mapping for /admin/activity. Every
 * filter (kind, team) is a URL param — server refetch on change, never
 * client-side row hiding — so these helpers are shared by page.tsx (parse +
 * href-build) and the client filter controls (href-build only).
 */

export interface ActivityFilters {
  type: ActivityKind | null;
  teamId: string | null;
  cursor: string | null;
}

type RawSearchParams = Record<string, string | string[] | undefined>;

function firstString(v: string | string[] | undefined): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

/** Never throws on a bad/unknown value — an unrecognized `type` or empty
 *  `team`/`cursor` just falls back to "no filter" (matches parseErrorsFilters'
 *  drop-invalid-don't-400 convention). */
export function parseActivityFilters(params: RawSearchParams): ActivityFilters {
  const rawType = firstString(params.type);
  const rawTeam = firstString(params.team);
  const rawCursor = firstString(params.cursor);
  return {
    type: isActivityKind(rawType) ? rawType : null,
    teamId: rawTeam && rawTeam.length > 0 ? rawTeam : null,
    cursor: rawCursor && rawCursor.length > 0 ? rawCursor : null,
  };
}

export function searchParamsToURLSearchParams(params: RawSearchParams): URLSearchParams {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') usp.set(key, value);
  }
  return usp;
}

/** Changing ANY filter drops `cursor` — a stale cursor from the previous
 *  filter set would silently mis-paginate the new one. */
function withoutCursor(current: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(current);
  next.delete('cursor');
  return next;
}

function toHref(next: URLSearchParams): string {
  const qs = next.toString();
  return qs ? `/admin/activity?${qs}` : '/admin/activity';
}

export function kindChipHref(current: URLSearchParams, kind: ActivityKind | 'all'): string {
  const next = withoutCursor(current);
  if (kind === 'all') next.delete('type');
  else next.set('type', kind);
  return toHref(next);
}

export function teamFilterHref(current: URLSearchParams, teamId: string | null): string {
  const next = withoutCursor(current);
  if (teamId) next.set('team', teamId);
  else next.delete('team');
  return toHref(next);
}

export function loadMoreHref(current: URLSearchParams, nextCursor: string): string {
  const next = new URLSearchParams(current);
  next.set('cursor', nextCursor);
  return toHref(next);
}
