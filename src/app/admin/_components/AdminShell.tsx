'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Activity, AlertTriangle, KeyRound, Flag, CircleDot,
  Users, Timer, Rocket, HeartPulse, ExternalLink, MessageSquarePlus, Gauge, SearchCheck, ScrollText,
  Radar, CreditCard,
  RefreshCw, Dumbbell, Search,
} from 'lucide-react';
import {
  AppShell,
  Button,
  IconButton,
  CommandMenu,
  type Breadcrumb,
  type NavSection,
  type CommandGroup,
  type CommandItem,
} from '@/components/fairway';
import { FairwayBottomNav } from '@/components/fairway/app-shell/FairwayBottomNav';
import { selectOverflow, summarizeMoreTab } from '@/components/fairway/app-shell/more-nav';
import type { NavItem } from '@/components/fairway/app-shell/types';
import { SessionActivityProvider } from '@/components/providers/SessionActivityProvider';
import { cn } from '@/lib/utils';
import { ADMIN_NAV, hrefForShortcut, BRIDGE_BOTTOM_NAV_HREFS, BRIDGE_BOTTOM_NAV_LABELS } from './admin-nav';
import { RelativeTime } from './RelativeTime';

/** Sub-route leaf labels the Breadcrumb trail can't derive from ADMIN_NAV
 *  (dynamic `[id]`/`[fingerprint]` segments render as "Detail" instead of
 *  the raw id/uuid). */
const SUBROUTE_LABELS: Record<string, string> = {
  tracer: 'Tracer',
  'view-as': 'View as',
};

/** Dynamic-route segments (uuids, opaque ids) are never surfaced verbatim. */
function isOpaqueIdSegment(segment: string): boolean {
  return /^[0-9a-f-]{8,}$/i.test(segment) || segment.length > 24;
}

function computeBreadcrumbs(pathname: string): readonly Breadcrumb[] {
  const tab = ADMIN_NAV.find((entry) =>
    entry.href === '/admin' ? pathname === '/admin' : pathname.startsWith(entry.href),
  );
  if (!tab) return [{ label: 'Bridge', href: '/admin' }];

  const rest = pathname.slice(tab.href.length).split('/').filter(Boolean);
  const crumbs: Breadcrumb[] = [
    { label: 'Bridge', href: '/admin' },
    { label: tab.label, href: rest.length > 0 ? tab.href : undefined },
  ];
  rest.forEach((segment, i) => {
    const isLast = i === rest.length - 1;
    const label = SUBROUTE_LABELS[segment] ?? (isOpaqueIdSegment(segment) ? 'Detail' : segment);
    crumbs.push({ label, href: isLast ? undefined : pathname });
  });
  return crumbs;
}

const NAV_ICON_BY_HREF = {
  '/admin': LayoutDashboard,
  '/admin/activity': Activity,
  '/admin/errors': AlertTriangle,
  '/admin/auth': KeyRound,
  '/admin/utilization': Gauge,
  '/admin/golf': Flag,
  '/admin/baseball': CircleDot,
  '/admin/lifting': Dumbbell,
  '/admin/ben-leah': MessageSquarePlus,
  '/admin/work': ScrollText,
  '/admin/users': Users,
  '/admin/jobs': Timer,
  '/admin/deploys': Rocket,
  '/admin/health': HeartPulse,
  '/admin/teams': Radar,
  '/admin/billing': CreditCard,
} as const;

/**
 * The `RefreshCw` glyph's ONE-SHOT rotation (docs/MOBILE_DOCTRINE.md's
 * motion spec — "rotates 360° once, ~0.6s linear, while refresh is pending").
 * Tailwind's built-in `spin` keyframe run for a single iteration, not the
 * continuous `animate-spin` loop. `motion-safe:` so `prefers-reduced-motion`
 * gets no spin at all (just the button's own `disabled` dimming).
 */
const REFRESH_SPIN_CLASS = 'motion-safe:animate-[spin_0.6s_linear_1]';

/**
 * M1 (bridge-chrome): the More sheet's `header` slot — the prod pill, the
 * live "updated Xs ago" freshness clock, and a full-width Refresh button.
 * Presentational only (side effects live in `AdminShell`); a plain function
 * component so the caller can memoize the element on its own dependencies
 * (Decision 7 — every element prop entering AppShell is stable at the call
 * site).
 */
