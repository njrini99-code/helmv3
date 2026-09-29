'use client';

import Link from 'next/link';
import type { GolfUserData } from '@/contexts/golf-user-context';
import { useNotificationBadges } from '@/contexts/notification-badge-context';
import { Avatar } from '../ui/Avatar';
import { Icon } from '../ui/Icon';
import type { ChShellData } from '../data/shell';
import { CH_NAV, activeNavItem, type ChNavItem } from './nav';
import { NextEventCard } from './NextEventCard';

export function badgeCount(item: ChNavItem, badges: { messages: number }, shell: ChShellData): number | null {
  if (item.badge === 'messages') return badges.messages > 0 ? badges.messages : null;
  if (item.badge === 'joinRequests') return shell.pendingJoinRequests ? shell.pendingJoinRequests : null;
  return null;
}

export function Sidebar({ userData, shell, pathname }: { userData: GolfUserData; shell: ChShellData; pathname: string }) {
  const badges = useNotificationBadges();
  const current = activeNavItem(pathname)?.id;
  const sections: Array<ChNavItem['section']> = [undefined, 'Team', 'Program'];

  return (
    <aside className="ch-sidebar" aria-label="Main">
      <div className="ch-brand">
        <img src="/helm-main-logo-transparent-white-trim.png" alt="" width={32} height={32} />
        <div className="ch-brand__txt">
          <span className="ch-brand__word">GolfHelm</span>
          {userData.teamName && <span className="ch-brand__team">{userData.teamName}</span>}
        </div>
      </div>

      <nav className="ch-nav">
        {sections.map((section) => (
          <div key={section ?? 'main'} className="ch-nav__group">
            {section && <div className="ch-nav__section">{section}</div>}
            {CH_NAV.filter((i) => i.section === section).map((i) => {
              const count = badgeCount(i, badges, shell);
              return (
                <Link
                  key={i.id}
                  href={i.href}
                  className="ch-navitem"
                  aria-current={current === i.id ? 'page' : undefined}
                >
                  <Icon icon={i.icon} size={16} />
                  <span>{i.label}</span>
                  {count != null && <span className="ch-navitem__count ch-num">{count}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="ch-sidebar__foot">
        {shell.nextEvent && <NextEventCard event={shell.nextEvent} />}
        <div className="ch-identity">
          <Avatar name={userData.name} size={30} />
          <div className="ch-identity__txt">
            <span className="ch-identity__name">{userData.name}</span>
            <span className="ch-identity__meta">Coach{userData.teamName ? ` · ${userData.teamName}` : ''}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
