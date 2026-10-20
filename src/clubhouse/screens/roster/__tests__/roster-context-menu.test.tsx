import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../__tests__/dialog-polyfill';

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }) }));
vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: false }) }));
vi.mock('@/app/golf/actions/roster', () => ({ removePlayerFromTeam: vi.fn() }));
vi.mock('@/app/golf/actions/team-management', () => ({ updatePlayerStatus: vi.fn() }));
vi.mock('@/app/golf/actions/teams', () => ({ acceptJoinRequest: vi.fn(), rejectJoinRequest: vi.fn(), getTeamJoinRequests: vi.fn() }));
vi.mock('@/app/golf/actions/v3/intent', () => ({ setIntent: vi.fn() }));

import { PREVIEW_ROSTER } from '../../../preview/fixtures-roster';
import { clearPeople, usePeople } from '../../../shell/command/people';
import { ToastProvider } from '../../../ui/Toast';
import { Roster } from '../Roster';

beforeEach(() => {
  clearPeople();
  window.sessionStorage.clear();
  vi.mocked(window.matchMedia).mockImplementation(
    (query: string) => ({ matches: query.includes('hover: hover'), media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }) as unknown as MediaQueryList,
  );
});
afterEach(() => cleanup());

function People() {
  return <output aria-label="people">{usePeople().map((p) => p.name).join('|')}</output>;
}
const tree = (
  <LazyMotion features={domAnimation}>
    <ToastProvider>
      <div className="ch-root" data-ui="clubhouse">
        <Roster data={PREVIEW_ROSTER} />
        <People />
      </div>
    </ToastProvider>
  </LazyMotion>
);
const labels = () => within(screen.getByRole('menu')).getAllByRole('menuitem').map((i) => i.textContent);

describe('Roster right-click menu', () => {
  it('holds the same items as the row\'s own Actions menu, on a face and on a list row', async () => {
    const user = userEvent.setup();
    render(tree);
    fireEvent.contextMenu(screen.getByRole('button', { name: /Theo Marchetti.*Open profile/ }), { clientX: 200, clientY: 200 });
    const onFace = labels();
    expect(onFace).toEqual(expect.arrayContaining(['Mark inactive', 'Remove from team']));
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());

    await user.click(screen.getByRole('button', { name: 'List view' }));
    await user.click(screen.getByRole('button', { name: 'Actions for Theo Marchetti' }));
    const kebab = labels();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());

    const row = screen.getAllByRole('row').find((r) => within(r).queryByRole('button', { name: 'Actions for Theo Marchetti' }));
    fireEvent.contextMenu(row!, { clientX: 100, clientY: 100 });
    expect(labels()).toEqual(kebab);
    expect(onFace).toEqual(kebab);
  });

  it('opens the same Remove confirmation the kebab does', async () => {
    const user = userEvent.setup();
    render(tree);
    fireEvent.contextMenu(screen.getByRole('button', { name: /Theo Marchetti.*Open profile/ }), { clientX: 200, clientY: 200 });
    await user.click(screen.getByRole('menuitem', { name: 'Remove from team' }));
    expect(await screen.findByRole('dialog', { name: 'Remove player?' })).toBeInTheDocument();
  });

  it('hands the loaded players to the command palette, and only those', () => {
    render(tree);
    const names = screen.getByLabelText('people').textContent!.split('|');
    expect(names).toContain('Jonah Okafor');
    expect(names).toHaveLength(PREVIEW_ROSTER.players.length);
  });
});
