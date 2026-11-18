import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * GolfHelm draws Clubhouse only (2026-11-18): a GolfHelm route outside the Clubhouse shell (the sign-in room's pages,
 * onboarding, a join link, a crash in the shell itself) hands RouteErrorBoundary its own view (`outsideShell`), so the
 * boundary never draws its generic fallback there. Inside the shell, the shell's own view still wins.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }), usePathname: () => '/golf/join' }));
vi.mock('@/lib/recovery/client', async (orig) => ({ ...(await orig<object>()), requestRecovery: vi.fn(() => 'scheduled') }));
vi.mock('@/lib/error-logging', async (orig) => ({ ...(await orig<object>()), logError: vi.fn(), logErrorToServer: vi.fn() }));

import { RouteErrorBoundary } from '../RouteErrorBoundary';
import { ClubhouseMarker } from '@/clubhouse/shell/context';
import { routeErrorWords, type RouteErrorViewProps } from '@/clubhouse/ui/Notices';

function Outside(props: RouteErrorViewProps) {
  return (
    <p data-testid="outside">
      {props.kind} {props.homePath} {props.route}
    </p>
  );
}

describe('RouteErrorBoundary outside the Clubhouse shell', () => {
  it('draws the view it is handed, with the same classification, and never the generic fallback', () => {
    render(<RouteErrorBoundary error={new Error('boom')} reset={vi.fn()} route="/golf/join" homePath="/golf" outsideShell={Outside} autoRetry={false} />);
    expect(screen.getByTestId('outside')).toHaveTextContent('unknown /golf /golf/join');
    expect(screen.queryByText('Something went wrong')).toBeNull();
  });

  it('inside the shell the shell’s own view wins', () => {
    render(
      <ClubhouseMarker>
        <RouteErrorBoundary error={new Error('boom')} reset={vi.fn()} route="/golf/dashboard/rounds" outsideShell={Outside} autoRetry={false} />
      </ClubhouseMarker>,
    );
    expect(screen.queryByTestId('outside')).toBeNull();
    expect(document.querySelector('[data-ch-code="CH-1206"]')).not.toBeNull();
  });

  it('the outside view speaks the route error’s own words and numbers', () => {
    expect(routeErrorWords('chunk', '/golf/join')).toMatchObject({ code: 'CH-1202' });
    expect(routeErrorWords('unknown', '/golf/dashboard/rounds')).toEqual({ title: 'Rounds didn’t load', body: expect.any(String), code: 'CH-1206' });
  });
});
