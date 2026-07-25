'use client';

/**
 * ============================================================================
 * LeakBoard — "where is the team bleeding strokes?" (redesign of the category view)
 * ----------------------------------------------------------------------------
 * The legacy TeamCategoryView is a tabbed skill view ranked by TEAM AVERAGE — it
 * answers "what's our putting average" but not "where are we losing the most
 * strokes." A coach with 12 players and 90 seconds needs the latter.
 *
 * The LeakBoard regroups live insights by skill category and makes the UNIT of
 * every row the SUMMED stroke-impact across every leak in that category —
 * biggest bleed first — so the flood of insights collapses into a triage
 * board read in one scan. Each row carries its leak count, the players
 * affected, the worst severity, and a "high bleed" flag at ≥ `flameThreshold`.
 *
 * Honesty: the total is a SUM across every player and every leak insight in
 * the category — NOT a per-round rate. It used to be labeled "str/rd" (a
 * per-round unit), which read as if −26.4 meant a team losing 26 strokes
 * EVERY round — 8x the genuine team SG-putting figure (~−3.19/rd) computed
 * from real rounds. The label now says what the number actually is: a
 * cross-player, cross-insight total for the window, never a rate. Stroke-
 * impact itself is still the engine's own counterfactual magnitude (already
 * confidence- and sample-gated upstream); the board sums what the engine
 * surfaced, never invents a number. Decoupled shape — no server import.
 * ========================================================================== */

import { cn } from '@/lib/utils';
import { InstrumentPanel } from '@/components/fairway/instrument/InstrumentPanel';

type Priority = 'low' | 'medium' | 'high' | 'urgent';

export interface LeakInsight {
  id: string;
  category: string | null;
  title: string;
  /** evidence.strokes_impact (sign-agnostic; we sum the magnitude). */
  strokesImpact: number;
  priority: Priority;
  playerName?: string;
}

export interface LeakBoardProps {
  insights: LeakInsight[];
  /**
   * Summed total strokes (across every leak in the category) at or above
   * which it's flagged a high bleed. NOT a per-round rate. Omit to use the
   * board's own honest, RELATIVE default (see `resolveFlameThreshold`) —
   * a flat absolute number can't scale between a light week (every category
   * under 2 strokes) and a heavy one (categories in the 30s), so a fixed
   * 0.8 tripped on literally every row regardless of magnitude (bug #949 #4:
   * −33.5, −4.4, and −1.4 all read "· high bleed" alike).
   */
  flameThreshold?: number;
  className?: string;
}

/**
 * Bug #949 #4 — the "high bleed" flag must actually differentiate rows, not
 * fire on every one of them. A flat threshold (the old default, 0.8) is
 * useless: it's tiny next to a genuinely bad category (−33.5) but would ALSO
 * flag a quiet week where nothing has crossed 2 strokes. Since there's no
 * external "how much bleed is a lot" standard (mirrors `relativeTones`'
 * self-referential read elsewhere in this codebase for the same reason),
 * "high" is read RELATIVE to this board's own worst category: at least half
 * of the biggest bleed shown, with a 3-stroke floor so a lone small leak in
 * an otherwise-quiet board never earns the label just for being the largest
 * of a small pack.
 */
export function resolveFlameThreshold(maxTotal: number, override?: number): number {
  if (typeof override === 'number') return override;
  return Math.max(maxTotal * 0.5, 3);
}

const CATEGORY_LABEL: Record<string, string> = {
  putting: 'Putting',
  approach: 'Approach',
  short_game: 'Around the green',
  tee: 'Off the tee',
  driving: 'Off the tee',
  course_management: 'Course management',
  course_mgmt: 'Course management',
  pressure: 'Pressure',
  scoring: 'Scoring',
};

const PRIORITY_RANK: Record<Priority, number> = { low: 0, medium: 1, high: 2, urgent: 3 };

const SEVERITY_BAR: Record<Priority, string> = {
  urgent: 'bg-fw-danger',
  high: 'bg-fw-danger',
  medium: 'bg-fw-warning',
  low: 'bg-text-tertiary',
};

interface LeakRow {
  label: string;
  total: number;
  count: number;
  worst: Priority;
  players: Set<string>;
}

export function LeakBoard({ insights, flameThreshold, className }: LeakBoardProps) {
  const groups = new Map<string, LeakRow>();
  for (const i of insights) {
    const key = (i.category ?? 'other').toLowerCase();
    const label = CATEGORY_LABEL[key] ?? 'Other';
    const row = groups.get(label) ?? { label, total: 0, count: 0, worst: 'low', players: new Set<string>() };
    row.total += Math.abs(i.strokesImpact || 0);
    row.count += 1;
    if (PRIORITY_RANK[i.priority] > PRIORITY_RANK[row.worst]) row.worst = i.priority;
    if (i.playerName) row.players.add(i.playerName);
    groups.set(label, row);
  }

  const rows = [...groups.values()].sort((a, b) => b.total - a.total);

  if (rows.length === 0) {
    return (
      <InstrumentPanel depth="base" className={className} eyebrow="CoachHelm · team" header="Where the team is bleeding">
        <p className="text-body-sm text-text-secondary">
          No live leaks right now — analyze the team or log a few more rounds and the board fills in.
        </p>
      </InstrumentPanel>
    );
  }

  const maxTotal = rows.reduce((m, r) => Math.max(m, r.total), 0) || 1;
  const totalPlayers = new Set(insights.map((i) => i.playerName).filter(Boolean)).size;
  const threshold = resolveFlameThreshold(maxTotal, flameThreshold);

  return (
    <InstrumentPanel
      depth="base"
      className={className}
      eyebrow="CoachHelm · team"
      header="Where the team is bleeding"
    >
      <div className="space-y-4">
        <p className="text-body-sm text-text-secondary">
          {insights.length} leak{insights.length !== 1 ? 's' : ''}
          {totalPlayers > 0 ? <> across {totalPlayers} player{totalPlayers !== 1 ? 's' : ''}</> : null} —
          total strokes lost this window, biggest bleed first.
        </p>

        <div className="space-y-3">
          {rows.map((r) => {
            const hot = r.total >= threshold;
            return (
              <div key={r.label} className="space-y-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-body-sm font-medium text-text-primary">{r.label}</span>
                  {/* "total" (never "str/rd") — this is a SUM across every leak
                      insight for every player in the category, not a per-round
                      rate. See the file header for why that distinction matters. */}
                  <span className="shrink-0 font-fw-mono text-body-sm tabular-nums text-text-primary">
                    −{r.total.toFixed(1)}
                    <span className="ml-1 text-caption text-text-tertiary">total</span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-sunken">
                  <div
                    className={cn('h-full rounded-full', SEVERITY_BAR[r.worst])}
                    style={{ width: `${((r.total / maxTotal) * 100).toFixed(1)}%` }}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-x-2 text-caption text-text-tertiary">
                  <span>
                    {r.count} leak{r.count !== 1 ? 's' : ''}
                  </span>
                  {r.players.size > 0 ? (
                    <span>
                      · {r.players.size} player{r.players.size !== 1 ? 's' : ''}
                    </span>
                  ) : null}
                  {hot ? <span className="font-medium text-fw-danger-ink">· high bleed</span> : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </InstrumentPanel>
  );
}
