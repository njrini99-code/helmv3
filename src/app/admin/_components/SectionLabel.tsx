import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The Bridge's section heading — one copy, not seventeen.
 *
 * This four-line helper had been pasted into seventeen admin files, and the
 * copies had already drifted into THREE different components wearing the same
 * name: thirteen ruled with `accent-600/25`, two (`engineering`, `jobs`) ruled
 * with `primary-600/25` — a visibly different hairline colour for the same
 * element, on two tabs an operator reaches from the same rail — and one
 * (`teams/[id]`) with no rule at all.
 *
 * Nothing failed when a copy diverged, which is exactly why they did. A
 * seventeen-way copy is not a design system; it is a design system's absence
 * with good intentions.
 *
 * `accent-600/25` is the canonical rule — the majority, and the one that
 * matches the accent every other Bridge hairline uses. `rule={false}` keeps the
 * one deliberate unruled case (`teams/[id]`, where the label sits inside a card
 * that already has its own border) expressible without a fourth copy.
 */
export function SectionLabel({
  children,
  rule = true,
  className,
}: {
  children: ReactNode;
  /** The accent hairline under the label. `false` inside an already-bordered card. */
  rule?: boolean;
  className?: string;
}) {
  return (
    <h2
      className={cn(
        'text-xs font-semibold uppercase tracking-widest text-warm-500',
        rule && 'border-b border-accent-600/25 pb-2',
        className,
      )}
    >
      {children}
    </h2>
  );
}
