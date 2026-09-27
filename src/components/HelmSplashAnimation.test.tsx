import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HelmSplashAnimation from './HelmSplashAnimation';

/**
 * /splash renders this animation on its own. The "Replay Animation" button is
 * a development convenience: shipped to production it made the public page
 * look like a leftover test page. The dev server always runs with
 * NODE_ENV=development, so a screenshot of it cannot show the production
 * state; this test pins it instead.
 */
describe('HelmSplashAnimation replay control', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders no replay button in a production build', () => {
    vi.stubEnv('NODE_ENV', 'production');
    render(<HelmSplashAnimation />);
    expect(screen.queryByRole('button', { name: /replay animation/i })).toBeNull();
    expect(screen.queryByText('Replay Animation')).toBeNull();
  });

  it('keeps the replay button in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    render(<HelmSplashAnimation />);
    expect(screen.getByRole('button', { name: /replay animation/i })).toBeInTheDocument();
  });
});
