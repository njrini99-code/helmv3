// @vitest-environment jsdom
//
// Regression guard for the blank-First-Name/Last-Name-input investigation
// (player-player-comms-docs audit, `/baseball/dashboard/profile`).
//
// `formData` used to be seeded ONLY ONCE at mount (`useState(player)`), with
// no effect to resync it if the `player` prop later became more complete —
// e.g. a lightweight route-guard reconciliation (`use-baseball-auth.ts`'s
// `reconcileStore`) can write a PARTIAL player object `{id,
// onboarding_completed, player_type}` into the shared auth store before
// `useAuth()`'s own full-row fetch resolves. If `CollegeProfileEditor` first
// mounts against that partial snapshot, `formData.first_name`/`last_name`
// are `undefined` forever after — even once `player` is replaced with the
// full row — so the inputs render blank though the data is genuinely there,
// and a Save could send an update with the name field simply absent.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Player } from '@/lib/types';

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
  }),
}));

import { CollegeProfileEditor } from '@/components/baseball/profile/CollegeProfileEditor';

// Partial snapshot a lightweight route-guard reconciliation can leave behind
// before the full player row has loaded — only identity fields present.
const partialPlayer = {
  id: 'player-1',
  user_id: 'user-1',
  player_type: 'college',
  onboarding_completed: true,
} as unknown as Player;

const fullPlayer = {
  ...partialPlayer,
  first_name: 'Marcus',
  last_name: 'Rodriguez',
  city: null,
  state: null,
  primary_position: 'SS',
  email: 'marcus@example.com',
} as unknown as Player;

function firstNameInput() {
  return screen.getByLabelText(/first name/i) as HTMLInputElement;
}
function lastNameInput() {
  return screen.getByLabelText(/last name/i) as HTMLInputElement;
}

describe('CollegeProfileEditor — formData resyncs when a fuller player arrives', () => {
  it('backfills First/Last Name once the full player row replaces a partial one', async () => {
    const { rerender } = render(
      <CollegeProfileEditor player={partialPlayer} onUpdate={vi.fn()} />,
    );
    await waitFor(() => expect(screen.getByText(/team affiliation/i)).toBeInTheDocument());

    // Mounted against the partial snapshot — genuinely nothing to show yet.
    expect(firstNameInput().value).toBe('');
    expect(lastNameInput().value).toBe('');

    // The store resolves the full row; the parent re-renders with it.
    rerender(<CollegeProfileEditor player={fullPlayer} onUpdate={vi.fn()} />);

    await waitFor(() => expect(firstNameInput().value).toBe('Marcus'));
    expect(lastNameInput().value).toBe('Rodriguez');
  });

  it('never clobbers a name the player is actively typing', async () => {
    const { rerender } = render(
      <CollegeProfileEditor player={partialPlayer} onUpdate={vi.fn()} />,
    );
    await waitFor(() => expect(screen.getByText(/team affiliation/i)).toBeInTheDocument());

    fireEvent.change(firstNameInput(), { target: { value: 'Marc' } });
    expect(firstNameInput().value).toBe('Marc');

    // A resync effect that later fires must not stomp the in-progress edit.
    rerender(<CollegeProfileEditor player={fullPlayer} onUpdate={vi.fn()} />);

    // Last name was never touched, so it DOES get backfilled.
    await waitFor(() => expect(lastNameInput().value).toBe('Rodriguez'));
    expect(firstNameInput().value).toBe('Marc');
  });

  it('renders correctly when the full row is already present at mount (common case)', async () => {
    render(<CollegeProfileEditor player={fullPlayer} onUpdate={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/team affiliation/i)).toBeInTheDocument());
    expect(firstNameInput().value).toBe('Marcus');
    expect(lastNameInput().value).toBe('Rodriguez');
  });
});
