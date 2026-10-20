'use client';

import { m } from 'motion/react';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Ellipsis, Share, type LucideIcon } from 'lucide-react';
import { CH_DUR, CH_EASE, chSpring, chSpringCurve } from '../lib/motion';
import { chSupportsLinear } from '../lib/sheet-drag';
import { useChReducedMotion } from '../lib/reduced-motion';
import { poppedByUA } from '../lib/ua-pop';
import { Icon } from '../ui/Icon';
import { PhoneBarParts, type ChPhoneBarParts } from '../ui/PhoneBar';
import type { ChPhonePushedTop } from './nav';
import { useClubhouseRole } from './context';
import { SectionTrigger } from './section-switch';

/**
 * What a page asks of the phone chrome (owner design, docs/clubhouse/phone/foundation.md).
 *
 *   <PhoneTop back title action />  the top bar's pushed variant (a back link, a centred title
 *                            and one action) in place of the tab root's title and bell
 *   usePhoneImmersive(open)  a pushed screen with a composer, or the round itself, covers the page
 *                            and everything on it: the shell's top bar and the dock go
 *   usePhoneCover(open)      any other pushed screen (a profile, details): the top bar is
 *                            inert under it as well, but the dock keeps its Resume round
 *                            accessory, as iOS keeps its tab bar for a push (`dockKept`)
 *   usePhoneHero(on)         a tab root drawn on the green hero (Home): the top bar turns
 *                            green and shows the team in place of the page title
 *   usePhoneTabsHidden(on)   a full-page form (a create form) hides the tab bar, so its
 *                            submit in the top bar is the only way forward
 *   usePhoneStackHistory(depth, popTo)
 *                            each pushed screen is a history entry, so the iOS edge swipe
 *                            and the browser's back pop it instead of leaving the page
 *   usePhonePushed(present)  a pushed screen is up and not leaving: the page beneath it
 *                            draws back and dims (PhoneUnderlay, CH-1618)
 *
 * Each holds only while the calling component is mounted, and takes hold in the commit that
 * mounts it (a layout effect), so the shell's bars change in the same frame as the page: never
 * a frame of the old page's bar over the new one. Desktop ignores them. Until a pushed page's
 * own top arrives, the shell draws it from the address (`PushedTopStandIn`, CH-1402).
 */
interface Ctx {
  slot: HTMLElement | null;
  setSlot: (el: HTMLElement | null) => void;
  pageTop: number;
  setPageTop: (fn: (n: number) => number) => void;
  /** Of those, the tab roots' own titles (`start`, no action): the bell stays beside them. */
  rootTop: number;
  setRootTop: (fn: (n: number) => number) => void;
  immersive: number;
  setImmersive: (fn: (n: number) => number) => void;
  noTabs: number;
  setNoTabs: (fn: (n: number) => number) => void;
  hero: number;
  setHero: (fn: (n: number) => number) => void;
  pushed: number;
  setPushed: (fn: (n: number) => number) => void;
  /** Pushed screens that cover the page but leave the dock's Resume round accessory (see `usePhoneCover`). */
  covering: number;
  setCovering: (fn: (n: number) => number) => void;
}

const PhoneChromeCtx = createContext<Ctx>({
  slot: null,
  setSlot: () => {},
  pageTop: 0,
  setPageTop: () => {},
  rootTop: 0,
  setRootTop: () => {},
  immersive: 0,
  setImmersive: () => {},
  noTabs: 0,
  setNoTabs: () => {},
  hero: 0,
  setHero: () => {},
  pushed: 0,
  setPushed: () => {},
  covering: 0,
  setCovering: () => {},
});

export function PhoneChromeProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [pageTop, setPageTop] = useState(0);
  const [rootTop, setRootTop] = useState(0);
  const [immersive, setImmersive] = useState(0);
  const [noTabs, setNoTabs] = useState(0);
  const [hero, setHero] = useState(0);
  const [pushed, setPushed] = useState(0);
  const [covering, setCovering] = useState(0);
  const value = useMemo(
    () => ({ slot, setSlot, pageTop, setPageTop, rootTop, setRootTop, immersive, setImmersive, noTabs, setNoTabs, hero, setHero, pushed, setPushed, covering, setCovering }),
    [slot, pageTop, rootTop, immersive, noTabs, hero, pushed, covering],
  );
  return <PhoneChromeCtx.Provider value={value}>{children}</PhoneChromeCtx.Provider>;
}

