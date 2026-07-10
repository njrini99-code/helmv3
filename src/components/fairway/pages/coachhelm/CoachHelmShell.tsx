'use client';

/**
 * ============================================================================
 * Fairway · CoachHelm · CoachHelmShell — the in-content shell composite
 * ----------------------------------------------------------------------------
 * The shared presentation wrapper mounted INSIDE each CoachHelm route's redesign
 * fork branch — NOT a (coachhelm)/layout.tsx. The five coach surfaces live in 4
 * different folder trees, so a single route-group layout cannot wrap them
 * without moving files (forbidden). The existing (dashboard)/layout.tsx chrome +
 * GolfSidebar rail stay UNTOUCHED — this is an IN-CONTENT shell only.
 *
 * ANATOMY (blueprint shell.mountModel):
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  CoachHelm AI            ← overline (accent eyebrow)           │
 *   │  <Title>                              [ right action cluster ] │  ← Fraunces
 *   │  <breadcrumbs / description>  (optional)                       │
 *   │  ────────────────────────────────────────────────────────────  │
 *   │  Brief · Signals · Players · Effectiveness · Ask   (sub-nav)   │  ← persistent
 *   ├──────────────────────────────────────────────────────────────┤
 *   │  {children}                                                    │  ← on bg-canvas
 *   └──────────────────────────────────────────────────────────────┘
 *
 * DOES NOT FETCH DATA — pure presentation wrapper so every route keeps its own
 * server fetch above the fork. It only renders chrome + the sub-nav (which it
 * feeds the SSR-known `active` tab + the shell's single `signalCount`).
 *
 * BADGE: ONE source of truth — the route computes getAlertCounts(coachId)
 * server-side and passes `signalCount` (urgent + high open). The shell forwards
 * it to CoachHelmSubNav's Signals badge; the same count also feeds the GolfSidebar
 * entry (wired elsewhere — the shell only consumes here).
 *
 * BREADCRUMB CONTRACT: CoachHelm > <Tab> > <leaf>. Pass `breadcrumbs` for the
 * leaf depth (Players > {playerName}, Players > Compare). Signals stays at tab
 * level (filtered presets, not leaves).
 *
 * LIVE — mounted unconditionally by ~15 CoachHelm route surfaces (coach Brief/
 * Signals/Players/Effectiveness/Ask + player Overview/Development/Game Profile/
 * Standing and their leaf views such as GenomeDetailView/GenomeCompareView/
 * PlayersGridView). Renders inside a `.fairway-ds` scope on a `bg-canvas` page.
 * ========================================================================== */

import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { ViewHeader } from '@/components/fairway/view-header/view-header';
import { IconChevronRight } from '@/components/icons';
import {
  CoachHelmSubNav,
  type CoachHelmTab,
  type CoachHelmRole,
} from './CoachHelmSubNav';

/** A single breadcrumb crumb — a label, optionally a real link. */
export interface CoachHelmCrumb {
  label: React.ReactNode;
  href?: string;
}

export interface CoachHelmShellProps {
  /** The SSR-known active sub-nav tab (no-flash fallback before hydration). */
  active: CoachHelmTab;
  /** Coach (5 tabs) or player (Brief + Players). Default 'coach'. */
  role?: CoachHelmRole;
  /**
   * Unread urgent/high open-signal count, computed ONCE server-side and passed
   * down. Feeds the Signals tab badge. `null`/0 → no badge (honest, never "0").
   */
  signalCount?: number | null;

  /** The Fraunces page title. Defaults to a per-tab title when omitted. */
  title?: React.ReactNode;
  /** Overline above the title. Defaults to "CoachHelm AI". */
  eyebrow?: React.ReactNode;
  /** Optional context line under the title. */
  description?: React.ReactNode;
  /**
   * The leaf breadcrumb trail BELOW the masthead (CoachHelm > Tab > leaf). The
   * "CoachHelm > <Tab>" prefix is implied by the eyebrow + active tab, so pass
   * only the leaf crumbs (e.g. [{ label: 'Mason Reed' }]).
   */
  breadcrumbs?: CoachHelmCrumb[];
  /** Right-aligned action cluster (the ViewHeader primary/secondary slot). */
  actions?: React.ReactNode;

  children: React.ReactNode;
  className?: string;
}

/** Sensible default titles per tab so routes can omit `title`. */
const DEFAULT_TITLE: Record<CoachHelmTab, string> = {
  brief: 'Team Brief',
  signals: 'Signals',
  players: 'Players',
  standing: 'Standing',
  effectiveness: 'Effectiveness',
  ask: 'Ask CoachHelm',
};

export function CoachHelmShell({
  active,
  role = 'coach',
  signalCount,
  title,
  eyebrow = 'CoachHelm AI',
  description,
  breadcrumbs,
  actions,
  children,
  className,
}: CoachHelmShellProps) {
  const resolvedTitle = title ?? DEFAULT_TITLE[active];
  const hasCrumbs = Array.isArray(breadcrumbs) && breadcrumbs.length > 0;

  return (
    <div
      data-slot="coachhelm-shell"
      data-active={active}
      data-role={role}
      className={cn('flex w-full flex-col', className)}
    >
      {/* ── Masthead (§A light-airy gutters) + persistent sub-nav strip ─────── */}
      {/* Masthead + body share ONE centered max-w container so every CoachHelm
          tab aligns at the same width + gutters (cross-tab cohesion). */}
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 px-4 pt-2 md:px-6">
        <ViewHeader
          eyebrow={eyebrow}
          title={resolvedTitle}
          description={description}
          primaryAction={actions}
          // The sub-nav is the shell's own strip (richer than the segmented row),
          // rendered immediately beneath — so we never pass segments here.
        />

        {/* Leaf breadcrumbs: CoachHelm > <Tab> > <leaf>. Tab prefix is implied. */}
        {hasCrumbs ? (
          <nav aria-label="Breadcrumb" className="-mt-1">
            <ol className="flex flex-wrap items-center gap-1.5 font-fw-sans text-caption text-text-tertiary">
              {breadcrumbs!.map((c, i) => {
                const last = i === breadcrumbs!.length - 1;
                return (
                  <li key={i} className="flex items-center gap-1.5">
                    {c.href && !last ? (
                      <Link
                        href={c.href}
                        className="rounded-fw-sm text-text-secondary outline-none transition-colors [transition-duration:180ms] hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none"
                      >
                        {c.label}
                      </Link>
                    ) : (
                      <span
                        aria-current={last ? 'page' : undefined}
                        className={last ? 'font-medium text-text-secondary' : undefined}
                      >
                        {c.label}
                      </span>
                    )}
                    {!last ? (
                      <IconChevronRight size={12} className="text-text-tertiary" aria-hidden="true" />
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </nav>
        ) : null}

        <CoachHelmSubNav active={active} role={role} signalCount={signalCount} />
      </div>

      {/* ── Surface body on the warm canvas, aligned to the masthead width ──── */}
      <div className="mx-auto w-full max-w-[1200px] px-4 py-6 md:px-6">{children}</div>
    </div>
  );
}
