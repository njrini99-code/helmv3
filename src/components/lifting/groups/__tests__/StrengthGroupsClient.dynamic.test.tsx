// =============================================================================
// src/components/lifting/groups/__tests__/StrengthGroupsClient.dynamic.test.tsx
//
// Lane D2 fix #4: prod has real helm_lifting_groups rows with
// group_type='dynamic' + rule_json, but StrengthGroupsClient previously only
// rendered the static-group management affordances (rename/archive/add/
// remove member) with no awareness that a selected group's membership might
// be rule-computed, not hand-maintained. This guards the read-only contract:
// dynamic groups render a "Dynamic" indicator + a defensively-parsed rule
// summary, and every mutating affordance (archive, remove member, add
// member) is disabled for them rather than silently letting a coach "edit" a
// membership the rule will just recompute out from under them.
// =============================================================================

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('framer-motion', async () => {
  const ReactMod = await import('react');
  return {
    useReducedMotion: () => true,
    motion: new Proxy(
      {},
      {
        get: (_target, prop) =>
          ReactMod.forwardRef<HTMLElement, Record<string, unknown>>((props, ref) => {
            const { children, initial: _i, animate: _a, exit: _e, transition: _t, whileTap: _w, ...rest } = props;
            void _i; void _a; void _e; void _t; void _w;
            return ReactMod.createElement(prop as string, { ...rest, ref }, children as React.ReactNode);
          }),
      },
    ),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  };
});

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('@/app/lifting/actions/groups', () => ({
  createGroup: vi.fn(),
  deleteGroup: vi.fn(),
  addGroupMember: vi.fn(),
  removeGroupMember: vi.fn(),
}));

import { StrengthGroupsClient } from '../StrengthGroupsClient';

const ATHLETE_ID = 'athlete-1';

// The component's `GroupWithMembers` (HelmLiftingGroupRow + member_count +
// member_athlete_ids) isn't exported — derive it from the component's own
// prop type instead of re-declaring it, so this fixture can never drift from
// what StrengthGroupsClient actually expects.
type GroupProp = React.ComponentProps<typeof StrengthGroupsClient>['groups'][number];

function groupFixture(overrides: Partial<GroupProp> = {}): GroupProp {
  return {
    id: 'group-1',
    organization_id: 'org-1',
    sport: 'baseball' as const,
    team_id: null,
    name: 'Pitchers',
    description: null,
    group_type: 'dynamic' as const,
    rule_json: { positions: ['P'], grad_years: [2027] },
    created_by_coach_id: null,
    is_active: true,
    legacy_baseball_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    member_count: 1,
    member_athlete_ids: [ATHLETE_ID],
    ...overrides,
  };
}

const ATHLETES = [
  { id: ATHLETE_ID, first_name: 'Alex', last_name: 'Kim', position: 'P', sport: 'baseball' as const },
];

describe('StrengthGroupsClient — dynamic groups render read-only', () => {
  it('shows the Dynamic badge and a parsed rule summary for the selected group', () => {
    render(
      <StrengthGroupsClient
        groups={[groupFixture()]}
        athletes={ATHLETES}
        orgId="org-1"
        canEdit
      />,
    );

    expect(screen.getAllByText('Dynamic').length).toBeGreaterThan(0);
    // Defensively parsed from rule_json = { positions: ['P'], grad_years: [2027] }.
    expect(screen.getAllByText(/Position: P/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Class: 2027/).length).toBeGreaterThan(0);
  });

  it('disables the Archive button for a dynamic group', () => {
    render(
      <StrengthGroupsClient
        groups={[groupFixture()]}
        athletes={ATHLETES}
        orgId="org-1"
        canEdit
      />,
    );

    const archiveButton = screen.getByRole('button', { name: /Archive/i });
    expect(archiveButton).toBeDisabled();
  });

  it('disables the Remove-member button for a dynamic group', () => {
    render(
      <StrengthGroupsClient
        groups={[groupFixture()]}
        athletes={ATHLETES}
        orgId="org-1"
        canEdit
      />,
    );

    const removeButton = screen.getByRole('button', { name: /Remove/i });
    expect(removeButton).toBeDisabled();
  });

  it('replaces the Add-athletes panel with a locked explanation for a dynamic group', () => {
    render(
      <StrengthGroupsClient
        groups={[groupFixture({ member_athlete_ids: [], member_count: 0 })]}
        athletes={ATHLETES}
        orgId="org-1"
        canEdit
      />,
    );

    expect(screen.queryByPlaceholderText('Search athletes…')).not.toBeInTheDocument();
    expect(screen.getByText(/manual add is disabled/i)).toBeInTheDocument();
  });

  it('degrades to a generic label for malformed rule_json instead of throwing', () => {
    render(
      <StrengthGroupsClient
        groups={[groupFixture({ rule_json: 'not-an-object' })]}
        athletes={ATHLETES}
        orgId="org-1"
        canEdit
      />,
    );

    expect(screen.getAllByText('Rule-managed group').length).toBeGreaterThan(0);
  });

  it('leaves a static group fully editable (archive + remove-member enabled)', () => {
    render(
      <StrengthGroupsClient
        groups={[groupFixture({ group_type: 'static', rule_json: {} })]}
        athletes={ATHLETES}
        orgId="org-1"
        canEdit
      />,
    );

    expect(screen.getByRole('button', { name: /Archive/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /Remove/i })).not.toBeDisabled();
    expect(screen.getByPlaceholderText('Search athletes…')).toBeInTheDocument();
  });
});
