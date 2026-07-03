/**
 * Roster triage helpers (v10 §Roster: "the team's operating index").
 *
 * Pure, additive utilities that derive the spec-mandated *operating* signals a
 * coach triages on — source freshness and attention — from data the roster page
 * already loads (member status, member aggregates). Kept framework-free so the
 * table, card grid, and the Position / Status / Development boards all read from
 * one source of truth instead of re-deriving badge logic per surface.
 */

import type { BaseballPlayerAggregates } from '@/lib/types';

export type MemberStatus =
  | 'pending'
  | 'active'
  | 'inactive'
  | 'removed'
  | 'injured'
  | 'alumni';

/** A roster member as read by the triage boards (position/status/development). */
export interface RosterBoardMember {
  memberId: string;
  playerId: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  primaryPosition: string | null;
  secondaryPosition: string | null;
  jerseyNumber: number | null;
  status: MemberStatus | null;
  aggregates?: BaseballPlayerAggregates;
}

/** How recently this player's data was last refreshed from a session. */
export type FreshnessLevel = 'fresh' | 'recent' | 'stale' | 'none';

export interface Freshness {
  level: FreshnessLevel;
  /** Whole days since the last session, or null when no session exists. */
  days: number | null;
  /** Short scannable label, e.g. "3d", "Stale", "No data". */
  label: string;
}

const DAY_MS = 1000 * 60 * 60 * 24;

/**
 * Derive source freshness from the aggregate's last-refresh timestamp — the real
 * signal of when this player's data was last recomputed from a captured session.
 * fresh ≤ 7d · recent ≤ 21d · stale > 21d · none = never.
 *
 * Uses `last_calculated_at` (the recompute timestamp on the aggregate row); a
 * player with zero sessions has no aggregate, so `agg` is undefined → "No data".
 */
export function getFreshness(agg: BaseballPlayerAggregates | undefined): Freshness {
  // A player with no captured sessions has no aggregate row at all, so treat a
  // missing aggregate (or missing timestamp) as "No data" honestly.
  const last = agg && (agg.total_sessions ?? 0) > 0 ? agg.last_calculated_at : null;
  if (!last) return { level: 'none', days: null, label: 'No data' };

  const ts = Date.parse(last);
  if (Number.isNaN(ts)) return { level: 'none', days: null, label: 'No data' };

  const days = Math.max(0, Math.floor((Date.now() - ts) / DAY_MS));
  if (days <= 7) return { level: 'fresh', days, label: days === 0 ? 'Today' : `${days}d` };
  if (days <= 21) return { level: 'recent', days, label: `${days}d` };
  return { level: 'stale', days, label: `${days}d` };
}

export type AttentionReason =
  | 'injured'
  | 'pending'
  | 'inactive'
  | 'declining'
  | 'no-data'
  | 'stale-data';

const REASON_LABELS: Record<AttentionReason, string> = {
  injured: 'Injured',
  pending: 'Awaiting join',
  inactive: 'Inactive',
  declining: 'Trending down',
  'no-data': 'No sessions',
  'stale-data': 'Data stale',
};

export interface Attention {
  /** True when the player needs a coach's eyes. */
  needsAttention: boolean;
  reasons: AttentionReason[];
  /** Human-readable summary of why, e.g. "Injured · Data stale". */
  summary: string;
}

/**
 * Derive whether a player needs attention and why. A coach's roster is an
 * action queue: injured / not-yet-joined / inactive members, a declining
 * trend, or missing/stale data all surface here so they can be filtered and
 * sorted to the top.
 */
export function getAttention(
  status: MemberStatus | null,
  agg: BaseballPlayerAggregates | undefined,
): Attention {
  const reasons: AttentionReason[] = [];

  if (status === 'injured') reasons.push('injured');
  if (status === 'pending') reasons.push('pending');
  if (status === 'inactive') reasons.push('inactive');

  if (agg?.recent_trend === 'declining') reasons.push('declining');

  const freshness = getFreshness(agg);
  if (freshness.level === 'none') reasons.push('no-data');
  else if (freshness.level === 'stale') reasons.push('stale-data');

  return {
    needsAttention: reasons.length > 0,
    reasons,
    summary: reasons.map((r) => REASON_LABELS[r]).join(' · '),
  };
}

/** Position groups for quick-filtering (v10 §Roster: "quick filters for position group"). */
export type PositionGroup = 'all' | 'pitchers' | 'catchers' | 'infield' | 'outfield';

const INFIELD = new Set(['1B', '2B', '3B', 'SS', 'UTL']);
const OUTFIELD = new Set(['OF', 'LF', 'CF', 'RF']);
const PITCHERS = new Set(['LHP', 'RHP', 'P']);

export function positionGroupOf(position: string | null): PositionGroup | null {
  if (!position) return null;
  if (PITCHERS.has(position)) return 'pitchers';
  if (position === 'C') return 'catchers';
  if (INFIELD.has(position)) return 'infield';
  if (OUTFIELD.has(position)) return 'outfield';
  return null;
}

export function matchesPositionGroup(
  group: PositionGroup,
  primary: string | null,
  secondary: string | null,
): boolean {
  if (group === 'all') return true;
  return positionGroupOf(primary) === group || positionGroupOf(secondary) === group;
}
