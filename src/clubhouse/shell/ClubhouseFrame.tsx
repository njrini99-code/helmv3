'use client';

import { LazyMotion } from 'motion/react';
import { createContext, memo, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useChPhone } from '../lib/use-phone';
import { useChDynamicType } from '../lib/dynamic-type';
import type { GolfUserData } from '@/contexts/golf-user-context';
import { clubhouseFontVariables } from '../lib/fonts';
import { chTagSession } from '../lib/track';
import { chLoadMotionFeatures } from '../lib/motion-features';
import { chKeepFocusThroughDisable } from '../lib/focus-keeper';
import { liftHandoffCurtain } from '../lib/handoff';
import { useAppearancePreferences } from '@/hooks/golf/use-appearance-preferences';
import { ToastProvider } from '../ui/Toast';
import type { ChShellData } from '../data/shell';
import { activeNavItem, isAliased, isRebuilt, phoneFullScreen, phonePushedTop, routeLabel } from './nav';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { OfflineBanner } from './OfflineBanner';
import { AccountSheet } from './AccountSheet';
import { SectionStrip } from './SectionStrip';
import { SectionSwitchProvider, useSectionSwitch } from './section-switch';
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
import { useCanvasSmoothScroll, useSmoothWheelEverywhere } from '../lib/smooth-scroll';

/** Set under ChMotionFeatures, so a frame rendered inside it doesn't render a second one. */
const ChMotionScope = createContext(false);
/** What ChMotionFeatures wraps, handed past its memoized LazyMotion. */
const ChMotionChildren = createContext<ReactNode>(null);

function ChMotionSlot() {
  return <>{useContext(ChMotionChildren)}</>;
}

/** Takes no props, so nothing above renders it again: LazyMotion renders once (and once more as the features load). */
const ChMotionProvider = memo(function ChMotionProvider() {
  return (
    <LazyMotion features={chLoadMotionFeatures} strict>
      <ChMotionScope.Provider value>
        <ChMotionSlot />
      </ChMotionScope.Provider>
    </LazyMotion>
  );
});

/**
 * The animation features (domMax, for drag and layout: the calendar's drag, the toasts' layout) for every `m` component,
 * loaded in their own chunk after first paint (D-25) and retried when that load fails (A-01).
 *
 * LazyMotion gives its context a new object each time it renders, and every `m` component under it renders again with
 * it, memo or not. Rendered inside the frame (which renders on every section switch) or by a shell a server action's
 * refresh renders again (marking a notification read), that re-rendered every `m` component, the notification drop's
 * swipeable cards among them, each having Motion measure the page as it arrived: 15 to 25ms more a switch for a player
 * with unread notifications (WebKit, production build, 2026-10-15). So LazyMotion sits in a component that takes no
 * props, and what it wraps reaches it by context.
 */
export function ChMotionFeatures({ children }: { children: ReactNode }) {
  return (
    <ChMotionChildren.Provider value={children}>
      <ChMotionProvider />
    </ChMotionChildren.Provider>
  );
}

/**
 * The Clubhouse frame, UI only: a green frame with an inset ivory canvas
 * and the sidebar on wide screens, and a full-bleed canvas on phones, where the
 * section's name in the top bar opens the section strip (section-strip.md).
 * ClubhouseShell wraps it with the app's data providers; the dev preview
 * renders it with fixtures.
 */
