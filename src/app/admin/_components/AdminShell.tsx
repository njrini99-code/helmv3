'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  House,
  Activity,
  AlertTriangle,
  KeyRound,
  Flag,
  CircleDot,
  Users,
  Timer,
  Rocket,
  HeartPulse,
  ExternalLink,
  MessageSquarePlus,
  Gauge,
  SearchCheck,
  ScrollText,
  Radar,
  GitBranch,
  Database,
  RefreshCw,
  Dumbbell,
  Search,
  LogOut,
  Bot,
  ToggleLeft,
  AppWindow,
  MousePointerClick,
  Zap,
  Hash,
  ClipboardCheck,
  Repeat,
  ListVideo,
  Smartphone,
  Tag,
  GitCompareArrows,
  PackageOpen,
  Sunrise,
  UsersRound,
  Boxes,
  ShieldAlert,
  Ship,
  Inbox,
} from 'lucide-react';
import {
  AppShell,
  Button,
  IconButton,
  CommandMenu,
  type NavSection,
  type CommandGroup,
  type CommandItem,
} from '@/components/fairway';
import { FairwayBottomNav } from '@/components/fairway/app-shell/FairwayBottomNav';
import { selectOverflow, summarizeMoreTab } from '@/components/fairway/app-shell/more-nav';
import type { NavItem } from '@/components/fairway/app-shell/types';
import { SessionActivityProvider } from '@/components/providers/SessionActivityProvider';
import { createClient } from '@/lib/supabase/client';
import { clearActiveTeam } from '@/app/golf/actions/team-switcher';
import { clearAllCachedResources } from '@/lib/golf/client-resource-cache';
import { clearPrivateServiceWorkerCaches } from '@/lib/offline/private-caches';
import { toast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import {
  ADMIN_NAV,
  ADMIN_MORE_VIEWS,
  hrefForShortcut,
  isNavEntryActive,
  RESERVED_LOCAL_SHORTCUTS,
  BRIDGE_BOTTOM_NAV_HREFS,
  BRIDGE_BOTTOM_NAV_LABELS,
} from './admin-nav';
import { computeBreadcrumbs } from './admin-breadcrumbs';
import { RETIRED_SHORTCUTS } from '@/lib/admin/retired-routes';
import { SEARCH_MIN_QUERY, type BridgeSearchHit, type BridgeSearchKind } from '@/lib/admin/clubhouse/search';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import { RelativeTime } from './RelativeTime';

/** Rows of the palette's graph group (B14), one icon per kind. */
const GRAPH_HIT_ICON: Record<BridgeSearchKind, typeof House> = {
  page: AppWindow,
  control: MousePointerClick,
  action: Zap,
  code: Hash,
  finding: ClipboardCheck,
  release: GitBranch,
  person: Users,
  team: Users,
};

/**
 * B14 (plan §7.2): the palette asks the server for graph matches as you type.
 * Debounced, and a stale answer never lands: each query aborts the last.
 * Below `SEARCH_MIN_QUERY` characters, or on any failure, the palette shows its
 * nav rows alone rather than an error, because the nav still works.
 */
function useBridgeGraphSearch(open: boolean, query: string): BridgeSearchHit[] {
  const [hits, setHits] = useState<BridgeSearchHit[]>([]);
  const q = open ? query.trim() : '';
  useEffect(() => {
    if (q.length < SEARCH_MIN_QUERY) {
      setHits([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/admin/clubhouse/search?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
        cache: 'no-store',
      })
        .then((res) => (res.ok ? res.json() : { items: [] }))
        .then((body: { items?: BridgeSearchHit[] }) => {
          if (!controller.signal.aborted) setHits(Array.isArray(body.items) ? body.items : []);
        })
        .catch(() => {
          if (!controller.signal.aborted) setHits([]);
        });
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);
  return hits;
}

/**
 * Rail / ⌘K group order, DERIVED from ADMIN_NAV rather than hand-listed.
 * The hand-listed tuple here was `['Operations', 'Apps', 'Platform']`, and when
 * the nav was regrouped into question-shaped sections (Triage / Customers /
 * Apps / Platform / Revenue) nothing in this file changed — so the rail and the
 * command menu silently dropped every Triage, Customers and Revenue entry (9 of
 * the 16 tabs, Overview and Errors among them) and rendered an empty
 * "Operations" heading. Deriving the order means adding or renaming a section
 * can never again half-land.
 */
const NAV_SECTION_ORDER = [...new Set(ADMIN_NAV.map((entry) => entry.section))];

const NAV_ICON_BY_HREF = {
  // House, not LayoutDashboard: the bottom bar's 5th column (More) is a
  // 2×2 grid glyph, and LayoutDashboard is a grid too — on a phone the first
  // and last tabs read as the same button.
  '/admin': House,
  '/admin/pulse': House,
  // Spaces (plan 2026-11-26-bridge-spaces-build.md): one glyph each, none reused by a tab below.
  '/admin/spaces/today': Sunrise,
  '/admin/spaces/people': UsersRound,
  '/admin/spaces/product': Boxes,
  '/admin/spaces/reliability': ShieldAlert,
  '/admin/spaces/ship': Ship,
  '/admin/spaces/desk': Inbox,
  // Clubhouse (plan §7.1). A window, not a grid, for Pages: a grid glyph would
  // read as the bottom bar's More button in the More sheet.
  '/admin/clubhouse': AppWindow,
  '/admin/clubhouse/controls': MousePointerClick,
  '/admin/clubhouse/actions': Zap,
  '/admin/clubhouse/codes': Hash,
  '/admin/clubhouse/readiness': ClipboardCheck,
  '/admin/clubhouse/sessions': ListVideo,
  '/admin/clubhouse/experience': Smartphone,
  '/admin/clubhouse/releases': Tag,
  // B11: the docs against the running code. B13: the pack Duet takes.
  '/admin/clubhouse/drift': GitCompareArrows,
  '/admin/clubhouse/duet': PackageOpen,
  '/admin/activity': Activity,
  '/admin/errors': AlertTriangle,
  '/admin/traces': GitBranch,
  '/admin/engineering': Bot,
  // The database's own icon, not a variant of the Incidents triangle or
  // Jobs' Timer — this tab's subject is Postgres state itself (connections,
  // deduped DB errors, query deltas), not cross-source correlation or cron
  // scheduling.
  '/admin/database': Database,
  // A closed loop, not another gauge: this tab's subject is a CIRCUIT that
  // either completes or does not, and it sits beside Reliability where a
  // second measurement glyph would read as a variant of it.
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
  // A toggle, not another release/rocket glyph: this tab's subject is
  // per-flag on/off governance, distinct from Deploys & Infra's release
  // ledger — a second rocket would read as a duplicate of it.
  '/admin/releases': ToggleLeft,
  '/admin/health': HeartPulse,
  '/admin/teams': Radar,
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
        Jump to a tab, page, action or code…
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
 * Helm Bridge shares the authenticated GolfHelm session. Signing out must
 * clear the active-team cookie as well as revoke the browser session: without
 * it, the next person on a shared admin device could inherit an old team
 * selection after they sign in. Cookie cleanup is best-effort so a transient
 * server-action failure never traps an administrator in a signed-in session.
 */
function useBridgeSignOut() {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = useCallback(async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);

    try {
      await clearActiveTeam().catch(() => undefined);
      // Helm Bridge shares the GolfHelm session, so this device is exactly
      // the shared-device case client-resource-cache.ts's contract exists
      // for — the next admin to sign in must not inherit a stale warm cache.
      clearAllCachedResources();
      await clearPrivateServiceWorkerCaches();
      const { error } = await createClient().auth.signOut();
      if (error) throw error;

      router.replace('/golf/login');
      router.refresh();
    } catch {
      setIsSigningOut(false);
      toast.error('Could not sign out', { description: 'Please try again.' });
    }
  }, [isSigningOut, router]);

  return { isSigningOut, handleSignOut };
}

/**
 * Helm Bridge chrome: Fairway AppShell (warm-black rail + cream canvas) as
 * the neutral ops shell. Sport inks appear ONLY inside sport-scoped panes.
 * Keyboard: 1-9 then 0 jump the first ten tabs, Shift+letter jumps the rest
 * (see admin-nav.ts — ADMIN_NAV has grown past ten tabs since this comment
 * was first written), R refreshes, ⌘K opens the command menu — preserving
 * the old admin's muscle memory.
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
  healthCount,
  children,
}: {
  email: string;
  /** Bridge bottom-nav Incidents badge — 0 renders no badge (honest-only).
   *  `null` means the incident feed could not be READ: it renders no numeric
   *  badge (there is no number) plus a distinct "unreadable" chip in the top
   *  bar, so a broken read is never mistaken for an empty queue. Same rule as
   *  `healthCount` below. */
  errorCount: number | null;
  /** Bridge bottom-nav Health badge — count of RED features, computed in
   *  layout.tsx via fetchFeatureHealthRedCount() (see its doc comment for
   *  the DB-only, Sentry-free cost tradeoff). `null` means the pipeline was
   *  degraded/unreachable — "unknown" must never render like "zero", so
   *  both `null` and `0` render no badge, and only a real positive count
   *  shows one (honest-only). */
  healthCount: number | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { isSigningOut, handleSignOut } = useBridgeSignOut();
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
      const groups = NAV_SECTION_ORDER.map((section) => ({
        heading: section,
        items: ADMIN_NAV.filter((entry) => entry.section === section).map((entry) => ({
          label: entry.label,
          href: entry.href,
          icon: NAV_ICON_BY_HREF[entry.href],
          description: entry.description,
          shortcut: entry.key === '0' ? '0' : entry.key,
          meta: entry.meta,
          // Longest match wins (navEntryForPath): on a Controls dossier only
          // Controls lights up, never Pages (`/admin/clubhouse`) beside it.
          activeMatch: (p: string) => isNavEntryActive(entry.href, p),
        })),
      }));
      // D5: the self-heal views close the More group. They never claim the
      // highlight; the tab that owns them (Incidents, Jobs) already has it.
      const moreViews: NavItem[] = ADMIN_MORE_VIEWS.map((view) => ({
        label: view.label,
        href: view.href,
        icon: Repeat,
        description: view.description,
        shortcut: view.key,
        meta: 'view',
        activeMatch: () => false,
      }));
      return [
        ...groups.map((group) =>
          group.heading === 'More' ? { ...group, items: [...group.items, ...moreViews] } : group,
        ),
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
      // Reserved BEFORE hrefForShortcut, and case-SENSITIVE (plain 'r' only)
      // — every ADMIN_NAV letter shortcut is the Shift+letter (uppercase)
      // form precisely so it never collides with a local key reserved here.
      // This used to check `e.key === 'r' || e.key === 'R'`, which ate
      // Shift+R and made Reliability's 'R' tab shortcut permanently
      // unreachable; see RESERVED_LOCAL_SHORTCUTS in admin-nav.ts.
      if (RESERVED_LOCAL_SHORTCUTS.has(e.key)) {
        e.preventDefault();
        // Routed through the SAME `doRefresh` the Refresh button/icon use —
        // one refresh path, so the "r" shortcut also updates the freshness
        // clock and the icon spin instead of silently going stale.
        doRefresh();
        return;
      }
      const href = hrefForShortcut(e.key);
      if (href) {
        e.preventDefault();
        router.push(href);
        return;
      }
      // A shortcut whose TAB was retired by the 30->19 consolidation still
      // works — it routes to the view that absorbed that tab, so an operator
      // with muscle memory for Shift+G ("Golf journey lens") lands on
      // /admin/golf?view=journey rather than on nothing at all. Consulted
      // AFTER hrefForShortcut, never before, so a live tab can never be
      // shadowed by a retired one; `retired-shortcuts.test.ts` pins that no
      // retired key collides with a live ADMIN_NAV key or a reserved local.
      const retired = RETIRED_SHORTCUTS[e.key];
      if (retired) {
        e.preventDefault();
        router.push(retired);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [router, doRefresh]);

  // The ⌘K nav rows never change; the graph rows (B14) follow the query.
  const navCommandGroups: CommandGroup[] = useMemo(
    () =>
      [
        {
          heading: 'Saved Views',
          // No `shortcut` hints here. These rows used to show P, L, D and F,
          // but Shift+L opens Lift Lab, Shift+F the Flight Recorder, Shift+D
          // Users and Shift+P the retired lifting lens: none of them opened
          // the view it sat beside. A key hint is a promise; these are reached
          // through ⌘K by name only.
          items: [
            {
              id: '/admin/errors?window=24&severity=error',
              label: 'Production Health',
              description: 'Grouped incidents, high-signal errors, live posture',
              keywords: ['prod', 'health', 'errors', 'truth layer'],
              tone: 'danger',
              icon: <Gauge size={16} aria-hidden />,
            },
            {
              id: '/admin/users?sport=baseball&attention=watch',
              label: 'Baseball Launch',
              description: 'Baseball teams, player watchlist, profile gaps',
              keywords: ['baseball', 'players', 'teams', 'launch'],
              tone: 'accent',
              icon: <SearchCheck size={16} aria-hidden />,
            },
            {
              id: '/admin/users?attention=demo',
              label: 'Demo Readiness',
              description: 'Demo accounts, rosters, activity signals',
              keywords: ['demo', 'accounts', 'roster'],
              tone: 'accent',
              icon: <Users size={16} aria-hidden />,
            },
            {
              id: '/admin/errors?source=rls_denial&window=168',
              label: 'Error Forensics',
              description: 'RLS, route, action, feature traceability',
              keywords: ['forensics', 'rls', 'trace', 'source'],
              tone: 'danger',
              icon: <AlertTriangle size={16} aria-hidden />,
            },
          ],
        },
        ...NAV_SECTION_ORDER.map((section) => ({
          heading: section,
          items: [
            ...ADMIN_NAV.filter((entry) => entry.section === section).map((entry) => {
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
            // D5: the self-heal views, under More here as in the rail.
            ...(section === 'More'
              ? ADMIN_MORE_VIEWS.map((view) => ({
                  id: view.href,
                  label: view.label,
                  description: view.description,
                  shortcut: view.key,
                  keywords: ['self-heal', 'self heal', 'loop', 'repair', 'more'],
                  tone: 'default' as CommandItem['tone'],
                  icon: <Repeat size={16} aria-hidden />,
                }))
              : []),
          ],
        })),
      ],
    [],
  );

  const [paletteQuery, setPaletteQuery] = useState('');
  const graphHits = useBridgeGraphSearch(commandOpen, paletteQuery);
  const commandGroups: CommandGroup[] = useMemo(() => {
    if (graphHits.length === 0) return navCommandGroups;
    const graphGroup: CommandGroup = {
      heading: 'Clubhouse contract',
      items: graphHits.map((hit) => {
        const Icon = GRAPH_HIT_ICON[hit.kind];
        return {
          id: hit.href,
          label: hit.label,
          description: hit.description,
          // The server already matched these against the query. Carrying it
          // keeps cmdk's own matcher from hiding a hit it would score low (a
          // CH- code resolving to its Bridge ID, a word inside a meaning).
          keywords: [hit.key, paletteQuery.trim()],
          tone: (hit.kind === 'finding' ? 'danger' : 'accent') as CommandItem['tone'],
          icon: <Icon size={16} aria-hidden />,
          dataAttributes: { 'data-br': hit.kind === 'code' ? BR.palette.byCode : BR.palette.result },
        };
      }),
    };
    return [graphGroup, ...navCommandGroups];
  }, [graphHits, navCommandGroups, paletteQuery]);

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
  // on `errorCount`/`healthCount` — `FairwayBottomNav` is `React.memo`'d on
  // this ARRAY's reference identity, so a fresh literal every render (e.g.
  // every unrelated pathname-driven re-render) would defeat it. Only Errors
  // and Health carry a badge, and only when > 0 (honest-only).
  const bottomNavItems: NavItem[] = useMemo(
    () =>
      BRIDGE_BOTTOM_NAV_HREFS.map((href) => ({
        label: BRIDGE_BOTTOM_NAV_LABELS[href],
        href,
        icon: NAV_ICON_BY_HREF[href],
        activeMatch: (p: string) => p === href || p.startsWith(`${href}/`),
        // Open incidents ride on Reliability, red features on Product (the spaces that answer them).
        badge:
          href === '/admin/spaces/reliability' && errorCount !== null && errorCount > 0
            ? errorCount
            : href === '/admin/spaces/product' && healthCount !== null && healthCount > 0
              ? healthCount
              : undefined,
      })),
    [errorCount, healthCount],
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
  // The incident badge's UNKNOWN state. `fetchBridgeErrorBadge` returns null
  // when the feed read failed; a null must be visibly different from "no
  // incidents" at every breakpoint, and a numeric bottom-nav badge cannot say
  // it, so the top bar does. Deliberately NOT hidden below `sm` like the prod
  // pill: the phone is exactly where the bottom-nav badge is the only signal.
  const topBarActions = useMemo(
    () => (
      <div className="flex items-center gap-2">
        {errorCount === null ? (
          <span
            role="status"
            data-testid="bridge-incidents-unreadable"
            title="The incident count could not be read. The Incidents tab may be showing a partial or empty list — this is not zero."
            className="inline-flex items-center gap-1 rounded-full border border-fw-warning/40 bg-fw-warning/10 px-2.5 py-1 font-fw-mono text-caption uppercase text-fw-warning-ink"
          >
            <AlertTriangle size={12} aria-hidden />
            Incidents unreadable
          </span>
        ) : null}
        <span className="hidden rounded-full border border-warm-200 bg-surface px-2.5 py-1 font-fw-mono text-caption uppercase text-warm-600 sm:inline-flex">
          prod
        </span>
        <IconButton variant="ghost" size="sm" aria-label="Refresh" onClick={doRefresh} disabled={refreshing}>
          <RefreshCw size={16} aria-hidden className={cn(refreshing && REFRESH_SPIN_CLASS)} />
        </IconButton>
      </div>
    ),
    [doRefresh, refreshing, errorCount],
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
      <div className="space-y-2 border-t border-border-subtle pt-3">
        <p className="truncate font-fw-sans text-caption text-text-tertiary">
          Signed in as {email}
        </p>
        <Button
          type="button"
          variant="ghost"
          fullWidth
          onClick={handleSignOut}
          disabled={isSigningOut}
          leftIcon={<LogOut size={16} aria-hidden />}
          className="justify-start text-text-secondary hover:bg-fw-danger/10 hover:text-fw-danger-ink"
        >
          {isSigningOut ? 'Signing out…' : 'Sign out'}
        </Button>
      </div>
    ),
    [email, handleSignOut, isSigningOut],
  );
  const sidebarFooter = useMemo(
    () => (
      <Button
        type="button"
        variant="ghost"
        fullWidth
        onClick={handleSignOut}
        disabled={isSigningOut}
        leftIcon={<LogOut size={16} aria-hidden />}
        className="justify-start text-nav-text-dim hover:bg-fw-danger/10 hover:text-fw-danger-ink"
      >
        {isSigningOut ? 'Signing out…' : 'Sign out'}
      </Button>
    ),
    [handleSignOut, isSigningOut],
  );

  return (
    <SessionActivityProvider>
    <div className="fairway-ds min-h-screen bg-canvas-gradient">
      <AppShell
        sections={sections}
        brand={brand}
        user={shellUser}
        sidebarFooter={sidebarFooter}
        pathname={pathname}
        linkComponent={Link}
        breadcrumbs={breadcrumbs}
        onSearchOpen={() => setCommandOpen(true)}
        searchPlaceholder="Jump to a tab, page, action or code…"
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
        placeholder="Jump to a tab, page, action or code…"
        emptyMessage="Nothing matches. Try a CH- code, a Bridge ID, ACT- or a page name."
        onQueryChange={setPaletteQuery}
      />
    </div>
    </SessionActivityProvider>
  );
}
