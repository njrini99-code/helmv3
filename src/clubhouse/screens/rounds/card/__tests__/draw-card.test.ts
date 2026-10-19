import { describe, expect, it, vi } from 'vitest';
import { PREVIEW_REVIEW, PREVIEW_REVIEW_NO_SG } from '../../../../preview/fixtures-round-review';
import { buildCard } from '../card-model';
import { CARD_SCALE, CARD_W, cardHeight, drawRoundCard, renderCardCanvas, type CardPalette } from '../draw-card';

/** P011 round card: the Canvas 2D drawing. jsdom has no canvas, so the context is a recorder. */

const palette: CardPalette = { paper: '#fff', ink: '#000', soft: '#333', faint: '#444', frame: '#b09560', rule: '#ccc', ruleSoft: '#ddd', under: '#b03a2e', gain: '#155a39', loss: '#865608', band: '#eee', brand: '#155a39', sans: 'sans-serif' };

function recorder() {
  const texts: string[] = [];
  const calls: string[] = [];
  const g = new Proxy(
    { textAlign: 'left', font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, textBaseline: 'alphabetic', measureText: (t: string) => ({ width: t.length * 6 }), fillText: (t: string) => texts.push(t) },
    {
      get(target, k: string) {
        if (k in target) return (target as Record<string, unknown>)[k];
        return (...a: unknown[]) => void calls.push(`${k}(${a.join(',')})`);
      },
      set(target, k: string, v) {
        (target as Record<string, unknown>)[k] = v;
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  return { g, texts, calls };
}

describe('drawRoundCard', () => {
  const m = buildCard(PREVIEW_REVIEW);

  it('draws the head, every hole’s score, the nines’ subtotals and the strokes gained', () => {
    const { g, texts } = recorder();
    const h = drawRoundCard(g, m, { sg: true, tally: true }, palette);
    expect(h).toBe(cardHeight(m, { sg: true, tally: true }));
    expect(texts).toContain('Finley GC');
    expect(texts).toContain('74');
    expect(texts).toContain('+2');
    expect(texts.filter((t) => t === 'Hole')).toHaveLength(2);
    expect(texts).toEqual(expect.arrayContaining(['Out', 'In', '37', 'Strokes gained', '+0.6', 'Approach', '+1.3', '−0.9']));
    expect(texts.some((t) => t.includes('Par 72') && t.includes('18 holes'))).toBe(true);
    for (const n of Array.from({ length: 18 }, (_, i) => String(i + 1))) expect(texts).toContain(n);
  });

  it('says whose round it is and where it came from: the name in the kicker, Golfhelm and the team in the foot', () => {
    const who = buildCard(PREVIEW_REVIEW, { name: 'Jonah Okafor', team: 'Varsity' });
    const { g, texts } = recorder();
    drawRoundCard(g, who, { sg: true, tally: true }, palette);
    expect(texts).toContain('Jonah Okafor · Wed Oct 14 · Practice');
    expect(texts).toContain('Golfhelm');
    expect(texts).toContain('Varsity');
    const bare = recorder();
    drawRoundCard(bare.g, m, { sg: true, tally: true }, palette);
    expect(bare.texts).toContain('Golfhelm');
    expect(bare.texts).not.toContain('Varsity');
  });

  it('leaves the strokes gained and the putts and greens off when asked', () => {
    const full = cardHeight(m, { sg: true, tally: true });
    const plain = cardHeight(m, { sg: false, tally: false });
    expect(plain).toBeLessThan(full);
    const { g, texts } = recorder();
    drawRoundCard(g, m, { sg: false, tally: false }, palette);
    expect(texts).not.toContain('Strokes gained');
    expect(texts).not.toContain('Putts');
    expect(texts).not.toContain('FIR');
    expect(texts).toContain('Score');
  });

  it('a round with no strokes gained has no strip to draw', () => {
    const none = buildCard(PREVIEW_REVIEW_NO_SG);
    expect(cardHeight(none, { sg: true, tally: true })).toBe(cardHeight(none, { sg: false, tally: true }));
  });

  it('a nine-hole round is one band, so a shorter picture', () => {
    const nine = buildCard({ ...PREVIEW_REVIEW, holesPlayed: 9, holes: PREVIEW_REVIEW.holes.slice(0, 9) });
    expect(cardHeight(nine, { sg: true, tally: true })).toBeLessThan(cardHeight(m, { sg: true, tally: true }));
    const { g, texts } = recorder();
    drawRoundCard(g, nine, { sg: true, tally: true }, palette);
    expect(texts.filter((t) => t === 'Hole')).toHaveLength(1);
    expect(texts).not.toContain('In');
  });

  it('draws circles for the birdies and squares for the bogeys', () => {
    const { g, calls } = recorder();
    drawRoundCard(g, m, { sg: false, tally: false }, palette);
    expect(calls.filter((c) => c.startsWith('arc(')).length).toBe(2); // the two birdies, one ring each
    expect(calls.filter((c) => c.startsWith('rect(') || c.startsWith('roundRect(')).length).toBeGreaterThanOrEqual(4);
  });
});

describe('renderCardCanvas', () => {
  it('is 1200px wide: a 600-unit layout drawn at 2x, after the fonts load', async () => {
    expect(CARD_W * CARD_SCALE).toBe(1200);
    const { g } = recorder();
    const scale = vi.fn();
    const canvas = { width: 0, height: 0, getContext: () => Object.assign(g, { scale }) };
    const load = vi.fn().mockResolvedValue([]);
    const doc = {
      querySelector: () => null,
      documentElement: {},
      createElement: () => canvas,
      fonts: { load, ready: Promise.resolve() },
    } as unknown as Document;
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '' }));
    const m = buildCard(PREVIEW_REVIEW);
    const out = await renderCardCanvas(m, { sg: true, tally: true }, doc);
    vi.unstubAllGlobals();
    expect(out).toBe(canvas);
    expect(canvas.width).toBe(1200);
    expect(canvas.height).toBe(Math.round(cardHeight(m, { sg: true, tally: true }) * 2));
    expect(scale).toHaveBeenCalledWith(2, 2);
    // Each weight drawn is loaded first (400, 500 and 600).
    expect(load.mock.calls.map((c) => String(c[0]).split(' ')[0]).sort()).toEqual(['400', '500', '600']);
  });

  it('returns null when the device has no canvas', async () => {
    const doc = { querySelector: () => null, documentElement: {}, createElement: () => ({ width: 0, height: 0, getContext: () => null }), fonts: undefined } as unknown as Document;
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '' }));
    const out = await renderCardCanvas(buildCard(PREVIEW_REVIEW), { sg: true, tally: true }, doc);
    vi.unstubAllGlobals();
    expect(out).toBeNull();
  });
});
