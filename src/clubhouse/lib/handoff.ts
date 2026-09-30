'use client';

import { CH_DUR, CH_EASE } from './motion';

/**
 * The curtain between the welcome (or the last onboarding screen) and the
 * dashboard.
 *
 * The fold ends on a still frame: the green frame, the sidebar's green on the
 * left and an empty ivory canvas where the dashboard's canvas will be. The route
 * change after it cannot animate by itself (the welcome unmounts, the dashboard
 * renders on the server), so for the moment in between this draws that same
 * still frame outside React, on top of everything. When the dashboard's frame
 * has mounted and its fonts are in, it fades away over the reveal beat and the
 * dashboard's own first-paint reveal plays underneath. Nothing ever shows an
 * empty page, and nothing jumps: the frame is the same geometry on both sides.
 *
 * If the dashboard never says it is there (a different destination, an error
 * page), the curtain lifts on its own after a few seconds.
 */

const ID = 'ch-handoff-curtain';
const SAFETY_MS = 4000;
const PHONE = '(max-width: 820px)';

const ease = `cubic-bezier(${CH_EASE.join(',')})`;

/** The Clubhouse tokens as resolved on the screen handing over, so the curtain matches it exactly (light or dark). */
function token(from: Element | null, name: string, fallback: string): string {
  if (!from) return fallback;
  const v = getComputedStyle(from).getPropertyValue(name).trim();
  return v || fallback;
}

let safety: number | null = null;

export function dropHandoffCurtain(): void {
  if (typeof document === 'undefined' || document.getElementById(ID)) return;
  const from = document.querySelector('[data-ui="clubhouse"]');
  const frame = token(from, '--ch-frame', '#0a331f');
  const page = token(from, '--ch-bg-page', '#f7f5ef');
  const sidebarW = token(from, '--ch-sidebar-w', '240px');
  const phone = window.matchMedia(PHONE).matches;

  const curtain = document.createElement('div');
  curtain.id = ID;
  curtain.setAttribute('aria-hidden', 'true');
  Object.assign(curtain.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483000',
    pointerEvents: 'none',
    // The sidebar's own gradient, so the sidebar text simply appears on the green it will sit on.
    background: phone ? page : `linear-gradient(180deg, #0e4029, ${frame})`,
  });
  if (!phone) {
    const canvas = document.createElement('div');
    Object.assign(canvas.style, {
      position: 'absolute',
      top: '8px',
      right: '8px',
      bottom: '8px',
      left: sidebarW,
      borderRadius: '14px',
      background: page,
      boxShadow: '0 1px 3px rgb(0 0 0 / 0.25), 0 0 0 1px rgb(0 0 0 / 0.12)',
    });
    curtain.appendChild(canvas);
  }
  document.body.appendChild(curtain);
  safety = window.setTimeout(() => liftHandoffCurtain(), SAFETY_MS);
}

/** Called by the dashboard's frame when it has mounted. A no-op when there is no curtain (every ordinary page load). */
export function liftHandoffCurtain(): void {
  if (typeof document === 'undefined') return;
  const curtain = document.getElementById(ID);
  if (!curtain || curtain.dataset.lifting) return;
  curtain.dataset.lifting = '1';
  if (safety !== null) {
    window.clearTimeout(safety);
    safety = null;
  }
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const go = () => {
    // Two frames: the dashboard's first paint is on screen before the curtain starts to move.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (reduced || typeof curtain.animate !== 'function') {
          curtain.remove();
          return;
        }
        const a = curtain.animate([{ opacity: 1 }, { opacity: 0 }], { duration: CH_DUR.reveal * 1000, easing: ease, fill: 'forwards' });
        a.onfinish = () => curtain.remove();
        a.oncancel = () => curtain.remove();
      }),
    );
  };
  const fonts = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
  // Fonts first, so the text does not swap faces as the curtain lifts; never wait on them more than a moment.
  if (fonts?.ready) Promise.race([fonts.ready, new Promise((r) => setTimeout(r, 600))]).then(go, go);
  else go();
}
