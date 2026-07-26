import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TaskActivity, describeWork } from '@/components/golf/coachhelm/chat/TaskActivity';
import type { ToolEnvelope } from '@/lib/coachhelm/v3/chat/provenance';

/**
 * The activity surface is derived entirely from parts the stream already
 * publishes — no backend change backs it — so these tests pin the derivation
 * rather than the styling.
 *
 * The two rules worth guarding are honesty rules:
 *
 *   · a capped or summarised figure must not overstate what was read;
 *   · a restored conversation must not display a duration nobody measured.
 */

const STEPS = [
  { id: 's1', label: 'Reading 15 recorded rounds' },
  { id: 's2', label: 'Comparing player trends' },
];

function envelope(over: Partial<ToolEnvelope> = {}): ToolEnvelope {
  return {
    summary: 'read',
    measurements: [],
    series: [],
    coverage: 'complete',
    coverage_note: null,
    as_of: '2026-07-25T12:00:00Z',
    ...over,
  } as ToolEnvelope;
}

function measurement(over: Record<string, unknown> = {}) {
  return {
    metric_id: 'putts_per_round',
    metric_label: 'Putts per round',
    unit: 'count',
    value: 32.9,
    entity: { kind: 'player', id: 'p1', label: 'Cole Bennett' },
    window_start: '2026-05-18',
    window_end: '2026-07-10',
    sample_size: 15,
    sample_unit: 'rounds',
    as_of: '2026-07-25T12:00:00Z',
    coverage: 'complete',
    coverage_note: null,
    source: 'rounds',
    method: 'mean',
    denominator: null,
    benchmark: null,
    direction: 'lower_better',
    ...over,
  };
}

describe('TaskActivity', () => {
  it('keeps every announced step instead of showing only the latest', () => {
    render(<TaskActivity steps={STEPS} busy envelopes={[]} />);
    expect(screen.getByText('Reading 15 recorded rounds')).toBeInTheDocument();
    expect(screen.getByText('Comparing player trends')).toBeInTheDocument();
  });

  it('marks only the last announced step as current', () => {
    render(<TaskActivity steps={STEPS} busy envelopes={[]} />);
    const current = screen.getAllByRole('listitem').filter((li) => li.getAttribute('aria-current'));
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent('Comparing player trends');
  });

  /**
   * Nothing upstream knows how many tools a turn will use, so a greyed-out
   * "up next" row would be a guess drawn as a plan.
   */
  it('invents no steps beyond the ones announced', () => {
    render(<TaskActivity steps={STEPS} busy envelopes={[]} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(STEPS.length);
  });

  it('offers a stop affordance while working', () => {
    render(<TaskActivity steps={STEPS} busy envelopes={[]} onStop={() => {}} />);
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
  });

  it('collapses to a single receipt once the turn is done', () => {
    render(<TaskActivity steps={STEPS} busy={false} envelopes={[]} onStop={() => {}} />);
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument();
  });

  it('shows no duration for a conversation restored from history', () => {
    // Never observed as busy → the elapsed time is genuinely unknown here.
    render(<TaskActivity steps={STEPS} busy={false} envelopes={[]} />);
    expect(screen.queryByText(/\ds$/)).not.toBeInTheDocument();
  });

  it('renders nothing when the turn made no tool calls', () => {
    const { container } = render(<TaskActivity steps={[]} busy envelopes={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('describeWork', () => {
  /**
   * The bug this guards: four metrics measured over the SAME 15 rounds is
   * fifteen rounds read, not sixty. Summing sample sizes inflates the receipt
   * every time one tool returns more than one number about one window — which
   * is the normal case, not the edge case.
   */
  it('takes the max sample per unit, never the sum', () => {
    const env = envelope({
      measurements: [
        measurement({ metric_id: 'a', sample_size: 15 }),
        measurement({ metric_id: 'b', sample_size: 15 }),
        measurement({ metric_id: 'c', sample_size: 15 }),
      ],
    });
    expect(describeWork(STEPS, [env], null)).toBe('Read 15 rounds');
  });

  it('counts distinct players, and only mentions them when there are several', () => {
    const env = envelope({
      measurements: [
        measurement({ entity: { kind: 'player', id: 'p1', label: 'A' } }),
        measurement({ entity: { kind: 'player', id: 'p2', label: 'B' } }),
        measurement({ entity: { kind: 'player', id: 'p2', label: 'B' } }),
      ],
    });
    expect(describeWork(STEPS, [env], null)).toBe('Read 15 rounds across 2 players');
  });

  it('appends the measured duration when one was observed', () => {
    const env = envelope({ measurements: [measurement()] });
    expect(describeWork(STEPS, [env], 4.23)).toBe('Read 15 rounds · 4.2s');
  });

  it('falls back to step count when no sample sizes came back', () => {
    expect(describeWork(STEPS, [envelope()], null)).toBe('Read 2 steps');
  });
});
