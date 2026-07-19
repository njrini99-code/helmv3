// @vitest-environment jsdom
/**
 * ============================================================================
 * FairwayCoachHelmSignals — header tiles vs the rendered list (bug #4/#184)
 * ----------------------------------------------------------------------------
 * The 3 header stat tiles ("Open …", "Urgent + high", "Showing …") used to be
 * scoped to `allRows` — every row loaded for the active sub-tab — while the
 * card list below rendered `rows`, the NARROWER post-toolbar-filter (and
 * smart-default-capped) set. The instant any toolbar filter (severity/status/
 * category/search) or the smart-default shortlist narrowed the visible list,
 * the tiles kept reporting the wider, unfiltered `allRows` count — e.g.
 * "Showing 3" in the tile while only 1 card actually rendered below.
 *
 * Fix: all three tiles now derive from `rows` (the exact list rendered),
 * so "Showing N" always equals the number of cards on screen, in every
 * filter state.
 * ========================================================================== */
import { act, render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { FairwayCoachHelmSignals } from './FairwayCoachHelmSignals';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';

vi.mock('./CoachHelmShell', () => ({
  CoachHelmShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

// Passive stub — the toolbar's own filter popovers aren't exercised here;
// the narrowing in this suite comes entirely from `defaultFilter.severity`.
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

// 3 open rows: 1 critical, 1 high, 1 low. Plus 1 already-resolved row that
// must NEVER count toward "Open" or "Showing".
const MIXED_INSIGHTS: EvidenceInsight[] = [
  makeInsight({ id: 'i1', title: 'Critical driving issue', priority: 'urgent', status: 'active' }),
  makeInsight({ id: 'i2', title: 'High putting issue', priority: 'high', status: 'active' }),
  makeInsight({ id: 'i3', title: 'Low tempo note', priority: 'low', status: 'active' }),
  makeInsight({ id: 'i4', title: 'Already resolved item', priority: 'high', status: 'resolved' }),
];

const PLAYER_NAMES = { 'player-1': 'Alex Rivera' };

/** Reads a MetricCard's big numeric value by its uppercase eyebrow label —
 *  scoped to that ONE tile so it can't collide with an identical digit
 *  appearing elsewhere on the page (e.g. inside a card's own evidence). */
function tileValue(label: string): string {
  const labelEl = screen.getByText(label);
  const card = labelEl.closest('.rounded-card');
  if (!card) throw new Error(`MetricCard root not found for label "${label}"`);
  const valueEl = card.querySelector('.text-h1, .text-h2, .text-display');
  if (!valueEl) throw new Error(`MetricCard value not found for label "${label}"`);
  return valueEl.textContent ?? '';
}

describe('FairwayCoachHelmSignals — header tiles match the rendered list (#4/#184)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('unfiltered: all 3 tiles read the full loaded set, matching every card on screen', async () => {
    await act(async () => {
      render(
        <FairwayCoachHelmSignals
          coachId="coach-1"
          teamId="team-1"
          signalSource="insights"
          initialInsights={MIXED_INSIGHTS}
          playerNames={PLAYER_NAMES}
        />,
      );
    });

    // 4 cards render (3 open + 1 resolved) — nothing is client-filtered here.
    expect(screen.getByText('Critical driving issue')).toBeInTheDocument();
    expect(screen.getByText('High putting issue')).toBeInTheDocument();
    expect(screen.getByText('Low tempo note')).toBeInTheDocument();
    expect(screen.getByText('Already resolved item')).toBeInTheDocument();

    // "Showing" = every loaded row (4), "Open" = the 3 non-resolved rows,
    // "Urgent + high" = the 2 of those 3 that are critical/high priority.
    expect(tileValue('Open insights')).toBe('3');
    expect(tileValue('Urgent + high')).toBe('2');
    expect(tileValue('Showing insights')).toBe('4');
  });

  it('with a toolbar search query narrowing the list: all 3 tiles shrink to match — never the stale unfiltered count', async () => {
    await act(async () => {
      render(
        <FairwayCoachHelmSignals
          coachId="coach-1"
          teamId="team-1"
          signalSource="insights"
          initialInsights={MIXED_INSIGHTS}
          playerNames={PLAYER_NAMES}
          // Seeds the toolbar search box (`query` state) directly — a client-
          // side toolbar filter, independent of the segment/severity-preset
          // logic, that narrows the rendered list to the ONE matching row.
          initialSearchParams={{ q: 'Critical driving' }}
        />,
      );
    });

    // Only the one filtered-in card renders.
    expect(screen.getByText('Critical driving issue')).toBeInTheDocument();
    expect(screen.queryByText('High putting issue')).not.toBeInTheDocument();
    expect(screen.queryByText('Low tempo note')).not.toBeInTheDocument();
    expect(screen.queryByText('Already resolved item')).not.toBeInTheDocument();

    // Every tile reads 1 — matching the ONE rendered card, not the 4 loaded
    // rows (the pre-fix bug: "Showing" would have kept reading 4 here).
    expect(tileValue('Open insights')).toBe('1');
    expect(tileValue('Urgent + high')).toBe('1');
    expect(tileValue('Showing insights')).toBe('1');
  });
});
