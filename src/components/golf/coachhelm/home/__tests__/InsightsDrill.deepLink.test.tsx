// @vitest-environment jsdom
/**
 * InsightsDrill: the dashboard's "Open details" link lands on
 * `?view=insights&insight=<id>` and must open that insight's evidence sheet.
 * Before the audit fix it pushed `?focus=<id>`, which nothing read, so the
 * player landed on the CoachHelm home with nothing opened.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StageRouter } from '@/components/fairway/modules';
import { InsightsDrill } from '../InsightsDrill';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const topInsight = {
  id: 'top-1',
  player_id: 'p-1',
  category: 'putting',
  insight_type: 'short_putt_make',
  title: '3-5 ft putting: 48%',
  content: 'Short putts are costing you strokes.',
  signature: 'short_putt_make:3_5ft',
  evidence: null,
  metadata: null,
  lifecycle_state: 'detected',
  status: 'active',
  priority: 'high',
  acknowledged_at: null,
  resolved_at: null,
  created_at: '2026-09-12T00:00:00Z',
  updated_at: '2026-09-12T00:00:00Z',
} as unknown as EvidenceInsight;

function renderDrill(initialOpenInsight: EvidenceInsight | null, onRate = vi.fn()) {
  return render(
    <StageRouter
      param="view"
      homeKey="home"
      views={[
        {
          key: 'home',
          node: (
            <InsightsDrill
              insights={[]}
              standingByMetric={{}}
              themesEnabled={false}
              themes={[]}
              onRate={onRate}
              onMakePlan={vi.fn()}
              makePlanPendingId={null}
              initialOpenInsight={initialOpenInsight}
            />
          ),
        },
      ]}
    />,
  );
}

describe('InsightsDrill deep link', () => {
  it('opens the linked insight on arrival, even when it is the top insight', async () => {
    renderDrill(topInsight);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getAllByText('3-5 ft putting: 48%').length).toBeGreaterThan(0);
  });

  it('opens nothing without a deep link', () => {
    renderDrill(null);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('InsightsDrill sheet actions (HUB-04)', () => {
  it('shows one visible action; acknowledge and dismiss sit in the overflow menu', async () => {
    const onRate = vi.fn();
    renderDrill(topInsight, onRate);
    await screen.findByRole('dialog');
    expect(screen.queryByRole('button', { name: /^acknowledge$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^dismiss$/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /more insight actions/i }));
    fireEvent.click(await screen.findByText('Dismiss'));
    expect(onRate).toHaveBeenCalledWith('top-1', 'dismissed');
  });

  it('acknowledge from the overflow menu keeps the same rating call', async () => {
    const onRate = vi.fn();
    renderDrill(topInsight, onRate);
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: /more insight actions/i }));
    fireEvent.click(await screen.findByText('Acknowledge'));
    expect(onRate).toHaveBeenCalledWith('top-1', 'acknowledged');
  });
});
