'use client';

import { CH_PHONE_QUERY } from '@/clubhouse/lib/phone-query';
import { CH_EASE_IOS, CH_EASE_IOS_CSS, CH_FADE_MS, CH_PUSH_MS, chBezier } from './motion';
import { chMotionModeNow } from './reduced-motion';
import { markHandPop, poppedByUA } from './ua-pop';
import { captureShare, endShare, flyShare, forgetShare } from './share-morph';

/**
 * Which way a phone navigation moves (native-feel audit 2026-10-08, P1-1 and P1-2; production audit 2026-11-15, S4.1 to
 * S4.8). A drill-in (a row in More, a link from a page into its detail) pushes, as a pushed phone screen does; Back from a
 * pushed page pops; everything else on a phone, a section switch above all, swaps at once. The kind is read here when
 * the tap or the Back happens, before the router starts the navigation, and kept in this module, not on <html> (MOT-20:
 * an attribute on <html> restyled the whole document three to five times a navigation). Desktop never pushes.
 */
export type ChNavKind = 'push' | 'pop' | 'fade';

/**
 * A page's identity for page motion: its path, plus `?view=` where a query value is a page of its own. CoachHelm's read and a
 * player's page live on the section's one route, and are pushed screens all the same.
 */
export function chNavPath(pathname: string, search: string = ''): string {
  const base = pathname.replace(/\/$/, '') || '/';
  if (base !== '/golf/dashboard/coachhelm') return base;
  const view = new URLSearchParams(search).get('view');
  return view === 'read' || view === 'player' ? `${base}?view=${view}` : base;
}
const strip = (p: string) => {
  const [path = p, search = ''] = (p.split('#')[0] ?? p).split('?');
  return chNavPath(path, search);
};
const within = (child: string, parent: string) => parent !== '/' && child.startsWith(parent + '/');

/**
 * `from` and `to` are paths; `tabRoots` the phone's section roots (the section strip's links). A tap on the strip always swaps. A
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

const PHONE = CH_PHONE_QUERY;
const phoneNow = () => !!window.matchMedia?.(PHONE).matches;
/** How long a kind waits for its navigation to commit before it lapses (a tap that never navigated). */
const LAPSE_MS = 3000;
/** How long after the commit the kind stays: past the push's 520ms. */
const SETTLE_MS = 700;
let shownPath = '';
let shownKey = '';
let lapse = 0;
/** The navigation under way: its kind, and whether it switches section. */
let navKind: ChNavKind = 'fade';
/**
 * A section switch: a tap on the phone's tab bar or on a desktop sidebar item (motion pass 2026-10-22, mot-03; S4.4). It
 * swaps the page at once, as a tab bar and a sidebar do on iOS and macOS, with no view transition and no hold onto a
 * skeleton: the route's skeleton is there in the first frame, whole.
 */
let navTab = false;

function tabRoots(): string[] {
  return Array.from(document.querySelectorAll<HTMLAnchorElement>('.ch-strip a[href]')).map((a) => new URL(a.href, location.href).pathname);
}

function clear() {
  navKind = 'fade';
  navTab = false;
  dropHeld();
  forgetShare();
}

function mark(kind: ChNavKind, tab = false) {
  window.clearTimeout(lapse);
  navTab = tab;
  // A push and a pop slide only on a phone with motion on: under Reduce Motion they crossfade (owner decision 2, OQ-15).
  navKind = kind !== 'fade' && phoneNow() && chMotionModeNow() === 'full' ? kind : 'fade';
  lapse = window.setTimeout(clear, LAPSE_MS);
}

/** Whether a link switches section: the phone's tab bar or the desktop sidebar's main list. */
export function isSectionLink(a: Element): boolean {
  return !!a.closest('.ch-strip, .ch-nav');
}

/** The kind of the navigation under way, if any. */
export function chNavKind(): ChNavKind {
  return navKind;
}

/**
 * Whether the navigation under way crossfades: RouteFrame keys its `<ViewTransition>` to the route only then (S4.8). A
 * desktop page change does, and on a phone under Reduce Motion every page change does, a section switch included: a
 * push, a pop and a switch all become the 180 ms opacity fade (MOTION-AND-VISUAL 3.3, 3.11). With motion on, a section
 * switch never does, nor any phone navigation (a push and a pop are drawn on the live page here, anything else swaps at
 * once), nor a Back iOS already played. Mapping the boundary to 'none' by a transition type is not enough: React 19.3
 * starts a document view transition, and snapshots the whole page, for any `<ViewTransition>` that mounts in a
 * transition, whatever its class.
 */
