'use client';

/**
 * Breadcrumb — the single canonical breadcrumb primitive.
 *
 * Wave W7A (information-architecture) introduces a deep-route wayfinding
 * primitive so a coach/player/operator three or four levels down the tree
 * always has a visible trail back to a root section. Prior to W7A several
 * deep routes hand-rolled their own one-off "← Back to X" links (e.g. the
 * CRM Sequences page) with inconsistent treatment; this primitive replaces
 * that pattern with a chevron-separated, truncating, accessible trail.
 *
 * API — two ways to feed it:
 *
 *   1. Explicit items (caller controls the trail):
 *        <Breadcrumb items={[
 *          { label: 'CRM', href: '/golf/admin/crm' },
 *          { label: 'Sequences' },                 // last item: not a link
 *        ]} />
 *
 *   2. Auto-derive from the current pathname:
 *        <Breadcrumb auto />
 *      …or feed a precomputed trail via the `useBreadcrumbItems` hook:
 *        const items = useBreadcrumbItems();
 *        <Breadcrumb items={items} />
 *
 * Behaviour contract:
 *   - Renders inside a semantic <nav aria-label="Breadcrumb"> + ordered list.
 *   - Each item except the LAST renders as a <Link>; the last item is plain
 *     text and carries aria-current="page".
 *   - Items are separated by a chevron glyph (aria-hidden).
 *   - Long single labels truncate (max-w + truncate); the whole row never
 *     wraps and scrolls horizontally on overflow with no visible scrollbar.
 *
 * Audit reference: ultra-audit master synthesis A4 (nav/wayfinding sprawl)
 * + A7 (deep-route orientation — every page ≥3 levels deep needs a trail).
 */

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { IconChevronRight } from '@/components/icons';
import { cn } from '@/lib/utils';

export interface BreadcrumbItem {
  /** Visible label for this crumb. */
  label: string;
  /**
   * Target for this crumb. Omit on the LAST item (current page) — that crumb
   * renders as plain text, never a link.
   */
  href?: string;
}

export interface BreadcrumbProps extends Omit<React.HTMLAttributes<HTMLElement>, 'children'> {
  /**
   * Explicit trail. The last item is treated as the current page (rendered as
   * text, not a link) regardless of whether it carries an href.
   */
  items?: BreadcrumbItem[];
  /**
   * When true (and `items` is not supplied), derive the trail from the current
   * pathname via the same logic as `useBreadcrumbItems`.
   */
  auto?: boolean;
  /** Optional override for the chevron separator glyph. */
  separator?: React.ReactNode;
  /** Max width (Tailwind class) applied to each truncating label. */
  itemMaxWidthClassName?: string;
}

/**
 * Human-readable labels for known route segments. Anything not in this map is
 * title-cased from its slug (e.g. `my-development` → "My Development"). Dynamic
 * segments (raw ids / uuids) fall back to a generic "Detail" label so we never
 * leak a uuid into the chrome.
 */
const SEGMENT_LABELS: Record<string, string> = {
  golf: 'Golf',
  dashboard: 'Dashboard',
  admin: 'Admin',
  crm: 'CRM',
  coachhelm: 'CoachHelm',
  genome: 'Genome',
  qualifying: 'Qualifying',
  qualifiers: 'Qualifiers',
  'my-qualifiers': 'My Qualifiers',
  'my-development': 'My Development',
  'my-insights': 'My Insights',
  'my-standing': 'My Standing',
  'my-game-profile': 'My Game Profile',
  'coaching-intelligence': 'Coaching Intelligence',
  notifications: 'Notifications',
  automations: 'Automations',
  suppressions: 'Suppressions',
  sequences: 'Sequences',
  insights: 'Insights',
  inbox: 'Inbox',
  settings: 'Settings',
  roster: 'Roster',
  rounds: 'Rounds',
  review: 'Review',
  recover: 'Recover',
  new: 'New',
  continue: 'Continue',
  stats: 'Stats',
  team: 'Team',
  players: 'Players',
  player: 'Player',
  coach: 'Coach',
  analytics: 'Analytics',
  alerts: 'Alerts',
  patterns: 'Patterns',
  intelligence: 'Intelligence',
  development: 'Development',
  recruiting: 'Recruiting',
  messages: 'Messages',
  announcements: 'Announcements',
  tasks: 'Tasks',
  documents: 'Documents',
  travel: 'Travel',
  calendar: 'Calendar',
  classes: 'Classes',
  hub: 'Hub',
  compare: 'Compare',
  chat: 'Chat',
  game: 'Game',
  print: 'Print',
  'whats-new': "What's New",
};

