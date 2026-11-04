import { CH_EASE, CH_EASE_SHEET, CH_FADE_MS, chSpringCurve, CH_DUR, CH_SPRING_POP_MS } from '../../lib/motion';

/** The task card's motion (coachhelm 07): in, settle, confirm, the three lands, chip, receipt and told. Transform and opacity only. */
const ease = `cubic-bezier(${CH_EASE.join(',')})`;
const dip = `cubic-bezier(${CH_EASE_SHEET.join(',')})`;
const fade = (el: Element) => el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: CH_FADE_MS, easing: 'linear' });
const rise = (el: Element, px: number, duration: number, easing: string, delay = 0) =>
  el.animate([{ opacity: 0, transform: `translateY(${px}px)` }, { opacity: 1, transform: 'none' }], { duration, easing, delay, fill: delay ? 'backwards' : 'none' });
const settled = async (a: Animation | undefined) => {
  await a?.finished.catch(() => undefined);
};

/** M-TASK-in, then M-FIELD on what arrived with it, then M-TASK-settle and M-CONFIRM-in. */
export async function taskIn(card: HTMLElement, reduced: boolean): Promise<void> {
  const foot = card.querySelector('.task__f');
  const fields = card.querySelectorAll('.fact dd, .qr b');
  if (reduced) {
    fade(card);
    fields.forEach(fade);
    if (foot) fade(foot);
    return;
  }
  const settle = chSpringCurve('settle');
  foot?.animate([{ opacity: 0 }, { opacity: 0 }], { duration: settle.ms + 507, fill: 'none' });
  await settled(rise(card, 8, settle.ms, settle.linear));
  fields.forEach((f) => rise(f, 6, 260, ease));
  await settled(
    card.animate(
      [
        { transform: 'scale(1)', easing: dip },
        { transform: 'scale(0.985)', offset: 90 / 507, easing: settle.linear },
        { transform: 'scale(1)' },
      ],
      { duration: CH_SPRING_POP_MS },
    ),
  );
  if (foot) rise(foot, 6, 260, ease);
}

/** M-LAND-cal: the block flies along a quadratic arc into its day's cell, which bumps as the dot lands. */
async function landCal(card: HTMLElement, reduced: boolean): Promise<void> {
  const block = card.querySelector<HTMLElement>('.blk.new');
  const cell = card.querySelector<HTMLElement>('.cal-wk i.on');
  if (!block || !cell) return;
  const flyer = block.cloneNode(true) as HTMLElement;
  const c = card.getBoundingClientRect();
  const b = block.getBoundingClientRect();
  Object.assign(flyer.style, { position: 'absolute', left: `${b.left - c.left}px`, top: `${b.top - c.top}px`, width: `${b.width}px`, height: `${b.height}px`, zIndex: '5', margin: '0' });
  flyer.setAttribute('aria-hidden', 'true');
  card.appendChild(flyer);
  try {
    if (reduced) {
      await settled(flyer.animate([{ opacity: 1 }, { opacity: 0.2 }], { duration: CH_FADE_MS, easing: 'linear', fill: 'forwards' }));
      return;
    }
    const r = cell.getBoundingClientRect();
    const dx = r.left + r.width / 2 - (b.left + b.width / 2);
    const dy = r.top + r.height / 2 - (b.top + b.height / 2);
    const frames = Array.from({ length: 21 }, (_, i) => {
      const t = i / 20;
      const cx = 0.4 * dx;
      const cy = 0.4 * dy - 52;
      const x = 2 * (1 - t) * t * cx + t * t * dx;
      const y = 2 * (1 - t) * t * cy + t * t * dy;
      return { transform: `translate(${x}px, ${y}px) scale(${1 - 0.92 * t})`, opacity: t < 0.45 ? 1 : 1 - (0.8 * (t - 0.45)) / 0.55 };
    });
    const smooth = chSpringCurve('smooth');
    block.style.opacity = '0.22';
    await settled(flyer.animate(frames, { duration: smooth.ms, easing: smooth.linear, fill: 'forwards' }));
    block.style.opacity = '';
    const settle = chSpringCurve('settle');
    cell.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.1)', offset: 0.4 }, { transform: 'scale(1)' }], { duration: settle.ms, easing: settle.linear });
  } finally {
    flyer.remove();
  }
}

