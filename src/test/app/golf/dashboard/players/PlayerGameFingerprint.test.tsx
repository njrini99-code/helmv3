/**
 * PlayerGameFingerprint component tests — Wave 2 / Task G5.
 *
 * Covers:
 *  - All 7 sections render in stable order.
 *  - Sparse sections render the "Not enough data" fallback in-slot (no
 *    layout shift — the section band still appears in the DOM).
 *  - Insights pre-routed by the aggregator end up in the right section's
 *    InsightCard list.
 *  - Hero Print button navigates to the /print route.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type {
  PlayerFingerprint,
  SectionData,
  FingerprintSectionKey,
} from '@/app/golf/actions/player-fingerprint';

// next/link internally invokes `new IntersectionObserver(...)`. The repo's
// global test-setup.tsx installs an arrow-function mock, which can't be
// `new`-constructed. Override it here with a real class so Link renders.
beforeAll(() => {
  class MockIntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    value: MockIntersectionObserver,
    writable: true,
  });
  Object.defineProperty(window, 'IntersectionObserver', {
    value: MockIntersectionObserver,
    writable: true,
  });
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('framer-motion', async () => {
  const React = await import('react');
  return {
    m: new Proxy(
      {},
      {
        get:
          (_target, prop) =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            React.forwardRef<HTMLElement, any>((props, ref) => {
              const {
                children,
                whileTap: _wt,
                whileHover: _wh,
                initial: _i,
                animate: _a,
                exit: _e,
                transition: _t,
                ...rest
              } = props;
              void _wt;
              void _wh;
              void _i;
              void _a;
              void _e;
              void _t;
              return React.createElement(prop as string, { ...rest, ref }, children);
            }),
      },
    ),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  };
});

// Recharts imports heavy browser globals; we stub it for JSDOM.
vi.mock('recharts', () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="recharts-stub">{children}</div>
  );
  return {
    LineChart: Passthrough,
    Line: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Tooltip: () => null,
    ResponsiveContainer: Passthrough,
    ReferenceLine: () => null,
    Dot: () => null,
  };
});

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

vi.mock('@/contexts/golf-user-context', () => ({
  useGolfUser: () => ({
    role: 'coach',
    userId: 'u-1',
    name: 'Coach',
    coachId: 'c-1',
  }),
}));

vi.mock('@/app/golf/actions/insights', () => ({
  acknowledgeInsight: vi.fn(async () => ({ success: true })),
  dismissInsight: vi.fn(async () => ({ success: true })),
}));

vi.mock('@/app/golf/actions/development', () => ({
  createFocusAreaFromInsight: vi.fn(async () => ({ success: true, data: { focusAreaId: 'fa-1' } })),
}));

vi.mock('@/app/golf/actions/drills', () => ({
  getDrillsForInsight: vi.fn(async () => []),
  recordDrillView: vi.fn(async () => undefined),
}));

import { PlayerGameFingerprint } from '@/app/golf/(dashboard)/dashboard/players/[playerId]/game/PlayerGameFingerprint';

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function makeEvidence(partial: Record<string, unknown> = {}) {
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
    ...partial,
  };
}

function makeInsight(overrides: Partial<EvidenceInsight> = {}): EvidenceInsight {
  return {
    id: 'insight-1',
    player_id: 'p-1',
    category: 'putting',
    title: 'Putting gap vs D2',
    content: 'You make 38% from 6-10 ft vs 52% D2 average.',
    signature: 'sig',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    evidence: makeEvidence() as any,
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

function makeSection(
  key: FingerprintSectionKey,
  overrides: Partial<SectionData> = {},
): SectionData {
  const labelMap: Record<FingerprintSectionKey, string> = {
    tee: 'From the tee',
    approach: 'Approach',
    short_game: 'Around the green',
    putting: 'Putting',
    scoring: 'Scoring',
    pressure: 'Pressure',
  };
  return {
    key,
    category: labelMap[key],
    sparse: false,
    metrics: [{ label: 'Metric', value: 'V', tone: 'neutral' }],
    insights: [],
    chart_data: null,
    ...overrides,
  };
}

function makeFingerprint(
  overrides: Partial<PlayerFingerprint> = {},
): PlayerFingerprint {
  return {
    player: {
      id: 'p-1',
      first_name: 'Jake',
      last_name: 'Doe',
      team_name: 'Helmetta CC',
    },
    composite: { rating: 73, trend: 'up', rounds_in_calculation: 12 },
    sections: {
      tee: makeSection('tee'),
      approach: makeSection('approach'),
      short_game: makeSection('short_game'),
      putting: makeSection('putting'),
      scoring: makeSection('scoring'),
      pressure: makeSection('pressure'),
    },
    trend: { rolling: [] },
    generated_at: '2026-04-22T12:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  pushMock.mockClear();
});

describe('PlayerGameFingerprint', () => {
  it('renders the hero with player name, team, and composite rating', () => {
    render(<PlayerGameFingerprint fingerprint={makeFingerprint()} />);

    expect(screen.getByTestId('fingerprint-hero-name')).toHaveTextContent('Jake Doe');
    expect(screen.getByText('Helmetta CC', { exact: false })).toBeInTheDocument();
    expect(screen.getByTestId('fingerprint-composite-rating')).toHaveTextContent('73');
    expect(screen.getByTestId('fingerprint-composite-trend')).toHaveAttribute(
      'data-trend',
      'up',
    );
  });

  it('renders all 6 section bands in stable order + the trend band', () => {
    render(<PlayerGameFingerprint fingerprint={makeFingerprint()} />);

    const expectedOrder = [
      'section-band-tee',
      'section-band-approach',
      'section-band-short_game',
      'section-band-putting',
      'section-band-scoring',
      'section-band-pressure',
      'section-band-trend',
    ];

    const rendered = expectedOrder.map((id) => screen.getByTestId(id));
    expect(rendered).toHaveLength(expectedOrder.length);

    // Assert DOM order matches the expected order.
    const allBandNodes = screen.getAllByTestId(/^section-band-/);
    expect(allBandNodes.map((n) => n.getAttribute('data-testid'))).toEqual(expectedOrder);
  });

  it('renders the "Not enough data" fallback for sparse sections without removing them', () => {
    const fingerprint = makeFingerprint({
      sections: {
        tee: makeSection('tee', { sparse: true, metrics: [] }),
        approach: makeSection('approach'),
        short_game: makeSection('short_game'),
        putting: makeSection('putting'),
        scoring: makeSection('scoring'),
        pressure: makeSection('pressure', { sparse: true, metrics: [] }),
      },
    });

    render(<PlayerGameFingerprint fingerprint={fingerprint} />);

    // Section bands remain in the layout.
    expect(screen.getByTestId('section-band-tee')).toHaveAttribute('data-sparse', 'true');
    expect(screen.getByTestId('section-band-pressure')).toHaveAttribute(
      'data-sparse',
      'true',
    );

    // Fallback copy is visible. Two sparse sections → two fallback slots.
    const fallbacks = screen.getAllByTestId('section-empty');
    expect(fallbacks.length).toBe(2);
    expect(fallbacks[0]!).toHaveTextContent(/not enough data/i);
  });

  it('routes insights into the section that owns their category', () => {
    const putting = makeInsight({ id: 'putt-i', category: 'putting', title: 'Putting note' });
    const tee = makeInsight({ id: 'tee-i', category: 'tee', title: 'Tee note' });

    const fingerprint = makeFingerprint({
      sections: {
        tee: makeSection('tee', { insights: [tee] }),
        approach: makeSection('approach'),
        short_game: makeSection('short_game'),
        putting: makeSection('putting', { insights: [putting] }),
        scoring: makeSection('scoring'),
        pressure: makeSection('pressure'),
      },
    });

    render(<PlayerGameFingerprint fingerprint={fingerprint} />);

    const puttingBand = screen.getByTestId('section-band-putting');
    expect(within(puttingBand).getByText('Putting note')).toBeInTheDocument();
    // The tee insight must NOT show up in the putting band.
    expect(within(puttingBand).queryByText('Tee note')).toBeNull();

    const teeBand = screen.getByTestId('section-band-tee');
    expect(within(teeBand).getByText('Tee note')).toBeInTheDocument();
  });

  it('Print button navigates to the /print route for this player', () => {
    render(<PlayerGameFingerprint fingerprint={makeFingerprint()} />);

    const printBtn = screen.getByTestId('fingerprint-print-button');
    fireEvent.click(printBtn);

    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith('/golf/dashboard/players/p-1/game/print');
  });

  it('Discuss-in-messages deep link points to the messages surface', () => {
    render(<PlayerGameFingerprint fingerprint={makeFingerprint()} />);

    const link = screen.getByTestId('fingerprint-discuss-link');
    expect(link).toHaveAttribute('href', '/golf/dashboard/messages?player=p-1');
  });

  it('Assign-focus-area link points to development', () => {
    render(<PlayerGameFingerprint fingerprint={makeFingerprint()} />);

    const link = screen.getByTestId('fingerprint-focus-area-link');
    expect(link).toHaveAttribute('href', '/golf/dashboard/development?player=p-1');
  });
});
