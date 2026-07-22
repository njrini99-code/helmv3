/**
 * HubInsightSignalCard tests — Hub team / H3.
 *
 * Covers:
 *  - null insight → renders nothing
 *  - present insight → renders the hub signal section + InsightCard
 *  - dismiss-for-today sets localStorage + hides the card
 *  - localStorage flag from earlier today → card stays hidden
 *  - localStorage flag from yesterday → card renders normally
 *  - rate_helpful fires `rateInsightAsPlayer`
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { HubInsightSignalCard } from '@/components/golf/player-hub/HubInsightSignalCard';

// ---------------------------------------------------------------------------
// In-memory localStorage polyfill. The jsdom-provided globalThis.localStorage
// in this repo's setup doesn't expose a callable `clear()`, so we install a
// minimal, fully callable implementation before any component code runs.
// ---------------------------------------------------------------------------
beforeAll(() => {
  const store = new Map<string, string>();
  const stub: Storage = {
    get length() {
      return store.size;
    },
    key(index: number): string | null {
      return Array.from(store.keys())[index] ?? null;
    },
    getItem(key: string): string | null {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string): void {
      store.set(key, String(value));
    },
    removeItem(key: string): void {
      store.delete(key);
    },
    clear(): void {
      store.clear();
    },
  };
  Object.defineProperty(window, 'localStorage', { value: stub, configurable: true });
  // `localStorage` as a global also needs to resolve to the stub.
  Object.defineProperty(globalThis, 'localStorage', { value: stub, configurable: true });
});

// ---------------------------------------------------------------------------
// Framer-motion passthrough (same pattern as InsightCard.test.tsx). Both `m`
// and `motion` are stubbed — `motion` is what FocusAreaModal's ModalShell
// uses, exercised by the promote-to-focus-area tests below.
// ---------------------------------------------------------------------------
vi.mock('framer-motion', async () => {
  const React = await import('react');
  // Component identity must be STABLE per tag (`motion.div` must return the
  // same component reference across renders) — a Proxy that minted a new
  // forwardRef on every property access broke Radix's <Presence> (used by
  // FocusAreaModal's ModalShell/Dialog): each render looked like a brand new
  // component type, and Presence's ref-composition effect loop never settled
  // ("Maximum update depth exceeded"). Cache by prop key to fix that.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cache = new Map<string | symbol, any>();
  const passthrough = new Proxy(
    {},
    {
      get: (_target, prop) => {
        const cached = cache.get(prop);
        if (cached) return cached;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const comp = React.forwardRef<HTMLElement, any>((props, ref) => {
          const {
            children,
            whileTap: _whileTap,
            whileHover: _whileHover,
            initial: _initial,
            animate: _animate,
            exit: _exit,
            transition: _transition,
            variants: _variants,
            layout: _layout,
            ...rest
          } = props;
          void _whileTap;
          void _whileHover;
          void _initial;
          void _animate;
          void _exit;
          void _transition;
          void _variants;
          void _layout;
          return React.createElement(prop as string, { ...rest, ref }, children);
        });
        cache.set(prop, comp);
        return comp;
      },
    },
  );
  return {
    useReducedMotion: () => false,
    m: passthrough,
    motion: passthrough,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  };
});

// Stub drills + player-feedback so nothing talks to supabase.
// `getDrillsForInsights` (batched, plural) is what FocusAreaModal's Practice
// Rx preview calls once the promote-to-focus-area modal is opened (see
// PromoteFocusAreaAction in HubInsightSignalCard.tsx) — stub it too so that
// path stays inert.
vi.mock('@/app/golf/actions/drills', () => ({
  getDrillsForInsight: vi.fn(async () => []),
  getDrillsForInsights: vi.fn(async () => ({})),
  recordDrillView: vi.fn(async () => undefined),
}));

const rateInsightAsPlayerMock = vi.fn(
  async (_input: { insightId: string; rating: 'helpful' | 'not_helpful' | 'dismissed' | 'acknowledged' }) => ({
    success: true as const,
  }),
);
vi.mock('@/app/golf/actions/player-feedback', () => ({
  rateInsightAsPlayer: (input: {
    insightId: string;
    rating: 'helpful' | 'not_helpful' | 'dismissed' | 'acknowledged';
  }) => rateInsightAsPlayerMock(input),
}));

// FocusAreaModal convergence: the hub card's promote action now opens the
// shared FocusAreaModal and calls createFocusAreaFromInsightV2 directly
// instead of rendering the retired vaul-Drawer PromoteToFocusAreaButton.
const mockCreateFocusAreaFromInsightV2 = vi.fn(async (..._args: unknown[]) => ({
  success: true,
  focusAreaId: 'fa-1',
}));
vi.mock('@/app/golf/actions/development', () => ({
  createFocusAreaFromInsightV2: (...args: unknown[]) => mockCreateFocusAreaFromInsightV2(...args),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEvidence(overrides: Partial<InsightEvidence> = {}): InsightEvidence {
  return {
    metric: 'putt_make_rate_6_10ft',
    metric_label: '6-10 ft make rate',
    unit: 'percent',
    your_value: 0.38,
    your_value_display: '38%',
    comparison_value: 0.52,
    comparison_label: 'D2 average',
    comparison_source: 'd2_avg',
    sample_n: 47,
    window_days: 30,
    window_start: '2026-03-23T00:00:00.000Z',
    window_end: '2026-04-22T00:00:00.000Z',
    strokes_impact: 2.1,
    strokes_impact_method: 'peer_delta',
    confidence: 0.78,
    confidence_factors: { sample_adequacy: 1, recency: 1, variance: 0.5 },
    ...overrides,
  };
}

function makeInsight(overrides: Partial<EvidenceInsight> = {}): EvidenceInsight {
  return {
    id: 'insight-hub-1',
    player_id: 'player-hub-1',
    category: 'putting',
    title: 'Your 6-10ft putting lags D2 peers',
    content: 'You make 38% vs the 52% D2 average — a 14pt gap.',
    signature: 'sig_hub_1',
    evidence: makeEvidence(),
    metadata: null,
    lifecycle_state: 'matured',
    status: 'active',
    priority: 'high',
    acknowledged_at: null,
    resolved_at: null,
    created_at: '2026-04-15T12:00:00.000Z',
    updated_at: '2026-04-22T12:00:00.000Z',
    drills: [],
    ...overrides,
  };
}

/** Build a `hub_signal_dismissed_YYYY-MM-DD` key rooted in local time — the
 *  same format the component writes — for a specific offset in days from
 *  today. */
