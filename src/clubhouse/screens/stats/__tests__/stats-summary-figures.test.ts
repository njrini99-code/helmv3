import { describe, expect, it } from 'vitest';
import { filterFor } from '../../../data/stats-filter';
import { PREVIEW_PLAYER } from '../../../preview/fixtures-stats';
import { divergeBar, glanceTiles, hasPrevious, keyFigure, monoPath, sgTone, strongestAndLeak, windowLabel } from '../shs-figures';

describe('one source per figure', () => {
  it('reads the glance tile and the part figure from one value', () => {
    const tiles = glanceTiles(PREVIEW_PLAYER);
    expect(tiles.find((t) => t.label === 'Greens')!.value).toBe(keyFigure(PREVIEW_PLAYER, 'approach').value);
    expect(tiles.find((t) => t.label === 'Scrambling')!.value).toBe(keyFigure(PREVIEW_PLAYER, 'short').value);
    expect(tiles.find((t) => t.label === 'Fairways')!.value).toBe(keyFigure(PREVIEW_PLAYER, 'tee').value);
    expect(tiles.find((t) => t.label === 'Putts')!.value).toBe(keyFigure(PREVIEW_PLAYER, 'putting').value);
  });
  it('draws no Tour text without a standard', () => {
    expect(keyFigure({ ...PREVIEW_PLAYER, bench: {} }, 'approach').tour).toBeNull();
    expect(keyFigure(PREVIEW_PLAYER, 'tee').tour).toBeNull();
    expect(keyFigure(PREVIEW_PLAYER, 'putting').tour).toBeNull();
  });
});

describe('windows', () => {
  it('labels each window as drawn', () => {
    expect(windowLabel(filterFor('last10'))).toBe('Last 10 rounds');
    expect(windowLabel(filterFor('season'))).toBe('This season');
    expect(windowLabel(filterFor('qualifiers'))).toBe('Qualifiers');
  });
  it('says the N before only for Last 5 and Last 10', () => {
    expect(hasPrevious({ ...PREVIEW_PLAYER, filter: filterFor('season') })).toBe(false);
  });
});

describe('strokes gained', () => {
  it('is flat inside 0.05 and under three rounds', () => {
    expect(sgTone(0.04)).toBe('flat');
    expect(sgTone(1)).toBe('gain');
    expect(sgTone(1, false)).toBe('flat');
  });
  it('names the strongest and the biggest leak', () => {
    expect(strongestAndLeak([{ label: 'A', value: 1 }, { label: 'B', value: -2 }])).toEqual({ strongest: 'A', leak: { label: 'B', value: -2 } });
  });
  it('bars run from the centre', () => {
    expect(divergeBar(2, 4)).toEqual({ left: 50, width: 25 });
    expect(divergeBar(-2, 4)).toEqual({ left: 25, width: 25 });
  });
});

describe('monoPath', () => {
  it('draws nothing for one point', () => {
    expect(monoPath([[0, 0]])).toBe('');
  });
});
