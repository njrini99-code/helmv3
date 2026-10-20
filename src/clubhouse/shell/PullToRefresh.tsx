'use client';

import { useEffect, useRef, useState } from 'react';
import { isNativeApp } from '@/lib/utils/capacitor';
import { haptic } from '../lib/haptics';
import { CH_DUR, chSpringAt } from '../lib/motion';
import { useChReducedMotion } from '../lib/reduced-motion';
import { useRefresh } from '../lib/use-refresh';

/** How far the page comes down before it refreshes, where it rests while the refresh runs, and the most green drawn. */
const PULL_TRIGGER = 64;
const PULL_HOLD = 52;
const PULL_MAX = 180;
/** The spinner shows at least this long, so a refresh that lands at once still reads as one. */
const PULL_MIN_SPIN_MS = CH_DUR.reveal * 1000;
const SPOKES = 8;
const PHONE = '(max-width: 820px)';

/** UIScrollView's rubber band: the farther the finger goes, the less the page follows (0.55 of the screen's height). */
const rubber = (raw: number, dim: number) => (1 - 1 / ((raw * 0.55) / dim + 1)) * dim;
const unrubber = (d: number, dim: number) => (d >= dim ? Infinity : ((d / dim / (1 - d / dim)) * dim) / 0.55);

/** The app on an iPhone (CapacitorProvider marks the body; the bridge says so before it does). Safari keeps its own pull. */
function inIOSApp(): boolean {
  const body = document.body.classList;
  return body.contains('capacitor-ios') || (isNativeApp() && !body.contains('capacitor-android'));
}

/**
 * Whether a touch can start a pull: a phone page at its top, with no screen pushed, no full-screen flow, no sheet and
 * no scroll lock, landing on the page itself (not its bar), outside a text area and outside any inner scroller that
 * is not at its own top.
 */
function canPull(target: EventTarget | null): boolean {
  if (!window.matchMedia(PHONE).matches || window.scrollY > 0) return false;
  const root = document.querySelector('.ch-root');
  if (!root || root.hasAttribute('data-phone-immersive') || root.hasAttribute('data-phone-notabs')) return false;
  if (document.body.style.position === 'fixed' || document.querySelector('dialog[open]')) return false;
  const canvas = document.getElementById('ch-canvas');
  if (!(target instanceof Element) || !canvas?.contains(target)) return false;
  if (target.closest('.ch-topbar, textarea, select, [contenteditable="true"]')) return false;
  for (let el: Element | null = target; el && el !== canvas; el = el.parentElement) if (el.scrollTop > 0) return false;
  return true;
}

type Mode = 'idle' | 'maybe' | 'pull' | 'hold' | 'off';

/**
 * Pull to refresh, in the iPhone app only (CH-1909, owner-approved 2026-10-08). The app has no native refresh control
 * and WKWebView gives a page none, so the page draws its own: at the top of a phone page a downward drag pulls the
 * parchment sheet down off the green chassis, with UIKit's rubber band. Past the trigger the medium haptic fires
 * (CH-1709, D-70) and the page re-reads (`useRefresh`) while the spinner turns on the green. Let go, the sheet settles
 * at the spinner on the smooth spring from the finger's speed, and springs home once the read has landed (CH-1622); a
 * finger can catch it on the way. Mobile Safari keeps its own pull: nothing here runs there. Reduced motion and
 * Animations off settle at once, and the spinner holds still.
 */