export function chNavCrossfades(): boolean {
  if (typeof window === 'undefined') return true;
  if (poppedByUA()) return false;
  const mode = chMotionModeNow();
  if (phoneNow() && mode === 'fade') return true;
  if (navTab) return false;
  return !(phoneNow() && mode === 'full');
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
  if (copy && copy.from === before && navKind === 'push') playPush(before, path, copy.layer);
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
  const kind = classifyNav({ from, to: url.pathname + url.search, tabRoots: tabRoots(), tabBar });
  mark(kind, tab);
  // The row's shared figure (E-6), read before the copy of this page is taken, so the copy carries its mark.
  if (navKind === 'push') captureShare(a);
  else forgetShare();
  holdForPush(from);
}

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
 * A push still sliding in when Back comes (motion pass 2026-10-22): how far it had come, from 0 to 1 along its curve,
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
    endShare();
    for (const a of run.anims) a.cancel();
    run.page.removeAttribute('data-ch-pushing');
    run.page.removeAttribute(CH_ARRIVING);
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

/** A push's or a pop's place along its curve: its length, and how far along it is at a share of that length. */
export interface ChNavCurve {
  ms: number;
  ease: (p: number) => number;
}

/** A tapped push and its pop (S4.1): 520ms on the iOS curve, as UIKit's own push moves. A released swipe finishes on the
 *  same curve over the share of the way it has left (shell/edge-swipe.ts `swipeFinish`, MOTION-AND-VISUAL 3.3). */
export function chTapTiming(): { curve: ChNavCurve; timing: KeyframeAnimationOptions } {
  return { curve: { ms: CH_PUSH_MS, ease: chBezier(CH_EASE_IOS) }, timing: { duration: CH_PUSH_MS, easing: CH_EASE_IOS_CSS } };
}

/** The page beneath a push: how far it draws back (--ch-push-parallax, S4.1: UIKit's 30%), from tokens.css. */
export function chUnderLook(): { parallax: string } {
  const css = getComputedStyle(document.documentElement);
  return { parallax: css.getPropertyValue('--ch-push-parallax').trim() || '-30%' };
}

/**
 * The dim on the copy beneath a push: a veil over it whose opacity moves, created on first use. A `filter` on the copy repainted it
 * every frame; a veil is compositor-only, so a push animates transform and opacity and nothing else.
 */
export function underVeil(layer: HTMLElement): HTMLElement {
  const had = layer.querySelector<HTMLElement>(':scope > .ch-under-veil');
  if (had) return had;
  const veil = document.createElement('i');
  veil.className = 'ch-under-veil';
  veil.setAttribute('aria-hidden', 'true');
  layer.appendChild(veil);
  return veil;
}

/**
 * The grabbable push (C1, rows 2 and 89). A drill-in on a phone no longer slides by a view transition, whose snapshots
 * can be neither grabbed nor reversed: the tap holds a copy of the page it leaves (`holdForPush`), the view transition
 * swaps at once (shell.css), and in the commit that shows the new page that page itself (`#ch-content`, under the bars,
 * which never move) slides in from the right edge over the copy, which draws back by the parallax share under a black
 * dim, over 520ms on the iOS curve (S4.1): the copy-and-slide Back already used. Because the live page is what
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
/**
 * The page a tapped push or a Back's pop is bringing in, for its 520 ms (E-2, audit 2026-11-19 F-02): it takes no taps
 * until it has landed, as UIKit turns off interaction during a navigation transition, so a second tap meant for the
 * row cannot open something on the page sliding in. Back, in the top bar outside the page, stays live and can still
 * reverse it. Its own mark, not data-ch-pushing, which a swipe's lift also sets while a finger holds the page.
 * pointer-events (shell.css), not `inert`: focus can still move to the page's title and VoiceOver still reads it.
 */
export const CH_ARRIVING = 'data-ch-arriving';
const unders: ChUnder[] = [];
const UNDERS_MAX = 4;
let held: { layer: HTMLElement; from: string } | null = null;
let pushing: { page: HTMLElement; anims: Animation[]; entry: ChUnder; curve: ChNavCurve } | null = null;

let holdFrame = 0;

/**
 * The tap frame stays light: the press state paints first, and the copy of the page (a deep clone, 20 to 35 ms on a long page) is taken in the
 * next frame. The route commits 45 ms or more after the tap even with no network wait (measured 2026-11-07), so the copy is there first; a
 * commit that somehow beat it would show the page without a slide.
 */
function holdForPush(from: string) {
  dropHeld();
  if (navKind !== 'push') return;
  holdFrame = requestAnimationFrame(() => {
    holdFrame = 0;
    if (navKind === 'push' && (shownPath || location.pathname) === from) takeHold(from);
  });
}

