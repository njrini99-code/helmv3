import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** P007 D3: a stale chunk after a deploy reloads once, through the one coordinator; anything else is Clubhouse's route error. */

const requestRecovery = vi.hoisted(() => vi.fn(() => 'scheduled'));
vi.mock('@/lib/recovery/client', async (orig) => ({ ...(await orig<object>()), requestRecovery }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }), usePathname: () => '/clubhouse-preview/messages' }));
vi.mock('@/lib/error-logging', async (orig) => ({ ...(await orig<object>()), logError: vi.fn(), logErrorToServer: vi.fn() }));

import { ClubhouseRouteError } from '../shell/ClubhouseRouteError';
import { ClubhouseMarker } from '../shell/context';

const chunk = () => Object.assign(new Error('Loading chunk 4521 failed. (error: /_next/static/chunks/4521.js)'), { name: 'ChunkLoadError' });

// ClubhouseMarker's `role` is the shell's coach or player, not an ARIA role.
const shellRole = 'coach' as const;

beforeEach(() => requestRecovery.mockClear());

describe('Clubhouse route error (P007 D3)', () => {
  it('a ChunkLoadError above the shell asks for one reload and shows Clubhouse’s view, not the app’s generic page', () => {
    const error = chunk();
    const view = render(<ClubhouseRouteError error={error} reset={vi.fn()} route="/clubhouse-preview" />);
    expect(requestRecovery).toHaveBeenCalledTimes(1);
    expect(requestRecovery).toHaveBeenCalledWith(error.message);
    const alert = screen.getByRole('alert');
    expect(alert.getAttribute('data-ch-code')).toBe('CH-1202');
    expect(alert.closest('.ch-root')).not.toBeNull();
    expect(screen.queryByText(/Helm Sports Labs|Try Again$/)).toBeNull();
    // A re-render with the same error never asks again: the coordinator's budget, not this view, decides any second try.
    view.rerender(<ClubhouseRouteError error={error} reset={vi.fn()} route="/clubhouse-preview" />);
    expect(requestRecovery).toHaveBeenCalledTimes(1);
  });

  it('inside the shell it draws the same view without a second root', () => {
    render(
      <div className="ch-root" data-testid="shell">
        <ClubhouseMarker role={shellRole}>
          <ClubhouseRouteError error={chunk()} reset={vi.fn()} route="/golf/dashboard/messages" />
        </ClubhouseMarker>
      </div>,
    );
    expect(screen.getByTestId('shell').querySelectorAll('.ch-root')).toHaveLength(0);
    expect(screen.getByRole('alert').getAttribute('data-ch-code')).toBe('CH-1202');
  });

  it('any other error never reloads: it is the Clubhouse route error with Try again', () => {
    render(<ClubhouseRouteError error={new Error('Cannot read properties of undefined')} reset={vi.fn()} route="/clubhouse-preview" />);
    expect(requestRecovery).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').getAttribute('data-ch-code')).toBe('CH-1206');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});
