'use client';

import { useEffect, type RefObject } from 'react';
import { KB_LIFT_QUERY } from './auth-motion';

/**
 * The phone sheet over the keyboard (auth.css, `data-kb` on the frame): while a field in the panel is typed in, the sheet
 * rises to just under the status bar, so the fields and Sign in sit above the keyboard, and it settles back when the
 * keyboard goes. It rises when a field takes focus, not as the finger lands: iOS focuses the field under the finger as it
 * lifts, so a sheet already moving carried Password out from under the tap (2026-10-14). A touch screen at phone width only.
 */
export function useKeyboardLift(panel: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = panel.current;
    const root = el?.closest<HTMLElement>('.ch-au');
    if (!el || !root || !window.matchMedia?.(KB_LIFT_QUERY).matches) return;
    const typing = (t: EventTarget | null) => t instanceof HTMLInputElement && el.contains(t);
    let settle = 0;
    // Rises on focus, never on the touch: iOS focuses the field the finger lifts over, so a sheet that starts moving on
    // pointerdown carries the field out from under the tap and Password never takes focus. Settles back once no field
    // has focus: moving from Email to Password blurs one and focuses the other in a turn.
    // Going down, the move is a CSS animation held at its first frame until that frame is on screen: the change lands in
    // a busy frame (the keyboard going), and the move had already covered 216px of its 290 by the first frame anyone saw
    // (WebKit video, 2026-10-15). Going up it starts at once, with the keyboard: held, it began two frames after iOS's
    // keyboard had started to rise (owner, 2026-10-16: "a slight delay with the animation right when you enter").
    let hold = 0;
    const set = (kb: 'up' | 'down') => {
      cancelAnimationFrame(hold);
      root.dataset.kb = kb;
      if (kb === 'up') {
        el.removeAttribute('data-ch-hold');
        return;
      }
      el.setAttribute('data-ch-hold', '');
      hold = requestAnimationFrame(() => {
        hold = requestAnimationFrame(() => el.removeAttribute('data-ch-hold'));
      });
    };
    // Sign in pressed: the field blurs and the keyboard goes, but the sheet stays where it is while the attempt runs, so a
    // sign-in leaves from there in one move (it dropped with the keyboard, waited on the server, then left: three moves),
    // and a refusal, which puts the cursor back in a field, never drops it and lifts it again.
    let pressedAt = 0;
    const press = (e: Event) => {
      if (e.target instanceof Element && e.target.closest('button[type="submit"]')) pressedAt = Date.now();
    };
    const attempting = () =>
      Date.now() - pressedAt < 600 || !!el.querySelector('button[type="submit"][aria-busy="true"]') || root.dataset.phase === 'opening';
    const up = (e: Event) => {
      if (!typing(e.target)) return;
      window.clearTimeout(settle);
      if (root.dataset.kb !== 'up') set('up');
    };
    const out = () => {
      window.clearTimeout(settle);
      const check = () => {
        if (typing(document.activeElement) || root.dataset.kb !== 'up') return;
        if (attempting()) settle = window.setTimeout(check, 150);
        else set('down');
      };
      settle = window.setTimeout(check, 60);
    };
    el.addEventListener('focusin', up);
    el.addEventListener('focusout', out);
    el.addEventListener('pointerdown', press);
    return () => {
      window.clearTimeout(settle);
      cancelAnimationFrame(hold);
      el.removeAttribute('data-ch-hold');
      el.removeEventListener('focusin', up);
      el.removeEventListener('focusout', out);
      el.removeEventListener('pointerdown', press);
      delete root.dataset.kb;
    };
  }, [panel]);
}
