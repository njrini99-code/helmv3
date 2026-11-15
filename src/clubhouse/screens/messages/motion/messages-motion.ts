/**
 * The one place Messages v2 gets its springs and motion helpers (docs/clubhouse/messages-v2/MOTION.md, SEAMS.md).
 * Packages A, C and D import motion from here only: no literal `duration:`, timer length or `cubic-bezier(` in a
 * component (clubhouse:check rejects them). Values live in `lib/motion.ts` (CH_SPRINGS, CH_MS, CH_KEYBOARD_EASE) and
 * `styles/tokens.css`; this file names them for Messages and holds the artifact's `anim()` as WAAPI.
 *
 * The spring numbers are the app's own `chSpringCurve`, not the artifact's solver (SETTLED ruling 29): smooth 462 ms,
 * settle 417, reveal 921, send 700, pop 496, lift 471, launch 812.
 */
import { CH_DUR, CH_EASE, CH_FADE_MS, CH_KEYBOARD_EASE, CH_MS, CH_SPRINGS, chSpringCurve, type ChSpringKind } from '../../../lib/motion';

export { CH_SPRINGS, chSpringCurve };
export type MsSpringKind = ChSpringKind;

/** The Reduce Motion crossfade: the shared length (Q-05), linear. */
export const FADE_MS = CH_FADE_MS;
/** The iOS keyboard's ride: 480 ms on the iOS curve (MOT-KB-1, MOT-SEND-1). */
export const KEYBOARD_MS = CH_MS.keyboard;
export const KEYBOARD_EASE = CH_KEYBOARD_EASE;
/** A press dips to this scale for the press beat (`data-ch-press-scale`, MOT-HOLD). */
export const PRESS_SCALE = 0.97;
export const PRESS_MS = CH_DUR.press * 1000;
/** Beats with no spring: the send arrow, the field returning, Delivered rising (MOT-SEND-6, -8). */
export const MS_BEATS = CH_MS;
/** A sheet leaving: the house ease-out over the release beat, from where it is (MOT-X-5, MOT-X-6). */
export const sheetCloseCurve = { ms: Math.round(CH_DUR.release * 1000), easing: `cubic-bezier(${CH_EASE.join(', ')})` } as const;

export interface MsAnimateOptions {
  /** Start from where the node is now (its current transform and opacity) instead of the first keyframe: an interrupt never jumps. */
  live?: boolean;
  /** `'add'` stacks on any running animation of the node (a second send adds its glide to the first). */
  composite?: CompositeOperation;
  /** The user's Reduce Motion setting (`useChReducedMotion`). */
  reduced?: boolean;
  /** Reduce Motion with `null`: the motion does not play at all. Left out, a motion with an opacity keyframe becomes a crossfade. */
  rd?: null;
  delay?: number;
  fill?: FillMode;
  /** A beat that is not a spring: its length in ms and its easing (CH_MS / KEYBOARD_EASE / the house curve). */
  timing?: { ms: number; easing: string };
}

const OPAQUE = (k: Keyframe) => (k.opacity === undefined ? null : Number(k.opacity));

/**
 * The artifact's `anim()`: play `keyframes` on `node` with a named spring (its sampled `linear()` curve) or an explicit
 * beat. Returns the animation, or null when nothing played (no WAAPI, or Reduce Motion with no opacity to fade).
 */
export function msAnimate(node: HTMLElement, keyframes: Keyframe[], spring: MsSpringKind | null, opts: MsAnimateOptions = {}): Animation | null {
  if (typeof node.animate !== 'function' || !keyframes.length) return null;
  const { live = false, composite, reduced = false, rd, delay = 0, fill = 'none', timing } = opts;
  if (reduced) {
    if (rd === null) return null;
    const from = OPAQUE(keyframes[0]!);
    const to = OPAQUE(keyframes[keyframes.length - 1]!);
    if (from === null || to === null || from === to) return null;
    return node.animate([{ opacity: from }, { opacity: to }], { duration: FADE_MS, easing: 'linear', fill, delay });
  }
  let frames = keyframes;
  if (live && typeof getComputedStyle === 'function') {
    const cs = getComputedStyle(node);
    const [first, ...rest] = keyframes;
    frames = [{ ...first, ...(first!.transform !== undefined && cs.transform && cs.transform !== 'none' ? { transform: cs.transform } : {}), ...(first!.opacity !== undefined && cs.opacity ? { opacity: cs.opacity } : {}) }, ...rest];
  }
  const curve = spring ? chSpringCurve(spring) : null;
  const ms = timing?.ms ?? curve?.ms ?? CH_MS.fill;
  const easing = timing?.easing ?? curve?.linear ?? 'linear';
  return node.animate(frames, { duration: ms, easing, fill, delay, ...(composite ? { composite } : {}) });
}

