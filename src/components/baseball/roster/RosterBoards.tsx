'use client';

/**
 * Roster board views (v10 §Roster "Views"): Position board, Status board, and
 * Development board. Each renders the roster as grouped columns so a coach can
 * read depth/availability/focus at a glance instead of scanning a flat list.
 *
 * Every player chip routes its primary click through `onSelect` → the player
 * peek panel (v10 §Roster: "Row click opens player peek panel"). The boards are
 * additive surfaces composed entirely from data the roster page already loads.
 */

import { memo } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getFullName } from '@/lib/utils';
import {
  IconAlertCircle,
  IconClock,
  IconTrendingUp,
  IconTrendingDown,
  IconMinus,
} from '@/components/icons';
import type { BaseballPlayerAggregates } from '@/lib/types';
import {
  getFreshness,
  getAttention,
  positionGroupOf,
  type MemberStatus,
  type Freshness,
} from './roster-triage';

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

// ── Shared badges ──────────────────────────────────────────────────────────

const FRESHNESS_STYLE: Record<Freshness['level'], string> = {
  fresh: 'bg-primary-50 text-primary-700 border-primary-200',
  recent: 'bg-warm-50 text-warm-600 border-warm-200',
  stale: 'bg-amber-50 text-amber-700 border-amber-200',
  none: 'bg-warm-50 text-warm-400 border-warm-200',
};

export const FreshnessBadge = memo(function FreshnessBadge({
  aggregates,
  className,
}: {
  aggregates: BaseballPlayerAggregates | undefined;
  className?: string;
}) {
  const f = getFreshness(aggregates);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums',
        FRESHNESS_STYLE[f.level],
        className,
      )}
      title={
        f.days == null
          ? 'No sessions recorded yet'
          : `Last session ${f.days} day${f.days === 1 ? '' : 's'} ago`
      }
    >
      <IconClock size={11} />
      {f.label}
    </span>
  );
});

export const AttentionBadge = memo(function AttentionBadge({
  status,
  aggregates,
  className,
}: {
  status: MemberStatus | null;
  aggregates: BaseballPlayerAggregates | undefined;
  className?: string;
}) {
  const a = getAttention(status, aggregates);
  if (!a.needsAttention) {
    return <span className={cn('text-xs text-warm-300', className)}>—</span>;
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700',
        className,
      )}
      title={a.summary}
    >
      <IconAlertCircle size={11} />
      {a.reasons.length > 1 ? `${a.reasons.length} flags` : a.summary}
    </span>
  );
});

function TrendDot({ trend }: { trend: BaseballPlayerAggregates['recent_trend'] }) {
  if (trend === 'improving') return <IconTrendingUp size={13} className="text-primary-600" />;
  if (trend === 'declining') return <IconTrendingDown size={13} className="text-red-500" />;
  if (trend === 'stable') return <IconMinus size={13} className="text-warm-400" />;
  return null;
}

// ── Player chip (shared across all boards) ─────────────────────────────────