/**
 * For the shell: whether a page supplies the top bar, whether a pushed screen covers the page (`immersive`: the top bar,
 * the section strip and pull to refresh stand down), and where the page's top bar goes. `dockKept` is true while every
 * covering screen is a plain push (a profile, details): the dock's Resume round accessory stays up over it, as iOS keeps
 * its tab bar for a push that is not immersive. A composer or the round itself hides the dock whole, as before.
 */
export function usePhoneChromeState(): {
  pageTop: boolean;
  rootTitle: boolean;
  immersive: boolean;
  dockKept: boolean;
  noTabs: boolean;
  hero: boolean;
  pushed: boolean;
  setSlot: (el: HTMLElement | null) => void;
} {
  const { pageTop, rootTop, immersive, covering, noTabs, hero, pushed, setSlot } = useContext(PhoneChromeCtx);
  return {
    pageTop: pageTop > 0,
    rootTitle: pageTop > 0 && rootTop >= pageTop,
    immersive: immersive > 0 || covering > 0,
    dockKept: covering > 0 && immersive === 0,
    noTabs: noTabs > 0,
    hero: hero > 0,
    pushed: pushed > 0,
    setSlot,
  };
}

/** While `on`, the phone top bar is the green hero's bar (the v2 phone Home): the team and the bell, on green. */
export function usePhoneHero(on: boolean): void {
  const { setHero } = useContext(PhoneChromeCtx);
  useLayoutEffect(() => {
    if (!on) return;
    setHero((n) => n + 1);
    return () => setHero((n) => n - 1);
  }, [on, setHero]);
}

/** While `on`, the phone tab bar is hidden: a full-page form whose Cancel and submit sit in the top bar. */
export function usePhoneTabsHidden(on: boolean): void {
  const { setNoTabs } = useContext(PhoneChromeCtx);
  useLayoutEffect(() => {
    if (!on) return;
    setNoTabs((n) => n + 1);
    return () => setNoTabs((n) => n - 1);
  }, [on, setNoTabs]);
}

/** While `open`, a pushed screen with a composer (or the round itself) covers the page and its dock: the top bar and the dock go. */
export function usePhoneImmersive(open: boolean): void {
  const { setImmersive } = useContext(PhoneChromeCtx);
  useLayoutEffect(() => {
    if (!open) return;
    setImmersive((n) => n + 1);
    return () => setImmersive((n) => n - 1);
  }, [open, setImmersive]);
}

/**
 * While `open`, a pushed screen covers the page but is not immersive (a profile, details): the shell's top bar and strip
 * are inert under it like any pushed screen, and the dock keeps its Resume round accessory (`dockKept`). A screen that
 * is also immersive wins: the dock goes.
 */
export function usePhoneCover(open: boolean): void {
  const { setCovering } = useContext(PhoneChromeCtx);
  useLayoutEffect(() => {
    if (!open) return;
    setCovering((n) => n + 1);
    return () => setCovering((n) => n - 1);
  }, [open, setCovering]);
}

/** While `present` (a pushed screen is up and not on its way out), the page beneath it draws back and dims (CH-1618). */
export function usePhonePushed(present: boolean): void {
  const { setPushed } = useContext(PhoneChromeCtx);
  useLayoutEffect(() => {
    if (!present) return;
    setPushed((n) => n + 1);
    return () => setPushed((n) => n - 1);
  }, [present, setPushed]);
}

/** How far the page beneath a pushed screen draws back, as a share of the screen's width (a UIKit push moves it about a third). */
export const CH_UNDERLAY_SHIFT = 0.24;

/**
 * What draws back under the pushed screens: inside the canvas, everything that holds no screen (the top bar, the
 * offline banner, and each part of the page beside the screens). The screens are fixed descendants of the page, and a transform on any of their ancestors would pin them to it, so those ancestors stay put and their
 * other children move instead. A dialog and a popover sit in the top layer and keep their place.
 */
