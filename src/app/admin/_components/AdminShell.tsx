'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Activity, AlertTriangle, KeyRound, Flag, CircleDot,
  Users, Timer, Rocket, HeartPulse, ExternalLink, MessageSquarePlus, Gauge, SearchCheck, ScrollText,
} from 'lucide-react';
import {
  AppShell,
  Button,
  CommandMenu,
  type Breadcrumb,
  type NavSection,
  type CommandGroup,
  type CommandItem,
} from '@/components/fairway';
import { SessionActivityProvider } from '@/components/providers/SessionActivityProvider';
import { ADMIN_NAV, hrefForShortcut } from './admin-nav';

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
  '/admin/golf': Flag,
  '/admin/baseball': CircleDot,
  '/admin/ben-leah': MessageSquarePlus,
  '/admin/work': ScrollText,
  '/admin/users': Users,
  '/admin/jobs': Timer,
  '/admin/deploys': Rocket,
  '/admin/health': HeartPulse,
} as const;

/**
 * Helm Bridge chrome: Fairway AppShell (warm-black rail + cream canvas) as
 * the neutral ops shell. Sport inks appear ONLY inside sport-scoped panes.
 * Keyboard: 1-9 then 0 jump the 10 tabs (see admin-nav.ts), R refreshes,
 * ⌘K opens the command menu — preserving the old admin's muscle memory.
 */
export function AdminShell({
  email,
  children,
}: {
  email: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [commandOpen, setCommandOpen] = useState(false);

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

  // Mobile parity (375px mandate): FairwayTopBar collapses the full trail to
  // just the last crumb below `md`, which is the ONLY on-screen "where am I"
  // signal on pages whose body starts straight into KPI tiles with no h1.
  const breadcrumbs = useMemo(() => computeBreadcrumbs(pathname), [pathname]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        router.refresh();
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
  }, [router]);

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

  return (
    <SessionActivityProvider>
    <div className="fairway-ds min-h-screen bg-canvas-gradient">
      <AppShell
        sections={sections}
        brand={
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.08] bg-nav-surface font-fw-mono text-caption text-accent-400">
              HB
            </span>
            <span className="min-w-0 text-sm font-semibold tracking-wide text-white">
              Helm <span className="text-accent-400">Bridge</span>
            </span>
          </span>
        }
        user={{ name: 'Super admin', teamName: email }}
        pathname={pathname}
        linkComponent={Link}
        breadcrumbs={breadcrumbs}
        onSearchOpen={() => setCommandOpen(true)}
        searchPlaceholder="Jump to command, incident, user…"
        topBarActions={
          <div className="hidden items-center gap-2 lg:flex">
            <span className="rounded-full border border-warm-200 bg-surface px-2.5 py-1 font-fw-mono text-caption uppercase text-warm-600">
              prod
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => router.refresh()}
              className="min-h-0 rounded-full px-2.5 py-1 text-caption"
            >
              Refresh
            </Button>
          </div>
        }
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
