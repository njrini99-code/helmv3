import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import type { ComponentProps } from 'react';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

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
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));