/** Title-case a slug: `coaching-intelligence` → "Coaching Intelligence". */
function titleCaseSegment(segment: string): string {
  return segment
    .split('-')
    .map((word) => (word.length ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ');
}

/** Heuristic: does a segment look like a raw id/uuid (dynamic route value)? */
function looksLikeId(segment: string): boolean {
  // UUID, numeric id, or long opaque token — anything we should not surface raw.
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment) ||
    /^\d+$/.test(segment) ||
    (/^[0-9a-z]{16,}$/i.test(segment) && !SEGMENT_LABELS[segment])
  );
}

function labelForSegment(segment: string): string {
  if (SEGMENT_LABELS[segment]) return SEGMENT_LABELS[segment];
  if (looksLikeId(segment)) return 'Detail';
  return titleCaseSegment(segment);
}

/**
 * Derive a breadcrumb trail from a pathname.
 *
 * - Route-group segments (Next.js parenthesised folders like `(dashboard)`)
 *   are dropped — they never appear in the URL.
 * - The first crumb is the section root (`/golf/dashboard` or `/golf/admin`)
 *   so the trail always starts at a meaningful home, not the bare `/golf`.
 * - The LAST crumb carries no href (it is the current page).
 *
 * Exported as a standalone function so it is unit-testable and reusable by
 * `useBreadcrumbItems`.
 */
export function deriveBreadcrumbItems(pathname: string): BreadcrumbItem[] {
  const path = (pathname.split('?')[0] ?? '').split('#')[0] ?? '';
  const rawSegments = path
    .split('/')
    .filter((s) => s.length > 0 && !(s.startsWith('(') && s.endsWith(')')));

  if (rawSegments.length === 0) return [];

  const items: BreadcrumbItem[] = [];
  let cumulative = '';
  for (const segment of rawSegments) {
    cumulative += `/${segment}`;
    items.push({ label: labelForSegment(segment), href: cumulative });
  }

  // The last crumb is the current page — strip its href so it renders as text.
  const last = items[items.length - 1];
  if (last) {
    items[items.length - 1] = { label: last.label };
  }

  return items;
}

/**
 * Hook: derive the breadcrumb trail for the current pathname. Thin wrapper over
 * `deriveBreadcrumbItems` + `usePathname` so consumers can do:
 *   const items = useBreadcrumbItems();
 */
export function useBreadcrumbItems(): BreadcrumbItem[] {
  const pathname = usePathname();
  return React.useMemo(() => deriveBreadcrumbItems(pathname ?? ''), [pathname]);
}

const DefaultSeparator = (
  <IconChevronRight size={14} aria-hidden className="flex-shrink-0 text-warm-400" />
);

/**
 * Breadcrumb trail. See the file header for the full API + behaviour contract.
 */
export const Breadcrumb = React.forwardRef<HTMLElement, BreadcrumbProps>(
  (
    {
      items,
      auto = false,
      separator = DefaultSeparator,
      itemMaxWidthClassName = 'max-w-[16ch]',
      className,
      ...props
    },
    ref,
  ) => {
    // Auto-derivation must always run an equal number of hooks per render, so
    // the hook is called unconditionally and its result only used when needed.
    const derived = useBreadcrumbItems();
    const resolved = items ?? (auto ? derived : []);

    if (resolved.length === 0) return null;

    const lastIndex = resolved.length - 1;

    return (
      <nav
        ref={ref}
        aria-label="Breadcrumb"
        className={cn('min-w-0', className)}
        {...props}
      >
        <ol className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap text-sm text-warm-500 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {resolved.map((item, index) => {
            const isLast = index === lastIndex;
            const key = `${item.label}-${index}`;
            return (
              <li key={key} className="flex items-center gap-1.5 min-w-0">
                {index > 0 && separator}
                {isLast || !item.href ? (
                  <span
                    aria-current={isLast ? 'page' : undefined}
                    className={cn(
                      'truncate font-medium text-warm-800',
                      itemMaxWidthClassName,
                    )}
                  >
                    {item.label}
                  </span>
                ) : (
                  <Link
                    href={item.href}
                    className={cn(
                      'truncate text-warm-500 hover:text-warm-800 transition-colors',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 rounded-sm',
                      itemMaxWidthClassName,
                    )}
                  >
                    {item.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    );
  },
);
Breadcrumb.displayName = 'Breadcrumb';
