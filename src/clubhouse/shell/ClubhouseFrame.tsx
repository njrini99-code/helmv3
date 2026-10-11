'use client';

import { LazyMotion } from 'motion/react';
import { loadMaxFeatures } from '@/lib/motion/load-features';
import { useEffect, useState, type ReactNode } from 'react';
import { useChPhone } from '../lib/use-phone';
import { useChDynamicType } from '../lib/dynamic-type';
import type { GolfUserData } from '@/contexts/golf-user-context';
import { clubhouseFontVariables } from '../lib/fonts';
import { chTagSession } from '../lib/track';
import { liftHandoffCurtain } from '../lib/handoff';
import { useAppearancePreferences } from '@/hooks/golf/use-appearance-preferences';
import { ToastProvider } from '../ui/Toast';
import type { ChShellData } from '../data/shell';
import { activeNavItem, isRebuilt, phoneFullScreen, phonePushedTop, routeLabel } from './nav';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { OfflineBanner } from './OfflineBanner';
import { TabBar } from './TabBar';
import { RouteFrame } from './RouteFrame';
import { PullToRefresh } from './PullToRefresh';
import { teamSwitchFor } from './team-switch';
import { NotRebuilt } from './NotRebuilt';
import { ClubhouseMarker } from './context';
import { LightProvider } from './light';
import { DockProvider, PhoneDock } from './Dock';
import { AskSheetProvider } from './AskSheet';
import { CrumbProvider } from './crumbs';
import { PhoneChromeProvider, PhoneUnderlay, usePhoneChromeState } from './phone-chrome';
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/ui.css';
import '../styles/shell.css';
import '../styles/controls.css';
import { useCanvasSmoothScroll } from '../lib/smooth-scroll';

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
  search = '',
  forceRebuilt = false,
  lightAt = null,
  children,
}: {
  userData: GolfUserData;
  shell: ChShellData;
  pathname: string;
  /** The address's query (`section=team`), for the phone bars it decides: a Settings section, a coach's player on Stats. */
  search?: string;
  /** Preview only: render children even on a route that isn't in CH_REBUILT_ROUTES. */
  forceRebuilt?: boolean;
  /** Preview only: hold the global light at this instant (?at=). */
  lightAt?: number | null;
  children: ReactNode;
}) {
  const role = userData.role;
  const teamSwitch = teamSwitchFor(userData);
  const item = activeNavItem(pathname, role);
  const rebuilt = forceRebuilt || isRebuilt(pathname, role);
  // A pushed page's bar, drawn by the shell until the page's own arrives (CH-1402); a page not rebuilt keeps the plain bar.
  // A full-screen flow hides the tab bar from its first frame, as its page will.
  const pushed = rebuilt ? phonePushedTop(pathname, role, search ? new URLSearchParams(search) : null) : null;
  const fullScreen = rebuilt && phoneFullScreen(pathname, role);
  const { showAnimations } = useAppearancePreferences();
  // Smooth wheel scrolling on the desktop canvas (off on a phone, with reduced motion and with Animations off).
  useCanvasSmoothScroll();
  useEffect(() => chTagSession(), []);
  // Arriving from the welcome or onboarding: the curtain holding the fold's last frame lifts now the frame is here.
  useEffect(() => liftHandoffCurtain(), []);

  return (
    <ClubhouseMarker role={role}>
      {/* The animation features (domMax, for layoutId slides) load in their own chunk, after first paint (D-25). */}
      <LazyMotion features={loadMaxFeatures} strict>
        <LightProvider course={shell.course ?? null} timeZone={shell.timezone ?? null} at={lightAt}>
          <PhoneChromeProvider>
            {/* The toast region renders inside .ch-root so it gets the Clubhouse tokens and fonts. */}
            <FrameRoot motionOff={!showAnimations} fullScreen={fullScreen} homeRoot={rebuilt && pathname.replace(/\/$/, '') === '/golf/dashboard'}>
              <ToastProvider scope={userData.teamId ?? ''}>
                <CrumbProvider>
                  <AskSheetProvider pathname={pathname} search={search} enabled={shell.askAvailable ?? false}>
                    <DockProvider>
                      {/* The first Tab on any page: jump past the navigation to the page itself (CH-1607: it slides into view). */}
                      <a className="ch-skip" href="#ch-content" data-ch-code="CH-1801">
                        Skip to content
                      </a>
                      <div className="ch-app">
                        <Sidebar userData={userData} shell={shell} pathname={pathname} teamSwitch={teamSwitch} />
                        <div className="ch-canvas" id="ch-canvas">
                          <TopBar item={item} pathname={pathname} teamName={userData.teamName ?? null} pushed={pushed} />
                          <OfflineBanner />
                          {/* A new team is a new page: the route remounts, so nothing the old team's screen held (a search, an open panel, a live feed) carries over. */}
                          <RouteFrame routeKey={`${pathname}\u0000${userData.teamId ?? ''}`}>
                            {rebuilt ? children : <NotRebuilt label={item?.label ?? routeLabel(pathname) ?? 'This page'} />}
                          </RouteFrame>
                          {/* The phone dock's height, so a page's last row clears it (P001-C1). */}
                          <div className="ch-dock-spacer" aria-hidden="true" />
                        </div>
                      </div>
                      <PhoneDock round={shell.roundInProgress ?? null} pathname={pathname} />
                      <TabBar pathname={pathname} shell={shell} role={role} user={{ name: userData.name, teamName: userData.teamName ?? null }} teamSwitch={teamSwitch} />
                      {/* The iPhone app's pull to refresh (CH-1909); nothing in a browser. */}
                      <PullToRefresh pathname={pathname} />
                    </DockProvider>
                  </AskSheetProvider>
                </CrumbProvider>
              </ToastProvider>
            </FrameRoot>
          </PhoneChromeProvider>
        </LightProvider>
      </LazyMotion>
    </ClubhouseMarker>
  );
}

/** `.ch-root`, marked while a pushed phone screen covers the page, so toasts sit above its composer instead of the hidden tab bar. */
function FrameRoot({ motionOff, fullScreen, homeRoot, children }: { motionOff: boolean; fullScreen: boolean; homeRoot: boolean; children: ReactNode }) {
  const { immersive, noTabs, hero: pageHero } = usePhoneChromeState();
  // P001-D4: Home's phone bar is the green hero's from the server's first paint (the device's last layout, F-36), not
  // "Home" until the page's usePhoneHero lands after hydration. From then on the page's own flag decides.
  const phone = useChPhone();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const hero = pageHero || (!hydrated && phone && homeRoot);
  usePhoneEdges(hero);
  useChDynamicType();
  return (
    <div
      className={`ch-root ${clubhouseFontVariables}`}
      data-ui="clubhouse"
      data-motion={motionOff ? 'off' : undefined}
      data-phone-immersive={immersive ? '' : undefined}
      data-phone-notabs={noTabs || fullScreen ? '' : undefined}
      data-phone-hero={hero ? '' : undefined}
    >
      {children}
      {/* The dim over the page while a phone screen is pushed, and what draws the page back with it (CH-1618). */}
      <PhoneUnderlay />
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
    // A theme change (Settings > Appearance, or the system flipping) changes the tokens read above. useGolfTheme rewrites
    // the theme-color tag in the same task, so this runs a frame later and has the last word on the phone.
    let frame = 0;
    const themed = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(sync);
    });
    themed.observe(html, { attributes: true, attributeFilter: ['data-fw-theme'] });
    return () => {
      phone.removeEventListener('change', sync);
      themed.disconnect();
      cancelAnimationFrame(frame);
      restore?.();
    };
  }, [hero]);
}