function dismissKeyForOffset(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `hub_signal_dismissed_${y}-${m}-${day}`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HubInsightSignalCard', () => {
  beforeEach(() => {
    localStorage.clear();
    rateInsightAsPlayerMock.mockClear();
  });

  it('renders nothing when insight is null', () => {
    const { container } = render(<HubInsightSignalCard insight={null} />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('hub-insight-signal-card')).toBeNull();
  });

  it('renders the section header + InsightCard when insight is present', async () => {
    render(<HubInsightSignalCard insight={makeInsight()} />);
    const section = await screen.findByTestId('hub-insight-signal-card');
    expect(section).toBeInTheDocument();
    expect(screen.getByText(/From your CoachHelm/i)).toBeInTheDocument();
    expect(screen.getByTestId('insight-card-default')).toBeInTheDocument();
  });

  it('dismiss-for-today writes the localStorage key and hides the card', async () => {
    render(<HubInsightSignalCard insight={makeInsight()} />);
    const dismissBtn = await screen.findByTestId('hub-insight-dismiss-today');

    fireEvent.click(dismissBtn);

    await waitFor(() => {
      expect(screen.queryByTestId('hub-insight-signal-card')).toBeNull();
    });

    // The localStorage key for today should now be set.
    expect(localStorage.getItem(dismissKeyForOffset(0))).toBe('1');
  });

  it("renders nothing when today's dismiss key is already in localStorage", () => {
    localStorage.setItem(dismissKeyForOffset(0), '1');
    render(<HubInsightSignalCard insight={makeInsight()} />);
    // The component hydrates dismiss state in useEffect and then suppresses.
    // Either it never renders (dismissedToday=null) or it detects the flag and
    // renders nothing — either way, the card should not be in the DOM.
    expect(screen.queryByTestId('hub-insight-signal-card')).toBeNull();
  });

  it("renders normally when only yesterday's dismiss key is present", async () => {
    localStorage.setItem(dismissKeyForOffset(-1), '1');
    render(<HubInsightSignalCard insight={makeInsight()} />);
    // The card should appear (yesterday's flag is stale, today's is absent).
    const section = await screen.findByTestId('hub-insight-signal-card');
    expect(section).toBeInTheDocument();
    // And the component should have pruned the stale key on mount.
    expect(localStorage.getItem(dismissKeyForOffset(-1))).toBeNull();
  });

  it('wires rate_helpful action to rateInsightAsPlayer', async () => {
    render(<HubInsightSignalCard insight={makeInsight()} />);
    // Wave 3 token port: the card now renders on the fairway InsightCard
    // primitive (`variant="default"`), which has no collapse/expand step —
    // its action row is always visible, unlike the legacy DefaultInsightCard
    // this replaced.
    await screen.findByTestId('insight-card-default');

    const helpful = await screen.findByTestId('action-rate-helpful');
    fireEvent.click(helpful);

    await waitFor(() => {
      expect(rateInsightAsPlayerMock).toHaveBeenCalledTimes(1);
    });
    expect(rateInsightAsPlayerMock).toHaveBeenCalledWith({
      insightId: 'insight-hub-1',
      rating: 'helpful',
    });
  });

  describe('promote-to-focus-area (FocusAreaModal convergence)', () => {
    beforeEach(() => {
      mockCreateFocusAreaFromInsightV2.mockClear();
    });

    it('opens a FocusAreaModal pre-filled from the raw insight fields, no write on open', async () => {
      render(<HubInsightSignalCard insight={makeInsight()} />);
      await screen.findByTestId('insight-card-default');

      const promote = await screen.findByTestId('action-create-focus-area');
      fireEvent.click(promote);

      const dialog = await screen.findByRole('dialog');
      // Player home is always mode='player' — "New focus area" is that
      // mode's dialog title (FocusAreaModal.tsx), not the coach "Prescribe"
      // copy the triage desk uses.
      expect(within(dialog).getByText('New focus area')).toBeInTheDocument();
      expect(within(dialog).getByDisplayValue(makeInsight().title)).toBeInTheDocument();
      expect(within(dialog).getByDisplayValue(makeInsight().content)).toBeInTheDocument();
      expect(mockCreateFocusAreaFromInsightV2).not.toHaveBeenCalled();
    });

    it('confirming saves through createFocusAreaFromInsightV2 with playerId/insightId/areaType', async () => {
      render(<HubInsightSignalCard insight={makeInsight()} />);
      await screen.findByTestId('insight-card-default');

      fireEvent.click(await screen.findByTestId('action-create-focus-area'));
      const dialog = await screen.findByRole('dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Add focus area' }));

      await waitFor(() => {
        expect(mockCreateFocusAreaFromInsightV2).toHaveBeenCalledWith(
          expect.objectContaining({
            playerId: 'player-hub-1',
            insightId: 'insight-hub-1',
            title: 'Your 6-10ft putting lags D2 peers',
            areaType: 'putting',
          }),
        );
      });
    });

    it('hides the promote trigger once the insight is resolved (promotable gate)', async () => {
      // status='resolved' (not lifecycle_state) so this doesn't also route
      // through <ResolutionCelebration>, which is unrelated to this assertion.
      render(<HubInsightSignalCard insight={makeInsight({ status: 'resolved' })} />);
      await screen.findByTestId('insight-card-default');
      expect(screen.queryByTestId('action-create-focus-area')).toBeNull();
    });
  });
});
