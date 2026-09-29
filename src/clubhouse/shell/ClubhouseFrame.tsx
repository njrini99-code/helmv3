'use client';

import { LazyMotion, domAnimation } from 'framer-motion';
import { useEffect, type ReactNode } from 'react';
import type { GolfUserData } from '@/contexts/golf-user-context';
import { clubhouseFontVariables } from '../lib/fonts';
import { chTagSession } from '../lib/track';
import { useAppearancePreferences } from '@/hooks/golf/use-appearance-preferences';
import { ToastProvider } from '../ui/Toast';
import type { ChShellData } from '../data/shell';
import { activeNavItem, isRebuilt } from './nav';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { OfflineBanner } from './OfflineBanner';
import { TabBar } from './TabBar';
import { RouteFrame } from './RouteFrame';
import { NotRebuilt } from './NotRebuilt';
import { ClubhouseMarker } from './context';
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/ui.css';
import '../styles/shell.css';
import '../styles/controls.css';

/**
 * The Clubhouse frame, UI only: a green frame with an inset ivory canvas
 * and the sidebar on wide screens, and a full-bleed canvas with a bottom tab
 * bar on phones. ClubhouseShell wraps it with the app's data providers; the
 * dev preview renders it with fixtures.
 */
export function ClubhouseFrame({
  userData,
  shell,
  pathname,
  forceRebuilt = false,
  children,
}: {
  userData: GolfUserData;
  shell: ChShellData;
  pathname: string;
  /** Preview only: render children even on a route that isn't in CH_REBUILT_ROUTES. */
  forceRebuilt?: boolean;
  children: ReactNode;
}) {
  const role = userData.role;
  const item = activeNavItem(pathname, role);
  const rebuilt = forceRebuilt || isRebuilt(pathname, role);
  const { showAnimations } = useAppearancePreferences();
  useEffect(() => chTagSession(), []);

  return (
    <ClubhouseMarker>
      <LazyMotion features={domAnimation} strict>
        {/* The toast region renders inside .ch-root so it gets the Clubhouse tokens and fonts. */}
        <div className={`ch-root ${clubhouseFontVariables}`} data-ui="clubhouse" data-motion={showAnimations ? undefined : 'off'}>
          <ToastProvider>
            <div className="ch-app">
              <Sidebar userData={userData} shell={shell} pathname={pathname} />
              <div className="ch-canvas" id="ch-canvas">
                <TopBar item={item} pathname={pathname} />
                <OfflineBanner />
                <RouteFrame routeKey={pathname}>
                  {rebuilt ? children : <NotRebuilt label={item?.label ?? 'This page'} />}
                </RouteFrame>
              </div>
            </div>
            <TabBar pathname={pathname} shell={shell} role={role} />
          </ToastProvider>
        </div>
      </LazyMotion>
    </ClubhouseMarker>
  );
}
