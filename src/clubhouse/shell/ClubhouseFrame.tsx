'use client';

import { LazyMotion } from 'framer-motion';
import { loadMaxFeatures } from '@/lib/motion/load-features';
import { useEffect, type ReactNode } from 'react';
import type { GolfUserData } from '@/contexts/golf-user-context';
import { clubhouseFontVariables } from '../lib/fonts';
import { chTagSession } from '../lib/track';
import { liftHandoffCurtain } from '../lib/handoff';
import { useAppearancePreferences } from '@/hooks/golf/use-appearance-preferences';
import { ToastProvider } from '../ui/Toast';
import type { ChShellData } from '../data/shell';
import { activeNavItem, isRebuilt, routeLabel } from './nav';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { OfflineBanner } from './OfflineBanner';
import { TabBar } from './TabBar';
import { RouteFrame } from './RouteFrame';
import { teamSwitchFor } from './team-switch';
import { NotRebuilt } from './NotRebuilt';
import { ClubhouseMarker } from './context';
import { CrumbProvider } from './crumbs';
import { PhoneChromeProvider, usePhoneChromeState } from './phone-chrome';
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
  const teamSwitch = teamSwitchFor(userData);
  const item = activeNavItem(pathname, role);
  const rebuilt = forceRebuilt || isRebuilt(pathname, role);
  const { showAnimations } = useAppearancePreferences();
  useEffect(() => chTagSession(), []);
  // Arriving from the welcome or onboarding: the curtain holding the fold's last frame lifts now the frame is here.
  useEffect(() => liftHandoffCurtain(), []);

  return (
    <ClubhouseMarker role={role}>
      {/* The animation features (domMax, for layoutId slides) load in their own chunk, after first paint (D-25). */}
      <LazyMotion features={loadMaxFeatures} strict>
        <PhoneChromeProvider>
          {/* The toast region renders inside .ch-root so it gets the Clubhouse tokens and fonts. */}
          <FrameRoot motionOff={!showAnimations}>
            <ToastProvider scope={userData.teamId ?? ''}>
              <CrumbProvider>
                {/* The first Tab on any page: jump past the navigation to the page itself (CH-1607: it slides into view). */}
                <a className="ch-skip" href="#ch-content" data-ch-code="CH-1801">
                  Skip to content
                </a>
                <div className="ch-app">
                  <Sidebar userData={userData} shell={shell} pathname={pathname} teamSwitch={teamSwitch} />
                  <div className="ch-canvas" id="ch-canvas">
                    <TopBar item={item} pathname={pathname} teamName={userData.teamName ?? null} />
                    <OfflineBanner />
                    {/* A new team is a new page: the route remounts, so nothing the old team's screen held (a search, an open panel, a live feed) carries over. */}
                    <RouteFrame routeKey={`${pathname}\u0000${userData.teamId ?? ''}`}>
                      {rebuilt ? children : <NotRebuilt label={item?.label ?? routeLabel(pathname) ?? 'This page'} />}
                    </RouteFrame>
                  </div>
                </div>
                <TabBar pathname={pathname} shell={shell} role={role} user={{ name: userData.name, teamName: userData.teamName ?? null }} teamSwitch={teamSwitch} />
              </CrumbProvider>
            </ToastProvider>
          </FrameRoot>
        </PhoneChromeProvider>
      </LazyMotion>
    </ClubhouseMarker>
  );
}

/** `.ch-root`, marked while a pushed phone screen covers the page, so toasts sit above its composer instead of the hidden tab bar. */
function FrameRoot({ motionOff, children }: { motionOff: boolean; children: ReactNode }) {
  const { immersive, noTabs, hero } = usePhoneChromeState();
  usePhoneEdges(hero);
  return (
    <div
      className={`ch-root ${clubhouseFontVariables}`}
      data-ui="clubhouse"
      data-motion={motionOff ? 'off' : undefined}
      data-phone-immersive={immersive ? '' : undefined}
      data-phone-notabs={noTabs ? '' : undefined}
      data-phone-hero={hero ? '' : undefined}
    >
      {children}
    </div>
  );
}


/**
 * The phone's top and bottom edges carry the app's colour (F-49): green under the status bar on the
 * hero Home, the phone ivory elsewhere. theme-color tints the browser chrome; the html background
 * is what newer Safari samples and what the rubber band shows. Both are put back on unmount.
 */
function usePhoneEdges(hero: boolean) {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const phone = window.matchMedia('(max-width: 820px)');
    let restore: (() => void) | undefined;
    const sync = () => {
      restore?.();
      restore = undefined;
      if (!phone.matches) return;
      const root = document.querySelector('.ch-root[data-ui="clubhouse"]');
      if (!root) return;
      const css = getComputedStyle(root);
      const page = css.getPropertyValue('--ch-bg-page').trim();
      const green = css.getPropertyValue('--ch-green-800').trim();
      let meta = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      const created = !meta;
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'theme-color';
        document.head.appendChild(meta);
      }
      const before = meta.content;
      const was = { html: html.style.backgroundColor, body: body.style.backgroundColor };
      html.style.backgroundColor = hero ? green : page;
      body.style.backgroundColor = page;
      meta.content = hero ? green : page;
      const tag = meta;
      restore = () => {
        html.style.backgroundColor = was.html;
        body.style.backgroundColor = was.body;
        if (created) tag.remove();
        else tag.content = before;
      };
    };
    sync();
    phone.addEventListener('change', sync);
    return () => {
      phone.removeEventListener('change', sync);
      restore?.();
    };
  }, [hero]);
}
