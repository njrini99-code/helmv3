import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

/** The dashboard 404: Clubhouse's page empty (CH-1306), for coaches and players alike (Clubhouse is the only UI). */

import GolfDashboardNotFound from '../not-found';

describe('dashboard not-found', () => {
  it('CH-1306 shows Clubhouse’s page empty with the way back to Home, and no Fairway markup', () => {
    render(<GolfDashboardNotFound />);
    const page = document.querySelector('[data-ch-code="CH-1306"]')!;
    expect(page).not.toBeNull();
    expect(page.className).toContain('ch-empty-page');
    expect(screen.getByRole('heading', { name: 'We couldn’t find that' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to Home' }).getAttribute('href')).toBe('/golf/dashboard');
    expect(screen.queryByRole('link', { name: 'Back to dashboard' })).toBeNull();
  });
});