export function underlayParts(): HTMLElement[] {
  const screens = Array.from(document.querySelectorAll<HTMLElement>('.ch-pscreen'));
  const parts: HTMLElement[] = [];
  const walk = (el: Element) => {
    for (const child of Array.from(el.children)) {
      if (!(child instanceof HTMLElement) || screens.includes(child) || child.matches('dialog, [popover]')) continue;
      if (screens.some((s) => child.contains(s)) || getComputedStyle(child).display === 'contents') walk(child);
      else parts.push(child);
    }
  };
  const canvas = document.getElementById('ch-canvas');
  if (canvas) walk(canvas);
  return parts;
}

/** Draws `parts` back by `progress` of the shift (0 at rest, 1 drawn back), compositing them while they move. */
export function placeUnderlay(parts: HTMLElement[], progress: number): void {
  const at = progress > 0.0005 ? `${(-CH_UNDERLAY_SHIFT * 100 * progress).toFixed(3)}vw 0` : '';
  for (const el of parts) {
    el.style.translate = at;
    el.style.willChange = at ? 'transform' : '';
  }
}

/** The spring a hand-thrown pop hands on to the page beneath: the throw's speed and rest, in progress of the distance left. */
export interface ChUnderlaySpring {
  /** Progress per second toward the mark at the moment the finger let go. */
  velocity?: number;
  rest?: number;
  hold?: boolean;
}

/**
 * What a swipe-back leaves for the page beneath it: the screen leaves on a spring that starts at the finger's speed, and
 * the page, whose own slide begins a frame later with the screen's exit, takes the same one so the two edges stay
 * together (use-edge-swipe.ts). Taken once, and only if it is fresh.
 */
let releaseSpring: { spring: ChUnderlaySpring; at: number } | null = null;
const RELEASE_TTL_MS = 1000;
export function handUnderlaySpring(spring: ChUnderlaySpring): void {
  releaseSpring = { spring, at: performance.now() };
}
function takeUnderlaySpring(): ChUnderlaySpring | undefined {
  const held = releaseSpring;
  releaseSpring = null;
  return held && performance.now() - held.at < RELEASE_TTL_MS ? held.spring : undefined;
}

/**
 * Slides `parts` to drawn back (1) or rest (0) on the compositor, on the smooth spring the pushed screen rides, from
 * wherever each one is now (mid slide included), so a pop that cuts a push short reverses from there. Returns the
 * running animations; at the end each part is placed for good and its animation let go. `spring` carries a finger's
 * speed into it (a swipe back that was thrown).
 */
export function slideUnderlay(parts: HTMLElement[], to: 0 | 1, running: Animation[] = [], spring?: ChUnderlaySpring): Animation[] {
  const curve = chSupportsLinear() ? chSpringCurve('smooth', spring) : null;
  const timing: KeyframeAnimationOptions = curve
    ? { duration: curve.ms, easing: curve.linear, fill: 'forwards' }
    : { duration: CH_DUR.base * 1000, easing: `cubic-bezier(${CH_EASE.join(',')})`, fill: 'forwards' };
  const target = to ? `${(-CH_UNDERLAY_SHIFT * 100).toFixed(3)}vw 0` : '0px 0px';
  // Read every start before any new animation begins: one style pass, not one per part.
  const from = parts.map((el) => {
    const now = getComputedStyle(el).translate;
    return now && now !== 'none' ? now : '0px 0px';
  });
  // Without WAAPI (an old engine, a test DOM) the page is placed at once.
  if (parts.some((el) => typeof el.animate !== 'function')) {
    for (const old of running) old.cancel?.();
    placeUnderlay(parts, to);
    return [];
  }
  const next = parts.map((el, i) => {
    el.style.willChange = 'transform';
    const anim = el.animate([{ translate: from[i] }, { translate: target }], timing);
    anim.onfinish = () => {
      placeUnderlay([el], to);
      anim.cancel();
    };
    return anim;
  });
  for (const old of running) {
    old.onfinish = null;
    old.cancel();
  }
  return next;
}

