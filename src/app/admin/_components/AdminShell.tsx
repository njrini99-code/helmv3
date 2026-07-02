'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, AlertTriangle, KeyRound, Flag, CircleDot,
  Users, Timer, Rocket, HeartPulse, ExternalLink,
} from 'lucide-react';
import {
  AppShell,
  CommandMenu,
  type Breadcrumb,
  type NavSection,
  type CommandGroup,
  type CommandItem,
} from '@/components/fairway';
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

const NAV_ICONS = [
  LayoutDashboard, AlertTriangle, KeyRound, Flag, CircleDot, Users, Timer, Rocket, HeartPulse,
] as const;

/**
 * Helm Bridge chrome: Fairway AppShell (warm-black rail + cream canvas) as
 * the neutral ops shell. Sport inks appear ONLY inside sport-scoped panes.
 * Keyboard: 1-9 jump tabs, R refreshes, ⌘K opens the command menu —
 * preserving the old admin's muscle memory.
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
    () => [
      {
        heading: 'Bridge',
        items: ADMIN_NAV.map((entry, i) => ({
          label: entry.label,
          href: entry.href,
          icon: NAV_ICONS[i]!,
          // Overview must not stay lit on every /admin/* subroute; the other
          // 7 tabs SHOULD stay lit on their sub-routes (e.g. /admin/errors/[fp]).
          activeMatch: (p: string) =>
            entry.href === '/admin' ? p === '/admin' : p.startsWith(entry.href),
        })),
      },
      {
        heading: 'Elsewhere',
        items: [
          // CRM stays a plain LINK OUT — no CRM code crosses the boundary.
          { label: 'Coach CRM', href: '/golf/admin/crm', icon: ExternalLink },
        ],
      },
    ],
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
    () => [
      {
        heading: 'Tabs',
        items: ADMIN_NAV.map((entry) => ({
          id: entry.href,
          label: entry.label,
          shortcut: entry.key,
        })),
      },
    ],
    [],
  );

  return (
    <div className="fairway-ds min-h-screen bg-canvas-gradient">
      <AppShell
        sections={sections}
        brand={
          <span className="text-sm font-semibold tracking-wide text-white">
            Helm <span className="text-accent-400">Bridge</span>
          </span>
        }
        user={{ name: 'Super admin', teamName: email }}
        pathname={pathname}
        linkComponent={Link}
        breadcrumbs={breadcrumbs}
        onSearchOpen={() => setCommandOpen(true)}
        searchPlaceholder="Jump to tab, user, team…"
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
  );
}
