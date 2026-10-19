import { formatSigned, formatToPar, NO_DATA } from '../../../lib/format';
import { countText, figure, holesLine, type CardBand, type CardHole, type CardModel } from './card-model';

/**
 * P011: the round card drawn with the Canvas 2D API, from the card's data (not a rasterised copy of the page). The layout
 * is 600 units wide and is drawn at 2x, so the picture is 1200px across. Two bands of nine on a page of ledger paper, in
 * the house type and the page's own colours. Numbers are centred in a cell of their own, since a canvas has no
 * tabular-figures setting.
 */

export const CARD_W = 600;
export const CARD_SCALE = 2;

const PAD = 36;
const LABEL_W = 52;
const HOLE_W = 44;
const TOT_W = CARD_W - PAD * 2 - LABEL_W - HOLE_W * 9;
const HEAD_H = 118;
const ROW = { head: 28, par: 26, score: 36, putts: 26, mark: 24 } as const;
const BAND_GAP = 20;
const SG_H = 68;

export interface CardPalette {
  paper: string;
  ink: string;
  soft: string;
  faint: string;
  frame: string;
  rule: string;
  ruleSoft: string;
  under: string;
  gain: string;
  loss: string;
  band: string;
  sans: string;
}

/** What goes on the picture: the player can leave the strokes gained, or the putts and greens, off a card they share. */
export interface CardOptions {
  sg: boolean;
  tally: boolean;
}

/** The page's own tokens, read at draw time, so the card is drawn in the Clubhouse's ink and paper (light or night). */
export function readPalette(doc: Document = document): CardPalette {
  const host = doc.querySelector('[data-ui="clubhouse"]') ?? doc.documentElement;
  const cs = getComputedStyle(host);
  const t = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    paper: t('--ch-sheet-bg', '#fdfbf7'),
    ink: t('--ch-ink-900', '#1c1b18'),
    soft: t('--ch-text-secondary', '#3a3833'),
    faint: t('--ch-text-tertiary', '#46433d'),
    frame: t('--ch-champagne-500', '#b09560'),
    rule: t('--ch-ledger-rule', 'rgb(110 98 62 / 0.16)'),
    ruleSoft: t('--ch-ledger-rule-soft', 'rgb(110 98 62 / 0.09)'),
    under: t('--ch-score-under', '#b03a2e'),
    gain: t('--ch-chart-gain', '#155a39'),
    loss: t('--ch-chart-loss', '#865608'),
    band: t('--ch-ledger-row-hover', 'rgb(110 98 62 / 0.05)'),
    sans: t('--ch-font-sans', 'system-ui, sans-serif'),
  };
}

const bandRows = (m: CardModel, o: CardOptions) => ({ putts: o.tally && m.rows.putts, fir: o.tally && m.rows.fir, gir: o.tally && m.rows.gir });

function bandHeight(m: CardModel, o: CardOptions): number {
  const r = bandRows(m, o);
  return ROW.head + ROW.par + ROW.score + (r.putts ? ROW.putts : 0) + (r.fir ? ROW.mark : 0) + (r.gir ? ROW.mark : 0);
}

/** The picture's height in layout units, so the canvas can be sized before anything is drawn. */
export function cardHeight(m: CardModel, o: CardOptions): number {
  const sg = o.sg && m.sg ? SG_H : 0;
  return PAD + HEAD_H + m.bands.length * bandHeight(m, o) + (m.bands.length - 1) * BAND_GAP + (sg ? 24 + sg : 0) + PAD;
}

const FONT = (p: CardPalette, w: 400 | 500 | 600, px: number) => `${w} ${px}px ${p.sans}`;

/** The text cut to a width with an ellipsis, for a long course name. */
function fit(g: CanvasRenderingContext2D, text: string, width: number): string {
  if (g.measureText(text).width <= width) return text;
  let s = text;
  while (s.length > 1 && g.measureText(s + '…').width > width) s = s.slice(0, -1);
  return s.trimEnd() + '…';
}

function rrect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  if (typeof g.roundRect === 'function') g.roundRect(x, y, w, h, r);
  else g.rect(x, y, w, h);
}

function hline(g: CanvasRenderingContext2D, y: number, color: string, x1 = PAD, x2 = CARD_W - PAD, width = 1): void {
  g.strokeStyle = color;
  g.lineWidth = width;
  g.beginPath();
  g.moveTo(x1, y);
  g.lineTo(x2, y);
  g.stroke();
}

