// =============================================================================
// /baseball/join/[code] — invite-link landing page
//
// This is the page a coach's invite link lands on, so it is the front door of
// every roster the product will ever have. It resolves TWO different
// 8-character codes that look identical in a URL:
//
//   baseball_team_invitations.code  — a minted, countable, revocable invite
//   baseball_teams.join_code        — the team's persistent code
//
// Both used to be read with a plain `.eq(...)` against a table whose SELECT
// policy was effectively public to authenticated users. Both now go through
// SECURITY DEFINER resolvers, because once the policies are tenant-scoped
// (migrations 20260729000100 / 20260729000200) a prospective joiner — who by
// definition belongs to neither the team nor its staff — can satisfy no
// row-level predicate on either table.
//
// WHY THIS SUITE RENDERS RATHER THAN INSPECTS. The resolver returns a FLAT
// row; the old query returned a nested `baseball_teams.organizations` join.
// The page rebuilds that shape by hand, and a wrong field name there produces
// no type error (the RPC result is cast) and no crash — just a card with a
// blank team name, or the "Invalid Invite Code" card for a perfectly good
// link. Asserting on rendered output is the only thing that catches it.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const getUser = vi.fn();
const from = vi.fn();
const rpc = vi.fn();

// `import JoinTeamPage from '../page'` is hoisted above these declarations, so
// page.tsx's own `import { redirect } from 'next/navigation'` runs first. A
// plain `const redirect` referenced directly in the factory is still in its
// temporal dead zone at that point ("Cannot access 'redirect' before
// initialization"); vi.hoisted lifts the spy to where the factory can see it.
// The supabase factory escapes this only because its inner arrow defers the
// lookup until call time.
const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser }, from, rpc })),
}));
vi.mock('next/navigation', () => ({ redirect }));

// The client island is not under test; stub it so the assertions below are
// about what the SERVER resolved, not about the join form's internals.
vi.mock('../join-team-client', () => ({
  JoinTeamClient: ({ team }: { team: { name: string; organization?: { name?: string } | null } }) => (
    <div data-testid="join-client">
      <span data-testid="join-team-name">{team.name}</span>
      <span data-testid="join-org-name">{team.organization?.name ?? ''}</span>
    </div>
  ),
}));

import JoinTeamPage from '../page';

const PLAYER = { id: 'player-1', first_name: 'Sam', last_name: 'Ruiz', player_type: 'college' };

/** The flat row shape resolve_baseball_team_invitation_by_code returns. */
function resolvedInvitation(overrides: Record<string, unknown> = {}) {
  return {
    invitation_id: 'inv-1',
    team_id: 'team-1',
    expires_at: null,
    is_active: true,
    team_name: 'Ridgeview Eagles',
    team_type: 'college',
    organization_name: 'Ridgeview College',
    organization_city: 'Ridgeview',
    organization_state: 'CA',
    organization_logo_url: null,
    ...overrides,
  };
}

let invitationRows: unknown[] = [];
let joinCodeRows: unknown[] = [];

function chain(resolver: () => unknown) {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq']) builder[method] = vi.fn(() => builder);
  builder.single = vi.fn(resolver);
  builder.maybeSingle = vi.fn(resolver);
  return builder;
}

async function renderPage(code = 'ABC12345') {
  // Awaiting an async server component yields a React ELEMENT — the children
  // it returns are not evaluated until something renders it.
  const ui = await JoinTeamPage({ params: Promise.resolve({ code }) });
  return render(ui);
}

describe('/baseball/join/[code]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invitationRows = [resolvedInvitation()];
    joinCodeRows = [];
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'resolve_baseball_team_invitation_by_code') {
        return { data: invitationRows, error: null };
      }
      if (fn === 'resolve_baseball_team_by_join_code') {
        return { data: joinCodeRows, error: null };
      }
      return { data: null, error: null };
    });

    from.mockImplementation((table: string) => {
      if (table === 'baseball_players') return chain(() => ({ data: PLAYER, error: null }));
      // No existing membership — the visitor is a prospective joiner.
      if (table === 'baseball_team_members') return chain(() => ({ data: null, error: null }));
      return chain(() => ({ data: null, error: null }));
    });
  });

  it('resolves the invite code through the RPC and never reads the invitations table', async () => {
    await renderPage('ABC12345');

    expect(rpc).toHaveBeenCalledWith('resolve_baseball_team_invitation_by_code', {
      p_code: 'ABC12345',
    });
    // The direct read only ever worked because the baseline policy let every
    // authenticated user read every live invite code in the database.
    expect(from).not.toHaveBeenCalledWith('baseball_team_invitations');
  });

  it('renders the team and organization from the resolver\'s flat row', async () => {
    await renderPage();

    // The whole point of the suite: the hand-rebuilt nesting is correct.
    expect(screen.getByTestId('join-team-name')).toHaveTextContent('Ridgeview Eagles');
    expect(screen.getByTestId('join-org-name')).toHaveTextContent('Ridgeview College');
  });

  it('still resolves an invitation whose team has no organization', async () => {
    invitationRows = [
      resolvedInvitation({
        organization_name: null,
        organization_city: null,
        organization_state: null,
        organization_logo_url: null,
      }),
    ];

    await renderPage();

    // Missing branding must not be mistaken for a missing team.
    expect(screen.getByTestId('join-team-name')).toHaveTextContent('Ridgeview Eagles');
    expect(screen.queryByText(/Invalid Invite Code/i)).not.toBeInTheDocument();
  });

  it('shows "Inactive", not "Invalid Invite Code", for a deactivated invitation', async () => {
    // Unreachable before the resolver: the old policy filtered is_active
    // itself, so a switched-off code looked exactly like a nonexistent one.
    invitationRows = [resolvedInvitation({ is_active: false })];

    await renderPage();

    expect(screen.getByText(/Invitation Inactive/i)).toBeInTheDocument();
    expect(screen.queryByText(/Invalid Invite Code/i)).not.toBeInTheDocument();
  });

  it('shows "Expired" for an invitation past its expires_at', async () => {
    invitationRows = [
      resolvedInvitation({ expires_at: new Date(Date.now() - 86_400_000).toISOString() }),
    ];

    await renderPage();

    expect(screen.getByText(/Invitation Expired/i)).toBeInTheDocument();
  });

  it('falls back to the join_code resolver when the code is not an invitation', async () => {
    invitationRows = [];
    joinCodeRows = [
      { id: 'team-9', name: 'Northgate Bruins', team_type: 'high_school', organization_id: null },
    ];

    await renderPage('JOINCODE');

    expect(rpc).toHaveBeenCalledWith('resolve_baseball_team_by_join_code', {
      p_join_code: 'JOINCODE',
    });
    expect(screen.getByTestId('join-team-name')).toHaveTextContent('Northgate Bruins');
  });

  it('shows the invalid-code card when neither resolver matches', async () => {
    invitationRows = [];
    joinCodeRows = [];

    await renderPage('BOGUS123');

    expect(screen.getByText(/Invalid Invite Code/i)).toBeInTheDocument();
  });
});
