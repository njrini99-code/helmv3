/**
 * SectionMasthead — THE page header for every baseball route.
 *
 * Replaces the generic `ViewHeader` on baseball surfaces (spec §4.1, §5): a
 * small-caps `Eyebrow` dateline, a Space Grotesk page title (`font-annual`, per
 * ADDENDUM 2 — the editorial serif is dropped from the kit), an optional right-aligned
 * `actions` slot (⌘K, filters, primary CTA), and — the point — a bold lane-ink
 * accent rule under the title. In team lanes (Pressbox / Passport) that rule is
 * GREEN; in the War Room it is clay. This is where the founder addendum's "more
 * green" shows up on every page, so the accent is weighted (3px) to read.
 *
 * No hooks — safe in a server component. The accent rule's draw-on lives in the
 * client `<HairlineRule>` it composes, so this header stays server-rendered.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Eyebrow } from './Eyebrow';
import { HairlineRule } from './HairlineRule';

export interface SectionMastheadProps {
  /** Small-caps dateline above the title (e.g. `THE PRESSBOX · WEEK 6`). */
  eyebrow?: string;
  /** The serif page title. */
  title: string;
  /** Lane ink for the eyebrow + accent rule: `team` green (default) or `pursuit` clay. */
  ink?: 'team' | 'pursuit';
  /** Right-aligned actions (search, filters, primary CTA). */
  actions?: ReactNode;
  /** Optional content below the accent rule (sub-nav, tabs, a lede). */
  children?: ReactNode;
  className?: string;
}

export function SectionMasthead({ eyebrow, title, ink = 'team', actions, children, className }: SectionMastheadProps) {
  return (
    <header data-fw-title-anchor className={cn('flex flex-col gap-3', className)}>
      {eyebrow ? <Eyebrow ink={ink}>{eyebrow}</Eyebrow> : null}

      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <h1 className="min-w-0 flex-1 font-annual text-h1 font-semibold leading-tight text-text-primary md:text-display">
          {title}
        </h1>
        {actions ? (
          <div className="flex basis-full flex-wrap items-center gap-2 sm:basis-auto sm:shrink-0">{actions}</div>
        ) : null}
      </div>

      {/* The green (team) / clay (pursuit) accent rule — the per-page green. */}
      <HairlineRule ink={ink} weight={3} className="w-16 rounded-full" />

      {children}
    </header>
  );
}
