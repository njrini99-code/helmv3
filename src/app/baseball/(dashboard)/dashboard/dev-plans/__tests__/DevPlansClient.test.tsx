/**
 * DevPlansClient — plan card header/action layout.
 *
 * Regression coverage for two visual-audit findings
 * (coach-devplans-performance-videos.md, 005 — Development Plans, [DESIGN]):
 *
 *  1. The status badge sat in an `items-center` row with the title. A long
 *     title wraps to several lines on a narrow viewport, and centering the
 *     badge against the WHOLE multi-line block made it land beside a middle
 *     line rather than labeling the card. Fix: `items-start` — the badge
 *     stays pinned to the title's first line regardless of how many lines it
 *     wraps to.
 *  2. The "View Plan" action had no `shrink-0` guard, so a long title + a
 *     two-word badge in the sibling column left too little row width and the
 *     link shrank BELOW its own text's intrinsic width — Button's base
 *     classes are `whitespace-nowrap overflow-hidden`, so the shrunken box
 *     hard-clipped the label to "View" with no ellipsis. Fix: `shrink-0` on
 *     the wrapping Link.
 *
 * jsdom has no real layout engine, so this can't observe the actual visual
 * clipping/misalignment a browser would — it asserts the specific Tailwind
 * classes that produce the correct behavior in a real browser (repo idiom:
 * see src/components/ui/select.test.tsx's `toHaveClass` usage).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

const LONG_TITLE = 'Off-Season Hitting & Speed Development';

let queryResult: { data: unknown[] | null; error: null } = { data: [], error: null };

function makeQueryChain() {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order', 'in']) {
    chain[method] = () => chain;
  }
  (chain as { then: (resolve: (v: unknown) => void) => void }).then = (resolve) => {
    resolve(queryResult);
  };
  return chain;
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => makeQueryChain(),
  }),
}));

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: { role: 'coach' },
    coach: { id: 'coach-1' },
    loading: false,
  }),
}));

vi.mock('@/stores/team-store', () => ({
  useTeamStore: () => ({ selectedTeamId: 'team-1' }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/components/coach/CreateDevPlanModal', () => ({
  CreateDevPlanModal: () => null,
}));

vi.mock('framer-motion', async () => {
  const React = await import('react');
  return {
    useReducedMotion: () => true,
    LazyMotion: ({ children }: { children: ReactNode }) => children,
    domAnimation: {},
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
              variants: _variants,
              transition: _transition,
              custom: _custom,
              ...rest
            } = props;
            void _initial;
            void _animate;
            void _exit;
            void _variants;
            void _transition;
            void _custom;
            return React.createElement(prop as string, { ...rest, ref }, children);
          }),
      },
    ),
    AnimatePresence: ({ children }: { children: ReactNode }) => children,
  };
});

import DevPlansClient from '../DevPlansClient';

describe('DevPlansClient — plan card header/action layout', () => {
  beforeEach(() => {
    queryResult = {
      data: [
        {
          id: 'plan-1',
          title: LONG_TITLE,
          description: null,
          status: 'in_progress',
          start_date: '2026-06-02',
          end_date: '2026-08-31',
          goals: [1, 2, 3, 4],
          created_at: '2026-06-01T00:00:00Z',
          player: {
            id: 'player-1',
            first_name: 'Marcus',
            last_name: 'Rodriguez',
            avatar_url: null,
            primary_position: 'SS',
            grad_year: 2027,
          },
        },
      ],
      error: null,
    };
  });

  it('top-aligns the status badge with the title instead of centering it against a wrapped multi-line block', async () => {
    render(<DevPlansClient />);

    const title = await screen.findByText(LONG_TITLE);
    const row = title.parentElement;
    expect(row).not.toBeNull();
    expect(row).toHaveClass('items-start');
    expect(row).not.toHaveClass('items-center');

    // The badge is still rendered as a sibling of the title in that row.
    expect(screen.getByText('IN PROGRESS')).toBeInTheDocument();
  });

  it('guards the "View Plan" action with shrink-0 so it can never shrink below its own text', async () => {
    render(<DevPlansClient />);

    await waitFor(() => expect(screen.getByText(LONG_TITLE)).toBeInTheDocument());

    const viewPlanLink = screen.getByText('View Plan').closest('a');
    expect(viewPlanLink).not.toBeNull();
    expect(viewPlanLink).toHaveClass('shrink-0');
  });
});
