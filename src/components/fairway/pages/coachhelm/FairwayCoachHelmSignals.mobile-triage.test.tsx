// @vitest-environment jsdom
/**
 * ============================================================================
 * FairwayCoachHelmSignals — W2 mobile triage default (audit finding)
 * ----------------------------------------------------------------------------
 * Bug: /alerts is the one Signals route that never pins a `defaultFilter.view`
 * (/insights sets `'table'`, /patterns sets `'grouped'`), so it falls through
 * to the component's bare internal fallback — `'feed'` — on EVERY viewport.
 * Combined with the default `groupBy: 'player'`, that still renders every
 * player's group as FULL InsightCards (evidence Inset + 3 full-weight action
 * buttons), just collapsed to 4-per-group — a reading assignment, not a
 * triage list (the audited ~31,000px / 37-screen Signals feed on a phone).
 *
 * Fix: the untouched default now resolves to the SAME dense, one-line,
 * tap-to-expand card treatment the `grouped`/`table` presets already render,
 * but ONLY below the `sm` breakpoint (640px) — and only until the coach
 * explicitly touches the view toggle, a `?view=` URL, or a route's own
 * `defaultFilter.view` (all of which continue to win outright, on every
 * viewport). Desktop is provably unaffected: same props, `useMediaQuery`
 * mocked to report a desktop viewport, same full-card render as before.
 * ========================================================================== */
import { act, render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { FairwayCoachHelmSignals } from './FairwayCoachHelmSignals';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';

// ── viewport — the ONE thing this suite actually varies. `next/navigation` is
//    already globally mocked in src/test/setup.tsx. ─────────────────────────
const mediaQueryMock = vi.fn<(query: string) => boolean>();
vi.mock('@/hooks/use-media-query', () => ({
  useMediaQuery: (query: string) => mediaQueryMock(query),
}));

// ── shell — pure chrome (nav rail, breadcrumb, title). Not the SUT here. ───
vi.mock('./CoachHelmShell', () => ({
  CoachHelmShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

// ── toolbar — captures the `view` it's told to highlight (so we can assert
//    `displayView` directly) without touching its Popover-backed filter menus,
//    which are irrelevant to this fix. ──────────────────────────────────────
const toolbarViews: string[] = [];
vi.mock('./signals/SignalsToolbar', () => ({
  SignalsToolbar: (props: { view?: string }) => {
    toolbarViews.push(props.view ?? '');
    return <div data-testid="signals-toolbar" data-view={props.view} />;
  },
}));

// ── every server action this surface imports — stubbed so the mount-time
//    reads resolve deterministically with no Supabase/network involved. ────
vi.mock('@/app/golf/actions/insight-delivery', () => ({
  getInsightsForCoachWithMeta: vi.fn(async () => ({
    ok: true,
    data: [],
    total: 0,
    capped: false,
  })),
}));
vi.mock('@/app/golf/actions/insights', () => ({
  acknowledgeInsight: vi.fn(),
  dismissInsight: vi.fn(),
  reactivateInsight: vi.fn(),
}));
vi.mock('@/app/golf/actions/development', () => ({
  createFocusAreaFromInsight: vi.fn(),
}));
vi.mock('@/app/golf/actions/insight-management', () => ({
  bulkAcknowledgeInsights: vi.fn(),
  bulkDismissInsights: vi.fn(),
  bulkResolveInsights: vi.fn(),
  exportInsights: vi.fn(),
}));
vi.mock('@/app/golf/actions/pattern-management', () => ({
  getTeamPatterns: vi.fn(async () => ({ success: true, patterns: [], counts: null })),
  validatePattern: vi.fn(),
  dismissPattern: vi.fn(),
  markPatternAddressed: vi.fn(),
  resolvePattern: vi.fn(),
  reopenPattern: vi.fn(),
}));
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

/** Two open insights for two different players — enough to exercise the
 *  default "By player" grouping without tripping the 4-per-group collapse. */
const TWO_PLAYER_INSIGHTS: EvidenceInsight[] = [
  makeInsight({ id: 'i1', player_id: 'p1', title: 'Three-putt rate is climbing' }),
  makeInsight({ id: 'i2', player_id: 'p2', title: 'Approach proximity is trending up' }),
];

const PLAYER_NAMES = { p1: 'Alex Rivera', p2: 'Sam Lee' };

/** Renders exactly the /alerts route's untouched default: `signalSource`
 *  'insights', no `defaultFilter` at all (no `view`, no `groupBy`) — the one
 *  Signals route that leaves the component's bare internal fallback in play.
 *  Wrapped in an async `act` so the mount-time trust-signal / leak-board
 *  reads (mocked promises) settle before assertions run. */
async function renderUntouchedAlertsDefault() {
  await act(async () => {
    render(
      <FairwayCoachHelmSignals
        coachId="coach-1"
        teamId="team-1"
        signalSource="insights"
        initialInsights={TWO_PLAYER_INSIGHTS}
        playerNames={PLAYER_NAMES}
      />,
    );
  });
}

describe('FairwayCoachHelmSignals — mobile triage default (W2)', () => {
  beforeEach(() => {
    mediaQueryMock.mockReset();
    toolbarViews.length = 0;
  });

  it('under sm (phone): the untouched /alerts default renders compact rows, not full-weight action buttons', async () => {
    // useMediaQuery('(min-width: 640px)') → false ⇒ under the sm breakpoint.
    mediaQueryMock.mockReturnValue(false);
    await renderUntouchedAlertsDefault();

    // The toolbar is told to highlight "grouped" (the dense/collapsed preset),
    // not the bare "feed" fallback — this is `displayView` in action.
    expect(toolbarViews.at(-1)).toBe('grouped');

    // Compact rows never carry the inline action row (Acknowledge/Dismiss/
    // Focus area) — those only ever render on a full (default/hero) card.
    // Actions live inside the expanded InsightPanel instead (tap-to-expand).
    expect(screen.queryByRole('button', { name: /Acknowledge/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Focus/i })).not.toBeInTheDocument();
  });

  it('at/above sm (desktop): the SAME untouched default still renders the full Feed (unchanged)', async () => {
    // useMediaQuery('(min-width: 640px)') → true ⇒ at/above the sm breakpoint.
    mediaQueryMock.mockReturnValue(true);
    await renderUntouchedAlertsDefault();

    // Desktop keeps the pre-existing bare fallback — the toolbar highlights
    // "feed", exactly as before this fix.
    expect(toolbarViews.at(-1)).toBe('feed');

    // Full/hero cards DO carry the inline action row.
    expect(screen.getAllByRole('button', { name: /Acknowledge/i }).length).toBeGreaterThan(0);
  });

  it('/insights and /patterns already pin an explicit defaultFilter.view — unaffected on ANY viewport', async () => {
    mediaQueryMock.mockReturnValue(false); // under sm — would flip the bare fallback
    await act(async () => {
      render(
        <FairwayCoachHelmSignals
          coachId="coach-1"
          teamId="team-1"
          signalSource="insights"
          initialInsights={TWO_PLAYER_INSIGHTS}
          playerNames={PLAYER_NAMES}
          defaultFilter={{ view: 'table' }}
        />,
      );
    });
    // A route-level `defaultFilter.view` always wins, regardless of viewport.
    expect(toolbarViews.at(-1)).toBe('table');
  });
});
