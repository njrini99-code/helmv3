import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }), usePathname: () => '/golf/dashboard/roster' }));

import type { ChRosterPlayer } from '../../../data/roster';
import { RosterRowCrh } from '../RosterPhoneCrh';
import { accessibleName, expectLabelInName } from '../../../__tests__/label-in-name';

afterEach(cleanup);

const CLOCK = { tz: 'America/New_York', day: '2026-11-03' };
const dylan = { id: 'p1', name: 'Dylan Brooks', firstName: 'Dylan', status: 'active', availability: 'available', rounds: 5, avg: 74.1, handicap: 3.2, trend: [76, 75, 74, 73, 72], sgPerRound: 0.4, gradYear: 2028, classYear: 'So', attention: null } as unknown as ChRosterPlayer;

/**
 * F-0011 (WCAG 2.5.3, axe label-content-name-mismatch): the phone row showed the year coin's initials, the name, a note, the
 * bars and the figure, and an aria-label named it in other words, so axe never found the face in the name.
 */
describe('Roster · a phone row opens its name with the player it shows', () => {
  it.each(['avg', 'sg'] as const)('sorted by %s: no aria-label, the name first, the figures in words after it', (sort) => {
    render(<RosterRowCrh p={dylan} statsError={false} sort={sort} mean={74} clock={CLOCK} onOpen={() => {}} />);
    const row = screen.getByRole('button', { name: /^Dylan Brooks/ });
    expect(row).not.toHaveAttribute('aria-label');
    expectLabelInName(row, 'Dylan Brooks');
    expect(accessibleName(row)).toMatch(sort === 'sg' ? /strokes gained \+0\.4 a round/ : /average 74\.1, handicap 3\.2/);
    expect(accessibleName(row)).toMatch(/last five rounds: 76, 75, 74, 73, 72$/);
  });
});
