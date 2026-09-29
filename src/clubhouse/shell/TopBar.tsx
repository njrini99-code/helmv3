'use client';

import Link from 'next/link';
import { ChevronRight, Settings } from 'lucide-react';
import { Icon } from '../ui/Icon';
import type { ChNavItem } from './nav';
import { Bell } from './Bell';

/**
 * Sticky glass bar over the canvas: breadcrumbs, the notifications bell (the
 * current app's feed) and settings. The handoff's search field arrives with
 * its own spec; it is not rendered as a dead control in the meantime
 * (tracker: data gaps).
 */
export function TopBar({ item }: { item: ChNavItem | undefined }) {
  const crumbs = !item || item.id === 'home' ? ['Home'] : [item.section, item.label].filter(Boolean) as string[];
  return (
    <header className="ch-topbar">
      <nav className="ch-topbar__crumbs" aria-label="Breadcrumb">
        {crumbs.map((c, i) => (
          <span key={c} className="ch-topbar__crumb">
            {i > 0 && <Icon icon={ChevronRight} size={13} />}
            {i === crumbs.length - 1 ? <b aria-current="page">{c}</b> : c}
          </span>
        ))}
      </nav>
      <div className="ch-topbar__actions">
        <Bell />
        <Link href="/golf/dashboard/settings" className="ch-btn ch-btn--ghost ch-iconbtn" aria-label="Settings" title="Settings">
          <Icon icon={Settings} size={16} />
        </Link>
      </div>
    </header>
  );
}
