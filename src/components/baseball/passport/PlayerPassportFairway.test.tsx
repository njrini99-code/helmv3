/**
 * PlayerPassportFairway.tsx — compact-vs-full "Verified Measurables" header
 * regression test.
 *
 * Guards against the DISHONEST bug where the compact (Player Today) embed's
 * "Verified Measurables" header carried `model.completeness.percent` (the
 * WHOLE-passport completeness figure — identity + positions + measurables +
 * stats + story + media + academic + exposure) as if it were a
 * measurables-specific stat, directly above five rows that are honestly all
 * "—" (unverified). The read model's own comment for the measurables signal
 * states it is *always* `complete: false` until a value is VERIFIED — so any
 * non-zero percentage on that specific header is a contradiction. The
 * percentage belongs only on the page-level "On the Record" footer, which is
 * where the full (non-compact) surface already places it correctly.
 *
 * Mocks framer-motion the same way Reveal.test.tsx / HoverReveal.test.tsx do
 * (an `m` Proxy rendering the underlying DOM tag), extended with `useScroll` /
 * `useTransform` stubs because Masthead.tsx (rendered inside this component)
 * calls both unconditionally.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import * as React from 'react';

vi.mock('framer-motion', () => ({
  useReducedMotion: () => false,
  useScroll: () => ({ scrollY: { get: () => 0, on: () => () => {} } }),
  useTransform: () => ({ get: () => 0, on: () => () => {} }),
  m: new Proxy(
    {},
    {
      get: (_target, prop) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (props: any) => {
          const { children, initial: _i, animate: _a, variants: _v, ...rest } = props;
          void _i;
          void _a;
          void _v;
          return React.createElement(prop as string, rest, children);
        },
    },
  ),
}));

import { PlayerPassportFairway } from './PlayerPassportFairway';
import type { PassportReadModel } from '@/lib/baseball/read-models/player-passport';

function buildModel(overrides: Partial<PassportReadModel> = {}): PassportReadModel {
  return {
    playerId: 'player-1',
    teamId: 'team-1',
    viewerRole: 'self',
    visibilityState: 'staff_only',
    headline: null,
    mode: 'compact',
    identity: [
      { key: 'name', label: 'Name', value: 'Marcus Rodriguez', visibility: 'player_visible' },
      { key: 'positions', label: 'Positions', value: 'SS / 2B', visibility: 'player_visible' },
    ],
    // Zero measurables on file — every row renders as an honest ghost dash,
    // matching the real db-truth state this bug was found against.
    measurables: [],
    recentActivity: {
      capturedSessions: 6,
      lastSessionDate: '2026-06-17',
      lastSessionSource: null,
      lastSessionTrust: null,
      lastSessionProvenance: null,
      sourceLayer: 'box-score',
    },
    developmentStory: null,
    media: null,
    performance: null,
    // The WHOLE-passport completeness figure — deliberately non-zero so a
    // regression (the bug reappearing) would show up as a visible percentage.
    completeness: { percent: 38, signals: [] },
    withheldFieldCount: 0,
    authorized: true,
    error: null,
    ...overrides,
  };
}

describe('PlayerPassportFairway — Verified Measurables header honesty', () => {
  it('compact mode: carries NO percentage on "Verified Measurables" (matches the full page)', () => {
    render(<PlayerPassportFairway model={buildModel()} compact fullHref="/baseball/player/passport" />);

    const header = screen.getByText('Verified Measurables').closest('div');
    expect(header).not.toBeNull();
    // The whole-passport 38% must never appear anywhere near this header.
    expect(within(header as HTMLElement).queryByText(/on the record/i)).toBeNull();
    expect(within(header as HTMLElement).queryByText(/38%/)).toBeNull();
  });

  it('full mode: "Verified Measurables" also carries no percentage, but the real percent still surfaces on "On the Record"', () => {
    render(<PlayerPassportFairway model={buildModel({ mode: 'full' })} />);

    const measurablesHeader = screen.getByText('Verified Measurables').closest('div');
    expect(within(measurablesHeader as HTMLElement).queryByText(/%/)).toBeNull();

    // The page-level footer is the ONLY place the completeness percentage
    // may legitimately appear.
    const onTheRecordHeader = screen.getByText('On the Record').closest('div');
    expect(within(onTheRecordHeader as HTMLElement).getByText('38%')).toBeInTheDocument();
  });
});