/**
 * The page beneath the phone's pushed screens (CH-1618, owner-approved 2026-10-08). As a screen slides in, the page it
 * covers (the shell's bars and the page itself) draws back about a quarter of the width and dims, on the screen's own
 * smooth spring; as the screen pops, the page comes back with it on the same spring (P1-2, 2026-10-08). The two edges
 * move as one, so no gap opens between them. Both run on the compositor (the screen's transform through framer's
 * WAAPI, the page's translate here, the scrim's opacity), so a busy frame while the screen mounts or leaves doesn't
 * hold them back (motion audit 2026-10-12: a 50ms stall mid pop was a visible hitch when they ran frame by frame). A
 * pop that cuts a push short reverses all three from where they are. A Back that iOS animated itself, or a screen gone
 * with its page, puts the page back at once. With reduced motion or Animations off the page holds still under a
 * screen that swaps in at once. Desktop never pushes a screen, so this stays at rest there.
 */
export function PhoneUnderlay() {
  const { pushed } = usePhoneChromeState();
  const reduced = useChReducedMotion();
  const scrim = useRef<HTMLDivElement>(null);
  const parts = useRef<HTMLElement[]>([]);
  const running = useRef<Animation[]>([]);
  const on = pushed && !reduced;
  // Read as the change commits: the pushed screen is in the document until its exit ends, so a screen missing here
  // left with its page (a route change) and has nothing to slide out with.
  const atOnce = !on && (typeof document === 'undefined' || poppedByUA() || !document.querySelector('.ch-pscreen'));
  // In this commit, while the screen that left is still painted over the page, so no frame shows the page undimmed
  // beside it or dimmed without it.
  useLayoutEffect(() => {
    if (!atOnce) return;
    for (const anim of running.current) {
      anim.onfinish = null;
      anim.cancel();
    }
    running.current = [];
    placeUnderlay(parts.current, 0);
    if (scrim.current) scrim.current.style.opacity = '0';
    parts.current = [];
  }, [atOnce]);
  // Gone with the shell: nothing is left drawn back.
  useEffect(
    () => () => {
      for (const anim of running.current) anim.cancel();
      placeUnderlay(parts.current, 0);
    },
    [],
  );
  return (
    <m.div
      ref={scrim}
      className="ch-pscrim"
      aria-hidden="true"
      initial={{ opacity: 0 }}
      animate={{ opacity: on ? 1 : 0 }}
      transition={on || !atOnce ? chSpring('smooth') : { duration: 0 }}
      // The scrim's animation starts in the same frame as the screen's, so the page starts with them.
      onAnimationStart={() => {
        if (atOnce) return;
        const next = underlayParts();
        placeUnderlay(parts.current.filter((el) => !next.includes(el)), 0);
        parts.current = next;
        running.current = slideUnderlay(next, on ? 1 : 0, running.current, on ? undefined : takeUnderlaySpring());
      }}
    />
  );
}

/**
 * The shell top bar's pushed variant, rendered by the page: a back link
 * ("‹ More"), a centred title, and at most one action. Shown below 820px only. CH-1810: the back link is named for
 * where it goes ("Back to More") and takes the bell's place.
 */
export function PhoneTop(props: ChPhoneBarParts) {
  const { slot, setPageTop, setRootTop } = useContext(PhoneChromeCtx);
  // A tab root's own title (`start`, no action) is still a tab root: the bell stays (CLICKABLES gap 1).
  const root = !!props.start && !props.action;
  // In the commit that mounts it, so the shell's stand-in (or the last page's bar) and this one never share a frame.
  useLayoutEffect(() => {
    setPageTop((n) => n + 1);
    if (root) setRootTop((n) => n + 1);
    return () => {
      setPageTop((n) => n - 1);
      if (root) setRootTop((n) => n - 1);
    };
  }, [setPageTop, setRootTop, root]);
  // A start title is its section's name, so it is the section switcher (section-strip.md).
  const title = props.start ? <SectionTrigger>{props.title}</SectionTrigger> : props.title;
  return slot ? createPortal(<PhoneBarParts {...props} title={title} />, slot) : null;
}

