// @vitest-environment jsdom
/**
 * Player CoachHelm drills — summary first, detail on tap (2026-09-25 polish).
 *
 * jsdom has no layout engine, so these pin STRUCTURE at a phone-width
 * viewport, not pixels: each drill opens with exactly one summary card (key
 * number, one line, a basis line naming its sample), secondary detail sits
 * behind closed 44px disclosures, and at most one primary action is visible.
 * Data assertions (the numbers and samples printed) come from the fixtures.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { StageRouter } from '@/components/fairway/modules';
import type { FocusAreaCardData } from '@/components/fairway';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { PlayerFingerprint } from '@/app/golf/actions/player-fingerprint';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/golf/dashboard/coachhelm',
}));
vi.mock('@/components/ui/sonner', () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock('@/app/golf/actions/development', () => ({
  updateFocusAreaProgress: vi.fn(),
  completeFocusArea: vi.fn(),
  reactivateFocusArea: vi.fn(),
  createPlayerFocusArea: vi.fn(),
  acceptFocusArea: vi.fn(),
  declineFocusArea: vi.fn(),
}));
vi.mock('@/app/golf/actions/focus-area-practice-log', () => ({ logFocusAreaPracticeSession: vi.fn() }));

import { DevelopmentDrill } from '../DevelopmentDrill';
import { ProfileDrill, profileBasisLine } from '../ProfileDrill';
import { InsightsDrill } from '../InsightsDrill';

beforeAll(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
  window.dispatchEvent(new Event('resize'));
});

function inStage(node: React.ReactNode) {
  return render(<StageRouter param="view" homeKey="home" views={[{ key: 'home', node }]} />);
}

function visiblePrimaries(container: HTMLElement): HTMLElement[] {
  // Fairway Button marks its variant; count every rendered primary.
  return Array.from(container.querySelectorAll<HTMLElement>('[data-variant="primary"]'));
}

function area(id: string, over: Partial<FocusAreaCardData> = {}): FocusAreaCardData {
  return {
    id,
    area_type: 'putting',
    title: `Area ${id}`,
    description: null,
    status: 'active',
    target_metric: null,
    current_value: null,
    target_value: null,
    ...over,
  } as unknown as FocusAreaCardData;
}

describe('DevelopmentDrill', () => {
  it('opens with one summary: active count, top focus with its numbers, and completed/total', () => {
    const { container } = inStage(
      <DevelopmentDrill
        activeAreas={[area('a', { title: 'Lag putting', current_value: 31, target_value: 25 }), area('b')]}
        completedAreas={[area('c', { status: 'completed' })]}
        playerId="p-1"
        goals={[]}
      />,
    );
    const summaries = container.querySelectorAll('[aria-label="Summary"]');
    expect(summaries).toHaveLength(1);
    const summary = summaries[0] as HTMLElement;
    expect(summary.getAttribute('data-slot')).toBe('development-summary');
    expect(within(summary).getByText('2')).toBeTruthy();
    expect(summary.textContent).toContain('Top focus: Lag putting, at 31 with a target of 25.');
    expect(within(summary).getByRole('img').getAttribute('aria-label')).toBe('1 of 3 focus areas complete');
    // Completed / goals / causal detail sit behind closed disclosures.
    for (const slot of ['development-active', 'development-goals', 'development-causal', 'development-completed']) {
      const d = container.querySelector(`[data-slot="${slot}"]`);
      expect(d?.getAttribute('data-open')).toBe('false');
    }
    // "New focus area" is a secondary header action once a plan exists.
    expect(screen.getByRole('button', { name: /New focus area/ }).getAttribute('data-variant')).not.toBe('primary');
    expect(visiblePrimaries(container)).toHaveLength(0);
    // Tapping the row reveals the cards (and their own "Mark complete").
    fireEvent.click(screen.getByRole('button', { name: /Active focus areas/ }));
    expect(container.querySelector('[data-slot="development-active"]')?.textContent).toContain('Lag putting');
  });

  it('with prescribed areas, only the first Accept is primary', () => {
    const { container } = inStage(
      <DevelopmentDrill
        activeAreas={[]}
        completedAreas={[]}
        proposedAreas={[area('p1', { status: 'proposed' }), area('p2', { status: 'proposed' })]}
        playerId="p-1"
      />,
    );
    const accepts = screen.getAllByRole('button', { name: 'Accept' });
    expect(accepts).toHaveLength(2);
    expect(accepts[0]!.getAttribute('data-variant')).toBe('primary');
    expect(accepts[1]!.getAttribute('data-variant')).not.toBe('primary');
    expect(visiblePrimaries(container)).toHaveLength(1);
    expect(container.querySelector('[data-slot="development-summary"]')?.textContent).toContain(
      'Your coach prescribed 2 focus areas for you.',
    );
  });

  it('with no areas, the empty state carries the one primary and the header has none', () => {
    const { container } = inStage(<DevelopmentDrill activeAreas={[]} completedAreas={[]} playerId="p-1" />);
    expect(visiblePrimaries(container)).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /New focus area/ })).toHaveLength(1);
  });
});

const FINGERPRINT = {
  player: { id: 'p-1', first_name: 'Ava', last_name: 'Lee', team_name: 'Team', avatar_url: null },
  composite: { rating: 67.4, trend: 'up', rounds_in_calculation: 10 },
  metrics_rounds: 18,
  sections: {},
  trend: { rolling: [] },
  generated_at: '2026-09-24T00:00:00Z',
} as unknown as PlayerFingerprint;

describe('ProfileDrill', () => {
  it('states each sample separately: rating, category stats and genome rest on different round counts', () => {
    expect(profileBasisLine(FINGERPRINT, 12)).toBe(
      'Rating from your last 10 rounds · category stats from 18 rounds · genome from 12 rounds',
    );
    expect(profileBasisLine(null, null)).toBeNull();
  });

  it('opens with the rating, the strongest / watch line, and the basis; detail closed', () => {
    const { container } = inStage(
      <ProfileDrill
        axes={[
          { label: 'Driving', value: 72 },
          { label: 'Putting', value: 41 },
          { label: 'Scrambling', value: 55 },
        ]}
        dimensions={[
          { id: 'd1', label: 'Driving', score: 72, qualitative: 'Long' },
          { id: 'd2', label: 'Putting', score: 41, qualitative: 'Streaky' },
          { id: 'd3', label: 'Scrambling', score: 55, qualitative: null },
          { id: 'd4', label: 'Pressure', score: null, qualitative: 'Locked' },
        ]}
        strengths={[{ id: 'd1', label: 'Driving', qualitative: 'Long' }]}
        watchouts={[{ id: 'd2', label: 'Putting', qualitative: 'Streaky' }]}
        courseProfile={null}
        roundsBasis={12}
        fingerprint={FINGERPRINT}
      />,
    );
    const summary = container.querySelector('[data-slot="profile-summary"]') as HTMLElement;
    expect(summary).not.toBeNull();
    expect(within(summary).getByText('67')).toBeTruthy();
    expect(summary.textContent).toContain('overall game, trending up');
    expect(summary.textContent).toContain('Strongest: Driving. Watch: Putting.');
    expect(summary.textContent).toContain('genome from 12 rounds');
    for (const slot of ['profile-fingerprint', 'profile-dimensions', 'profile-composite']) {
      expect(container.querySelector(`[data-slot="${slot}"]`)?.getAttribute('data-open')).toBe('false');
    }
    fireEvent.click(screen.getByRole('button', { name: /Genome dimensions/ }));
    expect(container.querySelector('[data-slot="profile-dimensions"]')?.textContent).toContain('Pressure');
  });

  it('without a genome, shows rounds toward the floor and one primary to log a round', () => {
    const { container } = inStage(
      <ProfileDrill axes={[]} dimensions={[]} strengths={[]} watchouts={[]} courseProfile={null} roundsBasis={3} />,
    );
    const summary = container.querySelector('[data-slot="profile-summary"]') as HTMLElement;
    expect(within(summary).getByText('3/8')).toBeTruthy();
    expect(visiblePrimaries(container)).toHaveLength(1);
  });
});

function insight(id: string, category: string, created_at: string): EvidenceInsight {
  return {
    id,
    player_id: 'p-1',
    category,
    insight_type: 'x',
    title: `Insight ${id}`,
    content: 'Body text for the insight.',
    signature: id,
    evidence: { metric: 'not_a_metric', metric_label: 'Make % 5-10 ft', unit: 'percent', your_value: 40, sample_n: 20 },
    metadata: null,
    lifecycle_state: 'detected',
    status: 'active',
    priority: 'medium',
    acknowledged_at: null,
    resolved_at: null,
    created_at,
    updated_at: created_at,
  } as unknown as EvidenceInsight;
}

describe('InsightsDrill', () => {
  it('summarises the feed by category, opens only the first group, and never prints a raw metric id', () => {
    const { container } = inStage(
      <InsightsDrill
        insights={[
          insight('1', 'putting', '2026-09-20T00:00:00Z'),
          insight('2', 'putting', '2026-09-22T00:00:00Z'),
          insight('3', 'approach', '2026-09-18T00:00:00Z'),
        ]}
        standingByMetric={{}}
        themesEnabled={false}
        themes={[]}
        onRate={vi.fn()}
        onMakePlan={vi.fn()}
        makePlanPendingId={null}
      />,
    );
    const summary = container.querySelector('[data-slot="insights-summary"]') as HTMLElement;
    expect(within(summary).getByText('3')).toBeTruthy();
    expect(summary.textContent).toContain('Most are about putting.');
    expect(summary.textContent).toContain('Newest from Sep 22');
    const groups = container.querySelectorAll('[data-slot="flat-category-section"]');
    expect(groups).toHaveLength(2);
    expect(groups[0]!.getAttribute('data-open')).toBe('true');
    expect(groups[1]!.getAttribute('data-open')).toBe('false');
    expect(container.textContent).not.toContain('not_a_metric');
    expect(container.textContent).not.toContain('· Signal');
  });

  it('with an empty feed shows the shared empty state and no summary', () => {
    const { container } = inStage(
      <InsightsDrill
        insights={[]}
        standingByMetric={{}}
        themesEnabled={false}
        themes={[]}
        onRate={vi.fn()}
        onMakePlan={vi.fn()}
        makePlanPendingId={null}
      />,
    );
    expect(container.querySelector('[data-slot="insights-summary"]')).toBeNull();
    expect(container.textContent).toContain('No more insights right now');
  });
});