/** The query value that picks a screen on its route (Stats' and CoachHelm's `?player=`), for RouteFrame's scroll memory. */
function screenParam(search: string): string {
  return search ? (new URLSearchParams(search).get('player') ?? '') : '';
}

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
  // …and every other box that scrolls: lists, panes, a modal's body, a sheet.
  useSmoothWheelEverywhere();
  useEffect(() => chTagSession(), []);
  // Arriving from the welcome or onboarding: the curtain holding the fold's last frame lifts now the frame is here.
  useEffect(() => liftHandoffCurtain(), []);
  useReloadFromBackForwardCache();

  // The live shell renders the animation features above the frame (ChMotionFeatures, below); a preview renders the frame alone.
  const scoped = useContext(ChMotionScope);
  const frame = (
    <ClubhouseMarker role={role}>
      <LightProvider course={shell.course ?? null} timeZone={shell.timezone ?? null} at={lightAt}>
        <PhoneChromeProvider>
          <SectionSwitchProvider pathname={pathname} role={role} shell={shell}>
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
                          <RouteFrame routeKey={`${pathname}\u0000${userData.teamId ?? ''}`} scrollKey={`${pathname}\u0000${userData.teamId ?? ''}\u0000${screenParam(search)}`}>
                            {rebuilt ? (
                              children
                            ) : (
                              <>
                                <NotRebuilt label={item?.label ?? routeLabel(pathname) ?? 'This page'} />
                                {/* An old address Clubhouse moved redirects from inside its segment, and that redirect fires
                                    only once the segment renders: dropped, the page stood on "not rebuilt" (2026-10-14). */}
                                {isAliased(pathname) && <div hidden>{children}</div>}
                              </>
                            )}
                          </RouteFrame>
                          {/* The phone dock's height, so a page's last row clears it (P001-C1). */}
                          <div className="ch-dock-spacer" aria-hidden="true" />
                        </div>
                      </div>
                      <PhoneDock round={shell.roundInProgress ?? null} pathname={pathname} />
                      <SectionStrip pathname={pathname} role={role} user={{ name: userData.name }} />
                      <AccountSheet pathname={pathname} role={role} user={{ name: userData.name, teamName: userData.teamName ?? null }} teamSwitch={teamSwitch} />
                      {/* The iPhone app's pull to refresh (CH-1909); nothing in a browser. */}
                      <PullToRefresh pathname={pathname} />
                    </DockProvider>
                  </AskSheetProvider>
                </CrumbProvider>
              </ToastProvider>
            </FrameRoot>
          </SectionSwitchProvider>
        </PhoneChromeProvider>
      </LightProvider>
    </ClubhouseMarker>
  );
  return scoped ? frame : <ChMotionFeatures>{frame}</ChMotionFeatures>;
}

/** `.ch-root`, marked while a pushed phone screen covers the page, so toasts sit above its composer instead of the hidden tab bar. */
function FrameRoot({ motionOff, fullScreen, homeRoot, children }: { motionOff: boolean; fullScreen: boolean; homeRoot: boolean; children: ReactNode }) {
  const { immersive, noTabs, hero: pageHero } = usePhoneChromeState();
  const sections = useSectionSwitch();
  // P001-D4: Home's phone bar is the green hero's from the server's first paint (the device's last layout, F-36), not
  // "Home" until the page's usePhoneHero lands after hydration. From then on the page's own flag decides.
  const phone = useChPhone();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const hero = pageHero || (!hydrated && phone && homeRoot);
  usePhoneEdges(hero);
  useChDynamicType();
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => (rootRef.current ? chKeepFocusThroughDisable(rootRef.current) : undefined), []);
  return (
    <div
      ref={rootRef}
      className={`ch-root ${clubhouseFontVariables}`}
      data-ui="clubhouse"
      data-motion={motionOff ? 'off' : undefined}
      data-phone-immersive={immersive ? '' : undefined}
      data-phone-notabs={noTabs || fullScreen ? '' : undefined}
      data-phone-hero={hero ? '' : undefined}
      data-strip={sections?.open ? 'open' : undefined}
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
/** The two edge colours, read once per theme. */
let edgeCache: { theme: string; page: string; green: string } | null = null;

/**
 * The page and green tokens, as the theme has them. They change only with the theme, so they are read once per theme:
 * read on every hero change, getComputedStyle re-styled the page that had just arrived inside the section switch (25ms
 * of a switch to My stats' 125ms of script at 4x CPU, Chromium, production build, 2026-10-15).
 */
function edgeTokens(root: Element): { page: string; green: string } {
  const theme = `${document.documentElement.getAttribute('data-fw-theme') ?? ''}|${window.matchMedia('(prefers-color-scheme: dark)').matches}`;
  if (edgeCache?.theme !== theme) {
    const css = getComputedStyle(root);
    edgeCache = { theme, page: css.getPropertyValue('--ch-bg-page').trim(), green: css.getPropertyValue('--ch-green-800').trim() };
  }
  return edgeCache;
}

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
      const { page, green } = edgeTokens(root);
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

/**
 * A page Safari restores from its back-forward cache (Back after leaving the app, or after signing out) comes back with
 * its memory: the session it was drawn for and the phone tabs the router holds, fetched whole ahead (use-prefetch-tabs).
 * It loads again instead, so the server decides what it shows (security review, 2026-10-16).
 */
function useReloadFromBackForwardCache(): void {
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) window.location.reload();
    };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);
}
