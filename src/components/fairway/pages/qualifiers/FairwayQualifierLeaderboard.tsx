'use client';

/**
 * ============================================================================
 * Fairway · Qualifiers · FairwayQualifierLeaderboard — the matte live standings
 * ----------------------------------------------------------------------------
 * The HERO of the redesigned Qualifier Detail page (DESIGN-SYSTEM §5.2
 * "Qualifier leaderboard" + §0 #8 "honest emptiness"). A PRESENTATION rebuild
 * ONLY: it reuses the existing `useQualifierRealtime` hook VERBATIM (same
 * subscription, same data shape) and re-skins the presentation onto Fairway
 * tokens.
 *
 * REUSE (logic, UNCHANGED):
 *   • `useQualifierRealtime(qualifierId)` — the same hook the legacy
 *     `QualifierLeaderboardRealtime` consumed. Same realtime channel, same
 *     per-player round aggregates, same loading/error contract.
 *   • The leaderboard sort + tie + position derivation mirrors the legacy
 *     `QualifierViewTabs` table data path (total-to-par asc, players with 0
 *     rounds sink to the bottom).
 *
 * REBUILD vs the legacy surface (DROP the skeuomorphic bracket):
 *   • No gradient/ring/medal/progress-bar `QualifierBracket` — a flat matte
 *     standings table (tabular-nums, sticky-feel header hairline) instead.
 *   • Honest pre-event state: when NO player has a completed round, the body is
 *     an EmptyState ("Awaiting first round — N players entered…") rather than a
 *     table of all-dash rows or a bracket painting "E" for 0-round players
 *     (FIX: the legacy bracket bug that printed 'E' / even-par for players who
 *     have not posted a score).
 *   • A 0-round player is NEVER given a position, "E", or a "0" total — the
 *     to-par / total / avg cells read an em-dash until a real round posts.
 *
 * ADDITIVE + GATED — imported only behind the isRedesignEnabled() fork. Renders
 * inside the `.fairway-ds` scope on a bg-canvas page.
 * ========================================================================== */

import { useMemo } from 'react';
import { Flag } from 'lucide-react';

import { useQualifierRealtime } from '@/hooks/golf/use-qualifier-realtime';
import { Surface, EmptyState, InlineNotice, StatusPill } from '@/components/fairway';
import { cn } from '@/lib/utils';

interface FairwayQualifierLeaderboardProps {
  qualifierId: string;
  /** Entrant count from the server fetch — used in the honest "awaiting" copy. */
  entrantCount: number;
}

/** A presentation row derived from the realtime leaderboard entries. */
interface StandingRow {
  playerId: string;
  playerName: string;
  roundsCompleted: number;
  totalScore: number | null;
  totalToPar: number | null;
  hasScore: boolean;
  /** Display position (1-based among scored players); null until a score posts. */
  position: number | null;
  isTied: boolean;
}

/** Format a to-par value honestly: only scored players get '+N' / 'E' / '-N'. */
function formatToPar(toPar: number | null, hasScore: boolean): string {
  if (!hasScore || toPar === null) return '—';
  if (toPar === 0) return 'E';
  return toPar > 0 ? `+${toPar}` : `${toPar}`;
}

