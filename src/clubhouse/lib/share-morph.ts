'use client';

/**
 * The shared element of a push (E-6, audit 2026-11-19): a figure the tapped row shows, marked `data-ch-share="<key>"`,
 * travels into the same figure on the page pushed in (a team round's score into the review's hero score), over the push's
 * own 520 ms on the iOS curve, so the eye follows the number instead of losing it under the slide.
 *
 * Drawn here on the Web Animations API, as the push itself is (lib/nav-motion.ts playPush), not by a view transition: a
 * phone page change starts no view transition (S4.4, S4.8), whose snapshots would freeze the page and take away the
 * grab and the reverse. A ghost of the row's figure, fixed to the window over the page and under the bars, moves and
 * scales from the row's place to the target's resting place (where it is once the push has landed); the target hides
 * until the ghost arrives, and the row's figure in the copy beneath hides too, so the number is only ever drawn once.
 * Transform and opacity only. No target on the incoming page (it is still a plain skeleton, or the page has no such
 * figure): the push plays alone. Any interruption (a Back, a finger) ends it at once and shows the target. Never under
 * Reduce Motion or Animations off: those never push.
 */

/** On the page being pushed in while its shared figure is in flight: the figure waits hidden (shell.css). */
export const CH_SHARING = 'data-ch-sharing';
/** On the row's own figure from the tap until the copy of the page beneath has been taken. */
const FROM = 'data-ch-share-from';

interface Source {
  key: string;
  rect: DOMRect;
  ghost: HTMLElement;
}

let source: Source | null = null;
let flight: { ghost: HTMLElement; page: HTMLElement; anims: Animation[]; hidden: HTMLElement | null } | null = null;

const COPIED = ['font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'color', 'font-variant-numeric', 'font-feature-settings', 'font-variation-settings', 'white-space'] as const;

/** The tap: the first shared figure inside the tapped link, held as a ghost (not yet in the document). */
export function captureShare(link: Element): void {
  dropSource();
  const el = link.querySelector<HTMLElement>('[data-ch-share]');
  const key = el?.dataset.chShare;
  if (!el || !key) return;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  const ghost = ghostOf(el, rect);
  el.setAttribute(FROM, '');
  source = { key, rect, ghost };
}

/** The captured figure goes; the mark comes off the live page (a copy beneath keeps its own until its flight ends). */
function dropSource() {
  document.getElementById('ch-content')?.querySelectorAll(`[${FROM}]`).forEach((e) => e.removeAttribute(FROM));
  source = null;
}

/** Whether a figure was captured at the tap and waits for its push. */
export function shareHeld(): boolean {
  return !!source;
}

/**
 * The push has started (its first frame, once the new page has laid out and scrolled to the top): the ghost flies to
 * the target on `page` over `timing`. `layer` is the copy of the page beneath, whose own copy of the row's figure hides.
 * `pageShift` is how far right the page stands this frame (the push's start, its own width).
 */
export function flyShare(page: HTMLElement, layer: HTMLElement | null, timing: KeyframeAnimationOptions, pageShift: number): void {
  endShare();
  const from = source;
  source = null;
  if (!from) return;
  const target = page.querySelector<HTMLElement>(`[data-ch-share="${from.key}"]`);
  const to = target?.getBoundingClientRect();
  if (!target || !to || to.width === 0 || to.height === 0) {
    layer?.querySelectorAll(`[${FROM}]`).forEach((e) => e.removeAttribute(FROM));
    return;
  }
  // Where the target rests once the page has landed: this frame's place, less the push's shift.
  const left = to.left - pageShift;
  const top = to.top;
  const sx = to.width / from.rect.width;
  const sy = to.height / from.rect.height;
  // One scale for both axes (a number keeps its shape), from the heights: the type's size is what changes.
  const s = Number.isFinite(sy) && sy > 0 ? sy : Number.isFinite(sx) && sx > 0 ? sx : 1;
  // Its own fixed layer over the page and under the bars (the page sliding in stands at --ch-z-sticky − 1). Every style
  // the figure needs was copied onto the ghost, so the layer takes nothing from the root's scope.
  const host = document.createElement('div');
  host.className = 'ch-share-host';
  host.setAttribute('aria-hidden', 'true');
  host.inert = true;
  const sticky = parseInt(getComputedStyle(page).getPropertyValue('--ch-z-sticky'), 10);
  Object.assign(host.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: String(Number.isFinite(sticky) ? sticky - 1 : 1) });
  // The row's figure leaves as the page's arrives: the ghost of the one fades out as it travels and grows, a ghost of
  // the other, in the page's own type and colour, fades in over the same path, so the figure lands crisp and in its
  // final colour with no pop.
  const arrive = ghostOf(target, { left, top, width: to.width, height: to.height });
  host.append(from.ghost, arrive);
  document.body.appendChild(host);
  const hidden = layer?.querySelector<HTMLElement>(`[${FROM}]`) ?? null;
  if (hidden) hidden.style.visibility = 'hidden';
  page.setAttribute(CH_SHARING, '');
  const dx = left - from.rect.left;
  const dy = top - from.rect.top;
  const go = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scale(${s.toFixed(4)})`;
  const back = `translate(${(-dx / s).toFixed(2)}px, ${(-dy / s).toFixed(2)}px) scale(${(1 / s).toFixed(4)})`;
  const opts = { ...timing, fill: 'forwards' as const };
  const anims =
    typeof from.ghost.animate === 'function'
      ? [
          from.ghost.animate([{ transform: 'none', opacity: 1 }, { transform: go, opacity: 0 }], opts),
          arrive.animate([{ transform: back, opacity: 0 }, { transform: 'none', opacity: 1 }], opts),
        ]
      : [];
  const run = { ghost: host, page, anims, hidden };
  flight = run;
  if (!anims.length) return endShare();
  anims[1]!.finished.then(
    () => flight === run && endShare(),
    () => {},
  );
}

/** A figure's ghost: its text in its own computed type and colour, fixed at `box`, scaled from its top left. */
function ghostOf(el: HTMLElement, box: { left: number; top: number; width: number; height: number }): HTMLElement {
  const ghost = document.createElement('span');
  ghost.textContent = el.textContent;
  const css = getComputedStyle(el);
  for (const p of COPIED) ghost.style.setProperty(p, css.getPropertyValue(p));
  Object.assign(ghost.style, { position: 'fixed', left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`, margin: '0', transformOrigin: '0 0' });
  return ghost;
}

/** The flight ends (landed, or a Back or a finger took the push): the target shows, the ghost goes. */
export function endShare(): void {
  const run = flight;
  flight = null;
  if (!run) return;
  for (const a of run.anims) a.cancel();
  run.ghost.remove();
  run.page.removeAttribute(CH_SHARING);
  if (run.hidden) {
    run.hidden.style.visibility = '';
    run.hidden.removeAttribute(FROM);
  }
}

/** A tap that did not push (it swapped, it lapsed): the captured figure goes. */
export function forgetShare(): void {
  dropSource();
}
