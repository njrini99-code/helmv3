import type { CardModel } from './card-model';

/**
 * P011: getting the card's picture off the screen. The image is made on this device (draw-card.ts) and goes nowhere
 * else: the device's share sheet where the browser can share files, a download where it cannot. No server, no link.
 */

/** The part of `navigator` sharing needs, so each branch can be tested without a browser. */
export interface ShareNav {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data: ShareData) => boolean;
}

export type Delivery = 'shared' | 'downloaded' | 'cancelled';

/** Can this browser hand the picture to a share sheet? Decides the button's word: Share, or Save image. */
export function canShareFile(nav: ShareNav | undefined, file: File): boolean {
  if (!nav || typeof nav.share !== 'function') return false;
  return typeof nav.canShare === 'function' ? nav.canShare({ files: [file] }) : true;
}

/** "finley-gc-2026-10-14-74.png": the course, the date and the score, so a folder of cards sorts itself. */
export function cardFileName(m: CardModel, date: string): string {
  const course = m.course
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return [course || 'round', date.slice(0, 10), m.total.score].filter((p) => p != null && p !== '').join('-') + '.png';
}

/**
 * Shares the file when the device can, otherwise downloads it. Closing the share sheet (AbortError) is not a failure and
 * is reported as `cancelled`; a share the browser refuses (the tap's permission lapsed, NotAllowedError) falls back to the
 * download, so the player still ends up with the picture. Any other error is thrown for the caller to say so.
 */
export async function deliverCard(file: File, title: string, env: { nav: ShareNav | undefined; download: (file: File) => void }): Promise<Delivery> {
  if (canShareFile(env.nav, file)) {
    try {
      await env.nav!.share!({ files: [file], title });
      return 'shared';
    } catch (e) {
      const name = e instanceof Error || e instanceof DOMException ? e.name : '';
      if (name === 'AbortError') return 'cancelled';
      if (name !== 'NotAllowedError') throw e;
    }
  }
  env.download(file);
  return 'downloaded';
}

/** Saves a file through a link: the blob address is released a moment later, after the browser has taken it. */
export function downloadFile(file: File, doc: Document = document): void {
  const url = URL.createObjectURL(file);
  const a = doc.createElement('a');
  a.href = url;
  a.download = file.name;
  a.rel = 'noopener';
  doc.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
