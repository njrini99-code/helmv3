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
import { Spine, spineHeroDirection } from '../Spine';
import { FROSTED_CARD_CLASS } from '../frosted';
import { SpineLedger, spineLedgerColumns } from '../SpineLedger';
import { PriorityList, isLossValue } from '../PriorityList';
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

  it('renders a light frosted card, not the old dark green slab', () => {
    const { container } = render(<Spine {...fixture} className="sticky top-20" />);
    const aside = container.querySelector('[data-slot="spine"]')!;
    expect(aside.className).toMatch(/backdrop-blur/);
    for (const cls of FROSTED_CARD_CLASS.split(' ')) expect(aside.classList).toContain(cls);
    expect(aside.className).toMatch(/text-text-primary/);
    expect(aside.className).not.toMatch(/from-accent-900|text-text-on-accent/);
    expect(aside.className).toMatch(/sticky top-20/);
    expect(container.querySelector('[data-slot="standing-track"]')).toHaveAttribute('data-tone', 'light');
  });

  it('shows a loss chip for a negative hero without repeating the number', () => {
    const { container } = render(<Spine {...fixture} />);
    const chip = container.querySelector('[data-slot="spine-hero-chip"]')!;
    expect(chip).toHaveAttribute('data-direction', 'loss');
    expect(chip.textContent).toContain('Losing');
    expect(chip.className).toMatch(/text-fw-danger-ink/);
    expect(screen.getAllByText('−2.1')).toHaveLength(1);
  });

  it('shows a gain chip for a positive hero and none for an unsigned one', () => {
    const { container, rerender } = render(<Spine {...fixture} hero={{ value: '+1.3', unit: 'SG / rd' }} />);
    expect(container.querySelector('[data-slot="spine-hero-chip"]')).toHaveAttribute('data-direction', 'gain');
    rerender(<Spine {...fixture} hero={{ value: '74.2', unit: 'scoring avg' }} />);
    expect(container.querySelector('[data-slot="spine-hero-chip"]')).toBeNull();
  });
});

describe('spineHeroDirection', () => {
  it.each([
    ['+1.3', 'SG / rd', 'gain'],
    ['−2.1', 'SG / round', 'loss'],
    ['-0.4', 'SG / rd', 'loss'],
    ['0.0', 'SG / rd', null],
    ['+0.0', 'SG / rd', null],
    ['—', undefined, null],
    ['74.2', 'predicted score', null],
    // Score to par: plus is WORSE, so never a green "Gaining" chip.
    ['+3.0', 'score to par', null],
  ])('%s (%s) → %s', (value, unit, expected) => {
    expect(spineHeroDirection(value, unit)).toBe(expected);
  });
});

describe('PriorityList', () => {
  it('tints only minus-led values as a loss', () => {
    expect(isLossValue('−0.8 SG')).toBe(true);
    expect(isLossValue('+0.41 / hole')).toBe(false);
    const { container } = render(
      <PriorityList items={[{ rank: 1, title: 'Putting', value: '−0.8 SG' }, { rank: 2, title: 'Par 3s', value: '+0.41 / hole' }]} />,
    );
    const values = container.querySelectorAll('[data-slot="priority-value"]');
    expect(values[0]!.className).toMatch(/text-fw-danger-ink/);
    expect(values[1]!.className).not.toMatch(/text-fw-danger-ink/);
  });
});

describe('SpineLedger', () => {
  it('keeps <dt> before <dd> and lays up to four stats in one row', () => {
    const { container } = render(
      <SpineLedger
        rows={[
          { label: 'Rounds', value: '24' },
          { label: 'Fairways', value: '61%', delta: { text: '+4%', direction: 'up', good: true } },
          { label: 'Greens', value: '48%' },
          { label: 'Putts / rd', value: '31.2' },
        ]}
      />,
    );
    const dl = container.querySelector('[data-slot="spine-ledger"]')!;
    expect(dl.className).toMatch(/grid-cols-4/);
    const stat = container.querySelector('[data-slot="spine-ledger-stat"]')!;
    expect(stat.children[0]!.tagName).toBe('DT');
    expect(stat.children[1]!.tagName).toBe('DD');
    expect(screen.getByText('Fairways up +4%, improvement')).toHaveClass('sr-only');
  });

  it('falls back to two columns past four stats', () => {
    expect(spineLedgerColumns(3)).toBe('grid-cols-3');
    expect(spineLedgerColumns(4)).toBe('grid-cols-4');
    expect(spineLedgerColumns(6)).toBe('grid-cols-2');
  });
});
