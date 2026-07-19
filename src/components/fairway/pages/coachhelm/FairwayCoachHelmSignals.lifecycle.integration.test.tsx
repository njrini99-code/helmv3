// @vitest-environment jsdom
/**
 * ============================================================================
 * FairwayCoachHelmSignals — write-lifecycle integration coverage (bug #189)
 * ----------------------------------------------------------------------------
 * The full CoachHelm Alerts/Insights/Patterns write-lifecycle (create → act →
 * resolve/dismiss → promote) had ZERO passing-path test coverage: every prior
 * regression test in this file targets a presentational/layout concern
 * (mobile triage default, EvidenceList column widths), never the actual
 * mutation wiring a coach relies on to triage a real signal.
 *
 * This suite drives the rendered surface exactly the way a coach does — click
 * the row action button — and asserts BOTH halves of the contract:
 *   1. the correct server action is invoked with the right arguments
 *   2. the row's optimistic UI update matches what the handler promises
 *      (removed from the list on resolve/dismiss, lifecycle flipped in place
 *      on confirm, a route push to Development on promote-to-focus-area)
 *
 * One INSIGHT walks create(seed) → Acknowledge (resolve) → a second insight
 * → Dismiss → a third insight → Focus area (promote). One PATTERN walks
 * create(seed) → Confirm (validate) → Resolve. Every server action is a
 * `vi.fn()` so the test can assert on call args, not just presence.
 *
 * Round-2 addition (adversarial-review gap): every case above rendered with
 * `signalSource="insights"` and NO `defaultFilter`, which is the /insights
 * route, not /alerts. Both routes share this same `signalSource='insights'`
 * data source (see the component's own top-of-file comment) — /alerts is
 * discriminated ONLY by seeding a non-empty `defaultFilter.severity` (the
 * component derives `activeSegment === 'alerts'` from exactly that, never a
 * pathname sniff). Since the write-lifecycle wiring (Acknowledge/Dismiss/
 * Focus area) is shared code between both routes, the insight cases above
 * already exercise it — but nothing had asserted the ALERTS segment
 * specifically end to end, so a regression that broke lifecycle actions only
 * when reached via /alerts (e.g. a future change gating an action on
 * `activeSegment`) could still slip through. The suite below closes that.
 * ========================================================================== */
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { FairwayCoachHelmSignals } from './FairwayCoachHelmSignals';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { ExtendedPattern } from '@/app/golf/actions/pattern-management';
import {
  acknowledgeInsight,
  dismissInsight,
} from '@/app/golf/actions/insights';
import { createFocusAreaFromInsight } from '@/app/golf/actions/development';
import {
  validatePattern,
  resolvePattern,
} from '@/app/golf/actions/pattern-management';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/golf/dashboard/insights',
}));

// Desktop viewport — full-weight cards with the real action row (Acknowledge/
// Dismiss/Focus area, Confirm/Address/Resolve/Dismiss). The mobile compact
// triage default (see FairwayCoachHelmSignals.mobile-triage.test.tsx) hides
// these behind a tap-to-expand row, which is irrelevant to this suite.
vi.mock('@/hooks/use-media-query', () => ({
  useMediaQuery: () => true,
}));

