// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A route that crashes counts on the Bridge (E3, plan §4.2) on every screen Clubhouse draws: inside the dashboard's
 * shell, and on the front door, whose boundaries hand in their own view. The crash goes as a reported signal, so the
 * row the log writes carries its place; on the front door while nobody is signed in it waits for a sign-in, and then
 * says it was not reported, so the Bridge writes its own row rather than stamping one that has no place to find.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }), usePathname: () => '/golf/join' }));
vi.mock('@/lib/recovery/client', async (orig) => ({ ...(await orig<object>()), requestRecovery: vi.fn(() => 'scheduled') }));
vi.mock('@/lib/error-logging', async (orig) => ({ ...(await orig<object>()), logError: vi.fn(), logErrorToServer: vi.fn() }));
vi.mock('@/lib/utils/capacitor', () => ({ isNativeApp: () => false }));
vi.mock('@sentry/nextjs', () => ({ getReplay: () => ({ getReplayId: () => 'b'.repeat(32) }), addBreadcrumb: vi.fn(), setTag: vi.fn() }));

import { logError } from '@/lib/error-logging';
import { configureSignals, flushSignals, resetSignalsForTests } from '@/clubhouse/lib/signal';
import { ClubhouseMarker } from '@/clubhouse/shell/context';
import type { RouteErrorViewProps } from '@/clubhouse/ui/Notices';
import { RouteErrorBoundary } from '../RouteErrorBoundary';

const USER = '3f9a1c2e-0000-4000-8000-0000000000aa';

function Outside(props: RouteErrorViewProps) {
  return <p data-testid="outside">{props.kind}</p>;
}

let beacon: ReturnType<typeof vi.fn>;
function sent(): Record<string, unknown>[] {
  return beacon.mock.calls.flatMap(([, blob]) => (JSON.parse((blob as { text: string }).text) as { signals: Record<string, unknown>[] }).signals);
}
function logged(): Record<string, unknown> {
  return vi.mocked(logError).mock.calls.at(-1)![1] as Record<string, unknown>;
}

beforeEach(() => {
  resetSignalsForTests();
  sessionStorage.clear();
  vi.mocked(logError).mockClear();
  vi.stubGlobal(
    'Blob',
    class {
      text: string;
      constructor(parts: string[]) {
        this.text = parts.join('');
      }
    },
  );
  beacon = vi.fn(() => true);
  Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('a route crash reaches the Bridge', () => {
  it('inside the dashboard shell: one crash signal on the screen, and the log carries its place', () => {
    configureSignals({ enabled: true, role: 'coach', page: 'P011', route: '/golf/dashboard/rounds/[id]', userId: USER });
    render(
      <ClubhouseMarker>
        <RouteErrorBoundary error={new Error('boom')} reset={vi.fn()} route="/golf/dashboard/rounds" autoRetry={false} />
      </ClubhouseMarker>,
    );
    expect(logError).toHaveBeenCalledOnce();
    expect(logged().chSignal).toMatchObject({ page: 'P011', code: 'CH-1206' });
    flushSignals();
    expect(sent()).toEqual([expect.objectContaining({ kind: 'crash', code: 'CH-1206', page: 'P011', route: '/golf/dashboard/rounds/[id]', reported: true })]);
  });

  it('on the front door, signed in (onboarding, an invitation): sent as the shell sends it', () => {
    configureSignals({ enabled: true, role: 'player', page: 'P015', route: '/golf/join/[code]', userId: USER });
    render(<RouteErrorBoundary error={new Error('boom')} reset={vi.fn()} route="/golf/join" outsideShell={Outside} autoRetry={false} />);
    expect(logged().chSignal).toMatchObject({ page: 'P015' });
    flushSignals();
    expect(sent()).toEqual([expect.objectContaining({ kind: 'crash', page: 'P015', route: '/golf/join/[code]', reported: true })]);
  });

  it('on the front door, signed out: logged now, and the crash waits for a sign-in, then counts on its own row', async () => {
    render(<RouteErrorBoundary error={new Error('boom')} reset={vi.fn()} route="/golf/join" outsideShell={Outside} autoRetry={false} />);
    await Promise.resolve();
    expect(logError).toHaveBeenCalledOnce();
    expect(logged().chSignal).toBeUndefined();
    expect(beacon).not.toHaveBeenCalled();
    // A sign-in on this page: what waited goes out as theirs, and no longer says a row carries it.
    configureSignals({ enabled: true, role: 'player', page: 'P015', route: '/golf/join', userId: USER });
    flushSignals();
    expect(sent()).toEqual([expect.objectContaining({ kind: 'crash', code: 'CH-1206', page: 'P015', route: '/golf/join' })]);
    expect(sent()[0]!.reported).toBeUndefined();
    expect(logError).toHaveBeenCalledOnce();
  });

  it('outside Clubhouse (an admin page): logged, and no signal', () => {
    configureSignals({ enabled: true, role: 'coach', page: 'P002', route: '/golf/dashboard', userId: USER });
    render(<RouteErrorBoundary error={new Error('boom')} reset={vi.fn()} route="/golf/admin" autoRetry={false} />);
    expect(logError).toHaveBeenCalledOnce();
    expect(logged().chSignal).toBeUndefined();
    flushSignals();
    expect(sent()).toEqual([]);
  });
});
