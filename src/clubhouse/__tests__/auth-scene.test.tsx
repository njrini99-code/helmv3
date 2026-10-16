import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

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
import { SceneMount, posterWash } from '../screens/auth/SceneMount';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  scene.throws = true;
});

describe('CH-15908 a crash in the course leaves the form alone and is reported', () => {
  it('ships the painted course before JavaScript or the viewer clock is available', () => {
    const html = renderToStaticMarkup(<SceneMount />);
    expect(html).toContain('/clubhouse/auth/course-arrival.jpg');
    expect(html).toContain('650 0 760 1000');
    expect(html).not.toContain('data-testid="course"');
  });
  it('keeps the course poster and reports the animation crash to Sentry, low severity, tagged auth.scene', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <FixedClock.Provider value={new Date(2025, 9, 14, 9, 0)}>
        <SceneMount />
        <form aria-label="Sign in to GolfHelm" />
      </FixedClock.Provider>,
    );
    expect(screen.queryByTestId('course')).toBeNull();
    expect(document.querySelector('.ch-au-poster')).toBeInTheDocument();
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

describe('the still takes the hour\'s light until the course draws', () => {
  // The still is a daytime photo: a sign in at night opened on a sunny course and then switched (owner, 2026-10-14).
  const wash = () => (document.querySelector('.ch-au-poster__wash') as HTMLElement | null)?.style.opacity;
  it('washes the still dark at night, before the course has loaded', () => {
    scene.throws = false;
    render(
      <FixedClock.Provider value={new Date(2025, 9, 14, 23, 0)}>
        <SceneMount />
      </FixedClock.Provider>,
    );
    expect(Number(wash())).toBeGreaterThan(0.6);
  });
  it('leaves the still clear by day and on the server', () => {
    scene.throws = false;
    render(
      <FixedClock.Provider value={new Date(2025, 9, 14, 12, 30)}>
        <SceneMount />
      </FixedClock.Provider>,
    );
    expect(Number(wash())).toBe(0);
    expect(posterWash(null)).toBeUndefined();
  });
});