/** One moving node, as it was when a re-render was about to replace it. */
export interface CarriedMotion {
  key: string;
  animations: { keyframes: Keyframe[]; timing: EffectTiming; currentTime: number }[];
}

const keyOf = (el: Element) => el.id || el.getAttribute('data-ch-key') || '';

/**
 * MOT-X-13: before a re-render, note every running animation on the matched nodes (keyed by `id` or `data-ch-key`) so
 * `resume` can continue them on the nodes React draws next, from where they were.
 */
export function carryRunning(root: ParentNode, selectors: string): CarriedMotion[] {
  const out: CarriedMotion[] = [];
  root.querySelectorAll<HTMLElement>(selectors).forEach((el) => {
    const key = keyOf(el);
    if (!key || typeof el.getAnimations !== 'function') return;
    const animations = el
      .getAnimations()
      .filter((a) => a.playState === 'running' && a.effect)
      .map((a) => ({
        keyframes: (a.effect as KeyframeEffect).getKeyframes() as Keyframe[],
        timing: (a.effect as KeyframeEffect).getTiming(),
        currentTime: Number(a.currentTime ?? 0),
      }));
    if (animations.length) out.push({ key, animations });
  });
  return out;
}

/** Restart what `carryRunning` noted on the matching new nodes, at the time each had reached. Returns how many resumed. */
export function resume(root: ParentNode, carried: CarriedMotion[]): number {
  let n = 0;
  for (const c of carried) {
    const el = (root.querySelector(`[id="${CSS.escape(c.key)}"]`) ?? root.querySelector(`[data-ch-key="${CSS.escape(c.key)}"]`)) as HTMLElement | null;
    if (!el || typeof el.animate !== 'function') continue;
    for (const a of c.animations) {
      const next = el.animate(a.keyframes, a.timing);
      next.currentTime = a.currentTime;
      n += 1;
    }
  }
  return n;
}

/**
 * The scrollTop of a scroller's real bottom, read from layout: the list may be mid-glide on a transform (useThreadMakeRoom), and a
 * transform counts as scrollable overflow, so `scrollHeight` would be inflated by the room being made (MOT-JMP-3).
 */
export function layoutEnd(node: HTMLElement): number {
  const list = node.querySelector<HTMLElement>('.ch-ms-msgs');
  if (list && typeof list.getAnimations === 'function' && list.getAnimations().length) {
    const moved = new DOMMatrixReadOnly(getComputedStyle(list).transform).m42;
    if (moved > 0) {
      const below = parseFloat(getComputedStyle(node).paddingBottom) || 0;
      const bottom = list.getBoundingClientRect().bottom - moved - node.getBoundingClientRect().top + node.scrollTop;
      return Math.max(0, bottom + below - node.clientHeight);
    }
  }
  return Math.max(0, node.scrollHeight - node.clientHeight);
}

/**
 * MOT-JMP-3: glide a scroller to `to` (a scrollTop, or `'end'` for its layout bottom, read each frame because the
 * list grows while it glides) on a spring. A wheel, touch or pointer-down stops it where it is. Returns the cancel.
 */
export function springScroll(node: HTMLElement, to: number | 'end', kind: MsSpringKind = 'reveal', reduced = false): () => void {
  const target = () => (to === 'end' ? layoutEnd(node) : to);
  if (reduced || typeof requestAnimationFrame !== 'function') {
    node.scrollTop = target();
    return () => undefined;
  }
  const from = node.scrollTop;
  const { ms, ease } = chSpringCurve(kind);
  const start = performance.now();
  let raf = 0;
  const stop = () => {
    cancelAnimationFrame(raf);
    node.removeEventListener('wheel', stop);
    node.removeEventListener('touchstart', stop);
    node.removeEventListener('pointerdown', stop);
  };
  const tick = (now: number) => {
    const p = Math.min(1, (now - start) / ms);
    node.scrollTop = from + (target() - from) * ease(p);
    if (p < 1) raf = requestAnimationFrame(tick);
    else stop();
  };
  node.addEventListener('wheel', stop, { passive: true });
  node.addEventListener('touchstart', stop, { passive: true });
  node.addEventListener('pointerdown', stop);
  raf = requestAnimationFrame(tick);
  return stop;
}