vi.mock('./CoachHelmShell', () => ({
  CoachHelmShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

// The toolbar's own Popover-backed filter menus are irrelevant to lifecycle
// wiring — stub it to a passive marker, same as the mobile-triage suite.
vi.mock('./signals/SignalsToolbar', () => ({
  SignalsToolbar: () => <div data-testid="signals-toolbar" />,
}));

vi.mock('@/app/golf/actions/insight-delivery', () => ({
  getInsightsForCoachWithMeta: vi.fn(async () => ({
    ok: true,
    data: [],
    total: 0,
    capped: false,
  })),
}));
vi.mock('@/app/golf/actions/insights', () => ({
  acknowledgeInsight: vi.fn(async () => ({ success: true })),
  dismissInsight: vi.fn(async () => ({ success: true })),
  reactivateInsight: vi.fn(async () => ({ success: true })),
}));
vi.mock('@/app/golf/actions/development', () => ({
  createFocusAreaFromInsight: vi.fn(async () => ({ success: true })),
}));
vi.mock('@/app/golf/actions/insight-management', () => ({
  bulkAcknowledgeInsights: vi.fn(),
  bulkDismissInsights: vi.fn(),
  bulkResolveInsights: vi.fn(),
  exportInsights: vi.fn(),
}));
// A quiet background refresh (`getTeamPatterns`) always runs on mount even
// when the route pre-seeds `initialPatterns` (see FairwayCoachHelmSignals'
// own comment on that effect) — it only exists to populate `patternCounts`,
// but since it's mocked here it would otherwise stomp the seeded row with an
// empty list the instant it resolves. Echo back whatever the active test
// seeded via `mockPatternsSource` so the background refresh is a no-op.
let mockPatternsSource: ExtendedPattern[] = [];

vi.mock('@/app/golf/actions/pattern-management', async () => {
  const actual = await vi.importActual<typeof import('@/app/golf/actions/pattern-management')>(
    '@/app/golf/actions/pattern-management',
  );
  return {
    ...actual,
    getTeamPatterns: vi.fn(async () => ({
      success: true,
      patterns: mockPatternsSource,
      counts: null,
    })),
    validatePattern: vi.fn(async () => ({ success: true })),
    dismissPattern: vi.fn(async () => ({ success: true })),
    markPatternAddressed: vi.fn(async () => ({ success: true })),
    resolvePattern: vi.fn(async () => ({ success: true })),
    reopenPattern: vi.fn(async () => ({ success: true })),
  };
});
vi.mock('@/app/golf/actions/coachhelm-analytics', () => ({
  getInsightTrustSignals: vi.fn(async () => ({ success: false, error: 'not mocked' })),
}));

function makeInsight(overrides: Partial<EvidenceInsight> = {}): EvidenceInsight {
  return {
    id: 'insight-1',
    player_id: 'player-1',
    category: 'putting',
    insight_type: 'putts_per_round',
    title: 'Three-putt rate is climbing',
    content: 'Three-putts are up over the last 5 rounds.',
    signature: 'v3:x',
    evidence: {
      strokes_impact: 1.2,
      confidence: 0.8,
      sample_n: 12,
    } as unknown as EvidenceInsight['evidence'],
    metadata: null,
    lifecycle_state: 'detected',
    status: 'active',
    priority: 'high',
    acknowledged_at: null,
    resolved_at: null,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function makePattern(overrides: Partial<ExtendedPattern> = {}): ExtendedPattern {
  return {
    id: 'pattern-1',
    playerId: 'player-1',
    patternType: 'conditional',
    conditions: [{ field: 'lie', operator: 'eq', value: 'rough' }],
    outcome: { metric: 'strokes_gained', direction: 'decrease' },
    support: 0.4,
    confidence: 0.75,
    lift: 1.6,
    conviction: 1.2,
    strokeImpact: -1.4,
    actionability: 0.8,
    sampleSize: 20,
    firstDetected: '2026-06-01T00:00:00.000Z',
    lastOccurrence: '2026-07-01T00:00:00.000Z',
    occurrenceCount: 8,
    trend: 'stable',
    isActive: true,
    description: 'Struggles from the rough on approach shots.',
    severity: 'high',
    lifecycleState: 'detected',
    playerName: 'Alex Rivera',
    ...overrides,
  };
}

const PLAYER_NAMES = { 'player-1': 'Alex Rivera' };

describe('FairwayCoachHelmSignals — write-lifecycle integration (bug #189)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPatternsSource = [];
  });

  it('insight: Acknowledge calls acknowledgeInsight(id) and removes the row optimistically', async () => {
    const user = userEvent.setup();
    await act(async () => {
      render(
        <FairwayCoachHelmSignals
          coachId="coach-1"
          teamId="team-1"
          signalSource="insights"
          initialInsights={[makeInsight({ id: 'ack-1', title: 'Ack me' })]}
          playerNames={PLAYER_NAMES}
        />,
      );
    });

    expect(screen.getByText('Ack me')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Acknowledge/i }));

    await waitFor(() => {
      expect(acknowledgeInsight).toHaveBeenCalledWith('ack-1');
    });
    await waitFor(() => {
      expect(screen.queryByText('Ack me')).not.toBeInTheDocument();
    });
  });

  it('insight: Dismiss calls dismissInsight(id) and removes the row optimistically', async () => {
    const user = userEvent.setup();
    await act(async () => {
      render(
        <FairwayCoachHelmSignals
          coachId="coach-1"
          teamId="team-1"
          signalSource="insights"
          initialInsights={[makeInsight({ id: 'dismiss-1', title: 'Dismiss me' })]}
          playerNames={PLAYER_NAMES}
        />,
      );
    });

    expect(screen.getByText('Dismiss me')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Dismiss$/i }));

    await waitFor(() => {
      expect(dismissInsight).toHaveBeenCalledWith('dismiss-1');
    });
    await waitFor(() => {
      expect(screen.queryByText('Dismiss me')).not.toBeInTheDocument();
    });
  });

  it('insight: Focus area PROMOTES the insight — createFocusAreaFromInsight is called and the coach is routed to Development', async () => {
    const user = userEvent.setup();
    await act(async () => {
      render(
        <FairwayCoachHelmSignals
          coachId="coach-1"
          teamId="team-1"
          signalSource="insights"
          initialInsights={[
            makeInsight({
              id: 'promote-1',
              title: 'Promote me',
              content: 'Body text',
              category: 'putting',
              player_id: 'player-1',
            }),
          ]}
          playerNames={PLAYER_NAMES}
        />,
      );
    });

    await user.click(screen.getByRole('button', { name: /Focus/i }));

    await waitFor(() => {
      expect(createFocusAreaFromInsight).toHaveBeenCalledWith(
        expect.objectContaining({
          insight_id: 'promote-1',
          player_id: 'player-1',
          coach_id: 'coach-1',
          title: 'Promote me',
        }),
      );
    });
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/golf/dashboard/development');
    });
  });

  it('pattern: Confirm calls validatePattern and flips the row lifecycle in place (row stays, Confirm disappears)', async () => {
    const user = userEvent.setup();
    const seeded = [
      makePattern({ id: 'confirm-1', description: 'Confirm me', lifecycleState: 'detected' }),
    ];
    mockPatternsSource = seeded;
    await act(async () => {
      render(
        <FairwayCoachHelmSignals
          coachId="coach-1"
          teamId="team-1"
          signalSource="patterns"
          initialPatterns={seeded}
          playerNames={PLAYER_NAMES}
          // Patterns default to the grouped/compact card treatment, which
          // hides the inline action row — force the flat feed view (full
          // cards, real Confirm/Address/Resolve/Dismiss buttons) so this
          // suite exercises the SAME action a coach clicks, not a hidden one.
          defaultFilter={{ view: 'feed' }}
        />,
      );
    });

    await user.click(screen.getByRole('button', { name: /^Confirm$/i }));

    await waitFor(() => {
      expect(validatePattern).toHaveBeenCalledWith(
        'confirm-1',
        expect.objectContaining({ isAccurate: true }),
      );
    });
    // Lifecycle flip is in-place, never a removal — the row (and its
    // narrative) is still on screen, but Confirm is no longer offered for an
    // already-confirmed pattern.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /^Confirm$/i })).not.toBeInTheDocument();
    });
    expect(screen.getByText(/Confirm me/i)).toBeInTheDocument();
  });

  it('pattern: Resolve calls resolvePattern(id) and removes the row optimistically', async () => {
    const user = userEvent.setup();
    const seeded = [
      makePattern({ id: 'resolve-1', description: 'Resolve me', lifecycleState: 'confirmed' }),
    ];
    mockPatternsSource = seeded;
    await act(async () => {
      render(
        <FairwayCoachHelmSignals
          coachId="coach-1"
          teamId="team-1"
          signalSource="patterns"
          initialPatterns={seeded}
          playerNames={PLAYER_NAMES}
          // Patterns default to the grouped/compact card treatment, which
          // hides the inline action row — force the flat feed view (full
          // cards, real Confirm/Address/Resolve/Dismiss buttons) so this
          // suite exercises the SAME action a coach clicks, not a hidden one.
          defaultFilter={{ view: 'feed' }}
        />,
      );
    });

    await user.click(screen.getByRole('button', { name: /^Resolve$/i }));

    await waitFor(() => {
      expect(resolvePattern).toHaveBeenCalledWith('resolve-1');
    });
    await waitFor(() => {
      expect(screen.queryByText(/Resolve me/i)).not.toBeInTheDocument();
    });
  });

  /* ── ALERTS segment specifically (round-2 addition — see file header) ──── */

  it('ALERTS segment: renders as /alerts (not /insights) via the seeded severity filter', async () => {
    await act(async () => {
      render(
        <FairwayCoachHelmSignals
          coachId="coach-1"
          teamId="team-1"
          signalSource="insights"
          // This is the ONLY discriminator between /alerts and /insights (see
          // the component's own `activeSegment` derivation) — a non-empty
          // seeded severity is what makes this render the Alerts segment.
          defaultFilter={{ severity: ['critical', 'high'] }}
          initialInsights={[makeInsight({ id: 'alert-scope-check', priority: 'high' })]}
          playerNames={PLAYER_NAMES}
        />,
      );
    });

    // The honest summary tiles (bug #4/#184) read their label off the SAME
    // `activeSegment` this test is targeting — "Open alerts" only renders
    // when the component actually resolved to the alerts segment.
    expect(screen.getByText('Open alerts')).toBeInTheDocument();
  });

  it('alert: Acknowledge calls acknowledgeInsight(id) and removes the row optimistically', async () => {
    const user = userEvent.setup();
    await act(async () => {
      render(
        <FairwayCoachHelmSignals
          coachId="coach-1"
          teamId="team-1"
          signalSource="insights"
          defaultFilter={{ severity: ['critical', 'high'] }}
          initialInsights={[
            makeInsight({ id: 'alert-ack-1', title: 'Ack this alert', priority: 'high' }),
          ]}
          playerNames={PLAYER_NAMES}
        />,
      );
    });

    expect(screen.getByText('Open alerts')).toBeInTheDocument();
    expect(screen.getByText('Ack this alert')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Acknowledge/i }));

    await waitFor(() => {
      expect(acknowledgeInsight).toHaveBeenCalledWith('alert-ack-1');
    });
    await waitFor(() => {
      expect(screen.queryByText('Ack this alert')).not.toBeInTheDocument();
    });
  });

  it('alert: Focus area PROMOTES the alert — createFocusAreaFromInsight is called and the coach is routed to Development', async () => {
    const user = userEvent.setup();
    await act(async () => {
      render(
        <FairwayCoachHelmSignals
          coachId="coach-1"
          teamId="team-1"
          signalSource="insights"
          defaultFilter={{ severity: ['critical', 'high'] }}
          initialInsights={[
            makeInsight({
              id: 'alert-promote-1',
              title: 'Promote this alert',
              content: 'Body text',
              category: 'putting',
              player_id: 'player-1',
              // 'urgent' is the raw EvidenceInsight priority that maps to the
              // 'critical' SignalRow/severity-filter bucket (see
              // INSIGHT_PRIORITY_MAP in signals/patternToInsightVocabulary.ts)
              // — 'critical' itself is not a valid raw insight priority.
              priority: 'urgent',
            }),
          ]}
          playerNames={PLAYER_NAMES}
        />,
      );
    });

    expect(screen.getByText('Open alerts')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Focus/i }));

    await waitFor(() => {
      expect(createFocusAreaFromInsight).toHaveBeenCalledWith(
        expect.objectContaining({
          insight_id: 'alert-promote-1',
          player_id: 'player-1',
          coach_id: 'coach-1',
          title: 'Promote this alert',
        }),
      );
    });
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/golf/dashboard/development');
    });
  });
});
