/**
 * StatLineStack — a vertical column of `<RuledStatLine>`s (spec §7 "as column
 * spines"; the passport measurable stack, §6 #1).
 *
 * The Player Passport's `60-YARD / EXIT VELO / POP TIME` stack, or any column of
 * ruled measurables. Each row self-settles + draws its own green baseline rule
 * on mount (the atom owns its motion), so this molecule is pure layout: it maps
 * `items` → `<RuledStatLine>` at one of two rhythms.
 *
 * No hooks / handlers — safe in a server component.
 */
import { cn } from '@/lib/utils';
import { RuledStatLine } from '..';
import type { RuledStatLineProps } from '..';

const GAP: Record<'tight' | 'normal', string> = {
  tight: 'gap-3',
  normal: 'gap-6',
};

export interface StatLineStackProps {
  /** The measurables, each a full `<RuledStatLine>` spec. */
  items: Array<RuledStatLineProps>;
  /** Row rhythm (default `normal`). */
  gap?: 'tight' | 'normal';
  className?: string;
}

export function StatLineStack({ items, gap = 'normal', className }: StatLineStackProps) {
  return (
    <div className={cn('flex flex-col', GAP[gap], className)}>
      {items.map((item, i) => (
        <RuledStatLine key={`${item.label}-${i}`} {...item} />
      ))}
    </div>
  );
}
