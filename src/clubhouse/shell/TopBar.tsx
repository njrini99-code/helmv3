'use client';

import Link from 'next/link';
import { ChevronRight, Settings } from 'lucide-react';
import { Icon } from '../ui/Icon';
import { routeLabel, type ChNavItem } from './nav';
import { Bell } from './Bell';
import { useCrumbTrail } from './crumbs';
import { usePhoneChromeState } from './phone-chrome';
import { useClubhouseRole } from './context';

/** The board's page gears: on CoachHelm and Team Hub a coach's gear opens that page's Settings section (?section=). */
const PAGE_SETTINGS: ReadonlyArray<{ path: string; section: string; label: string }> = [
  { path: '/golf/dashboard/coachhelm', section: 'coachhelm', label: 'CoachHelm settings' },
  { path: '/golf/dashboard/team-hub', section: 'team', label: 'Team Hub settings' },
];

/**
 * Sticky glass bar over the canvas: breadcrumbs, the notifications bell (the
 * current app's feed) and settings. The handoff's search field arrives with
 * its own spec; it is not rendered as a dead control in the meantime
 * (tracker: data gaps).
 *
 * Below 820px it is the owner's phone top bar (foundation.md): the tab root
 * shows the page's title and the bell; a page that renders `PhoneTop` gets
 * the pushed variant instead (back link, centred title, one action), which
 * lands in the slot here. Settings lives in the More sheet on the phone (D-41).
 */
export function TopBar({ item, pathname, teamName = null }: { item: ChNavItem | undefined; pathname: string; teamName?: string | null }) {
  const pageTrail = useCrumbTrail();
  const { pageTop, rootTitle, immersive, setSlot } = usePhoneChromeState();
  const role = useClubhouseRole();
  const pageSettings = role === 'coach' ? PAGE_SETTINGS.find((p) => pathname === p.path || pathname.startsWith(`${p.path}/`)) : undefined;
  const crumbs =
    pageTrail ??
    (pathname.startsWith('/golf/dashboard/settings')
      ? ['Settings']
      : !item
        ? [routeLabel(pathname) ?? 'Home']
        : item.id === 'home'
          ? ['Home']
          : ([item.section, item.label].filter(Boolean) as string[]));
  return (
    <header className="ch-topbar" data-phone={rootTitle ? 'start' : pageTop ? 'page' : 'root'} inert={immersive || undefined}>
      <nav className="ch-topbar__crumbs" aria-label="Breadcrumb">
        {crumbs.map((c, i) => (
          <span key={c} className="ch-topbar__crumb">
            {i > 0 && <Icon icon={ChevronRight} size={13} />}
            {i === crumbs.length - 1 ? <b aria-current="page">{c}</b> : c}
          </span>
        ))}
      </nav>
      {/* The phone's tab-root title. Only one of it and the breadcrumbs is displayed at a width. */}
      <b className="ch-topbar__ptitle">{crumbs[crumbs.length - 1]}</b>
      {/* The green hero's bar (usePhoneHero, the phone Home): the team in place of the title. */}
      <span className="ch-topbar__team" aria-hidden="true">
        <img src="/helm-main-logo-transparent-white-trim.png" alt="" width={22} height={22} />
        {teamName ?? 'GolfHelm'}
      </span>
      <div className="ch-topbar__pslot" ref={setSlot} />
      <div className="ch-topbar__actions">
        <Bell />
        <Link
          href={pageSettings ? `/golf/dashboard/settings?section=${pageSettings.section}` : '/golf/dashboard/settings'}
          className={'ch-btn ch-btn--ghost ch-iconbtn ch-topbar__settings' + (pathname.startsWith('/golf/dashboard/settings') ? ' is-on' : '')}
          aria-label={pageSettings?.label ?? 'Settings'}
          aria-current={pathname.startsWith('/golf/dashboard/settings') ? 'page' : undefined}
          title={pageSettings?.label ?? 'Settings'}
        >
          <Icon icon={Settings} size={16} />
        </Link>
      </div>
    </header>
  );
}
