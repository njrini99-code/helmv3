import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** F-0030 (audit 2026-10-29): Team rounds' empty states offer the next step, as Home's do. */
vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('../../../lib/use-phone', () => ({ useChPhone: () => false }));

import '../../../__tests__/dialog-polyfill';
import { PREVIEW_TEAM_ROUNDS_EMPTY, PREVIEW_TEAM_ROUNDS_NO_ROSTER } from '../../../preview/fixtures-team-rounds';
import { TeamRounds } from '../TeamRounds';

afterEach(cleanup);

describe('Team rounds empty states have an action (F-0030)', () => {
  it('no players: Invite players opens the roster’s invite', () => {
    render(<TeamRounds data={PREVIEW_TEAM_ROUNDS_NO_ROSTER} teamId="t1" />);
    const link = screen.getByRole('link', { name: 'Invite players' });
    expect(link.getAttribute('href')).toBe('/golf/dashboard/roster?invite=1');
  });

  it('no rounds: Open roster', () => {
    render(<TeamRounds data={PREVIEW_TEAM_ROUNDS_EMPTY} teamId="t1" />);
    expect(screen.getByRole('link', { name: 'Open roster' }).getAttribute('href')).toBe('/golf/dashboard/roster');
  });
});
