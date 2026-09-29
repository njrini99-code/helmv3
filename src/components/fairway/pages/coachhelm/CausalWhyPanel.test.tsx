/**
 * `CausalWhyPanel` renders one hop per card and never joins two that connect.
 *
 * `composeCausalChains` (5a8fc017e) exists and is tested, but nothing calls it,
 * so the chain it can build reaches no screen. The panel is the surface where
 * it belongs: it already holds the player's whole deduped active set, so a
 * chain composed HERE can only ever cite hops the coach can also see listed
 * individually below it.
 *
 * The engine now detects two adjacent pairs:
 *
 *     driving_accuracy      -> greens_in_regulation   (2026-08-17)
 *     greens_in_regulation  -> putting_volume         (2026-08-18, ff87d8126)
 *
 * A player carrying both gets two separate cards today — "driving accuracy
 * affects greens hit" and "greens hit affects putts" — and is left to join them
 * himself. Joined, they say the thing a coach actually needs: his putting
 * numbers look like a putting problem and they are a driving problem.
 *
 * Chains are additive and never replace the single-edge list. A player with no
 * two connecting rows — 5 of Guilford's 12 have any relationship at all, and
 * only one has a row whose effect is not the score — must see exactly what he
 * sees today, with no extra heading and no empty state for a section that has
 * nothing to say.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CausalWhyPanel } from './CausalWhyPanel';
import type { CausalRelationshipRow } from '@/app/golf/actions/causal-relationships';

function row(
  cause: string,
  causeMetric: string,
  effect: string,
  effectMetric: string,
  over: Partial<CausalRelationshipRow> = {},
): CausalRelationshipRow {
  return {
    id: `${causeMetric}->${effectMetric}`,
    player_id: 'p1',
    cause,
    cause_metric: causeMetric,
    effect,
    effect_metric: effectMetric,
    relationship_type: 'direct',
    strength: 0.7,
    confidence: 0.8,
    mechanism: `${cause} moves ${effect}`,
    dose_response: false,
    intervention_potential: 0.6,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-17T00:00:00.000Z',
    correlation: 0.7,
    sample_n: 20,
    p_value: 0.001,
    q_value: 0.003,
    ...over,
  };
}

/** The two adjacent pairs the engine can detect, in the order they chain. */
const DRIVING_TO_GREENS = row(
  'driving_accuracy',
  'total_fairways_hit',
  'greens_in_regulation',
  'total_gir',
);
const GREENS_TO_PUTTS = row(
  'greens_in_regulation',
  'total_gir',
  'putting_volume',
  'total_putts',
);

