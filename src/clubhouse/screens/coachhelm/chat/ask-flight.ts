import { CH_FADE_MS, chSpringCurve } from '../../../lib/motion';

/** Ask's landings (ask 07, M-ASK-45, 46, 77, 78). Transform and opacity only; under Reduce Motion nothing travels. */

const settled = async (a: Animation | undefined) => {
  await a?.finished.catch(() => undefined);
};
/** Lifts 140 ms first, as both flights do. */
const LIFT_MS = 140;

function arc(dx: number, dy: number, sx: number, sy: number): Keyframe[] {
  return Array.from({ length: 21 }, (_, i) => {
    const t = i / 20;
    const cx = 0.4 * dx;
    const cy = 0.4 * dy - 52;
    const x = 2 * (1 - t) * t * cx + t * t * dx;
    const y = 2 * (1 - t) * t * cy + t * t * dy;
    return { transform: `translate(${x}px, ${y}px) scale(${1 + (sx - 1) * t}, ${1 + (sy - 1) * t})`, opacity: t < 0.7 ? 1 : 1 - (t - 0.7) / 0.6 };
  });
}

/** M-ASK-45 and 46: a copy of the draft flies into its home slot inside the card, and the slot pops as it lands. */
export async function flyDraftHome(card: HTMLElement, draft: HTMLElement, slot: HTMLElement, reduced: boolean): Promise<void> {
  if (reduced) {
    await settled(slot.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: CH_FADE_MS, easing: 'linear' }));
    return;
  }
  if (!slot.animate) return;
  const c = card.getBoundingClientRect();
  const a = draft.getBoundingClientRect();
  const b = slot.getBoundingClientRect();
  const flyer = draft.cloneNode(true) as HTMLElement;
  Object.assign(flyer.style, { position: 'absolute', left: `${a.left - c.left}px`, top: `${a.top - c.top}px`, width: `${a.width}px`, height: `${a.height}px`, margin: '0', zIndex: '3', pointerEvents: 'none', transformOrigin: '0 0', background: 'var(--ch-card-bg)', borderRadius: 'var(--ch-radius-md)', boxShadow: 'var(--ch-elevation-lifted)' });
  flyer.setAttribute('aria-hidden', 'true');
  flyer.removeAttribute('id');
  card.appendChild(flyer);
  try {
    const smooth = chSpringCurve('smooth');
    const frames = arc(b.left - a.left, b.top - a.top, b.width / Math.max(a.width, 1), b.height / Math.max(a.height, 1));
    await settled(flyer.animate(frames, { duration: smooth.ms, delay: LIFT_MS, easing: smooth.linear, fill: 'both' }));
    const pop = chSpringCurve('pop');
    await settled(slot.animate([{ transform: 'scale(0.9)' }, { transform: 'none' }], { duration: pop.ms, easing: pop.linear }));
  } finally {
    flyer.remove();
  }
}

/** M-ASK-77: a sheet of paper from the plan lands on the folder's art. The caller ticks the count, then calls `squashFolder`. */
export async function flyPageToFolder(page: HTMLElement, folder: HTMLElement, reduced: boolean): Promise<void> {
  if (reduced || !folder.animate) return;
  const a = page.getBoundingClientRect();
  const b = folder.getBoundingClientRect();
  const sheet = document.createElement('div');
  const w = Math.min(a.width, 120);
  const h = Math.round(w * 1.3);
  Object.assign(sheet.style, { position: 'fixed', left: `${a.left}px`, top: `${a.top}px`, width: `${w}px`, height: `${h}px`, zIndex: '60', pointerEvents: 'none', transformOrigin: '0 0', borderRadius: 'var(--ch-radius-sm)', background: 'var(--ch-card-bg)', boxShadow: 'var(--ch-elevation-lifted)' });
  sheet.setAttribute('aria-hidden', 'true');
  (folder.closest("[data-ui='clubhouse']") ?? document.body).appendChild(sheet);
  try {
    const smooth = chSpringCurve('smooth');
    await settled(sheet.animate(arc(b.left - a.left, b.top - a.top, b.width / w, b.height / h), { duration: smooth.ms, delay: LIFT_MS, easing: smooth.linear, fill: 'both' }));
  } finally {
    sheet.remove();
  }
}

/** M-ASK-78: the folder takes the page, 1.08 by 0.94 back to rest. */
export async function squashFolder(folder: HTMLElement, reduced: boolean): Promise<void> {
  if (reduced || !folder.animate) return;
  const pop = chSpringCurve('pop');
  await settled(folder.animate([{ transform: 'scale(1.08, 0.94)' }, { transform: 'none' }], { duration: pop.ms, easing: pop.linear }));
}
