'use client';

/**
 * The desktop sidebar folding to its icon rail and opening again (RailToggle, shell.css "The folding sidebar"), as one
 * moment the rest of the page can wait out (motion pass 2026-10-22, mot-01).
 *
 * Since the 2026-11-15 production audit (S4.4, MOT-11) the sidebar's width takes its new value at once and only
 * transform and opacity move, so the canvas is laid out once per fold rather than on every frame. Before that, every
 * reader of the canvas's size (a chart's ResizeObserver, a zone map, the evidence pane, Lenis's scroll limit)
 * re-measured and re-rendered on every frame of a width transition, and that was the stutter. While the fold moves,
 * `data-ch-rail-moving` is on `.ch-app` and `afterRailMove` holds those reads back; they run once, at the size the page
 * settles on. With no width transition the sidebar's computed duration is 0, so the fold settles on the next task.
 *
 * The fold ends when the sidebar's width transition ends, or when its own duration has passed (a transition that was
 * cut short, or never ran with reduced motion or Animations off, fires no transitionend). The width path stays so a
 * sidebar given a width transition again is still waited out.
 */
const MOVING = 'data-ch-rail-moving';
/** A little past the transition's own end, for a frame that ran late. */
const SLACK_MS = 80;

let moving = false;
let finish: (() => void) | null = null;
const waiting = new Set<() => void>();

/** Whether the sidebar is folding or opening right now. */
export function chRailMoving(): boolean {
  return moving;
}

/** Runs `read` now, or once the fold in progress has settled. A read asked for twice runs once. */
export function afterRailMove(read: () => void): void {
  if (moving) waiting.add(read);
  else read();
}

function longestMs(list: string): number {
  return Math.max(0, ...list.split(',').map((d) => (d.trim().endsWith('ms') ? parseFloat(d) : parseFloat(d) * 1000) || 0));
}

/** RailToggle: the fold is about to change. Call it in the same task as the state change that moves the sidebar. */
export function startRailMove(): void {
  const app = typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('.ch-app');
  const sidebar = app?.querySelector<HTMLElement>('.ch-sidebar');
  if (!app || !sidebar) return;
  finish?.();
  const style = getComputedStyle(sidebar);
  const ms = longestMs(style.transitionDuration) + longestMs(style.transitionDelay);
  moving = true;
  app.setAttribute(MOVING, '');
  let timer = 0;
  const onEnd = (e: TransitionEvent) => {
    if (e.target === sidebar && e.propertyName === 'width') done();
  };
  const done = () => {
    if (finish !== done) return;
    finish = null;
    window.clearTimeout(timer);
    sidebar.removeEventListener('transitionend', onEnd);
    sidebar.removeEventListener('transitioncancel', onEnd);
    app.removeAttribute(MOVING);
    moving = false;
    const reads = Array.from(waiting);
    waiting.clear();
    for (const read of reads) read();
  };
  finish = done;
  sidebar.addEventListener('transitionend', onEnd);
  sidebar.addEventListener('transitioncancel', onEnd);
  timer = window.setTimeout(done, ms > 0 ? ms + SLACK_MS : 0);
}