/** One hole's notation: a circle for a birdie, a double circle for an eagle or better, a square for a bogey, a double square for a double bogey or worse. */
function drawMark(g: CanvasRenderingContext2D, p: CardPalette, mark: NonNullable<CardHole['mark']>, cx: number, cy: number): void {
  g.lineWidth = 1.6;
  if (mark === 'birdie' || mark === 'eagle') {
    g.strokeStyle = p.under;
    g.beginPath();
    g.arc(cx, cy, 10, 0, Math.PI * 2);
    g.stroke();
    if (mark === 'eagle') {
      g.beginPath();
      g.arc(cx, cy, 14, 0, Math.PI * 2);
      g.stroke();
    }
    return;
  }
  g.strokeStyle = p.ink;
  rrect(g, cx - 10, cy - 10, 20, 20, 5);
  g.stroke();
  if (mark === 'double') {
    rrect(g, cx - 14, cy - 14, 28, 28, 8);
    g.stroke();
  }
}

function drawYesNo(g: CanvasRenderingContext2D, p: CardPalette, v: boolean | null, cx: number, cy: number): void {
  if (v == null) {
    g.fillStyle = p.faint;
    g.font = FONT(p, 400, 12);
    g.fillText(NO_DATA, cx, cy + 4);
    return;
  }
  g.beginPath();
  g.arc(cx, cy, 3.6, 0, Math.PI * 2);
  if (v) {
    g.fillStyle = p.ink;
    g.fill();
  } else {
    g.strokeStyle = p.soft;
    g.lineWidth = 1.4;
    g.stroke();
  }
}

function drawBand(g: CanvasRenderingContext2D, p: CardPalette, m: CardModel, o: CardOptions, b: CardBand, top: number): void {
  const r = bandRows(m, o);
  const colX = (i: number) => PAD + LABEL_W + HOLE_W * i + HOLE_W / 2;
  const totX = PAD + LABEL_W + HOLE_W * 9 + TOT_W / 2;
  const cell = (text: string, x: number, y: number, font: string, color: string) => {
    g.font = font;
    g.fillStyle = color;
    g.fillText(text, x, y);
  };
  let y = top;
  // The hole numbers, on a tinted head.
  g.fillStyle = p.band;
  g.fillRect(PAD, y, CARD_W - PAD * 2, ROW.head);
  g.textAlign = 'left';
  cell('Hole', PAD + 8, y + 18, FONT(p, 600, 12.5), p.ink);
  g.textAlign = 'center';
  b.holes.forEach((h, i) => cell(String(h.n), colX(i), y + 18, FONT(p, 500, 12.5), p.soft));
  cell(b.label, totX, y + 18, FONT(p, 600, 12.5), p.ink);
  y += ROW.head;
  hline(g, y, p.rule);
  // Par.
  g.textAlign = 'left';
  cell('Par', PAD + 8, y + 17, FONT(p, 500, 12.5), p.soft);
  g.textAlign = 'center';
  b.holes.forEach((h, i) => cell(figure(h.par), colX(i), y + 17, FONT(p, 400, 13), p.soft));
  cell(figure(b.par), totX, y + 17, FONT(p, 500, 13), p.soft);
  y += ROW.par;
  hline(g, y, p.ruleSoft);
  // Score, with its marks.
  g.textAlign = 'left';
  cell('Score', PAD + 8, y + 23, FONT(p, 600, 12.5), p.ink);
  g.textAlign = 'center';
  b.holes.forEach((h, i) => {
    const cy = y + ROW.score / 2;
    if (h.mark) drawMark(g, p, h.mark, colX(i), cy);
    cell(figure(h.score), colX(i), cy + 5, FONT(p, 600, 14), h.mark === 'birdie' || h.mark === 'eagle' ? p.under : p.ink);
  });
  cell(figure(b.score), totX, y + 23, FONT(p, 600, 15), p.ink);
  y += ROW.score;
  hline(g, y, p.ruleSoft);
  if (r.putts) {
    g.textAlign = 'left';
    cell('Putts', PAD + 8, y + 17, FONT(p, 500, 12.5), p.soft);
    g.textAlign = 'center';
    b.holes.forEach((h, i) => cell(figure(h.putts), colX(i), y + 17, FONT(p, h.putts != null && h.putts >= 3 ? 600 : 400, 13), h.putts != null && h.putts >= 3 ? p.loss : p.soft));
    cell(figure(b.putts), totX, y + 17, FONT(p, 500, 13), p.soft);
    y += ROW.putts;
    hline(g, y, p.ruleSoft);
  }
  for (const [key, label] of [['fir', 'FIR'], ['gir', 'GIR']] as const) {
    if (!r[key]) continue;
    g.textAlign = 'left';
    cell(label, PAD + 8, y + 16, FONT(p, 500, 12.5), p.soft);
    g.textAlign = 'center';
    b.holes.forEach((h, i) => drawYesNo(g, p, h[key], colX(i), y + 12));
    cell(countText(b[key]), totX, y + 16, FONT(p, 500, 12.5), p.soft);
    y += ROW.mark;
  }
  hline(g, top + bandHeight(m, o), p.rule);
}

