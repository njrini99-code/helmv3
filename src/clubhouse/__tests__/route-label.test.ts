import { describe, it, expect } from 'vitest';
import { routeLabel } from '../shell/nav';

describe('routeLabel (swap audit F-39)', () => {
  it('names a dashboard page with no nav item instead of calling it Home', () => {
    expect(routeLabel('/golf/dashboard/rounds')).toBe('Rounds');
    expect(routeLabel('/golf/dashboard/my-qualifiers/abc')).toBe('My qualifiers');
    expect(routeLabel('/golf/dashboard')).toBeNull();
  });
});