export function PullToRefresh({ pathname }: { pathname: string }) {
  const reduced = useChReducedMotion();
  const { refresh, refreshing } = useRefresh();
  const [on, setOn] = useState(false);
  const band = useRef<HTMLDivElement>(null);
  const live = useRef({ reduced, refresh, refreshing });
  const api = useRef<{ landed: () => void; reset: () => void } | null>(null);
  useEffect(() => {
    live.current = { reduced, refresh, refreshing };
  });
  useEffect(() => setOn(inIOSApp()), []);

  useEffect(() => {
    const el = band.current;
    if (!on || !el) return;
    const spin = el.firstElementChild as HTMLElement | null;
    const spokes = spin ? (Array.from(spin.children) as HTMLElement[]) : [];
    const s = {
      mode: 'idle' as Mode,
      d: 0,
      x: 0,
      y: 0,
      base: 0,
      triggered: false,
      triggeredAt: 0,
      step: -1,
      samples: [] as [number, number][],
      parts: [] as HTMLElement[],
      stop: () => {},
      wait: 0,
      moving: false,
    };

    const place = (d: number) => {
      s.d = d;
      el.style.translate = `0 ${(d - PULL_MAX).toFixed(2)}px`;
      if (spin) spin.style.translate = `-50% ${(13 - d / 2).toFixed(2)}px`;
      for (const part of s.parts) part.style.translate = d > 0.05 ? `0 ${d.toFixed(2)}px` : '';
      if (s.triggered) return;
      // The spokes come in clockwise as the sheet comes down, the last of them at the trigger.
      const step = Math.min(SPOKES, Math.floor((d / PULL_TRIGGER) * SPOKES));
      if (step === s.step) return;
      s.step = step;
      spokes.forEach((spoke, i) => {
        spoke.style.opacity = i < step ? '0.9' : '0';
      });
    };
    const rest = () => {
      s.stop();
      s.stop = () => {};
      window.clearTimeout(s.wait);
      place(0);
      for (const part of s.parts) part.style.willChange = '';
      s.parts = [];
      s.mode = 'idle';
      s.triggered = false;
      s.step = -1;
      el.dataset.state = 'rest';
      track();
    };
    /** Springs the sheet to `to` on the smooth spring, from the finger's speed (px/s); at once with motion off. */
    const settle = (to: number, velocity: number, done: () => void) => {
      s.stop();
      const from = s.d;
      if (live.current.reduced || Math.abs(to - from) < 0.5) {
        place(to);
        done();
        return;
      }
      const v0 = velocity / (to - from);
      const t0 = performance.now();
      let frame = 0;
      const step = (now: number) => {
        const t = Math.max(0, now - t0) / 1000;
        const p = chSpringAt('smooth', t, v0);
        if (t > 1.5 || (t > 0.05 && Math.abs(1 - p) < 0.001)) {
          s.stop = () => {};
          place(to);
          done();
          return;
        }
        place(from + (to - from) * p);
        frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
      s.stop = () => cancelAnimationFrame(frame);
    };
    /** Home once the read has landed and the spinner has shown for its minimum. */
    const landed = () => {
      if (s.mode !== 'hold') return;
      window.clearTimeout(s.wait);
      const left = PULL_MIN_SPIN_MS - (performance.now() - s.triggeredAt);
      if (left > 0 || live.current.refreshing) {
        s.wait = window.setTimeout(landed, Math.max(left, 120));
        return;
      }
      s.mode = 'idle';
      settle(0, 0, rest);
    };
    const speed = () => {
      const now = performance.now();
      const recent = s.samples.filter(([t]) => now - t < 80);
      if (recent.length < 2) return 0;
      const [t0, d0] = recent[0]!;
      const [t1, d1] = recent[recent.length - 1]!;
      return t1 > t0 ? ((d1 - d0) / (t1 - t0)) * 1000 : 0;
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || s.mode === 'hold' || s.mode === 'pull') return;
      if (!canPull(e.target)) {
        s.mode = 'off';
        return;
      }
      // Caught on its way home: the finger takes the sheet from where it is.
      s.stop();
      s.base = s.d > 0 ? unrubber(s.d, window.innerHeight) : 0;
      s.x = e.touches[0]!.clientX;
      s.y = e.touches[0]!.clientY;
      s.samples = [];
      s.mode = s.d > 0 ? 'pull' : 'maybe';
    };
    const onMove = (e: TouchEvent) => {
      if (s.mode !== 'maybe' && s.mode !== 'pull') return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (s.mode === 'maybe') {
        if (dx === 0 && dy === 0) return;
        // A scroll down the page, a sideways swipe, or a move iOS is already scrolling stays native.
        if (dy <= 0 || Math.abs(dx) > dy || !e.cancelable || window.scrollY > 0) {
          s.mode = 'off';
          return;
        }
        s.mode = 'pull';
        const canvas = document.getElementById('ch-canvas');
        s.parts = canvas ? (Array.from(canvas.children) as HTMLElement[]).filter((c) => !c.classList.contains('ch-topbar')) : [];
        for (const part of s.parts) part.style.willChange = 'transform';
        el.dataset.state = 'pull';
      }
      if (e.cancelable) e.preventDefault();
      const d = Math.min(PULL_MAX, rubber(Math.max(0, s.base + dy), window.innerHeight));
      place(d);
      s.samples.push([performance.now(), d]);
      if (s.samples.length > 8) s.samples.shift();
      if (!s.triggered && d >= PULL_TRIGGER) {
        s.triggered = true;
        s.triggeredAt = performance.now();
        spokes.forEach((spoke) => {
          spoke.style.opacity = '';
        });
        el.dataset.state = 'spin';
        haptic('commit');
        live.current.refresh();
      }
    };
    const onEnd = () => {
      if (s.mode !== 'pull') {
        if (s.mode !== 'hold') s.mode = 'idle';
        return;
      }
      const v = speed();
      if (s.triggered) {
        s.mode = 'hold';
        settle(PULL_HOLD, v, landed);
      } else {
        s.mode = 'idle';
        settle(0, v, rest);
      }
    };
    // A blocking touchmove listener only while a pull can start or runs: below the top, scrolling never waits on it.
    const track = () => {
      const want = window.scrollY <= 0 || s.mode === 'pull' || s.mode === 'maybe';
      if (want === s.moving) return;
      s.moving = want;
      if (want) document.addEventListener('touchmove', onMove, { passive: false });
      else document.removeEventListener('touchmove', onMove);
    };
    const onScroll = () => {
      // Held for a read, a scroll down the page lets the sheet go home; the read carries on.
      if (s.mode === 'hold' && window.scrollY > 4) {
        s.mode = 'idle';
        settle(0, 0, rest);
      }
      track();
    };

    api.current = {
      landed,
      reset: () => {
        if (s.mode !== 'idle' || s.d > 0) rest();
      },
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onEnd, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    track();
    return () => {
      api.current = null;
      rest();
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
      window.removeEventListener('scroll', onScroll);
    };
  }, [on]);

  // The read landed: a held sheet goes home (after the spinner's minimum).
  useEffect(() => {
    if (!refreshing) api.current?.landed();
  }, [refreshing]);

  // Another page: the sheet is home at once, whatever it was doing.
  useEffect(() => {
    api.current?.reset();
  }, [pathname]);

  if (!on) return null;
  return (
    <div ref={band} className="ch-ptr" aria-hidden="true" data-state="rest" data-ch-code="CH-1909">
      <span className="ch-ptr__spin">
        {Array.from({ length: SPOKES }, (_, i) => (
          <i key={i} />
        ))}
      </span>
    </div>
  );
}
