'use client';

import { CH_EASE, chSpringCurve } from './motion';

/**
 * Which way a phone navigation moves (native-feel audit 2026-10-08, P1-1 and P1-2). Changing tabs crossfades (the
 * page crossfade, RouteFrame); a drill-in (a row in More, a link from a page into its detail) pushes, as a pushed phone
 * screen does; Back from a pushed page pops. The kind is set on <html> as `data-ch-nav` when the tap or the Back
 * happens, before the router starts the navigation, and shell.css picks the view-transition keyframes by it. RouteFrame
 * clears it once the new page has committed and its transition has played. Desktop never sets it.
 */
export type ChNavKind = 'push' | 'pop' | 'fade';

const strip = (p: string) => (p.split(/[?#]/)[0] ?? p).replace(/\/$/, '') || '/';
const within = (child: string, parent: string) => parent !== '/' && child.startsWith(parent + '/');

/**
 * `from` and `to` are paths; `tabRoots` the phone tab bar's destinations. A tap on the tab bar always crossfades. A
 * Back (or a back link) from a page that is not a tab root pops; Forward onto one pushes. A tap onto a page that is not
 * a tab root pushes, unless it goes up to a page above this one, which pops.
 */
export function classifyNav({ from, to, tabRoots, tabBar = false, back = false }: { from: string; to: string; tabRoots: readonly string[]; tabBar?: boolean; back?: boolean }): ChNavKind {
  const a = strip(from);
  const b = strip(to);
  if (tabBar || a === b) return 'fade';
  const roots = tabRoots.map(strip);
  const isRoot = (p: string) => roots.includes(p);
  if (back) return !isRoot(a) ? 'pop' : !isRoot(b) ? 'push' : 'fade';
  if (within(a, b)) return 'pop';
  return isRoot(b) ? 'fade' : 'push';
}

const PHONE = '(max-width: 820px)';
/** How long a kind waits for its navigation to commit before it lapses (a tap that never navigated). */
const LAPSE_MS = 1500;
/** How long after the commit the kind stays: past the push's 462ms spring. */
const SETTLE_MS = 700;
let shownPath = '';
let lapse = 0;

function tabRoots(): string[] {
  return Array.from(document.querySelectorAll<HTMLAnchorElement>('.ch-tabbar a[href]')).map((a) => new URL(a.href, location.href).pathname);
}

function mark(kind: ChNavKind) {
  const root = document.documentElement;
  window.clearTimeout(lapse);
  if (kind === 'fade' || !window.matchMedia?.(PHONE).matches) root.removeAttribute('data-ch-nav');
  else {
    root.setAttribute('data-ch-nav', kind);
    lapse = window.setTimeout(() => root.removeAttribute('data-ch-nav'), LAPSE_MS);
  }
}

/** The kind currently set, if any. */
export function chNavKind(): ChNavKind {
  const k = typeof document === 'undefined' ? null : document.documentElement.getAttribute('data-ch-nav');
  return k === 'push' || k === 'pop' ? k : 'fade';
}

/** RouteFrame: the page now showing. A change of page lets the kind play out, then clears it. */
export function chNavShown(path: string): void {
  const changed = shownPath !== '' && shownPath !== path;
  shownPath = path;
  if (!changed) return;
  window.clearTimeout(lapse);
  lapse = window.setTimeout(() => document.documentElement.removeAttribute('data-ch-nav'), SETTLE_MS);
}

function onClick(e: MouseEvent) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const el = e.target instanceof Element ? e.target : null;
  if (!el?.closest("[data-ui='clubhouse']")) return;
  // A pushed page's back link (PhoneBar) goes up a level, whether by the router's Back or to its parent.
  if (el.closest('.ch-pbar__back')) return mark(shownPath ? 'pop' : 'fade');
  const a = el.closest<HTMLAnchorElement>('a[href]');
  if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin) return;
  mark(classifyNav({ from: shownPath || location.pathname, to: url.pathname, tabRoots: tabRoots(), tabBar: !!a.closest('.ch-tabbar') }));
}

/** Whether motion is off: the OS setting, or Settings › Animations off (data-motion on the Clubhouse root). */
function motionOff(): boolean {
  return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || !!document.querySelector("[data-ui='clubhouse'][data-motion='off']");
}

/**
 * Back from a pushed page (P1-2). React commits a Back synchronously inside the popstate event, and a synchronous
 * commit never starts a view transition, so the pop is drawn here: a copy of the leaving page, taken before the router
 * acts, slides off to the right edge on top while the page it uncovers comes in from the parallax mark, both on the
 * smooth spring a pushed screen pops on. The copy is inert, hidden from assistive tech, under the bars, and gone when
 * the slide ends. Not when iOS already played the Back with its edge swipe (data-ch-ua-pop), with reduced motion or
 * Animations off, or on desktop. Transform only.
 */
function playPop() {
  const frame = document.getElementById('ch-content');
  const root = frame?.closest<HTMLElement>('.ch-root');
  if (!frame || !root || document.documentElement.hasAttribute('data-ch-ua-pop') || motionOff()) return;
  const box = frame.getBoundingClientRect();
  const page = frame.cloneNode(true) as HTMLElement;
  page.removeAttribute('id');
  for (const el of Array.from(page.querySelectorAll('[id]'))) el.removeAttribute('id');
  // The visible part only: a window-sized layer holding the page at its scrolled place, not the whole page's height.
  Object.assign(page.style, { position: 'absolute', top: `${box.top}px`, left: '0', width: `${box.width}px`, margin: '0' });
  // On <body>, outside the tree React is about to change, with the root's scope (its tokens and fonts).
  const copy = document.createElement('div');
  copy.className = `${root.className} ch-frame-popping`;
  copy.setAttribute('data-ui', 'clubhouse');
  if (root.dataset.motion) copy.dataset.motion = root.dataset.motion;
  copy.setAttribute('aria-hidden', 'true');
  copy.inert = true;
  Object.assign(copy.style, { position: 'fixed', top: '0', left: `${box.left}px`, width: `${box.width}px`, height: `${window.innerHeight}px` });
  copy.appendChild(page);
  document.body.appendChild(copy);
  const curve = chSpringCurve('smooth');
  const timing: KeyframeAnimationOptions = { duration: curve.ms, easing: CSS.supports?.('transition-timing-function', 'linear(0, 1)') ? curve.linear : `cubic-bezier(${CH_EASE.join(', ')})` };
  const parallax = getComputedStyle(document.documentElement).getPropertyValue('--ch-vt-parallax').trim() || '-30%';
  // The next frame, once the router's synchronous commit has put the page beneath in place.
  requestAnimationFrame(() => {
    const under = document.getElementById('ch-content');
    under?.animate?.([{ transform: `translateX(${parallax})` }, { transform: 'none' }], timing);
    const out = copy.animate?.([{ transform: 'none' }, { transform: 'translateX(100%)' }], timing);
    if (!out) return copy.remove();
    out.finished.then(() => copy.remove(), () => copy.remove());
  });
}

function onPopState() {
  if (!shownPath) return;
  const kind = classifyNav({ from: shownPath, to: location.pathname, tabRoots: tabRoots(), back: true });
  // Drawn here rather than by a view transition (playPop), so the keyframes never run as well.
  if (kind === 'pop' && window.matchMedia?.(PHONE).matches) {
    mark('fade');
    playPop();
  } else mark(kind);
}

// Capture, so the kind is on <html> before Next's Link handler and the router's popstate start the navigation.
if (typeof window !== 'undefined') {
  document.addEventListener('click', onClick, true);
  window.addEventListener('popstate', onPopState, true);
}