describe('CausalWhyPanel — linked patterns', () => {
  it('joins two connecting relationships into one chain, above the single-edge list', () => {
    render(<CausalWhyPanel relationships={[DRIVING_TO_GREENS, GREENS_TO_PUTTS]} />);

    const chain = screen.getByRole('group', { name: /linked pattern/i });

    // Every node in order — the middle metric is named once, not twice.
    expect(chain).toHaveTextContent('Driving accuracy');
    expect(chain).toHaveTextContent('Greens in regulation');
    expect(chain).toHaveTextContent('Putting volume');
  });

  it('reports the weakest hop as the chain confidence, not the strongest', () => {
    render(
      <CausalWhyPanel
        relationships={[
          { ...DRIVING_TO_GREENS, confidence: 0.9 },
          { ...GREENS_TO_PUTTS, confidence: 0.4 },
        ]}
      />,
    );

    const chain = screen.getByRole('group', { name: /linked pattern/i });
    // Confidence reads as a word band (NUM-08), from the weakest hop.
    expect(chain).toHaveTextContent('Early read');
    expect(chain).not.toHaveTextContent('Solid read');
  });

  it('says every step was detected separately, so a chain never reads as proven', () => {
    render(<CausalWhyPanel relationships={[DRIVING_TO_GREENS, GREENS_TO_PUTTS]} />);

    const chain = screen.getByRole('group', { name: /linked pattern/i });
    expect(chain).toHaveTextContent(/detected separately/i);
  });

  it('still lists each hop individually — the chain adds a card, it does not replace them', () => {
    render(<CausalWhyPanel relationships={[DRIVING_TO_GREENS, GREENS_TO_PUTTS]} />);

    // Both mechanism sentences still reach the screen.
    expect(
      screen.getByText('driving_accuracy moves greens_in_regulation'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('greens_in_regulation moves putting_volume'),
    ).toBeInTheDocument();
    // The header count still counts RELATIONSHIPS, not chains.
    expect(screen.getByText('2 relationships')).toBeInTheDocument();
  });

  it('renders no chain section at all when nothing connects', () => {
    // Several edges, all score arithmetic: none may chain.
    render(
      <CausalWhyPanel
        relationships={[
          row('greens_in_regulation', 'total_gir', 'scoring', 'score_to_par'),
          row('putting', 'total_putts', 'scoring', 'score_to_par'),
          row('driving_accuracy', 'total_fairways_hit', 'scoring', 'score_to_par'),
        ]}
      />,
    );

    expect(screen.queryByRole('group', { name: /linked pattern/i })).toBeNull();
    // and the single-edge list is untouched
    expect(screen.getByText('3 relationships')).toBeInTheDocument();
  });

  it('renders no chain section for a single relationship', () => {
    render(<CausalWhyPanel relationships={[GREENS_TO_PUTTS]} />);
    expect(screen.queryByRole('group', { name: /linked pattern/i })).toBeNull();
  });

  it('keeps the honest empty state when there are no relationships at all', () => {
    render(<CausalWhyPanel relationships={[]} />);
    expect(screen.queryByRole('group', { name: /linked pattern/i })).toBeNull();
    expect(
      screen.getByText(/No stats move together clearly enough yet/i),
    ).toBeInTheDocument();
  });
});

/**
 * Deep audit rows 33/34 (2026-09-28), owner decision "honest correlation":
 * the cards must not claim cause, must show the sign and n, and must carry a
 * caveat. 'How sure the engine is it's causal' was the confidence hint.
 */
describe('CausalWhyPanel — honest correlation copy', () => {
  it('never claims causality on a relationship card', () => {
    const { container } = render(<CausalWhyPanel relationships={[GREENS_TO_PUTTS]} />);
    expect(container.textContent ?? '').not.toMatch(/causal|root.cause|dose.responsive/i);
    expect(screen.getByText(/not\s+proof that one causes the other/i)).toBeInTheDocument();
    expect(screen.getByText('How unlikely the pattern is to be chance')).toBeInTheDocument();
  });

  it('states the SIGN in words and shows n', () => {
    render(
      <CausalWhyPanel
        relationships={[{ ...GREENS_TO_PUTTS, correlation: -0.55, sample_n: 18 }]}
      />,
    );
    expect(screen.getByText('moves opposite to')).toBeInTheDocument();
    expect(screen.getByText(/tends to be\s+lower\s+\(18 rounds\)/i)).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
  });

  it('a positive correlation reads "moves with" and "higher"', () => {
    render(<CausalWhyPanel relationships={[GREENS_TO_PUTTS]} />);
    expect(screen.getByText('moves with')).toBeInTheDocument();
    expect(screen.getByText(/tends to be\s+higher/i)).toBeInTheDocument();
  });

  it('a linked pattern shows each link sign and the composed direction', () => {
    render(
      <CausalWhyPanel
        relationships={[
          { ...DRIVING_TO_GREENS, correlation: 0.6 },
          { ...GREENS_TO_PUTTS, correlation: -0.6 },
        ]}
      />,
    );
    const chain = screen.getByRole('group', { name: /linked pattern/i });
    expect(chain).toHaveTextContent('moves with');
    expect(chain).toHaveTextContent('moves opposite to');
    expect(chain).toHaveTextContent(/driving accuracy moves opposite to putting volume/i);
    expect(chain).toHaveTextContent(/not a cause/i);
  });
});
