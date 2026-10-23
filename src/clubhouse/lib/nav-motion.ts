'use client';

import { CH_EASE, chSpringCurve } from './motion';

/**
 * Which way a phone navigation moves (native-feel audit 2026-10-08, P1-1 and P1-2). Changing tabs swaps the page at
 * once (`data-ch-tab`, below; other crossfades are RouteFrame's); a drill-in (a row in More, a link from a page into its detail) pushes, as a pushed phone
 * screen does; Back from a pushed page pops. The kind is set on <html> as `data-ch-nav` when the tap or the Back
 * happens, before the router starts the navigation, and shell.css picks the view-transition keyframes by it. RouteFrame
 * clears it once the new page has committed and its transition has played. Desktop never sets it.
 */
export type ChNavKind = 'push' | 'pop' | 'fade';

const strip = (p: string) => (p.split(/[?#]/)[0] ?? p).replace(/\/$/, '') || '/';
const within = (child: string, parent: string) => parent !== '/' && child.startsWith(parent + '/');

/**
 * `from` and `to` are paths; `tabRoots` the phone's section roots (the section strip's links). A tap on the strip always crossfades. A
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
/**
 * A section switch: a tap on the phone's tab bar or on a desktop sidebar item (motion pass 2026-10-22, mot-03). It
 * swaps the page at once, as a tab bar and a sidebar do on iOS and macOS, rather than fade through: the fade-through's
 * old page fading out before the new one fades in left a beat with neither on screen, every time a coach changed
 * section. Set on <html> as `data-ch-tab` with the kind, on phone and desktop alike; shell.css drops the page's
 * keyframes by it. A navigation onto a route skeleton still holds the old page up (RouteFrame's hold), so a quick load
 * goes straight from the old page to the new one.
 */
const TAB = 'data-ch-tab';

function tabRoots(): string[] {
  return Array.from(document.querySelectorAll<HTMLAnchorElement>('.ch-strip a[href]')).map((a) => new URL(a.href, location.href).pathname);
}

function clear() {
  const root = document.documentElement;
  root.removeAttribute('data-ch-nav');
  root.removeAttribute(TAB);
}

function mark(kind: ChNavKind, tab = false) {
  const root = document.documentElement;
  window.clearTimeout(lapse);
  root.toggleAttribute(TAB, tab);
  if (kind === 'fade' || !window.matchMedia?.(PHONE).matches) root.removeAttribute('data-ch-nav');
  else root.setAttribute('data-ch-nav', kind);
  if (tab || root.hasAttribute('data-ch-nav')) lapse = window.setTimeout(clear, LAPSE_MS);
}

/** Whether a link switches section: the phone's tab bar or the desktop sidebar's main list. */
export function isSectionLink(a: Element): boolean {
  return !!a.closest('.ch-strip, .ch-nav');
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
  lapse = window.setTimeout(clear, SETTLE_MS);
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
  const from = shownPath || location.pathname;
  const tabBar = !!a.closest('.ch-strip');
  // A section item that opens the page already showing (a hash, the same route) is no switch: nothing to swap.
  const tab = isSectionLink(a) && url.pathname.replace(/\/$/, '') !== from.replace(/\/$/, '');
  mark(classifyNav({ from, to: url.pathname, tabRoots: tabRoots(), tabBar }), tab);
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
/**
 * A copy of `el` for the pop's slide without what lies below the window: a block wholly under it can't move anything in
 * view, so it is left out, and the page is cloned and laid out only as far down as the screen reaches. Cloning a long
 * page whole was most of the pop's late start (motion audit 2026-10-12). Blocks are split `depth` levels down; a block
 * that reaches past the window's foot at the last level is copied whole, and everything above the window is kept,
 * since it places what is in view.
 */
export function cloneInView(el: HTMLElement, viewH: number, depth: number): HTMLElement {
  const copy = el.cloneNode(false) as HTMLElement;
  for (const child of Array.from(el.childNodes)) {
    if (!(child instanceof HTMLElement)) {
      copy.appendChild(child.cloneNode(true));
      continue;
    }
    const r = child.getBoundingClientRect();
    const position = getComputedStyle(child).position;
    const inFlow = position !== 'absolute' && position !== 'fixed' && position !== 'sticky';
    if (inFlow && r.height > 0 && r.top > viewH) continue;
    if (depth > 1 && inFlow && r.bottom > viewH) copy.appendChild(cloneInView(child, viewH, depth - 1));
    else copy.appendChild(child.cloneNode(true));
  }
  return copy;
}

/**
 * A push still sliding in when Back comes (motion pass 2026-10-22): how far it had come, from 0 to 1 along its spring,
 * with the page transition ended where it stood so the pop can take over from there. 1 when no push is running. A
 * view transition can't be reversed, and the pop drawn over one still playing showed both at once: the page
 * uncovered slid in from the right as if pushed, under the copy sliding out.
 */
export function takeRunningPush(): number {
  if (typeof document === 'undefined' || typeof document.getAnimations !== 'function') return 1;
  const running = document.getAnimations().filter((a) => {
    const pseudo = (a.effect as KeyframeEffect | null)?.pseudoElement ?? '';
    return pseudo.startsWith('::view-transition') && a.playState === 'running';
  });
  if (!running.length) return 1;
  const incoming = running.find((a) => (a.effect as KeyframeEffect | null)?.pseudoElement === '::view-transition-new(ch-page)');
  const pushing = (incoming as CSSAnimation | undefined)?.animationName === 'ch-vt-push-in';
  const curve = chSpringCurve('smooth');
  const at = pushing ? Number(incoming?.currentTime ?? curve.ms) : curve.ms;
  for (const a of running) a.finish();
  return curve.ease(Math.min(1, Math.max(0, at / curve.ms)));
}

function playPop(from = 1) {
  const frame = document.getElementById('ch-content');
  const root = frame?.closest<HTMLElement>('.ch-root');
  if (!frame || !root || document.documentElement.hasAttribute('data-ch-ua-pop') || motionOff()) return;
  const box = frame.getBoundingClientRect();
  const page = cloneInView(frame, window.innerHeight, 4);
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
    // From where a push still sliding in had it (takeRunningPush): the page goes back the way it came, without a jump.
    const share = Math.min(1, Math.max(0, from));
    under?.animate?.([{ transform: `translateX(calc(${parallax} * ${share}))` }, { transform: 'none' }], timing);
    const out = copy.animate?.([{ transform: `translateX(${((1 - share) * 100).toFixed(2)}%)` }, { transform: 'translateX(100%)' }], timing);
    if (!out) return copy.remove();
    out.finished.then(() => copy.remove(), () => copy.remove());
  });
}

function onPopState() {
  if (!shownPath) return;
  const kind = classifyNav({ from: shownPath, to: location.pathname, tabRoots: tabRoots(), back: true });
  // Drawn here rather than by a view transition (playPop), so the keyframes never run as well.
  if (kind === 'pop' && window.matchMedia?.(PHONE).matches) {
    const from = takeRunningPush();
    mark('fade');
    playPop(from);
  } else mark(kind);
}

// Capture, so the kind is on <html> before Next's Link handler and the router's popstate start the navigation.
if (typeof window !== 'undefined') {
  document.addEventListener('click', onClick, true);
  window.addEventListener('popstate', onPopState, true);
}
