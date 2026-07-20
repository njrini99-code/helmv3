// @vitest-environment jsdom
/**
 * ============================================================================
 * Spine — render smoke test
 * ----------------------------------------------------------------------------
 * Mounts `Spine` with a hero + priorities fixture and asserts the hero value
 * renders and the priority rows render in rank order (01 first, 03 last).
 * ========================================================================== */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Spine } from '../Spine';
import type { PriorityItem, SpineProps } from '../types';

const priorities: PriorityItem[] = [
  { rank: 1, title: '3-5 ft putts', value: '47% · Tour 91' },
  { rank: 2, title: 'Long irons 175+', value: '30% greens' },
  { rank: 3, title: 'Par-3 doubles', value: '+0.41 / hole' },
];

const fixture: SpineProps = {
  eyebrow: 'Your game · last 15 rounds',
  hero: { value: '−2.1', unit: 'SG / round' },
  verdict: "Putting costs you the most. Fix 3–5 ft and you're a 73-shooter.",
  track: {
    pct: 38,
    subjectLabel: 'You',
    benchmarks: [
      { label: 'Team', pct: 62, emphasis: true },
      { label: 'Tour', pct: 91 },
    ],
  },
  priorities,
  ledger: [
    { label: 'Rounds', value: '24' },
    { label: 'Fairways', value: '61%' },
  ],
  cta: { label: 'Ask CoachHelm' },
};

describe('Spine — render smoke', () => {
  it('renders the hero value and verdict', () => {
    render(<Spine {...fixture} />);
    expect(screen.getByText('−2.1')).toBeInTheDocument();
    expect(screen.getByText('SG / round')).toBeInTheDocument();
    expect(screen.getByText(fixture.verdict)).toBeInTheDocument();
  });

  it('renders priorities in rank order (01 before 02 before 03)', () => {
    render(<Spine {...fixture} />);
    const ranks = screen.getAllByText(/^0[1-3]$/).map((el) => el.textContent);
    expect(ranks).toEqual(['01', '02', '03']);
    priorities.forEach((item) => expect(screen.getByText(item.title)).toBeInTheDocument());
  });

  it('renders the CTA as a button when no href is given', () => {
    render(<Spine {...fixture} />);
    const cta = screen.getByRole('button', { name: 'Ask CoachHelm' });
    expect(cta).toBeInTheDocument();
  });

  it('renders the CTA as a link when href is given', () => {
    render(<Spine {...fixture} cta={{ label: 'Ask CoachHelm', href: '/golf/dashboard/coachhelm' }} />);
    const cta = screen.getByRole('link', { name: 'Ask CoachHelm' });
    expect(cta).toHaveAttribute('href', '/golf/dashboard/coachhelm');
  });
});
