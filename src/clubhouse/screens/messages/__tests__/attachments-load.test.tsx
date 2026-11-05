/**
 * Attachment tiles (audit Messages L1, L6).
 *  - The message row can reach a recipient before its attachment rows exist, so an empty answer for a message flagged
 *    as having files is asked once more before it is believed.
 *  - A signed URL lives an hour: a tile loaded long ago reads again when the tab comes back, and keeps the files on
 *    screen while it does.
 */
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChAttachment } from '../model';
import { Attachments } from '../MessagesView';

const file = (url: string): ChAttachment => ({ id: 'a1', name: 'range.png', size: 1200, mime: 'image/png', url });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const flush = async (ms = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

describe('Attachments', () => {
  it('asks again once when the first answer is empty, then shows the files that arrived', async () => {
    const load = vi.fn<(id: string) => Promise<ChAttachment[] | null>>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([file('https://signed/1')]);
    render(<Attachments load={load} id="m1" mine={false} />);
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
    expect(screen.queryByAltText('range.png')).toBeNull();
    await flush(1600);
    expect(load).toHaveBeenCalledTimes(2);
    expect(screen.getByAltText('range.png').getAttribute('src')).toBe('https://signed/1');
  });

  it('believes a second empty answer and does not keep asking', async () => {
    const load = vi.fn<(id: string) => Promise<ChAttachment[] | null>>().mockResolvedValue([]);
    render(<Attachments load={load} id="m1" mine={false} />);
    await flush(5000);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('re-signs the files when the tab returns after 45 minutes, keeping them on screen', async () => {
    const load = vi.fn<(id: string) => Promise<ChAttachment[] | null>>()
      .mockResolvedValueOnce([file('https://signed/old')])
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce([file('https://signed/new')]);
    render(<Attachments load={load} id="m1" mine={false} />);
    await flush();
    expect(screen.getByAltText('range.png').getAttribute('src')).toBe('https://signed/old');

    // Back too soon: nothing to refresh.
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await flush();
    expect(load).toHaveBeenCalledTimes(1);

    await flush(46 * 60_000);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await flush();
    // The refresh failed: the old tile stays, no error button replaces it.
    expect(load).toHaveBeenCalledTimes(2);
    expect(screen.getByAltText('range.png').getAttribute('src')).toBe('https://signed/old');

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await flush();
    expect(load).toHaveBeenCalledTimes(3);
    expect(screen.getByAltText('range.png').getAttribute('src')).toBe('https://signed/new');
  });
});