/**
 * Back to wherever the user came from, or Home when the page was opened directly (D-41). Once the "‹ More" link on
 * pages opened from the More sheet; the strip made those pages roots (section-strip.md), and the shell's stand-in for
 * a pushed page still uses it.
 */
export function useBackFromMore(): () => void {
  const router = useRouter();
  return useCallback(() => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.push('/golf/dashboard');
  }, [router]);
}

/**
 * The icon action a pushed page's own bar ends with, known from the address alone, so the stand-in can draw it before
 * the page arrives (the bar then changes only in that the key comes alive, nothing appears late). Only an action that is
 * always there is drawn: a form's submit joins the bar with the form (it cannot be pressed before the form exists), and
 * an action that depends on the data (Roster's Invite players) is left to the page. Keep in step with the pages'
 * `PhoneTop`s: StatsPlayerPhone's Share, QualifierDetailPhone's coach-only actions.
 */
export function standInAction(top: ChPhonePushedTop, role: 'coach' | 'player' | null): { icon: LucideIcon; label: string } | null {
  if (top.form) return null;
  if (top.title === 'Player stats') return { icon: Share, label: 'Share' };
  if (top.title === 'Qualifier' && role === 'coach') return { icon: Ellipsis, label: 'Qualifier actions' };
  return null;
}

/**
 * The shell's stand-in for a pushed page's own top (CH-1402), drawn from the address (`phonePushedTop`) while the page
 * loads and in the server's first paint: the same back link, title and action in the same places, so the page's bar
 * replaces it without a jump or anything arriving late. The title is plain text, not a heading: the page brings its own,
 * and the action is a picture of the key (hidden from assistive tech and not pressable: the page's is the real one).
 * Back works while it loads: to wherever the user came from for a page opened from More, to the page above for one below
 * it; a form's is its plain Cancel, which has nothing to lose yet.
 */
export function PushedTopStandIn({ top }: { top: ChPhonePushedTop }) {
  const router = useRouter();
  const backFromMore = useBackFromMore();
  const role = useClubhouseRole();
  const { parent } = top;
  const action = standInAction(top, role);
  return (
    <PhoneBarParts
      back={{ label: top.back, chevron: !top.form, onBack: parent ? () => router.push(parent) : backFromMore }}
      title={top.quiet ? <span className="ch-sr-only">{top.title}</span> : top.title}
      heading={false}
      action={
        action ? (
          <span className="ch-pbar__icon" data-ch-standin="" aria-hidden="true">
            <Icon icon={action.icon} size={20} />
          </span>
        ) : undefined
      }
    />
  );
}

/**
 * Keeps a page's stack of pushed phone screens in step with the browser
 * history (CH-1906): each level pushed is a same-URL entry, so the iOS edge
 * swipe (the WebView's back gesture) and the browser's back pop the top
 * screen instead of leaving the page. Closing a screen from the UI takes its
 * entries back off quietly. `popTo(level)` closes every screen above `level`.
 * Next keeps the page mounted across these entries (checked on :3104,
 * 2026-09-29: no reload, state kept, URL unchanged).
 */
export function usePhoneStackHistory(depth: number, popTo: (level: number) => void): void {
  const pushed = useRef(0);
  const ignore = useRef(0);
  const popRef = useRef(popTo);
  useEffect(() => {
    popRef.current = popTo;
  }, [popTo]);
  useEffect(() => {
    if (depth > pushed.current) {
      for (let level = pushed.current + 1; level <= depth; level++) window.history.pushState({ chPhone: level }, '');
      pushed.current = depth;
    } else if (depth < pushed.current) {
      ignore.current += 1;
      window.history.go(depth - pushed.current);
      pushed.current = depth;
    }
  }, [depth]);
  useEffect(() => {
    const onPop = () => {
      if (ignore.current > 0) {
        ignore.current -= 1;
        return;
      }
      const state = window.history.state as { chPhone?: unknown } | null;
      const level = typeof state?.chPhone === 'number' ? state.chPhone : 0;
      if (level < pushed.current) {
        pushed.current = level;
        popRef.current(level);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
}
