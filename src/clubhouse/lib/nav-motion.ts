'use client';

import { CH_EASE, CH_FADE_MS, chSpringCurve } from './motion';
import { chMotionModeNow } from './reduced-motion';
import { markHandPop } from './ua-pop';

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
let shownKey = '';
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
  dropHeld();
}

function mark(kind: ChNavKind, tab = false) {
  const root = document.documentElement;
  window.clearTimeout(lapse);
  root.toggleAttribute(TAB, tab);
  // Under Reduce Motion a drill-in or a Back crossfades instead of sliding (owner decision 2, OQ-15; shell.css).
  if (kind === 'fade' || !window.matchMedia?.(PHONE).matches || chMotionModeNow() !== 'full') root.removeAttribute('data-ch-nav');
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

/**
 * RouteFrame: the page now showing, and its full key (the team is part of it). A change of page lets the kind play out,
 * then clears it. A drill-in that held a copy of the page it left slides in over it here (playPush), in the commit,
 * before the first frame. A team switch on the same page drops every copy kept beneath.
 */
export function chNavShown(path: string, key: string = path): void {
  const before = shownPath;
  const changed = before !== '' && before !== path;
  if (!changed && shownKey !== '' && key !== shownKey) dropUnders();
  shownPath = path;
  shownKey = key;
  if (!changed) return;
  const copy = held;
  held = null;
  if (copy && copy.from === before && chNavKind() === 'push') playPush(before, path, copy.layer);
  else {
    copy?.layer.remove();
    settleUnders(path);
  }
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
  const kind = classifyNav({ from, to: url.pathname, tabRoots: tabRoots(), tabBar });
  mark(kind, tab);
  holdForPush(from);
}


/**
 * Back from a pushed page (P1-2). React commits a Back synchronously inside the popstate event, and a synchronous
 * commit never starts a view transition, so the pop is drawn here: a copy of the leaving page, taken before the router
 * acts, slides off to the right edge on top while the page it uncovers comes in from the parallax mark, both on the
 * smooth spring a pushed screen pops on. The copy is inert, hidden from assistive tech, under the bars, and gone when
 * the slide ends. Not when iOS already played the Back with its edge swipe (data-ch-ua-pop), with Animations off, or on
 * desktop. Transform only; under the OS Reduce Motion setting the copy fades out over the quick beat instead, in opacity
 * only, and the page beneath stays still (owner decision 2, 2026-10-24, OQ-15).
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
  if (typeof document === 'undefined') return 1;
  // The WAAPI push (playPush): stop it where it stands; the pop carries on from there over its own copy.
  const run = pushing;
  if (run) {
    const share = pushShare(run);
    pushing = null;
    for (const a of run.anims) a.cancel();
    run.page.removeAttribute('data-ch-pushing');
    if (!run.entry.pinned) run.entry.layer.remove();
    return share;
  }
  if (typeof document.getAnimations !== 'function') return 1;
  const running = document.getAnimations().filter((a) => {
    const pseudo = (a.effect as KeyframeEffect | null)?.pseudoElement ?? '';
    return pseudo.startsWith('::view-transition') && a.playState === 'running';
  });
  // Any other page transition still running (a crossfade or a pop) is finished: a push is no longer a view transition.
  for (const a of running) a.finish();
  return 1;
}

/**
 * A window-sized copy of the page showing now (`#ch-content`), for a layer on <body> outside the tree React is about to
 * change, with the root's scope (its tokens and fonts): the visible part only, holding the page at its scrolled place,
 * not the whole page's height. Inert and hidden from assistive tech. Not yet in the document. Null with no page.
 */
export function pageLayer(className: string): HTMLElement | null {
  const frame = typeof document === 'undefined' ? null : document.getElementById('ch-content');
  const root = frame?.closest<HTMLElement>('.ch-root');
  if (!frame || !root) return null;
  const box = frame.getBoundingClientRect();
  const page = cloneInView(frame, window.innerHeight, 4);
  page.removeAttribute('id');
  for (const el of Array.from(page.querySelectorAll('[id]'))) el.removeAttribute('id');
  page.removeAttribute('data-ch-pushing');
  page.style.translate = '';
  page.style.transform = '';
  Object.assign(page.style, { position: 'absolute', top: `${box.top}px`, left: '0', width: `${box.width}px`, margin: '0' });
  const copy = document.createElement('div');
  copy.className = `${root.className} ${className}`;
  copy.setAttribute('data-ui', 'clubhouse');
  if (root.dataset.motion) copy.dataset.motion = root.dataset.motion;
  copy.setAttribute('aria-hidden', 'true');
  copy.inert = true;
  Object.assign(copy.style, { position: 'fixed', top: '0', left: `${box.left}px`, width: `${box.width}px`, height: `${window.innerHeight}px` });
  copy.appendChild(page);
  return copy;
}

/** The smooth spring as WAAPI timing (a linear() curve where the engine has one), with a finger's speed in it if thrown. */
export function chPushTiming(spring?: { velocity?: number; rest?: number; hold?: boolean }): { curve: ReturnType<typeof chSpringCurve>; timing: KeyframeAnimationOptions } {
  const curve = chSpringCurve('smooth', spring);
  const linear = typeof CSS !== 'undefined' && CSS.supports?.('transition-timing-function', 'linear(0, 1)');
  return { curve, timing: { duration: curve.ms, easing: linear ? curve.linear : `cubic-bezier(${CH_EASE.join(', ')})` } };
}

/** The page beneath a push: how far it draws back (--ch-vt-parallax) and how it dims (--ch-vt-push-dim), from tokens.css. */
export function chUnderLook(): { parallax: string; dim: string } {
  const css = getComputedStyle(document.documentElement);
  return { parallax: css.getPropertyValue('--ch-vt-parallax').trim() || '-30%', dim: css.getPropertyValue('--ch-vt-push-dim').trim() || 'brightness(0.9)' };
}

/**
 * The grabbable push (C1, rows 2 and 89). A drill-in on a phone no longer slides by a view transition, whose snapshots
 * can be neither grabbed nor reversed: the tap holds a copy of the page it leaves (`holdForPush`), the view transition
 * swaps at once (shell.css), and in the commit that shows the new page that page itself (`#ch-content`, under the bars,
 * which never move) slides in from the right edge over the copy, which draws back by the parallax share and dims, on
 * the smooth spring (`--ch-dur-vt-push`, 462ms): the copy-and-slide Back already used. Because the live page is what
 * moves, a finger can take it at any point (`grabPush`, use-route-swipe.ts) and a Back can reverse it from where it
 * stands (`takeRunningPush`).
 *
 * The copy stays, out of the document, as the page beneath the one pushed (`unders`, at most four deep), so a swipe back
 * shows what is under the finger. It goes with a Back to its page, with any section switch or crossfade, and with a team
 * switch. Phone only, with motion full: Reduce Motion keeps the crossfade and Animations off the swap.
 */
export interface ChUnder {
  /** The pushed page this copy is beneath. */
  over: string;
  /** The page the copy shows (where Back goes). */
  under: string;
  layer: HTMLElement;
  /** A swipe is still moving the layer: arriving at its page doesn't remove it; the swipe does when it ends. */
  pinned?: boolean;
  /** Called once when its page is showing again (a swipe that let go waits for it before it lets the copy go). */
  onArrive?: () => void;
}
const unders: ChUnder[] = [];
const UNDERS_MAX = 4;
let held: { layer: HTMLElement; from: string } | null = null;
let pushing: { page: HTMLElement; anims: Animation[]; entry: ChUnder; curve: ReturnType<typeof chSpringCurve> } | null = null;

function holdForPush(from: string) {
  dropHeld();
  if (document.documentElement.getAttribute('data-ch-nav') !== 'push') return;
  const layer = pageLayer('ch-frame-under');
  if (!layer) return;
  // In the document now, hidden, so its style and layout run while the page is fetched rather than in the commit that
  // shows it, beside the new page's first layout (F-0006). playPush only shows it and starts the slide.
  layer.style.visibility = 'hidden';
  document.body.appendChild(layer);
  held = { layer, from };
}

/** A held copy that no push used goes. */
function dropHeld() {
  held?.layer.remove();
  held = null;
}

function dropUnders() {
  for (const u of unders.splice(0)) if (!u.pinned) u.layer.remove();
}

/** A page shown by anything but a push: Back to the page under the top copy lets that copy go; anything else, all of them. */
function settleUnders(path: string) {
  const top = unders[unders.length - 1];
  if (top && top.under === path) {
    unders.pop();
    if (!top.pinned) top.layer.remove();
    top.onArrive?.();
    top.onArrive = undefined;
    return;
  }
  if (top && top.over === path) return;
  dropUnders();
}

function endPush(run: NonNullable<typeof pushing>) {
  if (pushing !== run) return;
  pushing = null;
  run.page.removeAttribute('data-ch-pushing');
  if (!run.entry.pinned) run.entry.layer.remove();
}

function playPush(from: string, to: string, layer: HTMLElement) {
  const page = document.getElementById('ch-content');
  if (!page || typeof page.animate !== 'function' || !window.matchMedia?.(PHONE).matches || chMotionModeNow() !== 'full') {
    // Held at the tap, in the document: no slide, so it goes.
    layer.remove();
    return;
  }
  const entry: ChUnder = { over: to, under: from, layer };
  const top = unders[unders.length - 1];
  // Pushed from a page that is itself pushed: the copies stack. From anywhere else, this is the first.
  if (!top || top.over !== from) dropUnders();
  unders.push(entry);
  while (unders.length > UNDERS_MAX) unders.shift()?.layer.remove();
  if (!layer.isConnected) document.body.appendChild(layer);
  layer.style.visibility = '';
  const { curve, timing } = chPushTiming();
  const { parallax, dim } = chUnderLook();
  page.setAttribute('data-ch-pushing', '');
  const anims = [
    page.animate([{ transform: 'translateX(100%)' }, { transform: 'none' }], timing),
    layer.animate([{ transform: 'none', filter: 'none' }, { transform: `translateX(${parallax})`, filter: dim }], { ...timing, fill: 'forwards' }),
  ];
  const run = { page, anims, entry, curve };
  pushing = run;
  anims[0]?.finished.then(
    () => endPush(run),
    () => {},
  );
}

/** How far the running push has come, 0 to 1 along its spring, read from its page's animation. */
function pushShare(run: NonNullable<typeof pushing>): number {
  const at = Number(run.anims[0]?.currentTime ?? run.curve.ms);
  return run.curve.ease(Math.min(1, Math.max(0, at / run.curve.ms)));
}

/** A number for a CSS value (geometry, not a displayed figure: CONS-15), rounded on `Math.round` to `places`. */
export function cssNum(n: number, places = 2): string {
  const k = 10 ** places;
  return String(Math.round(n * k) / k);
}

/**
 * A finger takes the push in flight (use-route-swipe.ts): the slide stops where it stands, and the page and the copy
 * beneath are left there, inline, for the finger to move. Null when no push is running.
 */
export function grabPush(): { entry: ChUnder; offset: number; share: number } | null {
  const run = pushing;
  if (!run) return null;
  pushing = null;
  const share = pushShare(run);
  const width = run.page.getBoundingClientRect().width || window.innerWidth;
  const { parallax, dim } = chUnderLook();
  for (const a of run.anims) a.cancel();
  run.page.style.translate = `${cssNum((1 - share) * width)}px 0`;
  run.entry.layer.style.transform = `translateX(calc(${parallax} * ${cssNum(share, 4)}))`;
  run.entry.layer.style.filter = share > 0.5 ? dim : 'none';
  return { entry: run.entry, offset: (1 - share) * width, share };
}

/** The copy beneath the page showing, when it was pushed and a swipe back can uncover it. */
export function underFor(path: string = shownPath): ChUnder | null {
  const top = unders[unders.length - 1];
  return top && top.over === path ? top : null;
}

/** The page showing, as RouteFrame last reported it. */
export function chShownPath(): string {
  return shownPath;
}

/**
 * A swipe let go past its mark (use-route-swipe.ts): the Back it is about to press was already drawn by the hand, so
 * neither the pop below nor the view transition plays it again (lib/ua-pop.ts).
 */
export function chHandPop(): void {
  markHandPop();
}

function playPop(from = 1) {
  const frame = document.getElementById('ch-content');
  const mode = chMotionModeNow();
  if (!frame || document.documentElement.hasAttribute('data-ch-ua-pop') || mode === 'off') return;
  const copy = pageLayer('ch-frame-popping');
  if (!copy) return;
  document.body.appendChild(copy);
  const { timing } = chPushTiming();
  const { parallax } = chUnderLook();
  // The next frame, once the router's synchronous commit has put the page beneath in place.
  requestAnimationFrame(() => {
    if (mode === 'fade') {
      const gone = copy.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: CH_FADE_MS, easing: `cubic-bezier(${CH_EASE.join(', ')})` });
      if (!gone) return copy.remove();
      gone.finished.then(() => copy.remove(), () => copy.remove());
      return;
    }
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
