// @vitest-environment jsdom
/**
 * ============================================================================
 * ResizableWorkspace — desktop power-user shell (queue | evidence | assistant)
 * ----------------------------------------------------------------------------
 * Pointer-drag is intentionally NOT exercised here: jsdom implements neither
 * `Element.setPointerCapture` nor a non-zero `getBoundingClientRect`, so a
 * simulated drag would only be testing the polyfill, not the component. The
 * pointer handler and the keyboard handler both funnel into the same
 * `resizeAt` — the keyboard tests below cover that shared math directly.
 * ========================================================================== */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { ResizableWorkspace } from '../ResizableWorkspace';

function mockMatchMedia(matches: (query: string) => boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: matches(query),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}
const mockDesktop = () => mockMatchMedia((q) => q === '(min-width: 768px)');
const mockMobile = () => mockMatchMedia(() => false);

function percents(root: HTMLElement): number[] {
  return root.style.gridTemplateColumns
    .split(' ')
    .filter((t) => t.endsWith('%'))
    .map((t) => parseFloat(t));
}

beforeEach(() => {
  mockMobile();
  window.localStorage.clear();
});
afterEach(() => {
  mockMobile();
  window.localStorage.clear();
});

describe('ResizableWorkspace — mobile fallback (below md)', () => {
  it('renders ONLY center by default — no left/right, no handles', () => {
    render(
      <ResizableWorkspace
        left={<div>Queue</div>}
        center={<div>Evidence</div>}
        right={<div>Assistant</div>}
      />,
    );
    expect(screen.getByText('Evidence')).toBeInTheDocument();
    expect(screen.queryByText('Queue')).not.toBeInTheDocument();
    expect(screen.queryByText('Assistant')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('separator')).toHaveLength(0);
  });

  it('renderMobile REPLACES the center-only default when provided', () => {
    render(
      <ResizableWorkspace
        left={<div>Queue</div>}
        center={<div>Evidence</div>}
        right={<div>Assistant</div>}
        renderMobile={<div>Mobile switcher</div>}
      />,
    );
    expect(screen.getByText('Mobile switcher')).toBeInTheDocument();
    expect(screen.queryByText('Evidence')).not.toBeInTheDocument();
  });
});

describe('ResizableWorkspace — desktop layout', () => {
  it('renders left/center/right and one handle per boundary', () => {
    mockDesktop();
    render(
      <ResizableWorkspace left={<div>Queue</div>} center={<div>Evidence</div>} right={<div>Assistant</div>} />,
    );
    expect(screen.getByText('Queue')).toBeInTheDocument();
    expect(screen.getByText('Evidence')).toBeInTheDocument();
    expect(screen.getByText('Assistant')).toBeInTheDocument();
    expect(screen.getAllByRole('separator')).toHaveLength(2);
  });

  it('omitting `right` drops that pane and its handle (2-pane workspace)', () => {
    mockDesktop();
    render(<ResizableWorkspace left={<div>Schedule</div>} center={<div>Inspector</div>} />);
    expect(screen.getByText('Schedule')).toBeInTheDocument();
    expect(screen.getByText('Inspector')).toBeInTheDocument();
    expect(screen.getAllByRole('separator')).toHaveLength(1);
  });

  it('every handle is a keyboard-focusable vertical separator', () => {
    mockDesktop();
    render(<ResizableWorkspace left={<div>A</div>} center={<div>B</div>} right={<div>C</div>} />);
    for (const handle of screen.getAllByRole('separator')) {
      expect(handle).toHaveAttribute('aria-orientation', 'vertical');
      expect(handle).toHaveAttribute('tabIndex', '0');
    }
  });

  it('splits evenly with no defaultLayout', () => {
    mockDesktop();
    const { container } = render(
      <ResizableWorkspace left={<div>A</div>} center={<div>B</div>} right={<div>C</div>} />,
    );
    const root = container.querySelector('[data-slot="fw-resizable-workspace"]') as HTMLElement;
    for (const pct of percents(root)) expect(pct).toBeCloseTo(100 / 3, 1);
  });

  it('honors an explicit defaultLayout on initial mount ("default" is initial-only, like defaultOpen)', () => {
    mockDesktop();
    const { container } = render(
      <ResizableWorkspace
        left={<div>A</div>}
        center={<div>B</div>}
        right={<div>C</div>}
        defaultLayout={[24, 48, 28]}
      />,
    );
    const root = container.querySelector('[data-slot="fw-resizable-workspace"]') as HTMLElement;
    expect(percents(root)).toEqual([24, 48, 28]);
  });
});

