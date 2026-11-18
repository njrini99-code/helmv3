import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import LiftLabNotFound from '../not-found';

/** GAP-R-07: a missing program, athlete or session stays inside Lift Lab, with one way back to its dashboard. */
describe('the Lift Lab 404', () => {
  it('says what happened and goes back to the Lift Lab dashboard, never to another product', () => {
    render(<LiftLabNotFound />);
    expect(screen.getByText('We couldn’t find that')).toBeInTheDocument();
    const links = screen.getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/lifting/dashboard']);
    expect(links[0]).toHaveTextContent('Back to Lift Lab');
  });
});
