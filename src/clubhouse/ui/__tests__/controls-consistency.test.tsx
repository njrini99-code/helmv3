import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TIP_OPEN_DELAY_MS } from '../../shell/command/tooltip-clock';
import { haptic } from '../../lib/haptics';
import { Button } from '../Button';
import { SideScroll } from '../SideScroll';
import { ScrollRegion } from '../ScrollRegion';
import { Tooltip } from '../Tooltip';

vi.mock('../../lib/haptics', () => ({ haptic: vi.fn() }));

afterEach(cleanup);

describe('Button busy', () => {
  it('is in flight: aria-busy, no second press, the label stays for assistive tech, one ring is drawn', () => {
    const onClick = vi.fn();
    render(
      <Button variant="primary" busy onClick={onClick}>
        Save
      </Button>,
    );
    const b = screen.getByRole('button', { name: 'Save' });
    expect(b).toHaveAttribute('aria-busy', 'true');
    expect(b).toBeDisabled();
    expect(b.querySelectorAll('.ch-spinner')).toHaveLength(1);
    fireEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('draws no ring and takes the press when it is not busy', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    const b = screen.getByRole('button', { name: 'Save' });
    expect(b).not.toHaveAttribute('aria-busy');
    expect(b.querySelector('.ch-spinner')).toBeNull();
    fireEvent.click(b);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('a validity reason still disables it without a ring', () => {
    render(
      <Button disabled onClick={() => undefined}>
        Save
      </Button>,
    );
    const b = screen.getByRole('button', { name: 'Save' });
    expect(b).toBeDisabled();
    expect(b).not.toHaveAttribute('aria-busy');
    expect(b.querySelector('.ch-spinner')).toBeNull();
  });
});

describe('the danger key (CONS-1)', () => {
  it('warns as it is pressed, by default', () => {
    vi.mocked(haptic).mockClear();
    render(<Button variant="danger">Remove</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(haptic).toHaveBeenCalledWith('warning');
  });

  it('draws from its tokens: no literal hex in its rules', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/controls.css'), 'utf8');
    const rules = [...css.matchAll(/([^{}]*\.ch-btn--danger[^{}]*)\{([^{}]*)\}/g)];
    expect(rules.length).toBeGreaterThanOrEqual(3);
    for (const r of rules) expect(r[2], r[1]).not.toMatch(/#[0-9a-f]{3,6}\b/i);
  });
});

describe('Tooltip without a label', () => {
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
  afterEach(() => vi.useRealTimers());

  it("says the control's own aria-label, so the tip and the name cannot differ", () => {
    render(
      <Tooltip>
        <button type="button" aria-label={`Remove ${'Dana'}`} />
      </Tooltip>,
    );
    const b = screen.getByRole('button', { name: 'Remove Dana' });
    act(() => void fireEvent.pointerOver(b, { pointerType: 'mouse' }));
    act(() => void vi.advanceTimersByTime(TIP_OPEN_DELAY_MS));
    expect(document.querySelector('.ch-tip')?.textContent).toBe('Remove Dana');
  });
});

describe('sideways scrollers show there is more', () => {
  const size = (el: HTMLElement, scrollWidth: number, clientWidth: number) => {
    Object.defineProperty(el, 'scrollWidth', { configurable: true, value: scrollWidth });
    Object.defineProperty(el, 'clientWidth', { configurable: true, value: clientWidth });
  };

  it('marks only the end at rest, both mid-way, and only the start at the far end', () => {
    render(
      <SideScroll data-testid="row">
        <span>wide</span>
      </SideScroll>,
    );
    const row = screen.getByTestId('row');
    size(row, 900, 300);
    const at = (x: number) => {
      row.scrollLeft = x;
      fireEvent.scroll(row);
    };
    at(0);
    expect(row.dataset.start).toBeUndefined();
    expect(row.dataset.end).toBe('true');
    at(300);
    expect(row.dataset.start).toBe('true');
    expect(row.dataset.end).toBe('true');
    at(600);
    expect(row.dataset.start).toBe('true');
    expect(row.dataset.end).toBeUndefined();
    expect(row).toHaveClass('ch-hscroll');
  });

  it('marks nothing when the content fits', () => {
    render(<SideScroll data-testid="row" />);
    const row = screen.getByTestId('row');
    size(row, 300, 300);
    fireEvent.scroll(row);
    expect(row.dataset.start).toBeUndefined();
    expect(row.dataset.end).toBeUndefined();
  });

  it('a ScrollRegion fades unless it draws its own shadow', () => {
    render(
      <>
        <ScrollRegion label="Plain">x</ScrollRegion>
        <ScrollRegion label="Framed" fade={false}>
          x
        </ScrollRegion>
      </>,
    );
    expect(screen.getByRole('region', { name: 'Plain' })).toHaveClass('ch-hscroll');
    expect(screen.getByRole('region', { name: 'Framed' })).not.toHaveClass('ch-hscroll');
  });
});