/** M-LAND-msg: the bubble lifts and settles, the tone chips dim, then a 300ms hold before the chip. */
async function landMsg(card: HTMLElement, reduced: boolean): Promise<void> {
  const bubble = card.querySelector('.mb.draft');
  const tones = card.querySelector('.mtone');
  if (tones) tones.animate([{ opacity: 1 }, { opacity: 0.4 }], { duration: reduced ? CH_FADE_MS : 200, easing: 'linear', fill: 'forwards' });
  if (reduced || !bubble) return;
  const settle = chSpringCurve('settle');
  await settled(
    bubble.animate(
      [
        { transform: 'none', easing: dip },
        { transform: 'translateY(-3px) scale(1.02)', offset: 90 / 507, easing: settle.linear },
        { transform: 'none' },
      ],
      { duration: CH_SPRING_POP_MS },
    ),
  );
  await new Promise((r) => setTimeout(r, 300));
}

/** M-LAND-qual, the body's half: out before the list replaces it. */
async function landQual(card: HTMLElement, reduced: boolean): Promise<void> {
  const body = card.querySelector('.task__b');
  if (!body) return;
  const out = reduced ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.92) translateY(-6px)' }];
  await settled(body.animate(out, { duration: reduced ? CH_FADE_MS : 220, easing: reduced ? 'linear' : ease }));
}

/** The write answered: the kind's land, then the old chip out (M-CHIP's first half). */
export async function land(card: HTMLElement, kind: string, reduced: boolean): Promise<void> {
  if (kind === 'cal') await landCal(card, reduced);
  else if (kind === 'msg') await landMsg(card, reduced);
  else if (kind === 'qual') await landQual(card, reduced);
  const chip = card.querySelector('.task__h .chip');
  await settled(chip?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reduced ? CH_FADE_MS : 90, easing: 'linear' }));
}

/** M-LAND-qual's second half, M-CHIP's second half, M-RCPT. M-WON is the `.won` class, added on this frame. */
export function landed(card: HTMLElement, reduced: boolean): void {
  const chip = card.querySelector('.task__h .chip');
  const row = card.querySelector('.task__f .rcpt');
  const disc = card.querySelector('.task__f .rcpt__g');
  const check = card.querySelector<SVGPathElement>('.task__f .rcpt__g path');
  const fresh = card.querySelector('.qlist .is-new');
  if (reduced) {
    if (chip) fade(chip);
    if (row) fade(row);
    if (fresh) fade(fresh);
    return;
  }
  const settle = chSpringCurve('settle');
  chip?.animate([{ opacity: 0, transform: 'scale(0.8)' }, { opacity: 1, transform: 'none' }], { duration: settle.ms, easing: settle.linear });
  if (row) rise(row, 6, settle.ms, settle.linear);
  disc?.animate([{ transform: 'scale(0.4)' }, { transform: 'none' }], { duration: settle.ms, easing: settle.linear });
  check?.animate([{ strokeDasharray: '22', strokeDashoffset: 22 }, { strokeDasharray: '22', strokeDashoffset: 0 }], { duration: CH_DUR.release * 1000, delay: 100, easing: ease, fill: 'backwards' });
  fresh?.animate([{ opacity: 0, transform: 'translateY(-14px) scale(1.04)' }, { opacity: 1, transform: 'none' }], { duration: settle.ms, easing: settle.linear });
}

/** M-TOLD: the row under the receipt. */
export function toldIn(row: Element | null, reduced: boolean): void {
  if (!row) return;
  if (reduced) fade(row);
  else rise(row, 6, 260, ease);
}
