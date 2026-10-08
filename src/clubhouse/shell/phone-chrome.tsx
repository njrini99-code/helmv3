'use client';

import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { PhoneBarParts, type ChPhoneBarParts } from '../ui/PhoneBar';
import type { ChPhonePushedTop } from './nav';

/**
 * What a page asks of the phone chrome (owner design, docs/clubhouse/phone/foundation.md).
 *
 *   <PhoneTop back title action />  the top bar's pushed variant (a back link, a centred title
 *                            and one action) in place of the tab root's title and bell
 *   usePhoneImmersive(open)  a pushed screen (a thread, details) covers the page, so the
 *                            shell's top bar and tab bar go inert
 *   usePhoneHero(on)         a tab root drawn on the green hero (Home): the top bar turns
 *                            green and shows the team in place of the page title
 *   usePhoneTabsHidden(on)   a full-page form (a create form) hides the tab bar, so its
 *                            submit in the top bar is the only way forward
 *   usePhoneStackHistory(depth, popTo)
 *                            each pushed screen is a history entry, so the iOS edge swipe
 *                            and the browser's back pop it instead of leaving the page
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
});

export function PhoneChromeProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [pageTop, setPageTop] = useState(0);
  const [rootTop, setRootTop] = useState(0);
  const [immersive, setImmersive] = useState(0);
  const [noTabs, setNoTabs] = useState(0);
  const [hero, setHero] = useState(0);
  const value = useMemo(
    () => ({ slot, setSlot, pageTop, setPageTop, rootTop, setRootTop, immersive, setImmersive, noTabs, setNoTabs, hero, setHero }),
    [slot, pageTop, rootTop, immersive, noTabs, hero],
  );
  return <PhoneChromeCtx.Provider value={value}>{children}</PhoneChromeCtx.Provider>;
}

/** For the shell: whether a page supplies the top bar, whether a pushed screen covers the page, and where the page's top bar goes. */
export function usePhoneChromeState(): { pageTop: boolean; rootTitle: boolean; immersive: boolean; noTabs: boolean; hero: boolean; setSlot: (el: HTMLElement | null) => void } {
  const { pageTop, rootTop, immersive, noTabs, hero, setSlot } = useContext(PhoneChromeCtx);
  return { pageTop: pageTop > 0, rootTitle: pageTop > 0 && rootTop >= pageTop, immersive: immersive > 0, noTabs: noTabs > 0, hero: hero > 0, setSlot };
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

/** While `open`, a pushed screen covers the page, so the shell's top bar and tab bar go inert. */
export function usePhoneImmersive(open: boolean): void {
  const { setImmersive } = useContext(PhoneChromeCtx);
  useLayoutEffect(() => {
    if (!open) return;
    setImmersive((n) => n + 1);
    return () => setImmersive((n) => n - 1);
  }, [open, setImmersive]);
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
  return slot ? createPortal(<PhoneBarParts {...props} />, slot) : null;
}

/**
 * The "‹ More" back link on a page opened from the More sheet: it returns to
 * wherever the user came from (D-41), or Home when the page was opened directly.
 */
export function useBackFromMore(): () => void {
  const router = useRouter();
  return useCallback(() => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.push('/golf/dashboard');
  }, [router]);
}

/**
 * The shell's stand-in for a pushed page's own top (CH-1402), drawn from the address (`phonePushedTop`) while the page
 * loads and in the server's first paint: the same back link and title in the same places, so the page's bar replaces
 * it without a jump. The title is plain text, not a heading: the page brings its own. Back works while it loads: to
 * wherever the user came from for a page opened from More, to the page above for one below it; a form's is its plain
 * Cancel, which has nothing to lose yet.
 */
export function PushedTopStandIn({ top }: { top: ChPhonePushedTop }) {
  const router = useRouter();
  const backFromMore = useBackFromMore();
  const { parent } = top;
  return (
    <PhoneBarParts
      back={{ label: top.back, chevron: !top.form, onBack: parent ? () => router.push(parent) : backFromMore }}
      title={top.quiet ? <span className="ch-sr-only">{top.title}</span> : top.title}
      heading={false}
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