/**
 * Draws the card into a context whose coordinate space is already scaled by CARD_SCALE; returns its height in layout units.
 * The caller sizes the canvas with `cardHeight` first.
 */
export function drawRoundCard(g: CanvasRenderingContext2D, m: CardModel, o: CardOptions, p: CardPalette): number {
  const H = cardHeight(m, o);
  g.fillStyle = p.paper;
  g.fillRect(0, 0, CARD_W, H);
  // A double engraved rule inset from the edge, as the ledger's head.
  g.strokeStyle = p.frame;
  g.lineWidth = 1.5;
  g.strokeRect(10, 10, CARD_W - 20, H - 20);
  g.lineWidth = 0.75;
  g.strokeRect(14, 14, CARD_W - 28, H - 28);
  g.textBaseline = 'alphabetic';
  // Head: kicker, course, tees on the left; the score and its to par on the right.
  const scoreW = 110;
  g.textAlign = 'left';
  g.fillStyle = p.soft;
  g.font = FONT(p, 500, 13);
  g.fillText(fit(g, m.kicker, CARD_W - PAD * 2 - scoreW), PAD, PAD + 18);
  g.fillStyle = p.ink;
  g.font = FONT(p, 600, 28);
  g.fillText(fit(g, m.course, CARD_W - PAD * 2 - scoreW), PAD, PAD + 52);
  const sub = [m.tees, m.total.par != null ? `Par ${m.total.par}` : null, holesLine(m)].filter(Boolean).join(' · ');
  g.fillStyle = p.soft;
  g.font = FONT(p, 400, 13);
  g.fillText(fit(g, sub, CARD_W - PAD * 2 - scoreW), PAD, PAD + 76);
  g.textAlign = 'right';
  g.fillStyle = p.ink;
  g.font = FONT(p, 600, 54);
  g.fillText(figure(m.total.score), CARD_W - PAD, PAD + 52);
  const under = m.total.toPar != null && m.total.toPar < 0;
  g.fillStyle = under ? p.under : m.total.toPar != null && m.total.toPar > 0 ? p.loss : p.ink;
  g.font = FONT(p, 600, 18);
  g.fillText(formatToPar(m.total.toPar), CARD_W - PAD, PAD + 78);
  hline(g, PAD + HEAD_H - 14, p.frame, PAD, CARD_W - PAD, 1);
  let y = PAD + HEAD_H;
  m.bands.forEach((b, i) => {
    drawBand(g, p, m, o, b, y);
    y += bandHeight(m, o) + (i < m.bands.length - 1 ? BAND_GAP : 0);
  });
  // Strokes gained is the strip at the foot: the total, then the four legs.
  if (o.sg && m.sg) {
    y += 24;
    hline(g, y, p.frame, PAD, CARD_W - PAD, 1);
    const cells: Array<[string, number | null, boolean]> = [['Strokes gained', m.sg.total, true], ...m.sg.legs.map((l) => [l.label, l.value, false] as [string, number | null, boolean])];
    const w = (CARD_W - PAD * 2) / cells.length;
    g.textAlign = 'center';
    cells.forEach(([label, v, bold], i) => {
      const cx = PAD + w * i + w / 2;
      g.fillStyle = p.soft;
      g.font = FONT(p, bold ? 600 : 500, 11.5);
      g.fillText(label, cx, y + 24);
      g.fillStyle = v == null || Math.abs(v) < 0.05 ? p.ink : v > 0 ? p.gain : p.loss;
      g.font = FONT(p, 600, bold ? 22 : 19);
      g.fillText(formatSigned(v), cx, y + 52);
    });
  }
  return H;
}

/** Loads every weight the card draws before anything is drawn: a canvas does not wait for a font a page has not used yet. */
export async function loadCardFonts(p: CardPalette, doc: Document = document): Promise<void> {
  const fonts = doc.fonts;
  if (!fonts) return;
  try {
    await Promise.all(([400, 500, 600] as const).map((w) => fonts.load(`${w} 16px ${p.sans}`, '0123456789+−—ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz')));
    await fonts.ready;
  } catch {
    // The page's fallback type draws the card, which is better than no card.
  }
}

/** The card as a canvas, 1200px wide. */
export async function renderCardCanvas(m: CardModel, o: CardOptions, doc: Document = document): Promise<HTMLCanvasElement | null> {
  const p = readPalette(doc);
  await loadCardFonts(p, doc);
  const canvas = doc.createElement('canvas');
  canvas.width = CARD_W * CARD_SCALE;
  canvas.height = Math.round(cardHeight(m, o) * CARD_SCALE);
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.scale(CARD_SCALE, CARD_SCALE);
  drawRoundCard(g, m, o, p);
  return canvas;
}

export function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}
