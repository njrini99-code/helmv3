'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, AlertTriangle, KeyRound, Flag, CircleDot,
  Users, Timer, Rocket, ExternalLink,
} from 'lucide-react';
import { AppShell, CommandMenu, type NavSection, type CommandGroup, type CommandItem } from '@/components/fairway';
import { ADMIN_NAV, hrefForShortcut } from './admin-nav';

const NAV_ICONS = [
  LayoutDashboard, AlertTriangle, KeyRound, Flag, CircleDot, Users, Timer, Rocket,
] as const;

/**
 * Helm Bridge chrome: Fairway AppShell (warm-black rail + cream canvas) as
 * the neutral ops shell. Sport inks appear ONLY inside sport-scoped panes.
 * Keyboard: 1-8 jump tabs, R refreshes, ⌘K opens the command menu —
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
