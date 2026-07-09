// =============================================================================
// breadcrumbs.ts — pure breadcrumb-trail builder for BaseballFairwayShell
// (COHERENCE_RULING_2026-07-08.md Ruling 4).
//
// Split out from BaseballFairwayShell.tsx (a 'use client' component file
// importing React/hooks/next-navigation) so this logic can be unit-tested
// directly without dragging in the whole shell's client-only dependency
// graph. Pure — no React, no Supabase, no 'use client'.
// =============================================================================

import type { Breadcrumb } from '@/components/fairway/app-shell';
import {
  getVisibleBaseballNav,
  BASEBALL_MESSAGES_NAV,
  type BaseballNavContext,
} from '@/lib/baseball/nav-registry';

export function toTitle(seg: string): string {
  return seg.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Naive English singularize (strip one trailing non-"ss" "s") — good enough
 *  for route nouns like "players"/"games"/"programs", never applied to a
 *  user-visible record name (only to a URL segment as a last-resort label). */
export function singularize(seg: string): string {
  if (seg.length > 1 && seg.endsWith('s') && !seg.endsWith('ss')) return seg.slice(0, -1);
  return seg;
}

/** A UUID (any version) or a purely-numeric id — the shapes Supabase primary
 *  keys and route params take. Ruling 4: these must NEVER be title-cased into
 *  a breadcrumb crumb (e.g. "5e03752b D7fe 5e31 Ab39 F588ba3649d2"). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isIdShapedSegment(segment: string): boolean {
  return UUID_RE.test(segment) || /^\d+$/.test(segment);
}

/**
 * Breadcrumb label resolved against the SAME registry (never a second
 * hardcoded route→label map) — the longest href the pathname matches wins.
 *
 * `overrideLabel` (from the breadcrumb-label override channel — see
 * breadcrumb-label.tsx) is the real record name a dynamic detail page has
 * already fetched (player name, opponent, plan title, …); it wins whenever
 * present. When the trailing URL segment is UUID/numeric-id-shaped and no
 * override has been supplied yet (or ever, for routes that don't wire one),
 * the crumb falls back to the owning nav entry's label, and only as a last
 * resort to a singularized, title-cased form of the segment BEFORE the id
 * (e.g. "players/<uuid>" → "Player", "games/<uuid>" → "Game") — never the
 * raw id itself.
 */
export function buildBreadcrumbs(
  pathname: string,
  ctx: BaseballNavContext,
  homeHref: string,
  overrideLabel?: string,
): Breadcrumb[] {
  if (pathname === homeHref) return [{ label: 'Dashboard' }];

  const candidates: { href: string; label: string }[] = [
    ...getVisibleBaseballNav(ctx).map((e) => ({ href: e.href, label: e.label })),
    { href: BASEBALL_MESSAGES_NAV.href, label: BASEBALL_MESSAGES_NAV.label },
  ];
  let best: { href: string; label: string } | null = null;
  for (const c of candidates) {
    if (pathname === c.href || pathname.startsWith(`${c.href}/`)) {
      if (!best || c.href.length > best.href.length) best = c;
    }
  }

  const segments = pathname.split('/').filter(Boolean);
  const lastSegment = segments[segments.length - 1] ?? 'Page';

  if (isIdShapedSegment(lastSegment)) {
    const parentSegment = segments[segments.length - 2];
    const fallback = best?.label ?? (parentSegment ? toTitle(singularize(parentSegment)) : 'Details');
    return [{ label: 'Dashboard', href: homeHref }, { label: overrideLabel ?? fallback }];
  }

  // `best` may be a HUB entry whose href is only a route PREFIX of the
  // current page rather than the page itself — e.g. the Settings entry
  // (nav-registry.ts) explicitly folds permissions/roles/audit/imports/
  // integrations/philosophy/season under its own href for nav-highlighting
  // purposes, none of which register their own entry. Trusting `best.label`
  // unconditionally collapses every one of those subpages to the SAME crumb
  // ("Settings" for both /settings and /settings/roles). Only trust it when
  // the pathname IS that entry's own href; otherwise the URL's own trailing
  // segment names the actual current page more specifically than its hub.
  const label = overrideLabel ?? (best && pathname === best.href ? best.label : toTitle(lastSegment));
  return [{ label: 'Dashboard', href: homeHref }, { label }];
}
