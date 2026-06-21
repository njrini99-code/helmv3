/**
 * Team-scoped settings panels must follow the program head's team toggle.
 *
 * The dashboard layout resolves the ACTIVE team (golf_active_team cookie,
 * validated) and exposes it via GolfUserContext. These tests verify the
 * Fairway settings panels (prod-served):
 *
 *   1. READ the active team's row (`.eq('id', <context teamId>)`) — never a
 *      client-side org re-resolution that could pick the other team, and
 *   2. WRITE to the active team's row — a save while toggled to Women's
 *      updates the women's team, never the men's.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GolfUserProvider } from '@/contexts/golf-user-context';

// ── Light stand-ins for the Fairway primitives the panels render ───────────
vi.mock('@/components/fairway', () => ({
  ViewHeader: ({ title }: { title?: string }) => <header>{title}</header>,
  Surface: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  Button: ({
    children,
    onClick,
    'aria-label': ariaLabel,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    'aria-label'?: string;
  }) => (
    // Test double for the Fairway Button primitive.
    // eslint-disable-next-line helm/no-raw-button
    <button type="button" aria-label={ariaLabel} onClick={onClick}>
      {children}
    </button>
  ),
  Input: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
    // Test double for the Fairway Input primitive.
    // eslint-disable-next-line helm/no-raw-input
  }) => <input value={value} onChange={onChange} placeholder={placeholder} />,
  // Test double for the Fairway Select primitive.
  // eslint-disable-next-line helm/no-raw-input
  Select: () => <select />,
  Switch: () => <div />,
  Avatar: () => <div />,
  fairwayToast: { success: vi.fn(), error: vi.fn() },
}));

// Heavy neighbours imported by the module but not rendered by the panels.
vi.mock('@/components/golf/coachhelm/v2', () => ({ CoachHelmToggle: () => null }));
vi.mock('@/components/ui/avatar-upload', () => ({ AvatarUpload: () => null }));
vi.mock('@/components/ui/confirm-dialog', () => ({ ConfirmDialog: () => null }));
vi.mock('@/components/golf/settings/JoinTeamSection', () => ({ JoinTeamSection: () => null }));
vi.mock('@/lib/utils/capacitor', () => ({
  triggerHaptic: vi.fn(),
  isNativeApp: () => false,
}));

// ── Recording Supabase client mock ──────────────────────────────────────────
interface Call {
  table: string;
  method: string;
  args: unknown[];
}
const calls: Call[] = [];
const maybeSingleResults = new Map<string, unknown[]>(); // table → FIFO queue

function makeBuilder(table: string) {
  const builder: Record<string, unknown> = {};
  const record = (method: string) =>
    vi.fn((...args: unknown[]) => {
      calls.push({ table, method, args });
      return builder;
    });
  builder['select'] = record('select');
  builder['eq'] = record('eq');
  builder['update'] = record('update');
  builder['maybeSingle'] = vi.fn(() => {
    const queue = maybeSingleResults.get(table) ?? [];
    const next = queue.shift() ?? null;
    return Promise.resolve({ data: next, error: null });
  });
  // Awaiting the builder (e.g. `await ...update().eq()`) resolves cleanly.
  Object.defineProperty(builder, 'then', {
    get() {
      return (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
    },
  });
  return builder;
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => makeBuilder(table),
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
  }),
}));

// The context teamId is the WOMEN'S team — the program head has toggled.
const womensContext = {
  role: 'coach' as const,
  userId: 'user-1',
  name: 'Program Head',
  coachId: 'coach-1',
  teamId: 'team-women',
  organizationId: 'org-1',
  coachTeams: [
    { id: 'team-men', name: "Men's Golf", gender: 'mens' },
    { id: 'team-women', name: "Women's Golf", gender: 'womens' },
  ],
  canSwitchTeams: true,
};

function eqCalls(table: string, method = 'eq') {
  return calls.filter((c) => c.table === table && c.method === method);
}

describe('Fairway settings panels follow the active-team toggle', () => {
  beforeEach(() => {
    calls.length = 0;
    maybeSingleResults.clear();
  });

  it('TeamSettingsPanel reads the ACTIVE (women’s) team row from context — no client re-resolution', async () => {
    maybeSingleResults.set('golf_teams', [
      { id: 'team-women', name: "Women's Golf", season: '2025-2026', organization_id: 'org-1' },
    ]);
    maybeSingleResults.set('organizations', [
      { name: 'State U', location_city: 'City', location_state: 'CA', division: 'I', conference: 'Pac-12' },
    ]);

    const { TeamSettingsPanel } = await import(
      '@/components/fairway/pages/settings/FairwaySettingsGeneral'
    );

    render(
      <GolfUserProvider userData={womensContext}>
        <TeamSettingsPanel onUpdate={() => {}} />
      </GolfUserProvider>,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("Women's Golf")).toBeInTheDocument();
    });

    // The read targeted the context team id — the toggled team.
    const teamReads = eqCalls('golf_teams');
    expect(teamReads.some((c) => c.args[0] === 'id' && c.args[1] === 'team-women')).toBe(true);
    expect(teamReads.some((c) => c.args[1] === 'team-men')).toBe(false);
  });

  it('TeamSettingsPanel SAVE writes to the active (women’s) team row', async () => {
    maybeSingleResults.set('golf_teams', [
      { id: 'team-women', name: "Women's Golf", season: '2025-2026', organization_id: 'org-1' },
    ]);
    maybeSingleResults.set('organizations', [{ name: 'State U' }]);

    const { TeamSettingsPanel } = await import(
      '@/components/fairway/pages/settings/FairwaySettingsGeneral'
    );

    render(
      <GolfUserProvider userData={womensContext}>
        <TeamSettingsPanel onUpdate={() => {}} />
      </GolfUserProvider>,
    );

    const nameInput = await waitFor(() => screen.getByDisplayValue("Women's Golf"));

    // P379: the Save button is dirty-gated — an untouched form has nothing to
    // write. Make a real edit so the panel is dirty and the save commits.
    fireEvent.change(nameInput, { target: { value: "Women's Golf Team" } });

    calls.length = 0; // isolate the write
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      const updates = calls.filter((c) => c.table === 'golf_teams' && c.method === 'update');
      expect(updates).toHaveLength(1);
      expect(updates[0]!.args[0]).toMatchObject({ name: "Women's Golf Team" });
    });

    // The UPDATE's filter is the active team's id — never the men's row.
    const writeFilters = eqCalls('golf_teams');
    expect(writeFilters.some((c) => c.args[0] === 'id' && c.args[1] === 'team-women')).toBe(true);
    expect(writeFilters.some((c) => c.args[1] === 'team-men')).toBe(false);
  });

  it('TeamSettingsPanel SAVE is a no-op when nothing changed (P379 dirty-gating)', async () => {
    maybeSingleResults.set('golf_teams', [
      { id: 'team-women', name: "Women's Golf", season: '2025-2026', organization_id: 'org-1' },
    ]);
    maybeSingleResults.set('organizations', [{ name: 'State U' }]);

    const { TeamSettingsPanel } = await import(
      '@/components/fairway/pages/settings/FairwaySettingsGeneral'
    );

    render(
      <GolfUserProvider userData={womensContext}>
        <TeamSettingsPanel onUpdate={() => {}} />
      </GolfUserProvider>,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("Women's Golf")).toBeInTheDocument();
    });

    calls.length = 0; // isolate any write
    // No field edited → pristine. Clicking Save must not issue a write or a
    // false "updated" toast (P379: honest status, no needless mutation).
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    // Give any (incorrect) async write a chance to land, then assert none did.
    await Promise.resolve();
    const updates = calls.filter((c) => c.table === 'golf_teams' && c.method === 'update');
    expect(updates).toHaveLength(0);
  });

  it('InviteSettingsPanel regenerates the join code on the ACTIVE (women’s) team row', async () => {
    maybeSingleResults.set('golf_teams', [{ id: 'team-women', join_code: 'OLDCODE1' }]);

    const { InviteSettingsPanel } = await import(
      '@/components/fairway/pages/settings/FairwaySettingsGeneral'
    );

    render(
      <GolfUserProvider userData={womensContext}>
        <InviteSettingsPanel />
      </GolfUserProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('OLDCODE1')).toBeInTheDocument();
    });

    // The read targeted the context team id.
    expect(
      eqCalls('golf_teams').some((c) => c.args[0] === 'id' && c.args[1] === 'team-women'),
    ).toBe(true);

    calls.length = 0; // isolate the write
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate invite code' }));

    await waitFor(() => {
      const updates = calls.filter((c) => c.table === 'golf_teams' && c.method === 'update');
      expect(updates).toHaveLength(1);
      expect(updates[0]!.args[0]).toMatchObject({ join_code: expect.any(String) });
    });

    const writeFilters = eqCalls('golf_teams');
    expect(writeFilters.some((c) => c.args[0] === 'id' && c.args[1] === 'team-women')).toBe(true);
    expect(writeFilters.some((c) => c.args[1] === 'team-men')).toBe(false);
  });
});
