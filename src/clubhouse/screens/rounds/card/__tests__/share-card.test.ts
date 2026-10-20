import { describe, expect, it, vi } from 'vitest';
import { PREVIEW_REVIEW } from '../../../../preview/fixtures-round-review';
import { buildCard } from '../card-model';
import { canShareFile, cardFileName, deliverCard, type ShareNav } from '../share-card';

/** P011 round card: getting the picture off the screen (share sheet, or a download). */

const file = new File([new Uint8Array([1, 2, 3])], 'card.png', { type: 'image/png' });
const named = (name: string) => Object.assign(new Error(name), { name });

describe('cardFileName', () => {
  it('is the course, the date and the score', () => {
    expect(cardFileName(buildCard(PREVIEW_REVIEW), '2026-10-14')).toBe('finley-gc-2026-10-14-74.png');
  });
  it('flattens accents and punctuation, and survives a name with nothing to keep', () => {
    const m = buildCard({ ...PREVIEW_REVIEW, course: 'Café du Lac — Nº 2 & Pines' });
    expect(cardFileName(m, '2026-10-14T12:00:00Z')).toBe('cafe-du-lac-no-2-pines-2026-10-14-74.png');
    expect(cardFileName(buildCard({ ...PREVIEW_REVIEW, course: '***', score: null }), '2026-10-14')).toBe('round-2026-10-14.png');
  });
});

describe('canShareFile', () => {
  it('needs share, and a canShare that accepts files when it has one', () => {
    expect(canShareFile(undefined, file)).toBe(false);
    expect(canShareFile({}, file)).toBe(false);
    expect(canShareFile({ share: vi.fn() }, file)).toBe(true);
    expect(canShareFile({ share: vi.fn(), canShare: () => false }, file)).toBe(false);
    expect(canShareFile({ share: vi.fn(), canShare: (d) => Boolean(d.files?.length) }, file)).toBe(true);
  });
});

describe('deliverCard branches', () => {
  const run = (nav: ShareNav | undefined) => {
    const download = vi.fn();
    return { download, result: deliverCard(file, 'Finley GC · 74', { nav, download }) };
  };

  it('shares the file when the device can', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const { download, result } = run({ share, canShare: () => true });
    await expect(result).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({ files: [file], title: 'Finley GC · 74' });
    expect(download).not.toHaveBeenCalled();
  });

  it('downloads when there is no share sheet', async () => {
    const { download, result } = run(undefined);
    await expect(result).resolves.toBe('downloaded');
    expect(download).toHaveBeenCalledWith(file);
  });

  it('downloads when the browser will not share files', async () => {
    const share = vi.fn();
    const { download, result } = run({ share, canShare: () => false });
    await expect(result).resolves.toBe('downloaded');
    expect(share).not.toHaveBeenCalled();
    expect(download).toHaveBeenCalledTimes(1);
  });

  it('closing the share sheet is not a failure and downloads nothing', async () => {
    const { download, result } = run({ share: vi.fn().mockRejectedValue(named('AbortError')) });
    await expect(result).resolves.toBe('cancelled');
    expect(download).not.toHaveBeenCalled();
  });

  it('a share the browser refuses (the tap’s permission lapsed) falls back to the download', async () => {
    const { download, result } = run({ share: vi.fn().mockRejectedValue(named('NotAllowedError')) });
    await expect(result).resolves.toBe('downloaded');
    expect(download).toHaveBeenCalledWith(file);
  });

  it('any other error is thrown for the caller to report, with no download behind it', async () => {
    const { download, result } = run({ share: vi.fn().mockRejectedValue(named('DataError')) });
    await expect(result).rejects.toThrow('DataError');
    expect(download).not.toHaveBeenCalled();
  });
});
