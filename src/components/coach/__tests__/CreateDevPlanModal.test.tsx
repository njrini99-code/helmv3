/**
 * CreateDevPlanModal — "Select Player" roster picker.
 *
 * Regression coverage for the bug where the picker always rendered
 * "No players in roster. Add players to your team first." even when the
 * team's Roster page showed active players. Root cause: the picker's
 * client-side query filtered `baseball_team_members` on
 * `.is('left_at', null)` — a column that does not exist on that table
 * (see src/lib/types/database.ts) — so every request errored, `data` was
 * always null, and the empty state rendered unconditionally.
 *
 * These tests assert the picker (1) maps whatever rows the roster query
 * returns into selectable player cards, matching the same
 * `baseball_team_members -> baseball_players` join shape the canonical
 * roster read model uses (src/lib/baseball/read-models/roster.ts), and
 * (2) never re-introduces a filter on the nonexistent `left_at` column.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// ── Supabase client mock — chainable query builder that records every
// filter method invoked, so the test can assert `.is('left_at', ...)` is
// never called again, while still resolving with fixture roster rows. ────
type RosterRow = { player: Record<string, unknown> | null };

let queryResult: { data: RosterRow[] | null } = { data: [] };
const calledMethods: string[] = [];

function makeQueryChain() {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order', 'is']) {
    chain[method] = (...args: unknown[]) => {
      calledMethods.push(method);
      if (method === 'is') {
        // Track exactly what column an `.is()` filter (if any) targets, so a
        // regression back to `.is('left_at', null)` fails loudly.
        calledMethods.push(`is:${String(args[0])}`);
      }
      return chain;
    };
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
  useAuth: () => ({ coach: { id: 'coach-1' } }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock('@/components/ui/sonner', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

import { CreateDevPlanModal } from '../CreateDevPlanModal';

function rosterRow(overrides: Partial<Record<string, unknown>> = {}): RosterRow {
  return {
    player: {
      id: overrides.id ?? 'player-1',
      first_name: overrides.first_name ?? 'Jordan',
      last_name: overrides.last_name ?? 'Rivera',
      avatar_url: null,
      primary_position: overrides.primary_position ?? 'SS',
      grad_year: overrides.grad_year ?? 2027,
    },
  };
}

beforeEach(() => {
  queryResult = { data: [] };
  calledMethods.length = 0;
});

describe('CreateDevPlanModal — roster picker', () => {
  it('maps every roster row returned by the query into a selectable player card', async () => {
    queryResult = {
      data: [
        rosterRow({ id: 'p1', first_name: 'Ava', last_name: 'Stone', primary_position: 'C' }),
        rosterRow({ id: 'p2', first_name: 'Ben', last_name: 'Reed', primary_position: '1B' }),
        rosterRow({ id: 'p3', first_name: 'Cam', last_name: 'Knox', primary_position: 'OF' }),
      ],
    };

    render(<CreateDevPlanModal open onClose={vi.fn()} teamId="team-1" />);

    // The false "No players in roster" empty state must not render once the
    // roster query actually returns members.
    await waitFor(() => {
      expect(screen.queryByText(/Loading roster/i)).not.toBeInTheDocument();
    });
    expect(
      screen.queryByText(/No players in roster\. Add players to your team first\./i),
    ).not.toBeInTheDocument();

    // All 3 roster rows are rendered as pickable players.
    expect(screen.getByText('Ava Stone')).toBeInTheDocument();
    expect(screen.getByText('Ben Reed')).toBeInTheDocument();
    expect(screen.getByText('Cam Knox')).toBeInTheDocument();
  });

  it('scopes the roster query to the active team and never filters on the nonexistent left_at column', async () => {
    queryResult = { data: [rosterRow()] };

    render(<CreateDevPlanModal open onClose={vi.fn()} teamId="team-42" />);

    await waitFor(() => {
      expect(screen.getByText('Jordan Rivera')).toBeInTheDocument();
    });

    expect(calledMethods).toContain('eq');
    expect(calledMethods).not.toContain('is');
    expect(calledMethods.some((m) => m.startsWith('is:left_at'))).toBe(false);
  });

  it('shows the honest empty state only when the team genuinely has zero roster rows', async () => {
    queryResult = { data: [] };

    render(<CreateDevPlanModal open onClose={vi.fn()} teamId="team-1" />);

    await waitFor(() => {
      expect(
        screen.getByText(/No players in roster\. Add players to your team first\./i),
      ).toBeInTheDocument();
    });
  });
});