const PlayerChip = memo(function PlayerChip({
  member,
  onSelect,
}: {
  member: RosterBoardMember;
  onSelect: (playerId: string) => void;
}) {
  const fullName = getFullName(member.firstName, member.lastName);
  const attention = getAttention(member.status, member.aggregates);

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={() => onSelect(member.playerId)}
      haptic="none"
      className={cn(
        'min-h-0 h-auto group w-full justify-start gap-3 rounded-xl border border-warm-200 bg-white p-2.5 text-left font-normal',
        'hover:border-primary-300 hover:bg-white hover:shadow-sm',
        attention.needsAttention && 'border-l-2 border-l-amber-400',
      )}
      aria-label={`Open ${fullName} preview`}
    >
      <Avatar name={fullName} src={member.avatarUrl || undefined} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium text-warm-900">{fullName}</p>
          {member.jerseyNumber != null && (
            <span className="flex-shrink-0 rounded bg-warm-100 px-1 text-xs text-warm-500">
              #{member.jerseyNumber}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="text-xs text-warm-500 tabular-nums">
            {member.aggregates?.career_ops != null
              ? `OPS ${member.aggregates.career_ops.toFixed(3).replace(/^0\./, '.')}`
              : member.primaryPosition || '—'}
          </span>
          <TrendDot trend={member.aggregates?.recent_trend ?? null} />
        </div>
      </div>
      <FreshnessBadge aggregates={member.aggregates} className="flex-shrink-0" />
    </Button>
  );
});

// ── Generic board scaffold ─────────────────────────────────────────────────

interface BoardColumn {
  key: string;
  label: string;
  hint?: string;
  members: RosterBoardMember[];
}

const BoardLayout = memo(function BoardLayout({
  columns,
  onSelect,
  emptyHint,
}: {
  columns: BoardColumn[];
  onSelect: (playerId: string) => void;
  emptyHint: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {columns.map((col) => (
        <section
          key={col.key}
          className="flex flex-col rounded-2xl border border-warm-200 bg-cream-50/60 p-3"
          aria-label={`${col.label} (${col.members.length})`}
        >
          <header className="mb-3 flex items-center justify-between px-1">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-warm-900">{col.label}</h3>
              {col.hint && <p className="truncate text-xs text-warm-400">{col.hint}</p>}
            </div>
            <Badge variant="secondary">{col.members.length}</Badge>
          </header>
          <div className="flex flex-col gap-2">
            {col.members.length === 0 ? (
              <p className="rounded-xl border border-dashed border-warm-200 py-4 text-center text-xs text-warm-400">
                {emptyHint}
              </p>
            ) : (
              col.members.map((m) => (
                <PlayerChip key={m.memberId} member={m} onSelect={onSelect} />
              ))
            )}
          </div>
        </section>
      ))}
    </div>
  );
});

// ── Position board ─────────────────────────────────────────────────────────

const POSITION_COLUMNS: { key: string; label: string; hint: string }[] = [
  { key: 'pitchers', label: 'Pitchers', hint: 'LHP · RHP' },
  { key: 'catchers', label: 'Catchers', hint: 'C' },
  { key: 'infield', label: 'Infield', hint: '1B · 2B · 3B · SS · UTL' },
  { key: 'outfield', label: 'Outfield', hint: 'OF' },
  { key: 'unassigned', label: 'Unassigned', hint: 'No position set' },
];

export const PositionBoard = memo(function PositionBoard({
  members,
  onSelect,
}: {
  members: RosterBoardMember[];
  onSelect: (playerId: string) => void;
}) {
  const columns: BoardColumn[] = POSITION_COLUMNS.map((c) => ({
    ...c,
    members: members.filter((m) => {
      const grp = positionGroupOf(m.primaryPosition);
      return c.key === 'unassigned' ? grp == null : grp === c.key;
    }),
  }));
  return <BoardLayout columns={columns} onSelect={onSelect} emptyHint="No players" />;
});

// ── Status board ───────────────────────────────────────────────────────────

const STATUS_COLUMNS: { key: MemberStatus; label: string; hint: string }[] = [
  { key: 'active', label: 'Active', hint: 'Available to play' },
  { key: 'injured', label: 'Injured / Limited', hint: 'Restricted availability' },
  { key: 'pending', label: 'Awaiting Join', hint: 'Invite not accepted' },
  { key: 'inactive', label: 'Inactive', hint: 'Not currently active' },
  { key: 'alumni', label: 'Alumni', hint: 'Past roster' },
];

export const StatusBoard = memo(function StatusBoard({
  members,
  onSelect,
}: {
  members: RosterBoardMember[];
  onSelect: (playerId: string) => void;
}) {
  const known = new Set(STATUS_COLUMNS.map((c) => c.key));
  const columns: BoardColumn[] = STATUS_COLUMNS.map((c) => ({
    key: c.key,
    label: c.label,
    hint: c.hint,
    members: members.filter((m) =>
      c.key === 'inactive'
        ? m.status === 'inactive' || m.status == null || !known.has(m.status)
        : m.status === c.key,
    ),
  }));
  return <BoardLayout columns={columns} onSelect={onSelect} emptyHint="No players" />;
});

// ── Development board ──────────────────────────────────────────────────────

/**
 * Groups players by their performance trajectory — the closest honest proxy for
 * "development focus" available from loaded data. `development_stage` is not a
 * persisted DB column yet (see the "@deprecated" note on BaseballPlayerAggregates in
 * lib/types/index.ts and the "NOT YET IN DB" block above it), so we group on
 * the real `recent_trend` signal plus a "needs data" lane for players the coach
 * can't yet evaluate.
 */
const DEV_COLUMNS: { key: string; label: string; hint: string }[] = [
  { key: 'improving', label: 'Improving', hint: 'Trending up — reinforce' },
  { key: 'stable', label: 'Holding Steady', hint: 'Stable — maintain' },
  { key: 'declining', label: 'Needs Focus', hint: 'Trending down — intervene' },
  { key: 'no-data', label: 'Needs Data', hint: 'Log sessions to evaluate' },
];

export const DevelopmentBoard = memo(function DevelopmentBoard({
  members,
  onSelect,
}: {
  members: RosterBoardMember[];
  onSelect: (playerId: string) => void;
}) {
  const columns: BoardColumn[] = DEV_COLUMNS.map((c) => ({
    ...c,
    members: members.filter((m) => {
      const trend = m.aggregates?.recent_trend ?? null;
      const hasData = (m.aggregates?.total_sessions ?? 0) > 0;
      if (c.key === 'no-data') return !hasData || trend == null;
      return hasData && trend === c.key;
    }),
  }));
  return <BoardLayout columns={columns} onSelect={onSelect} emptyHint="No players" />;
});