export function FairwayQualifierLeaderboard({
  qualifierId,
  entrantCount,
}: FairwayQualifierLeaderboardProps) {
  // VERBATIM: same hook, same realtime subscription as the legacy leaderboard.
  const { leaderboard: entries, qualifier, loading, error } = useQualifierRealtime(qualifierId);

  // Mirror the legacy QualifierViewTabs sort/tie data path, but track an honest
  // `hasScore` flag so 0-round players never render a position or even-par.
  const rows = useMemo<StandingRow[]>(() => {
    if (!entries || entries.length === 0) return [];

    const sorted = [...entries].sort((a, b) => {
      const aScored = a.rounds_completed > 0;
      const bScored = b.rounds_completed > 0;
      // Players with rounds sort above those without (legacy behavior).
      if (aScored && !bScored) return -1;
      if (!aScored && bScored) return 1;
      if (!aScored && !bScored) return 0;
      const aToPar = a.total_to_par ?? Infinity;
      const bToPar = b.total_to_par ?? Infinity;
      if (aToPar !== bToPar) return aToPar - bToPar;
      const aScore = a.total_score ?? Infinity;
      const bScore = b.total_score ?? Infinity;
      return aScore - bScore;
    });

    let scoredSeen = 0;
    return sorted.map((entry, index) => {
      const hasScore = entry.rounds_completed > 0;
      const position = hasScore ? ++scoredSeen : null;
      const prev = index > 0 ? sorted[index - 1] : undefined;
      const isTied =
        hasScore &&
        prev !== undefined &&
        prev.rounds_completed > 0 &&
        (prev.total_to_par ?? null) === (entry.total_to_par ?? null);

      return {
        playerId: entry.player_id,
        playerName: entry.player_name,
        roundsCompleted: entry.rounds_completed,
        totalScore: hasScore ? entry.total_score ?? null : null,
        totalToPar: hasScore ? entry.total_to_par ?? null : null,
        hasScore,
        position,
        isTied,
      };
    });
  }, [entries]);

  const anyScored = rows.some((r) => r.hasScore);
  const isLive = qualifier?.status === 'in_progress';

  return (
    <Surface aria-label="Qualifier leaderboard">
      <Surface.Header
        title="Leaderboard"
        actions={
          isLive ? (
            <StatusPill tone="accent" pulse>
              Live
            </StatusPill>
          ) : undefined
        }
      />
      <Surface.Body>
        {loading ? (
          <LeaderboardSkeleton />
        ) : error ? (
          <InlineNotice tone="danger" title="Couldn't load the leaderboard">
            {error}
          </InlineNotice>
        ) : !anyScored ? (
          // HONEST pre-event hero state — no fabricated rows, no 'E', no zeros.
          <EmptyState
            variant="subtle"
            icon={Flag}
            title="Awaiting first round"
            description={
              entrantCount > 0
                ? `${entrantCount} player${entrantCount === 1 ? '' : 's'} entered — scores post here as rounds are submitted.`
                : 'Scores post here as rounds are submitted.'
            }
          />
        ) : (
          <StandingsTable rows={rows} />
        )}
      </Surface.Body>
    </Surface>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Matte standings table — flat, tabular-nums, no bracket / medals / rings
 * ──────────────────────────────────────────────────────────────────────── */

function StandingsTable({ rows }: { rows: StandingRow[] }) {
  return (
    <div className="overflow-x-auto overscroll-x-contain">
      <table className="w-full border-collapse font-fw-sans text-body">
        <thead>
          <tr className="border-b border-border-strong text-left">
            <Th className="w-12">Pos</Th>
            <Th>Player</Th>
            <Th align="right">Rounds</Th>
            <Th align="right">Total</Th>
            <Th align="right">To par</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const leader = row.position === 1;
            return (
              <tr
                key={row.playerId}
                className={cn(
                  'border-b border-border-subtle last:border-b-0',
                  leader && 'bg-accent-50/60',
                )}
              >
                <td className="py-2.5 pr-3 text-text-secondary tabular-nums">
                  {row.position === null ? (
                    <span className="text-text-tertiary">—</span>
                  ) : (
                    <span className={cn(leader && 'font-medium text-accent-700')}>
                      {row.isTied ? 'T' : ''}
                      {row.position}
                    </span>
                  )}
                </td>
                <td className="py-2.5 pr-3 font-medium text-text-primary">
                  {row.playerName}
                </td>
                <td className="py-2.5 pr-3 text-right text-text-secondary tabular-nums">
                  {row.roundsCompleted > 0 ? row.roundsCompleted : '—'}
                </td>
                <td className="py-2.5 pr-3 text-right font-fw-mono text-text-primary tabular-nums">
                  {row.hasScore && row.totalScore !== null ? row.totalScore : '—'}
                </td>
                <td
                  className={cn(
                    'py-2.5 text-right font-fw-mono tabular-nums',
                    row.hasScore && row.totalToPar !== null && row.totalToPar < 0
                      ? 'text-accent-700'
                      : 'text-text-secondary',
                  )}
                >
                  {formatToPar(row.totalToPar, row.hasScore)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  align = 'left',
  className,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) {
  return (
    <th
      className={cn(
        'pb-2 font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.07em] text-text-tertiary',
        align === 'right' ? 'pl-3 text-right' : 'pr-3 text-left',
        className,
      )}
    >
      {children}
    </th>
  );
}

function LeaderboardSkeleton() {
  return (
    <div role="status" aria-label="Loading leaderboard" className="animate-pulse motion-reduce:animate-none space-y-3">
      <div className="h-3 w-full rounded bg-inset" />
      <div className="h-3 w-5/6 rounded bg-inset" />
      <div className="h-3 w-4/6 rounded bg-inset" />
    </div>
  );
}
