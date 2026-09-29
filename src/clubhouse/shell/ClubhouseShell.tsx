'use client';

import { LazyMotion, domAnimation } from 'framer-motion';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { GolfUserProvider, type GolfUserData } from '@/contexts/golf-user-context';
import { NotificationBadgeProvider } from '@/contexts/notification-badge-context';
import { SessionActivityProvider } from '@/components/providers/SessionActivityProvider';
import { clubhouseFontVariables } from '../lib/fonts';
import { ToastProvider } from '../ui/Toast';
import type { ChShellData } from '../data/shell';
import { activeNavItem, isRebuilt } from './nav';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { TabBar } from './TabBar';
import { RouteFrame } from './RouteFrame';
import { NotRebuilt } from './NotRebuilt';
import { ClubhouseMarker } from './context';
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/ui.css';
import '../styles/shell.css';

/**
 * The Clubhouse app frame: a green frame with an inset ivory canvas and the
 * sidebar on wide screens, and a full-bleed canvas with a bottom tab bar on
 * phones. It carries the non-UI providers pages rely on (golf user, badges,
 * session activity) and none of Fairway's UI.
 */
export function ClubhouseShell({
  userData,
  shell,
  children,
}: {
  userData: GolfUserData;
  shell: ChShellData;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? '/golf/dashboard';
  const item = activeNavItem(pathname);
  const rebuilt = isRebuilt(pathname);

  return (
    <ClubhouseMarker>
    <SessionActivityProvider>
      <GolfUserProvider userData={userData}>
        <NotificationBadgeProvider>
          <LazyMotion features={domAnimation} strict>
            <ToastProvider>
              <div className={`ch-root ${clubhouseFontVariables}`} data-ui="clubhouse">
                <div className="ch-app">
                  <Sidebar userData={userData} shell={shell} pathname={pathname} />
                  <div className="ch-canvas" id="ch-canvas">
                    <TopBar item={item} />
                    <RouteFrame routeKey={pathname}>
                      {rebuilt ? children : <NotRebuilt label={item?.label ?? 'This page'} />}
                    </RouteFrame>
                  </div>
                </div>
                <TabBar pathname={pathname} shell={shell} />
              </div>
            </ToastProvider>
          </LazyMotion>
        </NotificationBadgeProvider>
      </GolfUserProvider>
    </SessionActivityProvider>
    </ClubhouseMarker>
  );
}