function BridgeMoreSheetHeader({
  lastSyncedAt,
  refreshing,
  onRefresh,
  onSearchOpen,
}: {
  lastSyncedAt: number;
  refreshing: boolean;
  onRefresh: () => void;
  /** bridge-visibility-wave: the ONLY touch entry point to the ⌘K Command
   *  Menu (and its curated Saved Views) — previously desktop/keyboard-only
   *  (the search slot lives in FairwayTopBar's `hidden ... md:flex` region,
   *  and `Meta+K` needs a physical keyboard), so mobile had no way to reach
   *  it at all. */
  onSearchOpen: () => void;
}) {
  return (
    <div className="mb-3 space-y-3 border-b border-border-subtle pb-4">
      <div className="flex items-center gap-2 font-fw-mono text-caption text-text-tertiary">
        <span className="rounded-full border border-border-subtle bg-surface-sunken px-2.5 py-1 uppercase text-text-secondary">
          prod
        </span>
        <span aria-hidden>·</span>
        <RelativeTime sinceMs={lastSyncedAt} />
      </div>
      <Button
        type="button"
        variant="secondary"
        fullWidth
        onClick={onSearchOpen}
        leftIcon={<Search size={16} aria-hidden />}
      >
        Jump to command, incident, user…
      </Button>
      <Button
        type="button"
        variant="secondary"
        fullWidth
        onClick={onRefresh}
        disabled={refreshing}
        leftIcon={<RefreshCw size={16} aria-hidden className={cn(refreshing && REFRESH_SPIN_CLASS)} />}
      >
        {refreshing ? 'Refreshing…' : 'Refresh now'}
      </Button>
    </div>
  );
}

/**
 * Helm Bridge chrome: Fairway AppShell (warm-black rail + cream canvas) as
 * the neutral ops shell. Sport inks appear ONLY inside sport-scoped panes.
 * Keyboard: 1-9 then 0 jump the 10 tabs (see admin-nav.ts), R refreshes,
 * ⌘K opens the command menu — preserving the old admin's muscle memory.
 *
 * M1 (bridge-chrome, docs/MOBILE_DOCTRINE.md rule 6/10): on phone, the rail
 * is replaced by a persistent bottom-tab bar (Overview/Errors/Health/Users —
 * Synthesis Decision 6) + the shared `MoreNavSheet` for the long tail — the
 * SAME overflow surface golf/baseball use (`selectOverflow`/`summarizeMoreTab`
 * from `more-nav.ts`), not a bespoke Bridge sheet.
 */
