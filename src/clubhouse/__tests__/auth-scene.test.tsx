import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** The painted course's mount (P015): it may fail without taking the form with it. */

const report = vi.hoisted(() => vi.fn());
vi.mock('../lib/track', () => ({ chReport: report, chTrail: vi.fn(), chTagSession: vi.fn() }));
const scene = vi.hoisted(() => ({ throws: true }));
// `next/dynamic` loads the course in its own chunk; here it is a component that either draws or throws.
vi.mock('next/dynamic', () => ({
  default: () =>
    function Course() {
      if (scene.throws) throw new Error('the course failed to draw');
      return <div data-testid="course" />;
    },
}));

import { FixedClock } from '../screens/auth/use-hour';
import { SceneMount } from '../screens/auth/SceneMount';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  scene.throws = true;
});

describe('CH-15908 a crash in the course leaves the form alone and is reported', () => {
  it('draws nothing in its place and reports it to Sentry, low severity, tagged auth.scene', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <FixedClock.Provider value={new Date(2025, 9, 14, 9, 0)}>
        <SceneMount />
        <form aria-label="Sign in to GolfHelm" />
      </FixedClock.Provider>,
    );
    expect(screen.queryByTestId('course')).toBeNull();
    expect(screen.getByRole('form', { name: 'Sign in to GolfHelm' })).toBeInTheDocument();
    expect(report).toHaveBeenCalledWith(expect.any(Error), { surface: 'auth.scene', severity: 'low' });
  });

  it('draws the course when it is fine, once the viewer clock is known', () => {
    scene.throws = false;
    render(
      <FixedClock.Provider value={new Date(2025, 9, 14, 9, 0)}>
        <SceneMount />
      </FixedClock.Provider>,
    );
    expect(screen.getByTestId('course')).toBeInTheDocument();
    expect(report).not.toHaveBeenCalled();
  });
});
