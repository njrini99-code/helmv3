'use client';

import Link from 'next/link';
import { ChevronRight, Settings } from 'lucide-react';
import { Icon } from '../ui/Icon';
import { routeLabel, type ChNavItem, type ChPhonePushedTop } from './nav';
import { Bell } from './Bell';
import { useCrumbTrail } from './crumbs';
import { PushedTopStandIn, usePhoneChromeState } from './phone-chrome';
import { useClubhouseRole } from './context';
import { AskSheetButton } from './AskSheet';

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
 * On a pushed address (`pushed`, from `phonePushedTop`) the shell draws that
 * variant itself until the page's own arrives (CH-1402), so the loading
 * skeleton and the server's first paint never show the tab root's title and bell.
 */
export function TopBar({
  item,
  pathname,
  teamName = null,
  pushed = null,
}: {
  item: ChNavItem | undefined;
  pathname: string;
  teamName?: string | null;
  pushed?: ChPhonePushedTop | null;
}) {
  const pageTrail = useCrumbTrail();
  const { pageTop, rootTitle, immersive, setSlot } = usePhoneChromeState();
  const standIn = pageTop ? null : pushed;
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
    <header className="ch-topbar" data-phone={rootTitle ? 'start' : pageTop || standIn ? 'page' : 'root'} inert={immersive || undefined}>
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
        <span className="ch-topbar__mark"><img src="/clubhouse/auth/helm-golf-mark.png" alt="" width={20} height={20} /></span>
        {teamName ?? 'GolfHelm'}
      </span>
      <div className="ch-topbar__pslot" ref={setSlot} />
      {standIn && (
        <div className="ch-topbar__pstand" data-ch-code="CH-1402">
          <PushedTopStandIn top={standIn} />
        </div>
      )}
      <div className="ch-topbar__actions">
        <AskSheetButton />
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
