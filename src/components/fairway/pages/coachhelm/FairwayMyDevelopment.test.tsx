// @vitest-environment jsdom
/**
 * ============================================================================
 * FairwayMyDevelopment — touch targets + no raw metric-key leaks (audit fix)
 * ----------------------------------------------------------------------------
 * Bugs fixed:
 *   #194 — several reused action buttons ("Message coach", "New focus area",
 *     "Retry", "Accept"/"Decline" on a prescribed area) rendered with the
 *     Button `size="sm"` prop, which is only 44px tall on coarse-pointer
 *     media queries — 36px on every other pointer. Every button on this
 *     surface must clear the 44px min-height unconditionally.
 *   #60 / #202 — a proposed (coach-prescribed) focus area's target chip, and
 *     the log-progress drawer's metric label, rendered the raw snake_case
 *     `target_metric` DB identifier (e.g. `putts_made_5_10ft_pct`) verbatim
 *     instead of a human label.
 * ========================================================================== */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { FocusAreaCardData } from './FocusAreaCard';

// ── shell + child sections — pure chrome / independent concerns, not the SUT
//    here. Mocked out so this suite is isolated to FairwayMyDevelopment's own
//    header actions + ProposedAreaCard. ─────────────────────────────────────
vi.mock('./CoachHelmShell', () => ({
  CoachHelmShell: ({ children, actions }: { children: ReactNode; actions?: ReactNode }) => (
    <div>
      <div data-testid="shell-actions">{actions}</div>
      {children}
    </div>
  ),
}));
vi.mock('./GoalsSection', () => ({
  GoalsSection: () => <div data-testid="goals-section" />,
}));
vi.mock('./CausalWhyPanel', () => ({
  CausalWhyPanel: () => <div data-testid="causal-why-panel" />,
}));
vi.mock('./FocusAreaModal', () => ({
  FocusAreaModal: () => null,
}));

// ── server actions — stubbed so mount-time behavior never touches Supabase.
vi.mock('@/app/golf/actions/development', () => ({
  updateFocusAreaProgress: vi.fn(),
  completeFocusArea: vi.fn(),
  reactivateFocusArea: vi.fn(),
  createPlayerFocusArea: vi.fn(),
  acceptFocusArea: vi.fn(),
  declineFocusArea: vi.fn(),
}));

import { FairwayMyDevelopment } from './FairwayMyDevelopment';

function makeProposedArea(overrides: Partial<FocusAreaCardData> = {}): FocusAreaCardData {
  return {
    id: 'fa-1',
    title: null,
    description: null,
    area_type: 'putting',
    status: 'proposed',
    target_metric: 'putts_made_5_10ft_pct',
    target_value: 60,
    current_value: 42,
    ...overrides,
  } as FocusAreaCardData;
}

describe('FairwayMyDevelopment — 44px touch targets', () => {
  it('never renders a reused action button with the 36px-on-fine-pointer `sm` size', () => {
    const { container } = render(
      <FairwayMyDevelopment
        activeAreas={[]}
        completedAreas={[]}
        proposedAreas={[makeProposedArea()]}
        playerId="player-1"
      />,
    );

    // `size="sm"` renders Button's dense class (`min-h-[36px]`), which is only
    // 44px behind a `(pointer: coarse)` media query. Every button here must
    // use the unconditional 44px `md`/`lg` sizing instead.
    const buttons = container.querySelectorAll('button, a[data-slot="fw-button"]');
    expect(buttons.length).toBeGreaterThan(0);
    for (const btn of Array.from(buttons)) {
      expect(btn.className).not.toMatch(/min-h-\[36px\]/);
    }
  });

  it('renders "Message coach" and "New focus area" at the 44px md size', () => {
    render(
      <FairwayMyDevelopment
        activeAreas={[makeProposedArea({ status: 'active' })]}
        completedAreas={[]}
        playerId="player-1"
      />,
    );
    const messageCoach = screen.getByRole('link', { name: /message coach/i });
    const newFocusArea = screen.getByRole('button', { name: /new focus area/i });
    expect(messageCoach.className).toMatch(/min-h-\[44px\]/);
    expect(newFocusArea.className).toMatch(/min-h-\[44px\]/);
  });

  it('renders Accept/Decline on a prescribed area at the 44px md size', () => {
    render(
      <FairwayMyDevelopment
        activeAreas={[]}
        completedAreas={[]}
        proposedAreas={[makeProposedArea()]}
        playerId="player-1"
      />,
    );
    const accept = screen.getByRole('button', { name: /^accept$/i });
    const decline = screen.getByRole('button', { name: /^decline$/i });
    expect(accept.className).toMatch(/min-h-\[44px\]/);
    expect(decline.className).toMatch(/min-h-\[44px\]/);
  });
});

describe('FairwayMyDevelopment — no raw snake_case metric key leaks', () => {
  it('renders a human label, never the raw target_metric, on a prescribed-area target chip', () => {
    render(
      <FairwayMyDevelopment
        activeAreas={[]}
        completedAreas={[]}
        proposedAreas={[makeProposedArea({ target_metric: 'putts_made_5_10ft_pct' })]}
        playerId="player-1"
      />,
    );
    expect(screen.queryByText('putts_made_5_10ft_pct')).toBeNull();
    expect(screen.getByText(/putts made 5-10 ft/i)).not.toBeNull();
  });

  it('falls back to a title-cased de-snake for a metric not in the canonical registry', () => {
    render(
      <FairwayMyDevelopment
        activeAreas={[]}
        completedAreas={[]}
        proposedAreas={[makeProposedArea({ target_metric: 'custom_swing_tempo' })]}
        playerId="player-1"
      />,
    );
    expect(screen.queryByText('custom_swing_tempo')).toBeNull();
    expect(screen.getByText('Custom Swing Tempo')).not.toBeNull();
  });
});
