'use client';

/**
 * ============================================================================
 * Disclosure: the one collapse primitive of the root-map surfaces
 * ----------------------------------------------------------------------------
 * Summary first, detail on request: every secondary section (an area's
 * ladder, the full map, the match note and legend, other reads, the Why
 * evidence, the team matrix and trend) sits behind one of these, closed by
 * default. A real `<button aria-expanded aria-controls>` (44px), optionally
 * inside a heading; the body mounts only while open and animates its height
 * (opacity only under prefers-reduced-motion). No animation on first paint.
 * ========================================================================== */

import { useId, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DURATION, EASE_CINEMATIC, useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';

export interface DisclosureProps {
  /** The trigger's content (its accessible name). */
  title: ReactNode;
  /** Right-aligned content inside the trigger (a value, a mini bar). */
  meta?: ReactNode;
  defaultOpen?: boolean;
  /** Controlled open state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Wrap the trigger in a heading of this level; null for none. */
  headingLevel?: 2 | 3 | 4 | null;
  /** `section`: a titled block with a rule; `row`: a compact list row. */
  variant?: 'section' | 'row';
  className?: string;
  bodyClassName?: string;
  slot?: string;
  children: ReactNode;
}

export function Disclosure({
  title,
  meta,
  defaultOpen = false,
  open,
  onOpenChange,
  headingLevel = 3,
  variant = 'section',
  className,
  bodyClassName,
  slot,
  children,
}: DisclosureProps) {
  const reduce = useReducedMotionGuard();
  const bodyId = useId();
  const [own, setOwn] = useState(defaultOpen);
  const isOpen = open ?? own;
  const toggle = () => {
    const next = !isOpen;
    if (open === undefined) setOwn(next);
    onOpenChange?.(next);
  };
  const trigger = (
    <button
      type="button"
      aria-expanded={isOpen}
      aria-controls={bodyId}
      onClick={toggle}
      className={cn(
        'group flex min-h-11 w-full items-center gap-3 text-left outline-none',
        'focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        variant === 'section'
          ? 'py-2 font-fw-display text-body-lg font-semibold text-text-primary'
          : 'py-1.5 text-body-sm font-medium text-text-primary',
      )}
    >
      <span className="min-w-0 flex-1">{title}</span>
      {meta}
      <ChevronDown
        aria-hidden
        className={cn(
          'h-4 w-4 shrink-0 text-text-tertiary motion-safe:transition-transform motion-safe:duration-200',
          isOpen ? 'rotate-180' : '',
        )}
      />
    </button>
  );
  const Heading = headingLevel ? (`h${headingLevel}` as const) : null;
  return (
    <div
      className={cn(variant === 'section' ? 'border-b border-border-subtle' : '', className)}
      data-slot={slot}
      data-open={isOpen ? 'true' : 'false'}
    >
      {Heading ? <Heading className="m-0">{trigger}</Heading> : trigger}
      <AnimatePresence initial={false}>
        {isOpen ? (
          <motion.div
            key="body"
            id={bodyId}
            initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: reduce ? 0 : DURATION.short, ease: EASE_CINEMATIC }}
            className="overflow-hidden"
          >
            <div className={cn(variant === 'section' ? 'pb-4 pt-1' : 'pb-3 pt-1', bodyClassName)}>{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