function takeHold(from: string) {
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
  if (holdFrame) cancelAnimationFrame(holdFrame);
  holdFrame = 0;
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
  endShare();
  run.page.removeAttribute('data-ch-pushing');
  run.page.removeAttribute(CH_ARRIVING);
  if (!run.entry.pinned) run.entry.layer.remove();
}

function playPush(from: string, to: string, layer: HTMLElement) {
  const page = document.getElementById('ch-content');
  if (!page || typeof page.animate !== 'function' || !phoneNow() || chMotionModeNow() !== 'full') {
    // Held at the tap, in the document: no slide, so it goes.
    layer.remove();
    forgetShare();
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
  const { curve, timing } = chTapTiming();
  const { parallax } = chUnderLook();
  page.setAttribute('data-ch-pushing', '');
  page.setAttribute(CH_ARRIVING, '');
  // Both ends are in place from this frame (fill backwards), but the clock starts a frame later (S4.1): this commit's
  // frame lays out the whole new page, and a slide started inside it lost its first frames to that work.
  const anims = [
    page.animate([{ transform: 'translateX(100%)' }, { transform: 'none' }], { ...timing, fill: 'backwards' }),
    layer.animate([{ transform: 'none' }, { transform: `translateX(${parallax})` }], { ...timing, fill: 'both' }),
    underVeil(layer).animate([{ opacity: 0 }, { opacity: 1 }], { ...timing, fill: 'both' }),
  ];
  for (const a of anims) a.pause();
  const run = { page, anims, entry, curve };
  pushing = run;
  requestAnimationFrame(() => {
    if (pushing !== run) return forgetShare();
    // The shared figure (E-6) leaves with the slide, measured now that the page has laid out at the top, standing its
    // own width to the right.
    flyShare(page, layer, timing, page.getBoundingClientRect().width);
    for (const a of anims) a.play();
  });
  anims[0]?.finished.then(
    () => endPush(run),
    () => {},
  );
}

/** How far the running push has come, 0 to 1 along its curve, read from its page's animation. */
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
  endShare();
  const share = pushShare(run);
  const width = run.page.getBoundingClientRect().width || window.innerWidth;
  const { parallax } = chUnderLook();
  for (const a of run.anims) a.cancel();
  // The finger has the page now: it is no longer arriving on its own.
  run.page.removeAttribute(CH_ARRIVING);
  run.page.style.translate = `${cssNum((1 - share) * width)}px 0`;
  run.entry.layer.style.transform = `translateX(calc(${parallax} * ${cssNum(share, 4)}))`;
  underVeil(run.entry.layer).style.opacity = cssNum(share, 4);
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

/**
 * Back from a pushed page (P1-2) that came by the browser's own Back, not the bar's (the bar's is drawn on live layers,
 * shell/use-route-swipe.ts). React commits a Back synchronously inside the popstate event, and a synchronous commit
 * never starts a view transition, so the pop is drawn here: a copy of the leaving page, taken before the router acts,
 * slides off to the right edge on top while the page it uncovers comes in from the parallax mark, both on the push's
 * curve. The copy is inert, hidden from assistive tech, under the bars, and gone when the slide ends. Not when iOS already
 * played the Back with its edge swipe (data-ch-ua-pop), with Animations off, or on desktop. Transform only; under the OS
 * Reduce Motion setting the copy fades out over the quick beat instead, in opacity only, and the page beneath stays
 * still (owner decision 2, 2026-10-24, OQ-15).
 */
function playPop(from = 1) {
  const frame = document.getElementById('ch-content');
  const mode = chMotionModeNow();
  if (!frame || poppedByUA() || mode === 'off') return;
  const copy = pageLayer('ch-frame-popping');
  if (!copy) return;
  document.body.appendChild(copy);
  const { timing } = chTapTiming();
  const { parallax } = chUnderLook();
  // The next frame, once the router's synchronous commit has put the page beneath in place.
  requestAnimationFrame(() => {
    if (mode === 'fade') {
      const gone = copy.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: CH_FADE_MS, easing: CH_EASE_IOS_CSS });
      if (!gone) return copy.remove();
      gone.finished.then(() => copy.remove(), () => copy.remove());
      return;
    }
    const under = document.getElementById('ch-content');
    // From where a push still sliding in had it (takeRunningPush): the page goes back the way it came, without a jump.
    const share = Math.min(1, Math.max(0, from));
    const back = under?.animate?.([{ transform: `translateX(calc(${parallax} * ${share}))` }, { transform: 'none' }], timing);
    // The page coming back takes no taps until it has landed (E-2), as a pushed one doesn't.
    if (under && back) {
      under.setAttribute(CH_ARRIVING, '');
      const landed = () => under.removeAttribute(CH_ARRIVING);
      back.finished.then(landed, landed);
    }
    const out = copy.animate?.([{ transform: `translateX(${((1 - share) * 100).toFixed(2)}%)` }, { transform: 'translateX(100%)' }], timing);
    if (!out) return copy.remove();
    out.finished.then(() => copy.remove(), () => copy.remove());
  });
}

