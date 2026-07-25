'use client';

/**
 * ============================================================================
 * Fairway · app-shell · FairwayLargeTitle
 * ----------------------------------------------------------------------------
 * The in-content large-title primitive. Lives as the first element below
 * `AppShell`'s sticky chrome unit — the page's real `<h1>`, rendered full-size
 * in CONTENT (docs/MOBILE_DOCTRINE.md rule 2: mastheads are a desktop cover
 * treatment; on phone they condense to one line). Mounting it also REGISTERS
 * its text as the name `FairwayTopBar` shows in its standing mobile title,
 * overriding the shell's `pageTitle`/breadcrumb fallback (see
 * `LargeTitleContext`) — use it on any route whose breadcrumb leaf would be a
 * worse label than the page's own.
 *
 * On phone the editorial eyebrow paragraph is deliberately OMITTED (`hidden
 * md:block`) — a desktop-only dateline, never phone chrome. `meta` is the
 * opposite: a single condensed metadata line shown ONLY on phone (`md:hidden`)
 * — desktop pages carry richer detail in their own masthead composition, so
 * this stays additive, never a replacement for it.
 *
 * Adoption is opt-in and page-local: golf and baseball pages use their own
 * mastheads (`ViewHeader` / `SectionMasthead`) and take the shell's breadcrumb
 * fallback instead, which is why this has a single call site today
 * (`/admin/users`).
 * ========================================================================== */

import { useEffect, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useLargeTitle } from './LargeTitleContext';

export interface FairwayLargeTitleProps {
  /** The page's `<h1>` text — also the name the top bar shows on phone. */
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

  // Registers the exact page title as the top bar's standing mobile label —
  // and UN-registers on unmount so navigating away to a route that hasn't
  // adopted this primitive never inherits a stale title (the shell falls
  // back to its breadcrumb copy instead, per LargeTitleContext's contract).
  useEffect(() => {
    setRegisteredTitle(title);
    return () => setRegisteredTitle(null);
  }, [title, setRegisteredTitle]);

  return (
    <div className={cn('flex flex-col gap-3 pt-5 pb-4', className)}>
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
