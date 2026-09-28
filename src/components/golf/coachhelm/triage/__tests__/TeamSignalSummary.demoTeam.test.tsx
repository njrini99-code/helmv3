// @vitest-environment jsdom
/**
 * ============================================================================
 * TeamSignalSummary: the Demo University Golf queue, as it stands
 * ----------------------------------------------------------------------------
 * The shape below is transcribed from read-only SQL against production on
 * 2026-09-27 (team 6ecdd1a6-…; visible v3 insights plus active non-contextual
 * patterns, collapsed to the newest row per player and category the way
 * `collapseDuplicates` does): 40 live signals from 7 players in 8 areas, one
 * of them high priority, 15.54 estimated strokes in total.
 *
 *   area               signals  high  est. strokes
 *   conditional (pat.)       7     0         11.98
 *   putting                  7     0          1.86
 *   approach                 7     0          0.00
 *   tee                      7     1          0.51
 *   short_game               4     0          1.19
 *   pressure                 4     0          0.00
 *   scoring                  2     0          0.00
 *   course_management        2     0          0.00
 *
 * Per-row stroke figures are spread evenly to hit each area's total; the
 * card only ever shows sums, so the spread does not change what it prints.
 * ========================================================================== */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { groupSignals, type GroupedSignal } from '@/lib/coachhelm/signal-grouping';
import { TeamSignalSummary } from '../TeamSignalSummary';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/golf/dashboard/intelligence',
  useSearchParams: () => new URLSearchParams(),
}));

const PLAYERS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'];

const AREAS: Array<{ category: string; count: number; high: number; strokes: number; kind?: 'pattern' }> = [
  { category: 'conditional', count: 7, high: 0, strokes: 11.98, kind: 'pattern' },
  { category: 'putting', count: 7, high: 0, strokes: 1.86 },
  { category: 'approach', count: 7, high: 0, strokes: 0 },
  { category: 'tee', count: 7, high: 1, strokes: 0.51 },
  { category: 'short_game', count: 4, high: 0, strokes: 1.19 },
  { category: 'pressure', count: 4, high: 0, strokes: 0 },
  { category: 'scoring', count: 2, high: 0, strokes: 0 },
  { category: 'course_management', count: 2, high: 0, strokes: 0 },
];

function demoSignals(): GroupedSignal[] {
  return AREAS.flatMap((area) =>
    Array.from({ length: area.count }, (_, i): GroupedSignal => ({
      id: `${area.category}-${i}`,
      kind: area.kind ?? 'insight',
      category: area.category,
      severity: i < area.high ? 'high' : 'medium',
      title: `${area.category} signal`,
      claim: 'A real signal.',
      ageDays: 3,
      status: 'active',
      strokeImpact: area.strokes / area.count,
      playerId: PLAYERS[i]!,
      supersededCount: 0,
    })),
  );
}

function renderDemo() {
  const names = Object.fromEntries(PLAYERS.map((id, i) => [id, `Player ${i + 1}`]));
  return render(
    <TeamSignalSummary
      groups={groupSignals(demoSignals(), names)}
      categoryHref={(c) => `/golf/dashboard/intelligence?view=lab&filter=category:${c}`}
      onOpenCategory={vi.fn()}
    />,
  );
}

describe('TeamSignalSummary on the demo team', () => {
  it('heads the card with the live count and the estimated strokes', () => {
    renderDemo();
    expect(screen.getByText('40 live')).toBeInTheDocument();
    expect(screen.getByText('15.5 est. strokes')).toBeInTheDocument();
  });

  it('ranks the one area with a high-priority signal first, then by volume and strokes', () => {
    renderDemo();
    const ranked = screen.getAllByRole('link').map((link) => link.textContent ?? '');
    expect(ranked[0]).toMatch(/^1Tee7 signals1 high priority≈0\.5 strokes$/);
    expect(ranked[1]).toMatch(/^2Conditional7 signals/);
    expect(ranked[1]).toContain('≈12.0 strokes');
    expect(ranked[2]).toMatch(/^3Putting7 signals/);
    expect(ranked[3]).toMatch(/^4Approach7 signalsNo high priority$/);
    expect(ranked).toHaveLength(6);
    expect(screen.getByText('+2 more areas in The Lab')).toBeInTheDocument();
  });

  it('counts the roster totals from the same signals', () => {
    renderDemo();
    const metric = (label: string) => screen.getByText(label).closest('div')!;
    expect(within(metric('High priority')).getByText('1')).toBeInTheDocument();
    expect(within(metric('Players flagged')).getByText('7')).toBeInTheDocument();
    expect(within(metric('Game categories')).getByText('8')).toBeInTheDocument();
  });

  it('prints no "undefined" or "NaN" anywhere', () => {
    const { container } = renderDemo();
    expect(container.textContent).not.toMatch(/undefined|NaN/);
  });
});