/**
 * A duration token in ms, from <html> where the page crossfade's tokens live (tokens.css), or `fallback`. The unit is read:
 * a token in seconds (`0.12s`, as WebKit returned the desk's tokens) was taken as 0.12 ms, so Back and Forward on the desk
 * swapped at once in Safari (E-8, 2026-11-19).
 */
export function msToken(css: Pick<CSSStyleDeclaration, 'getPropertyValue'>, name: string, fallback: number): number {
  const m = /^\s*(-?[\d.]+)\s*(ms|s)?\s*$/i.exec(css.getPropertyValue(name));
  if (!m) return fallback;
  const v = Number(m[1]) * (m[2]?.toLowerCase() === 's' ? 1000 : 1);
  return Number.isFinite(v) ? v : fallback;
}

/**
 * Back and Forward on the desk crossfade as a tap does (E-8, audit 2026-11-19): the page left fades out over
 * --ch-dur-vt-out while the page come back to fades in over --ch-dur-vt-in, together, on their own curves (owner
 * decision 3, A10). A history move commits synchronously inside popstate, so React starts no view transition for it
 * (it swapped at once before); the fade is drawn here instead, with a window-sized copy of the page leaving over the
 * live page, under the sidebar and the bar, taking no taps. Under Reduce Motion both sides take --ch-dur-vt-fade (3.11);
 * Animations off swaps. Should a view transition run after all, it alone plays: the copy goes at once.
 */
function playDeskHistory() {
  const mode = chMotionModeNow();
  const frame = document.getElementById('ch-content');
  if (!frame || mode === 'off' || typeof frame.animate !== 'function') return;
  const copy = pageLayer('ch-frame-fading');
  if (!copy) return;
  document.body.appendChild(copy);
  const css = getComputedStyle(document.documentElement);
  const fade = mode === 'fade';
  const out = { duration: msToken(css, fade ? '--ch-dur-vt-fade' : '--ch-dur-vt-out', fade ? CH_FADE_MS : 120), easing: css.getPropertyValue('--ch-ease-vt-out').trim() || 'ease-in' };
  const into = { duration: msToken(css, fade ? '--ch-dur-vt-fade' : '--ch-dur-vt-in', 180), easing: css.getPropertyValue('--ch-ease-vt-in').trim() || 'ease-out' };
  // The next frame, once the router's synchronous commit has put the page come back to in place.
  requestAnimationFrame(() => {
    // Only the page's own crossfade counts: the root's snapshot also runs a theme keyframe on a Back (WebKit, 2026-11-19),
    // and stepping aside for it left the Back with no fade at all.
    const vt = typeof document.getAnimations === 'function' && document.getAnimations().some((a) => ((a.effect as KeyframeEffect | null)?.pseudoElement ?? '').includes('(ch-page)'));
    if (vt) return copy.remove();
    const page = document.getElementById('ch-content');
    page?.animate([{ opacity: 0 }, { opacity: 1 }], into);
    const gone = copy.animate([{ opacity: 1 }, { opacity: 0 }], { ...out, fill: 'forwards' });
    gone.finished.then(
      () => copy.remove(),
      () => copy.remove(),
    );
  });
}

function onPopState() {
  if (!shownPath) return;
  if (!phoneNow()) {
    const kind = classifyNav({ from: shownPath, to: location.pathname + location.search, tabRoots: tabRoots(), back: true });
    mark(kind);
    if (strip(location.pathname + location.search) !== strip(shownPath)) playDeskHistory();
    return;
  }
  const kind = classifyNav({ from: shownPath, to: location.pathname + location.search, tabRoots: tabRoots(), back: true });
  // Drawn here rather than by a view transition (playPop), so the keyframes never run as well.
  if (kind === 'pop' && phoneNow()) {
    const from = takeRunningPush();
    mark('fade');
    playPop(from);
  } else mark(kind);
}

// Capture, so the kind is known before Next's Link handler and the router's popstate start the navigation.
if (typeof window !== 'undefined') {
  document.addEventListener('click', onClick, true);
  window.addEventListener('popstate', onPopState, true);
}
