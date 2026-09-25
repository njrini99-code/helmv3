import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VerdictLine } from './VerdictLine';

describe('VerdictLine', () => {
  it('joins the clauses that have a value and drops the rest', () => {
    const { container } = render(
      <VerdictLine clauses={['Scoring is down 1.2 a round.', null, undefined, false, '', 'Putting leads it.']} />,
    );
    expect(container.querySelector('p')?.textContent).toBe('Scoring is down 1.2 a round. Putting leads it.');
  });

  it('renders nothing when no clause is left', () => {
    const { container } = render(<VerdictLine clauses={[null, undefined, false]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing for empty children', () => {
    const { container } = render(<VerdictLine>{null}</VerdictLine>);
    expect(container.innerHTML).toBe('');
  });

  it('never truncates, and the lg size is the 20/28 regular verdict role', () => {
    const { container } = render(
      <VerdictLine size="lg" tone="good">
        A long verdict sentence.
      </VerdictLine>,
    );
    const p = container.querySelector('p')!;
    expect(p.className).toContain('text-title-3');
    expect(p.className).toContain('font-normal');
    expect(container.innerHTML).not.toMatch(/truncate|line-clamp|ellipsis/);
    expect(container.querySelector('[data-tone="good"]')).toBeTruthy();
  });

  it('prints the basis line and keeps the tone mark out of the accessible text', () => {
    render(
      <VerdictLine tone="bad" basis="Last 10 rounds · Solid read">
        Approach costs you a stroke.
      </VerdictLine>,
    );
    expect(screen.getByText('Last 10 rounds · Solid read')).toBeTruthy();
    const mark = document.querySelector('[aria-hidden="true"]')!;
    expect(mark.className).toContain('bg-fw-warning');
  });
});
