import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import type { ComponentProps } from 'react';

/**
 * Unmount, then let the unmount finish.
 *
 * `cleanup()` is synchronous, but some unmount paths are not. Radix's
 * FocusScope schedules a `setTimeout` on teardown that dispatches a focus event
 * at the container it just released. If nothing yields before the file's
 * environment is torn down, that timer fires into a dead jsdom and throws
 * `Failed to execute 'dispatchEvent' on 'EventTarget': parameter 1 is not of
 * type 'Event'` — the Event constructor it captured belongs to a realm that no
 * longer exists.
 *
 * Vitest counts that as an unhandled error and exits non-zero even when every
 * assertion passed, which is exactly how `main` went red on 2026-07-26: 7712
 * tests passed, one uncaught exception between them, CI red. It is intermittent
 * because it depends on whether the timer lands before or after teardown, so it
 * survives green PR runs and appears later.
 *
 * Yielding one macrotask lets any unmount-scheduled work run while the DOM it
 * refers to is still alive. It costs a tick per test and removes the whole
 * class — this is not specific to one component, it is true of anything that
 * defers work to a timer on unmount.
 */
afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 0));
  forgetEnvironmentSpyCalls();
});

/**
 * The spies this file hands to every test (the matchMedia mock, each MediaQueryList's listener spies, each observer's
 * methods) forget their calls after every test. Their implementations, including a test's own mockImplementation,
 * are kept, and a test still reads them freely while it runs.
 *
 * Why: vitest holds every mock that has been called and not cleared in a module-level Set (`DIRTY_MOCK_STATES` in
 * @vitest/spy), and `clearMocks` is off here. A MediaQueryList's `addEventListener` spy keeps the listener a
 * component passed it, and an observer's `observe` keeps the element, so every tree a test rendered stayed reachable
 * after unmount. A file that renders a large screen many times grew by about 20 MB per test and ran out of heap
 * (src/clubhouse/__tests__/calendar.test.tsx, out of memory at its 86th test, 2026-10-27).
 */
const environmentSpies = new Set<{ mockClear: () => unknown }>();
function track<T extends { mockClear: () => unknown }>(spy: T): T {
  environmentSpies.add(spy);
  return spy;
}
function forgetEnvironmentSpyCalls() {
  for (const spy of environmentSpies) spy.mockClear();
  environmentSpies.clear();
  if (typeof window === 'undefined') return;
  const mm = window.matchMedia as unknown as { mockClear?: () => void } | undefined;
  mm?.mockClear?.();
}

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

// Mock next/font/google. Vitest needs the mocked module's export names
// available synchronously (it builds the ESM namespace via
// Object.getOwnPropertyNames before any property is accessed), so a bare
// `new Proxy({}, { get })` with no real own keys fails validation with
// "No 'X' export is defined on the mock" even though the get trap would
// happily serve it — the trap is never reached. List every Google Font
// currently imported anywhere in the codebase (grep: `from 'next/font/google'`)
// and add new ones here as they're introduced.
const mockFont = () => ({
  className: 'mock-font',
  style: { fontFamily: 'mock' },
  variable: '--mock-font',
});
vi.mock('next/font/google', () => ({
  Fraunces: mockFont,
  DM_Sans: mockFont,
  Fragment_Mono: mockFont,
  Space_Grotesk: mockFont,
  Playfair_Display: mockFont,
  Satisfy: mockFont,
  // Clubhouse (src/clubhouse/lib/fonts.ts)
  Instrument_Sans: mockFont,
  JetBrains_Mono: mockFont,
  Norican: mockFont,
  // GolfHelm reset page (src/app/golf/(auth)/reset-password/layout.tsx)
  Poppins: mockFont,
}));

// Mock Next.js image
vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    priority: _priority,
    unoptimized: _unoptimized,
    fill: _fill,
    placeholder: _placeholder,
    blurDataURL: _blurDataURL,
    loader: _loader,
    ...props
  }: { src: string; alt: string; [key: string]: unknown }) => {
    return <img src={src} alt={alt} {...props} />;
  },
}));

// Clubhouse renders a long page's lower sections a painted frame after a navigation (useArrivalPainted). A component
// test renders a page at rest, so they render at once; use-painted.test.tsx tests the wait with the real hook.
vi.mock('@/clubhouse/lib/use-painted', async (orig) => ({
  ...(await orig<typeof import('@/clubhouse/lib/use-painted')>()),
  useArrivalPainted: () => true,
}));

// NumberFlow relies on browser animation internals that jsdom does not fully
// implement. Tests only need the rendered value, not the digit transition.
vi.mock('@number-flow/react', () => ({
  default: ({
    value,
    prefix = '',
    suffix = '',
    className,
  }: ComponentProps<'span'> & {
    value: number;
    prefix?: string;
    suffix?: string;
  }) => (
    <span className={className}>
      {prefix}
      {value}
      {suffix}
    </span>
  ),
}));

// Mock window.matchMedia (browser-only — skip in node-env test files, which set
// `// @vitest-environment node` for server-side logic like the XLSX/fflate readers).
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: track(vi.fn()),
      removeListener: track(vi.fn()),
      addEventListener: track(vi.fn()),
      removeEventListener: track(vi.fn()),
      dispatchEvent: track(vi.fn()),
    })),
  });
}

// Mock ResizeObserver / IntersectionObserver.
// Real classes, NOT vi.fn().mockImplementation(arrow): `new` on a vi.fn()
// constructs the implementation, and an arrow function is not constructible —
// any component that actually instantiates an observer (e.g. Segmented via
// use-scroll-fade since #829) throws "is not a constructor" under the old
// shape. Methods stay vi.fn() spies per instance.
class MockResizeObserver {
  observe = track(vi.fn());
  unobserve = track(vi.fn());
  disconnect = track(vi.fn());
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

class MockIntersectionObserver {
  observe = track(vi.fn());
  unobserve = track(vi.fn());
  disconnect = track(vi.fn());
  takeRecords = track(vi.fn(() => []));
  root = null;
  rootMargin = '';
  thresholds = [];
}
global.IntersectionObserver =
  MockIntersectionObserver as unknown as typeof IntersectionObserver;
