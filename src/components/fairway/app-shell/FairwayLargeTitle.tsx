'use client';

/**
 * ============================================================================
 * Fairway · app-shell · FairwayLargeTitle (M1, ADDITIVE — condensing-header)
 * ----------------------------------------------------------------------------
 * The in-content large-title primitive M2–M4 page rebuilds adopt. Lives as
 * the first element below `AppShell`'s sticky chrome unit — the page's real
 * `<h1>`, rendered full-size in CONTENT at rest (docs/MOBILE_DOCTRINE.md rule
 * 2: mastheads are a desktop cover treatment; on phone they condense to one
 * line). `FairwayTopBar`'s condensed copy takes over once this scrolls under
 * it (see `LargeTitleContext`) — this component only has to register the
 * text; the cross-fade/observer machinery lives in the shell.
 *
 * On phone the editorial eyebrow paragraph is deliberately OMITTED (`hidden
 * md:block`) — a desktop-only dateline, never phone chrome. `meta` is the
 * opposite: a single condensed metadata line shown ONLY on phone (`md:hidden`)
 * — desktop pages carry richer detail in their own masthead composition, so
 * this stays additive, never a replacement for it.
 *
 * M1 SHIPS this primitive; it wires nothing into existing pages yet (the
 * per-page masthead trim/adoption is M2–M4 — see condensing-header §5). Golf's
 * `LargeTitleHeader` gets ONE `useEffect` added (this wave) that calls
 * `setRegisteredTitle` directly via `useLargeTitle()`, so its bar already
 * condenses correctly without waiting for the full masthead migration.
 * ========================================================================== */

import { useEffect, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useLargeTitle } from './LargeTitleContext';

export interface FairwayLargeTitleProps {
  /** The page's `<h1>` text — also what the bar shows once condensed. */
  title: string;
  /** A single condensed metadata line (e.g. "28 players · 4 classes") —
   *  phone only (`md:hidden`); desktop pages carry this in their own
   *  masthead composition instead. */
  meta?: ReactNode;
  /** Small-caps dateline — desktop only (`hidden md:block`); phone never
   *  shows the editorial eyebrow paragraph (rule 2). */
  eyebrow?: string;
  /** Right-aligned actions (primary CTA, filters, …). */
  actions?: ReactNode;
  className?: string;
}

export function FairwayLargeTitle({ title, meta, eyebrow, actions, className }: FairwayLargeTitleProps) {
  const { setRegisteredTitle } = useLargeTitle();

  // Registers the exact page title with the shell's condensed top bar copy —
  // and UN-registers on unmount so navigating away to a route that hasn't
  // adopted this primitive never inherits a stale title (the shell falls
  // back to its breadcrumb copy instead, per LargeTitleContext's contract).
  useEffect(() => {
    setRegisteredTitle(title);
    return () => setRegisteredTitle(null);
  }, [title, setRegisteredTitle]);

  return (
    <div data-fw-title-anchor className={cn('flex flex-col gap-3 pt-5 pb-4', className)}>
      {eyebrow && (
        <span className="hidden font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.08em] text-text-tertiary md:block">
          {eyebrow}
        </span>
      )}

      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <h1 className="min-w-0 flex-1 font-fw-display text-h2 font-medium leading-[1.05] tracking-[-0.022em] text-text-primary md:text-display">
          {title}
        </h1>
        {actions && (
          <div className="flex basis-full flex-wrap items-center gap-2 sm:basis-auto sm:shrink-0">{actions}</div>
        )}
      </div>

      <div aria-hidden className="h-[3px] w-12 rounded-full bg-accent-500" />

      {meta && <p className="text-body-sm text-text-secondary md:hidden">{meta}</p>}
    </div>
  );
}
