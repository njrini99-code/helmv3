import { describe, expect, it } from 'vitest';
import { LETTER_CONTENT, pageCuts } from '../page-cuts';

const rows = (heights: number[], from = 0): Array<[number, number]> => {
  let at = from;
  return heights.map((h) => {
    const r: [number, number] = [at, at + h];
    at += h;
    return r;
  });
};

describe('where a printed piece breaks', () => {
  it('a piece that fits one sheet has no cut', () => {
    expect(pageCuts(900, 950, rows([300, 300, 300]))).toEqual([]);
    expect(pageCuts(950.6, 950, [])).toEqual([]);
  });
  it('cuts above the row that would not fit, never through it', () => {
    // Rows of 300: the fourth runs 900 to 1200 and would straddle 950, so the sheet ends at 900.
    expect(pageCuts(1500, 950, rows([300, 300, 300, 300, 300]))).toEqual([900]);
  });
  it('no row is ever split across the sheets it makes', () => {
    const blocks = rows([120, 225, 80, 140, 225, 96, 310, 64, 225, 180, 90, 225, 130, 75, 225, 160, 88, 140, 225, 60], 210);
    const total = blocks[blocks.length - 1]![1] + 40;
    const cuts = pageCuts(total, LETTER_CONTENT.h, blocks);
    expect(cuts.length).toBeGreaterThan(1);
    for (const cut of cuts) for (const [top, bottom] of blocks) expect(top < cut && bottom > cut).toBe(false);
    // And every sheet holds something: cuts only go forward.
    expect([...cuts].sort((a, b) => a - b)).toEqual(cuts);
    expect(new Set(cuts).size).toBe(cuts.length);
  });
  it('a row taller than a sheet starts a fresh sheet, then the sheet’s edge cuts it: nothing can keep it whole', () => {
    expect(pageCuts(2400, 950, [[100, 2300]])).toEqual([100, 1050, 2000]);
    // At the very top there is no fresh sheet to move it to.
    expect(pageCuts(2400, 950, [[0, 2300]])).toEqual([950, 1900]);
  });
  it('content with nothing to keep whole is cut at the sheet’s edge', () => {
    expect(pageCuts(2000, 950, [])).toEqual([950, 1900]);
  });
  it('one sheet is US Letter less 16mm on every side', () => {
    const px = (mm: number) => Math.round((mm * 96) / 25.4);
    expect(LETTER_CONTENT).toEqual({ w: px(215.9 - 32), h: px(279.4 - 32) });
  });
});
