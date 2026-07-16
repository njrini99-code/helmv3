'use client';

/**
 * PlayerRowPlate — THE record-book stats / roster row (spec §6 #5, #6).
 *
 * A serif name plate (given lighter + `SURNAME` semibold small-caps) with an
 * optional jersey and `<PositionChip>`, followed by a right-aligned run of
 * `<StatReadout>` figures resting on a GREEN bottom rule (clay in the War Room).
 * Per the founder addendum a column `leader` figure renders in lane ink so the
 * team-best number reads green. Rows are keyboard-accessible when clickable
 * (link via `href`, or button semantics via `onClick`).
 *
 * `PlayerRowPlateHeader` renders the small-caps column labels on the SAME fixed
 * stat-column grid so a Stats Center wall lines up under one header.
 *
 * Interaction layer (Stage-0): clickable rows use `pressableClass` for the
 * press-down + lane-ink hover tint (replacing a hand-rolled neutral hover),
 * and a trailing `HoverReveal` chevron marks the row as tappable without a
 * permanent affordance — visible on hover/focus, and always-on for touch.
 */
import Link from 'next/link';
import type { KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';
import { IconChevronRight } from '@/components/icons';
import { StatReadout, PositionChip, HairlineRule, HoverReveal, pressableClass } from '..';

// Shared stat-column geometry so the header and every row align to one grid.
const STAT_COL = 'w-20 shrink-0';
const STAT_GAP = 'gap-x-6';

const INK_TEXT: Record<'team' | 'pursuit', string> = {
  team: 'text-grade-plus',
  pursuit: 'text-pursuit',
};

export interface PlayerRowStat {
  /** Small-caps column label (rendered above the figure on a standalone row). */
  label?: string;
  /** The figure. Numbers roll on the odometer; strings render statically. */
  value: number | string;
  /** Decimals for a numeric value. */
  decimals?: number;
  /** Team-leading value in this column — renders in lane ink (green/clay). */
  leader?: boolean;
}

export interface PlayerRowPlateProps {
  firstName: string;
  lastName: string;
  /** Jersey number, set in small mono figures ahead of the name. */
  jerseyNumber?: number | string;
  /** Position / role chip, e.g. `SS`, `RHP`. */
  position?: string;
  /** The stat figures, left→right. */
  stats: Array<PlayerRowStat>;
  /** Navigate on click (renders as a link). */
  href?: string;
  /** Activate on click (renders with button semantics + keyboard support). */
  onClick?: () => void;
  /** Lane ink for the bottom rule, leaders + focus ring (default team green). */
  ink?: 'team' | 'pursuit';
  className?: string;
}

export interface PlayerRowPlateHeaderProps {
  /** Column labels, aligned to the row stat columns. */
  columns: string[];
  className?: string;
}

/** Column-label header row for a wall of `<PlayerRowPlate>`s. */
export function PlayerRowPlateHeader({ columns, className }: PlayerRowPlateHeaderProps) {
  return (
    <div className={cn('flex items-end px-1 pb-2', className)}>
      <span className="text-eyebrow font-semibold uppercase tracking-[0.14em] text-text-tertiary">Player</span>
      <div className={cn('ml-auto flex', STAT_GAP)}>
        {columns.map((c, i) => (
          <span
            key={`${c}-${i}`}
            className={cn(STAT_COL, 'text-right text-eyebrow font-semibold uppercase tracking-[0.14em] text-text-tertiary')}
          >
            {c}
          </span>
        ))}
      </div>
    </div>
  );
}

export function PlayerRowPlate({
  firstName,
  lastName,
  jerseyNumber,
  position,
  stats,
  href,
  onClick,
  ink = 'team',
  className,
}: PlayerRowPlateProps) {
  const clickable = Boolean(href || onClick);

  function handleKey(e: KeyboardEvent<HTMLDivElement>) {
    if (onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick();
    }
  }

  const nameAndStats = (
    <>
      {/* Name plate. The name span carries an explicit `min-w-[64px]`: without
          it, `truncate`'s `overflow-hidden` resolves the flex item's
          "automatic minimum size" to 0 (CSS flexbox spec), so under width
          pressure from the jersey number + PositionChip (neither of which
          clip, so both hold their full content width) the name collapses to
          a single glyph or nothing at all rather than truncating gracefully
          — the bug behind the 390px roster wall showing jersey+position with
          no name. The floor guarantees a legible fragment even in the
          tightest row; there's headroom above it whenever the row has more
          to give (flex-basis:auto still renders the full name when it fits). */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {jerseyNumber != null ? (
          <span className="font-annual text-body-sm tabular-nums text-text-tertiary">{jerseyNumber}</span>
        ) : null}
        <span data-testid="player-row-name" className="min-w-[64px] truncate font-annual leading-none text-text-primary">
          <span className="font-normal text-text-secondary">{firstName} </span>
          <span className="font-semibold uppercase" style={{ fontVariant: 'small-caps' }}>
            {lastName}
          </span>
        </span>
        {position ? (
          <PositionChip label={position} ink={ink === 'pursuit' ? 'pursuit' : 'neutral'} size="sm" />
        ) : null}
      </div>

      {/* Stat run */}
      <div className={cn('flex', STAT_GAP)}>
        {stats.map((s, i) => (
          <div
            key={`${s.label ?? 'stat'}-${i}`}
            data-testid="player-row-stat"
            className={cn(STAT_COL, 'flex flex-col items-end gap-1')}
          >
            {s.label ? (
              <span className="text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary">{s.label}</span>
            ) : null}
            <StatReadout
              value={s.value}
              decimals={s.decimals ?? 0}
              ariaLabel={s.label}
              className={cn('text-h2', s.leader ? INK_TEXT[ink] : undefined)}
            />
          </div>
        ))}
      </div>
    </>
  );

  const inner = (
    <>
      {clickable ? (
        <HoverReveal
          className="flex items-center gap-3 px-1 py-3"
          revealClassName="flex w-4 shrink-0 justify-center"
          reveal={<IconChevronRight size={14} className={INK_TEXT[ink]} aria-hidden />}
        >
          {nameAndStats}
        </HoverReveal>
      ) : (
        <div className="flex items-center gap-3 px-1 py-3">{nameAndStats}</div>
      )}

      {/* Green (team) / clay (pursuit) bottom rule the row rests on. */}
      <HairlineRule ink={ink} />
    </>
  );

  const base = cn('block w-full text-left', clickable && cn('rounded-fw-md', pressableClass({ ink })), className);

  if (href) {
    return (
      <Link href={href} className={base}>
        {inner}
      </Link>
    );
  }

  if (onClick) {
    return (
      <div role="button" tabIndex={0} onClick={onClick} onKeyDown={handleKey} className={base}>
        {inner}
      </div>
    );
  }

  return <div className={base}>{inner}</div>;
}
