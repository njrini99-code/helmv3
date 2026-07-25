'use client';

/**
 * ============================================================================
 * RuledLeaderStat — Fairway-native "green ruled leader" stat atom (W6 polish)
 * ----------------------------------------------------------------------------
 * Ports the CONCEPT of BaseballHelm Living Annual's `RuledStatLine` (a label
 * hung above/below a numeral resting on a baseline rule, with an explicit
 * leader tick) into Fairway's OWN `--fw-*` token system + helm-green accent.
 * This does NOT import the baseball kit — every color/type class here
 * resolves against Fairway tokens (`accent-*`, `fw-success`, `font-fw-*`,
 * `text-eyebrow`, `text-h1`/`text-h3`/`text-body-*`) so it renders correctly
 * anywhere inside the `.fairway-ds` scope.
 *
 * Owner ask (2026-07-01): stats wanted "loud graphite numerals, green rules,
 * green leaders" — the graphite numeral default already landed at the token
 * level; this atom is the missing GREEN RULED LEADER treatment:
 *   • `hero` / `row`     — a soft green baseline rule sits under every value
 *     by default (real green presence + crisp row separation, never a plain
 *     gray hairline); the numeral itself stays graphite (max contrast) unless
 *     `leader` is set, in which case both the numeral AND the rule turn full
 *     helm-green and a small "Leads" tick appears on the label row.
 *   • `lg` / `compact`   — denser embeddings (a per-player metric cell, a
 *     corner composite badge). These match the SURROUNDING non-leader chrome
 *     exactly (no rule) until `leader` is set, at which point the value turns
 *     green, a green tick appears, and a thin green rule draws in under the
 *     value — an ADDITIVE accent only a leader ever wears.
 *
 * `ghost` renders the honest no-data state (40% opacity, neutral hairline,
 * never a fabricated "Leads" claim) — mirrors the honest-empty convention the
 * rest of the Fairway stats surfaces already follow.
 * ========================================================================== */

import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { VIZ_EASE, VIZ_REVEAL_MS } from './theme';

export type RuledLeaderStatSize = 'hero' | 'row' | 'lg' | 'compact';

export interface RuledLeaderStatProps {
  /** Small-caps label, e.g. "FW%", "SCORING AVG", "TOP PERFORMER". */
  label: string;
  /** Preformatted display value — the caller owns em-dash/honest-null formatting. */
  value: string;
  /**
   * `hero` (passport-scale) / `row` (section-leader scale) always carry the
   * baseline rule. `lg` (a corner badge, e.g. a composite score) / `compact`
   * (a dense per-player metric cell) only draw the rule when `leader`.
   * Default `row`.
   */
  size?: RuledLeaderStatSize;
  /** Label position relative to the numeral. Defaults to 'above' for hero/row, 'below' for lg/compact. */
  labelPosition?: 'above' | 'below';
  /**
   * This value leads its column (team/roster best). Numeral + rule render in
   * helm green and a small green tick appears — `hero`/`row` spell out
   * "Leads"; `lg`/`compact` show just the tick dot (space-constrained).
   * Ignored when `ghost`.
   */
  leader?: boolean;
  /** No data for this cell — honest neutral hairline at reduced opacity, never a "Leads" claim. */
  ghost?: boolean;
  className?: string;
}

const VALUE_SIZE: Record<RuledLeaderStatSize, string> = {
  hero: 'text-h1',
  row: 'text-h3',
  lg: 'text-body-lg',
  compact: 'text-body-sm',
};

const DEFAULT_LABEL_POSITION: Record<RuledLeaderStatSize, 'above' | 'below'> = {
  hero: 'above',
  row: 'above',
  lg: 'below',
  compact: 'below',
};

function LeaderTick({ spelled }: { spelled: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 font-fw-display font-semibold uppercase tracking-[0.1em] text-fw-success-ink',
        spelled ? 'text-eyebrow' : '',
      )}
    >
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-fw-success" />
      {spelled ? 'Leads' : null}
    </span>
  );
}

/**
 * A stat value sitting on a green ruled baseline, with an explicit leader
 * tick/highlight — Fairway's native answer to the owner's "green rules,
 * green leaders" ask. See file header for the size/leader contract.
 */
export function RuledLeaderStat({
  label,
  value,
  size = 'row',
  labelPosition,
  leader = false,
  ghost = false,
  className,
}: RuledLeaderStatProps) {
  const reduced = useReducedMotion() ?? false;
  const isLeader = leader && !ghost;
  const position = labelPosition ?? DEFAULT_LABEL_POSITION[size];
  const dense = size === 'lg' || size === 'compact';
  // hero/row always carry the baseline rule (the "green rules" ask); the
  // denser lg/compact embeddings only draw it when they've earned the leader
  // accent, so every OTHER cell in a tight grid stays exactly as it was.
  const showRule = ghost || !dense || isLeader;

  // Label tone matches the codebase's established honest-metric convention
  // (MetricCell / DetailGrid's `dt`): eyebrow labels sit at text-secondary, so
  // a `compact`/`lg` cell reads identically to its untouched non-leader
  // siblings in the same grid.
  const labelNode = (
    <span className="font-fw-display text-eyebrow font-medium uppercase tracking-[0.1em] text-text-secondary">
      {label}
    </span>
  );
  // A missing reading ("—") is dimmed to text-tertiary — never as authoritative
  // as a real value — matching MetricCell/DetailGrid's dash treatment exactly.
  const isDash = value === '—';

  return (
    <div className={cn('flex flex-col gap-1', ghost && 'opacity-40', className)}>
      {position === 'above' ? (
        <div className="flex items-center justify-between gap-2">
          {labelNode}
          {isLeader ? <LeaderTick spelled={!dense} /> : null}
        </div>
      ) : null}

      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            'font-fw-mono tabular-nums',
            VALUE_SIZE[size],
            isLeader ? 'text-fw-success-ink' : isDash ? 'text-text-tertiary' : 'text-text-primary',
          )}
        >
          {value}
        </span>
        {position === 'below' && isLeader ? <LeaderTick spelled={!dense} /> : null}
      </div>

      {showRule ? (
        <motion.div
          aria-hidden
          initial={reduced ? false : { scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={reduced ? { duration: 0 } : { duration: VIZ_REVEAL_MS / 1000, ease: VIZ_EASE }}
          className={cn(
            'h-[1.5px] origin-left',
            ghost ? 'bg-border-subtle' : isLeader ? 'bg-fw-success' : 'bg-accent-300',
          )}
        />
      ) : null}

      {position === 'below' ? labelNode : null}
    </div>
  );
}
