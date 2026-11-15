import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StoriesCard } from '../Stories';

vi.mock('../../../../lib/use-phone', () => ({ useChPhone: () => true }));

const brief = {
  week: 'Week of Nov 6',
  counts: null,
  reads: [
    { id: 'r1', kind: 'read', who: 'Cole Bennett', title: 'Lag putts', href: '/x', behind: 'Three three-putts.', next: null },
    { id: 'r2', kind: 'read', who: 'Eli Brandt', title: 'Two doubles from penalties', href: '/y', behind: 'Both drives went into the hazard.', next: null },
  ],
  working: [],
} as never;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/**
 * F-0012 (AX-03): on the phone, closing a This week story left focus on the page. Safari focuses no tile it is tapped
 * on, so the viewer's opener, read from document.activeElement, was the page.
 */
describe('the story viewer hands focus back to the tile that opened it', () => {
  it('after a tap that focused nothing', () => {
    vi.useFakeTimers();
    render(<StoriesCard brief={brief} themes={null} failed={false} players={[]} phone rounds={null} onDesk={() => {}} onAction={() => {}} />);
    const tile = document.querySelector<HTMLElement>('button.tile')!;
    act(() => {
      fireEvent.pointerDown(tile);
      fireEvent.click(tile);
    });
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(document.activeElement).not.toBe(tile);
    act(() => void fireEvent.keyDown(document, { key: 'Escape' }));
    act(() => void vi.advanceTimersByTime(1000));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(tile);
  });
});
