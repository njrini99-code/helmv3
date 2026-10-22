// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { hoverCardWidth, PEEK_HOVER_MS, PeekTarget } from '../Peek';

vi.mock('../../lib/haptics', () => ({ haptic: vi.fn() }));

beforeAll(() => {
  (window as { PointerEvent?: unknown }).PointerEvent ??= class extends MouseEvent {
    pointerType: string;
    constructor(type: string, init: MouseEventInit & { pointerType?: string } = {}) {
      super(type, init);
      this.pointerType = init.pointerType ?? 'mouse';
    }
  };
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(window.matchMedia).mockImplementation(
    (query: string) => ({ matches: query.includes('hover: hover'), media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }) as unknown as MediaQueryList,
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('hoverCardWidth', () => {
  it('is never wider than the cell it is fitted to, however narrow the cell is', () => {
    for (const cell of [200, 240, 287, 288, 300]) expect(hoverCardWidth(true, cell)).toBeLessThanOrEqual(cell);
    expect(hoverCardWidth(true, 200)).toBe(200);
  });
  it('stops at the usual 328px in a wide cell, and an unfitted card is always 328px', () => {
    expect(hoverCardWidth(true, 500)).toBe(328);
    expect(hoverCardWidth(false, 120)).toBe(328);
  });
});

describe('PeekTarget hover card held to a cell', () => {
  it('opens no wider than a 200px cell (the grid\'s narrowest player column) and not past its right edge', () => {
    render(
      <div role="cell" data-testid="cell">
        <PeekTarget label="Theo" card={() => <p>Theo</p>} within="[role=cell]" actions={[{ label: 'Message', onSelect: () => {} }]}>
          <a href="#t">Theo</a>
        </PeekTarget>
      </div>,
    );
    const cell = screen.getByTestId('cell');
    cell.getBoundingClientRect = () => ({ x: 40, y: 100, left: 40, top: 100, right: 240, bottom: 140, width: 200, height: 40, toJSON: () => ({}) });
    fireEvent.pointerEnter(screen.getByText('Theo', { selector: 'a' }), { pointerType: 'mouse' });
    act(() => {
      vi.advanceTimersByTime(PEEK_HOVER_MS + 10);
    });
    const card = screen.getByRole('dialog');
    const width = parseFloat((card as HTMLElement).style.width);
    expect(width).toBeLessThanOrEqual(200);
    expect(parseFloat((card as HTMLElement).style.left) + width).toBeLessThanOrEqual(240);
  });
});