describe('ResizableWorkspace — keyboard resize', () => {
  it('ArrowRight on a handle grows the pane before it and shrinks the pane after it by 2 points', () => {
    mockDesktop();
    const { container } = render(
      <ResizableWorkspace
        left={<div>A</div>}
        center={<div>B</div>}
        right={<div>C</div>}
        defaultLayout={[30, 40, 30]}
      />,
    );
    const root = container.querySelector('[data-slot="fw-resizable-workspace"]') as HTMLElement;
    const [firstHandle] = screen.getAllByRole('separator');
    firstHandle!.focus();
    fireEvent.keyDown(firstHandle!, { key: 'ArrowRight' });
    expect(percents(root)).toEqual([32, 38, 30]);
  });

  it('ArrowLeft shrinks the pane before the handle and grows the pane after it', () => {
    mockDesktop();
    const { container } = render(
      <ResizableWorkspace
        left={<div>A</div>}
        center={<div>B</div>}
        right={<div>C</div>}
        defaultLayout={[30, 40, 30]}
      />,
    );
    const root = container.querySelector('[data-slot="fw-resizable-workspace"]') as HTMLElement;
    const [firstHandle] = screen.getAllByRole('separator');
    firstHandle!.focus();
    fireEvent.keyDown(firstHandle!, { key: 'ArrowLeft' });
    expect(percents(root)).toEqual([28, 42, 30]);
  });

  it('never resizes a pane below its minimum', () => {
    mockDesktop();
    const { container } = render(
      <ResizableWorkspace
        left={<div>A</div>}
        center={<div>B</div>}
        right={<div>C</div>}
        defaultLayout={[16, 68, 16]}
        minSizes={{ left: 15, center: 24, right: 15 }}
      />,
    );
    const root = container.querySelector('[data-slot="fw-resizable-workspace"]') as HTMLElement;
    const [firstHandle] = screen.getAllByRole('separator');
    firstHandle!.focus();
    // Repeated ArrowLeft would push `left` under its 15% floor without the clamp.
    for (let i = 0; i < 5; i++) {
      fireEvent.keyDown(firstHandle!, { key: 'ArrowLeft' });
    }
    const [leftPct] = percents(root);
    expect(leftPct).toBeGreaterThanOrEqual(15);
  });
});

describe('ResizableWorkspace — collapse (Home/End + chevron button)', () => {
  it('Home on the left handle collapses the left pane, handing its size to center; Home again restores it', () => {
    mockDesktop();
    const { container } = render(
      <ResizableWorkspace
        left={<div>Queue</div>}
        center={<div>Evidence</div>}
        right={<div>Assistant</div>}
        defaultLayout={[24, 48, 28]}
        collapsible={{ left: true }}
      />,
    );
    const root = container.querySelector('[data-slot="fw-resizable-workspace"]') as HTMLElement;
    const [leftHandle] = screen.getAllByRole('separator');
    leftHandle!.focus();
    fireEvent.keyDown(leftHandle!, { key: 'Home' });
    let [leftPct, centerPct] = percents(root);
    expect(leftPct).toBe(0);
    expect(centerPct).toBeCloseTo(72, 5);

    fireEvent.keyDown(leftHandle!, { key: 'Home' });
    [leftPct, centerPct] = percents(root);
    expect(leftPct).toBeCloseTo(24, 5);
    expect(centerPct).toBeCloseTo(48, 5);
  });

  it('the collapse chevron button toggles the same collapsed state as Home/End', () => {
    mockDesktop();
    render(
      <ResizableWorkspace
        left={<div>Queue</div>}
        center={<div>Evidence</div>}
        right={<div>Assistant</div>}
        collapsible={{ left: true }}
      />,
    );
    const button = screen.getByRole('button', { name: 'Collapse left panel' });
    fireEvent.click(button);
    expect(screen.getByRole('button', { name: 'Expand left panel' })).toBeInTheDocument();
  });

  it('a non-collapsible side ignores Home/End and renders no chevron', () => {
    mockDesktop();
    const { container } = render(
      <ResizableWorkspace left={<div>Queue</div>} center={<div>Evidence</div>} right={<div>Assistant</div>} defaultLayout={[24, 48, 28]} />,
    );
    expect(screen.queryByRole('button', { name: /Collapse|Expand/ })).not.toBeInTheDocument();
    const root = container.querySelector('[data-slot="fw-resizable-workspace"]') as HTMLElement;
    const [leftHandle] = screen.getAllByRole('separator');
    leftHandle!.focus();
    fireEvent.keyDown(leftHandle!, { key: 'Home' });
    expect(percents(root)).toEqual([24, 48, 28]);
  });
});

describe('ResizableWorkspace — layout persistence', () => {
  it('persists sizes to localStorage under storageKey after a resize', () => {
    mockDesktop();
    render(
      <ResizableWorkspace
        left={<div>A</div>}
        center={<div>B</div>}
        right={<div>C</div>}
        defaultLayout={[30, 40, 30]}
        storageKey="workspace-test"
      />,
    );
    const [firstHandle] = screen.getAllByRole('separator');
    firstHandle!.focus();
    fireEvent.keyDown(firstHandle!, { key: 'ArrowRight' });

    const raw = window.localStorage.getItem('workspace-test');
    expect(raw).not.toBeNull();
    const saved = JSON.parse(raw!) as number[];
    expect(saved[0]).toBeCloseTo(32, 5);
  });

  it('loads a previously saved layout on mount instead of defaultLayout', () => {
    window.localStorage.setItem('workspace-test-2', JSON.stringify([50, 30, 20]));
    mockDesktop();
    const { container } = render(
      <ResizableWorkspace
        left={<div>A</div>}
        center={<div>B</div>}
        right={<div>C</div>}
        defaultLayout={[24, 48, 28]}
        storageKey="workspace-test-2"
      />,
    );
    const root = container.querySelector('[data-slot="fw-resizable-workspace"]') as HTMLElement;
    expect(percents(root)).toEqual([50, 30, 20]);
  });
});
