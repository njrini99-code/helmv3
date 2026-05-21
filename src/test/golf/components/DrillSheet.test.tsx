/**
 * DrillSheet tests — Wave 1D.
 *
 * Covers:
 *  - Renders drill detail (title, description, duration, difficulty)
 *  - Renders the insight-context breadcrumb when provided
 *  - Renders the video iframe only when `video_url` is present
 *  - "Add to my practice plan" fires the stub handler
 *  - "Done — log this drill" calls the log handler + closes the sheet
 *  - ESC key + backdrop click close the sheet (via Drawer contract)
 *  - Returns null render when `open={false}`
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { DrillSheetProps } from '@/components/golf/coachhelm/insight-card/DrillSheet';
import { DrillSheet } from '@/components/golf/coachhelm/insight-card/DrillSheet';

// Flatten framer-motion so the tap-scale + sheet animation don't gate assertions.
vi.mock('framer-motion', async () => {
  const React = await import('react');
  return {
    useReducedMotion: () => false,
    m: new Proxy(
      {},
      {
        get: (_target, prop) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          React.forwardRef<HTMLElement, any>((props, ref) => {
            const {
              children,
              whileTap: _whileTap,
              whileHover: _whileHover,
              initial: _initial,
              animate: _animate,
              exit: _exit,
              transition: _transition,
              drag: _drag,
              dragConstraints: _dragConstraints,
              dragElastic: _dragElastic,
              onDragEnd: _onDragEnd,
              ...rest
            } = props;
            void _whileTap;
            void _whileHover;
            void _initial;
            void _animate;
            void _exit;
            void _transition;
            void _drag;
            void _dragConstraints;
            void _dragElastic;
            void _onDragEnd;
            return React.createElement(prop as string, { ...rest, ref }, children);
          }),
      },
    ),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  };
});

// Don't actually call the drill-view server action from this test suite.
vi.mock('@/app/golf/actions/drills', () => ({
  recordDrillView: vi.fn(async () => undefined),
}));

// Stub the shared toast surface so `defaultAddToPlan` doesn't throw.
vi.mock('@/components/ui/toast', () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

// Stub haptic calls (legacy — Drawer no longer triggers haptics directly).
vi.mock('@/lib/utils/capacitor', () => ({
  triggerHaptic: vi.fn(async () => undefined),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function baseProps(overrides: Partial<DrillSheetProps> = {}): DrillSheetProps {
  return {
    open: true,
    onClose: vi.fn(),
    drill: {
      id: 'drill-1',
      title: 'Gate drill',
      description: 'Set up two tees forming a gate and roll putts through.',
      duration_min: 10,
      difficulty: 'beginner',
    },
    insightContext: {
      title: '6-10ft putting',
      category: 'putting',
    },
    onLogDrill: vi.fn(async () => undefined),
    onAddToPlan: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Render shape
// ---------------------------------------------------------------------------

describe('DrillSheet render', () => {
  it('renders the drill title, duration, difficulty pill, and description', () => {
    render(<DrillSheet {...baseProps()} />);

    expect(screen.getByTestId('drill-sheet-title')).toHaveTextContent('Gate drill');
    expect(screen.getByText('Beginner')).toBeInTheDocument();
    expect(screen.getByText('10 min')).toBeInTheDocument();
    expect(
      screen.getByText(/roll putts through/i),
    ).toBeInTheDocument();
  });

  it('renders the insight-context breadcrumb when provided', () => {
    render(<DrillSheet {...baseProps()} />);
    const context = screen.getByTestId('drill-sheet-context');
    expect(context).toHaveTextContent(/Recommended because of/i);
    expect(context).toHaveTextContent('6-10ft putting');
    expect(context).toHaveTextContent('Putting');
  });

  it('omits the insight-context breadcrumb when not provided', () => {
    render(<DrillSheet {...baseProps({ insightContext: undefined })} />);
    expect(screen.queryByTestId('drill-sheet-context')).toBeNull();
  });

  it('renders the video iframe only when video_url is set', () => {
    const { rerender } = render(<DrillSheet {...baseProps()} />);
    expect(screen.queryByTestId('drill-sheet-video')).toBeNull();

    rerender(
      <DrillSheet
        {...baseProps({
          drill: {
            id: 'd-vid',
            title: 'Video drill',
            description: 'd',
            duration_min: 5,
            difficulty: 'intermediate',
            video_url: 'https://example.com/vid',
          },
        })}
      />,
    );

    const video = screen.getByTestId('drill-sheet-video');
    expect(video).toBeInTheDocument();
    const iframe = video.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute('src')).toBe('https://example.com/vid');
    // Rule 10 — no autoplay, no background motion.
    expect(iframe?.getAttribute('allow')?.includes('autoplay')).toBe(false);
  });

  it('renders nothing when open={false}', () => {
    const { container } = render(<DrillSheet {...baseProps({ open: false })} />);
    expect(container.querySelector('[data-testid="drill-sheet"]')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CTAs
// ---------------------------------------------------------------------------

describe('DrillSheet CTAs', () => {
  it('calls onAddToPlan(drillId) when the primary CTA is tapped', async () => {
    const onAddToPlan = vi.fn();
    render(<DrillSheet {...baseProps({ onAddToPlan })} />);

    fireEvent.click(screen.getByTestId('drill-sheet-add-to-plan'));

    await waitFor(() => expect(onAddToPlan).toHaveBeenCalledWith('drill-1'));
  });

  it('calls onLogDrill and onClose when the secondary CTA is tapped', async () => {
    const onLogDrill = vi.fn(async () => undefined);
    const onClose = vi.fn();
    render(<DrillSheet {...baseProps({ onLogDrill, onClose })} />);

    fireEvent.click(screen.getByTestId('drill-sheet-log-drill'));

    await waitFor(() => {
      expect(onLogDrill).toHaveBeenCalledWith('drill-1');
      expect(onClose).toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// Dismissal — ESC + backdrop (inherited from Drawer / vaul)
// ---------------------------------------------------------------------------
//
// Note: ESC + backdrop dismissal are guaranteed by the underlying vaul
// Drawer primitive. Asserting the exact wiring requires jsdom support for
// the pointer / focus mechanics vaul relies on, which it does not provide
// — these checks live in the vaul package's own test suite. Here we just
// verify that the explicit `onClose` prop is callable and that the close
// path runs when the secondary "log drill" CTA fires it (covered above).
// ---------------------------------------------------------------------------