export function AdminShell({
  email,
  errorCount,
  children,
}: {
  email: string;
  /** Bridge bottom-nav Errors badge — 0 renders no badge (honest-only). */
  errorCount: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [commandOpen, setCommandOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  // M1 (bridge-chrome): the More sheet header's "updated Xs ago" freshness
  // clock. Reset on every navigation (the force-dynamic layout re-fetches
  // per route already) and on every manual refresh — never on a background
  // timer (Overview's own AutoRefresh is page-scoped; a shell-level poll is
  // out of scope for M1, see the brief's edge-case note on badge staleness).
  const [lastSyncedAt, setLastSyncedAt] = useState(() => Date.now());
  useEffect(() => {
    setLastSyncedAt(Date.now());
  }, [pathname]);

  const [refreshing, startRefresh] = useTransition();
  const doRefresh = useCallback(() => {
    startRefresh(() => {
      router.refresh();
      setLastSyncedAt(Date.now());
    });
  }, [router]);

  const sections: readonly NavSection[] = useMemo(
    () => {
      const groups = (['Operations', 'Apps', 'Platform'] as const).map((section) => ({
        heading: section,
        items: ADMIN_NAV.filter((entry) => entry.section === section).map((entry) => ({
          label: entry.label,
          href: entry.href,
          icon: NAV_ICON_BY_HREF[entry.href],
          description: entry.description,
          shortcut: entry.key === '0' ? '0' : entry.key,
          meta: entry.meta,
          activeMatch: (p: string) =>
            entry.href === '/admin' ? p === '/admin' : p.startsWith(entry.href),
        })),
      }));
      return [
        ...groups,
        {
          heading: 'Elsewhere',
          items: [
            {
              label: 'Coach CRM',
              href: '/golf/admin/crm',
              icon: ExternalLink,
              description: 'Outbound pipeline stays outside Helm Bridge',
              meta: 'link',
            },
          ],
        },
      ];
    },
    [],
  );

  // Below `md` FairwayTopBar renders no breadcrumb trail (desktop-only chrome,
  // MOBILE_DOCTRINE rule 7) — but it DOES render this trail's leaf label as
  // the bar's standing destination title, so `breadcrumbs` is the phone
  // "where am I" signal as well as the desktop one. A page that wants a better
  // label than its leaf crumb mounts `<FairwayLargeTitle>`, whose registered
  // title wins (see LargeTitleContext).
  const breadcrumbs = useMemo(() => computeBreadcrumbs(pathname), [pathname]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        // Routed through the SAME `doRefresh` the Refresh button/icon use —
        // one refresh path, so the "R" shortcut also updates the freshness
        // clock and the icon spin instead of silently going stale.
        doRefresh();
        return;
      }
      const href = hrefForShortcut(e.key);
      if (href) {
        e.preventDefault();
        router.push(href);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [router, doRefresh]);

  const commandGroups: CommandGroup[] = useMemo(
    () =>
      [
        {
          heading: 'Saved Views',
          items: [
            {
              id: '/admin/errors?window=24&severity=error',
              label: 'Production Health',
              description: 'Grouped incidents, high-signal errors, live posture',
              shortcut: 'P',
              keywords: ['prod', 'health', 'errors', 'truth layer'],
              tone: 'danger',
              icon: <Gauge size={16} aria-hidden />,
            },
            {
              id: '/admin/users?sport=baseball&attention=watch',
              label: 'Baseball Launch',
              description: 'Baseball teams, player watchlist, profile gaps',
              shortcut: 'L',
              keywords: ['baseball', 'players', 'teams', 'launch'],
              tone: 'accent',
              icon: <SearchCheck size={16} aria-hidden />,
            },
            {
              id: '/admin/users?attention=demo',
              label: 'Demo Readiness',
              description: 'Demo accounts, rosters, activity signals',
              shortcut: 'D',
              keywords: ['demo', 'accounts', 'roster'],
              tone: 'accent',
              icon: <Users size={16} aria-hidden />,
            },
            {
              id: '/admin/errors?source=rls_denial&window=168',
              label: 'Error Forensics',
              description: 'RLS, route, action, feature traceability',
              shortcut: 'F',
              keywords: ['forensics', 'rls', 'trace', 'source'],
              tone: 'danger',
              icon: <AlertTriangle size={16} aria-hidden />,
            },
          ],
        },
        ...(['Operations', 'Apps', 'Platform'] as const).map((section) => ({
          heading: section,
          items: ADMIN_NAV.filter((entry) => entry.section === section).map((entry) => {
            const Icon = NAV_ICON_BY_HREF[entry.href];
            return {
              id: entry.href,
              label: entry.label,
              description: entry.description,
              shortcut: entry.key,
              keywords: [section, entry.meta ?? '', 'helm bridge', 'command center'],
              tone: (entry.meta === 'trace' ? 'danger' : entry.meta ? 'accent' : 'default') as CommandItem['tone'],
              icon: <Icon size={16} aria-hidden />,
            };
          }),
        })),
      ],
    [],
  );

  // Stable element/object identities (perf packet [shell-render-hygiene]):
  // inline literals here are fresh objects every render (e.g. each ⌘K
  // open/close), defeating the React.memo on FairwaySidebar/FairwayTopBar.
  const brand = useMemo(
    () => (
      <span className="flex min-w-0 items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.08] bg-nav-surface font-fw-mono text-caption text-accent-400">
          HB
        </span>
        <span className="min-w-0 text-sm font-semibold tracking-wide text-white">
          Helm <span className="text-accent-400">Bridge</span>
        </span>
      </span>
    ),
    [],
  );
  const shellUser = useMemo(() => ({ name: 'Super admin', teamName: email }), [email]);

  // M1 (bridge-chrome): the daily-loop four (Synthesis Decision 6). Memoized
  // on `errorCount` alone — `FairwayBottomNav` is `React.memo`'d on this
  // ARRAY's reference identity, so a fresh literal every render (e.g. every
  // unrelated pathname-driven re-render) would defeat it. Only the Errors
  // tab carries a badge, and only when > 0 (honest-only).
  const bottomNavItems: NavItem[] = useMemo(
    () =>
      BRIDGE_BOTTOM_NAV_HREFS.map((href) => ({
        label: BRIDGE_BOTTOM_NAV_LABELS[href],
        href,
        icon: NAV_ICON_BY_HREF[href],
        activeMatch: (p: string) => (href === '/admin' ? p === '/admin' : p.startsWith(href)),
        badge: href === '/admin/errors' && errorCount > 0 ? errorCount : undefined,
      })),
    [errorCount],
  );

  // M1 (more-sheet-nav, docs/MOBILE_DOCTRINE.md Rule 6/10): the More sheet's
  // content is the FULL rail `sections` minus the 4 bottom-nav hrefs
  // (`selectOverflow`), and the bottom bar's 5th "More" column derives its
  // active/badge state from that same overflow (`summarizeMoreTab`) — never
  // a second hand-maintained destination list.
  const overflow = useMemo(() => selectOverflow(sections, BRIDGE_BOTTOM_NAV_HREFS), [sections]);
  const more = useMemo(() => summarizeMoreTab(overflow, pathname), [overflow, pathname]);
  const openMoreSheet = useCallback(() => setMoreOpen(true), []);
  // bridge-visibility-wave: the More sheet's own "Jump to…" button routes
  // here — close the sheet first so the Command Menu dialog never stacks on
  // top of the still-open vaul Drawer.
  const openCommandFromSheet = useCallback(() => {
    setMoreOpen(false);
    setCommandOpen(true);
  }, []);

  const bottomNav = useMemo(
    () => (
      <FairwayBottomNav
        items={bottomNavItems}
        pathname={pathname}
        linkComponent={Link}
        onMoreOpen={openMoreSheet}
        moreActive={more.active}
        moreBadge={more.badge}
        moreOpen={moreOpen}
      />
    ),
    [bottomNavItems, pathname, openMoreSheet, more.active, more.badge, moreOpen],
  );

  // M1 (bridge-chrome): the prod pill stays desktop-adjacent (`hidden
  // sm:inline-flex`); the Refresh affordance is now icon-only and shown at
  // EVERY breakpoint (was `lg:`-only text) — phone had no manual refresh at
  // all before this. Spins once on tap while `doRefresh`'s transition is
  // pending (see REFRESH_SPIN_CLASS's doc comment).
  const topBarActions = useMemo(
    () => (
      <div className="flex items-center gap-2">
        <span className="hidden rounded-full border border-warm-200 bg-surface px-2.5 py-1 font-fw-mono text-caption uppercase text-warm-600 sm:inline-flex">
          prod
        </span>
        <IconButton variant="ghost" size="sm" aria-label="Refresh" onClick={doRefresh} disabled={refreshing}>
          <RefreshCw size={16} aria-hidden className={cn(refreshing && REFRESH_SPIN_CLASS)} />
        </IconButton>
      </div>
    ),
    [doRefresh, refreshing],
  );

  const moreSheetHeader = useMemo(
    () => (
      <BridgeMoreSheetHeader
        lastSyncedAt={lastSyncedAt}
        refreshing={refreshing}
        onRefresh={doRefresh}
        onSearchOpen={openCommandFromSheet}
      />
    ),
    [lastSyncedAt, refreshing, doRefresh, openCommandFromSheet],
  );
  const moreSheetFooter = useMemo(
    () => (
      <p className="truncate font-fw-sans text-caption text-text-tertiary">
        Signed in as {email}
      </p>
    ),
    [email],
  );

  return (
    <SessionActivityProvider>
    <div className="fairway-ds min-h-screen bg-canvas-gradient">
      <AppShell
        sections={sections}
        brand={brand}
        user={shellUser}
        pathname={pathname}
        linkComponent={Link}
        breadcrumbs={breadcrumbs}
        onSearchOpen={() => setCommandOpen(true)}
        searchPlaceholder="Jump to command, incident, user…"
        topBarActions={topBarActions}
        // M1 (bridge-chrome): Bridge's own `template.tsx` already owns the
        // route-reveal fade (useRouteRevealMotion, keyed on pathname) —
        // disabling AppShell's OWN RouteTransition here prevents a redundant
        // second pathname-keyed fade (mirrors golf/baseball's shells, which
        // disable it for the same reason).
        disableRouteTransition
        mobileOpen={moreOpen}
        onMobileOpenChange={setMoreOpen}
        // The More sheet's identity row has no real Bridge "Settings" route
        // to link to — Overview is the closest sane destination.
        settingsHref="/admin"
        bottomNavHrefs={BRIDGE_BOTTOM_NAV_HREFS}
        bottomNav={bottomNav}
        moreSheetHeader={moreSheetHeader}
        moreSheetFooter={moreSheetFooter}
      >
        {children}
      </AppShell>
      <CommandMenu
        open={commandOpen}
        onOpenChange={setCommandOpen}
        groups={commandGroups}
        onSelect={(item: CommandItem) => {
          setCommandOpen(false);
          router.push(item.id);
        }}
        placeholder="Jump to…"
      />
    </div>
    </SessionActivityProvider>
  );
}
