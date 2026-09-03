// @vitest-environment jsdom
/**
 * The "Ask CoachHelm" launcher is `position: fixed` bottom-right, and
 * `md:inline-flex` is a WIDTH breakpoint — so a wide-but-short viewport
 * (844×390 mobile landscape) still satisfies it while the launcher's own
 * footprint (bottom-6 + h-14) lands on top of whatever else lives in that
 * corner: the message composer's send button, the calendar's Fri/Sat
 * day-picker cells, a round-review chart axis label.
 * See `docs/ui-audits/GAPS_AUDIT_TABLET_LANDSCAPE_2026-09-02.md` #3 and #5.
 *
 * Two independent guards close this:
 *   1. A CSS-only `max-height` rule hides the launcher below ~500px of
 *      viewport height, regardless of width — no flicker, since it never
 *      depends on a JS measurement running after first paint.
 *   2. A focus-tracking hook hides the launcher whenever a text field
 *      (the composer's textarea, in particular) currently has focus, which
 *      also covers a tall-but-keyboard-open viewport where guard #1 does
 *      not fire.
 *
 * jsdom does not evaluate CSS media queries against a real viewport, so
 * guard #1 is pinned as a source-contract assertion (same approach as
 * `src/test/golf/coachhelm-fab-clearance.test.ts`), while guard #2 is
 * exercised as a real render + focus test.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CoachHelmDrawer } from './CoachHelmDrawer';

const SOURCE = readFileSync(
  join(process.cwd(), 'src/components/golf/coachhelm/chat/CoachHelmDrawer.tsx'),
  'utf8',
);

let currentPath = '/golf/dashboard';

vi.mock('next/navigation', () => ({
  usePathname: () => currentPath,
  useSearchParams: () => new URLSearchParams(),
}));

// Flatten framer-motion so the launcher's enter/exit animation doesn't gate
// mount/unmount assertions on real animation-frame timing — same approach as
// DrillSheet.test.tsx.
vi.mock('framer-motion', async () => {
  const React = await import('react');
  return {
    useReducedMotion: () => false,
    m: new Proxy(
      {},
      {
        get: (_target, prop) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          React.forwardRef<HTMLElement, any>((props, ref) => {
            const {
              children,
              initial: _initial,
              animate: _animate,
              exit: _exit,
              transition: _transition,
              ...rest
            } = props;
            void _initial;
            void _animate;
            void _exit;
            void _transition;
            return React.createElement(prop as string, { ...rest, ref }, children);
          }),
      },
    ),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  };
});

describe('Ask CoachHelm launcher — short-viewport class contract', () => {
  it('hides below ~500px of viewport height regardless of width, via CSS only', () => {
    // Distinct from `md:inline-flex` (a width breakpoint): this rule keys on
    // max-height so a wide short viewport (844x390 mobile landscape) does
    // not satisfy `md:inline-flex` while still overlapping page content.
    expect(SOURCE).toMatch(/\[@media\(max-height:500px\)\]:!hidden/);
  });

  it('keeps every existing desktop position/size class untouched', () => {
    // Same pins as coachhelm-fab-clearance.test.ts — the short-viewport rule
    // must be additive, not a replacement of the geometry that test (and the
    // layout's `md:pb-24` reservation) depend on.
    expect(SOURCE).toMatch(/\bbottom-6\b/);
    expect(SOURCE).toMatch(/\bright-6\b/);
    expect(SOURCE).toMatch(/\bh-14\b/);
    expect(SOURCE).toMatch(/\bmd:inline-flex\b/);
  });
});

describe('Ask CoachHelm launcher — hides while a text field is focused', () => {
  beforeEach(() => {
    currentPath = '/golf/dashboard';
  });

  it('unmounts the launcher while an unrelated text input has focus, and restores it on blur', async () => {
    render(
      <>
        <input aria-label="unrelated field" />
        <CoachHelmDrawer players={[]} suggestions={[]} teamName="Demo University Golf" />
      </>,
    );

    expect(screen.getByRole('button', { name: 'Ask CoachHelm' })).toBeInTheDocument();

    const input = screen.getByRole('textbox', { name: 'unrelated field' });
    fireEvent.focusIn(input);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Ask CoachHelm' })).not.toBeInTheDocument();
    });

    fireEvent.focusOut(input);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Ask CoachHelm' })).toBeInTheDocument();
    });
  });

  it('stays hidden through a tab between two text fields (no flash back in)', async () => {
    render(
      <>
        <input aria-label="first field" />
        <textarea aria-label="second field" />
        <CoachHelmDrawer players={[]} suggestions={[]} teamName="Demo University Golf" />
      </>,
    );

    const first = screen.getByRole('textbox', { name: 'first field' });
    const second = screen.getByRole('textbox', { name: 'second field' });

    fireEvent.focusIn(first);
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Ask CoachHelm' })).not.toBeInTheDocument();
    });

    // focusout on the first fires before focusin lands on the second, exactly
    // as a real Tab keypress would order the events.
    fireEvent.focusOut(first);
    second.focus();
    fireEvent.focusIn(second);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Ask CoachHelm' })).not.toBeInTheDocument();
    });
  });

  it('does not hide the launcher when a non-field element receives focus', () => {
    render(<CoachHelmDrawer players={[]} suggestions={[]} teamName="Demo University Golf" />);

    const launcher = screen.getByRole('button', { name: 'Ask CoachHelm' });
    fireEvent.focusIn(launcher);

    expect(screen.getByRole('button', { name: 'Ask CoachHelm' })).toBeInTheDocument();
  });
});
