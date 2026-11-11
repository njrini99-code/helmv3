import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard/practice/drills' }));
vi.mock('@/app/golf/actions/practice-library', () => ({ createTeamDrill: vi.fn(), archiveTeamDrill: vi.fn(), copyLibraryDrill: vi.fn(), updateTeamDrill: vi.fn(), savePracticeGroup: vi.fn(), deletePracticeGroup: vi.fn(), savePracticeTemplate: vi.fn(), renamePracticeTemplate: vi.fn(), deletePracticeTemplate: vi.fn() }));

import { ToastProvider } from '../../../ui/Toast';
import { DrillPage, DrillsPage, TemplatesPage } from '../LibraryPages';
import { tabsFitOneRow } from '../PracticeTabs';
import type { ChDrillDetail, ChDrillRow } from '../../../data/practice-library-shape';

afterEach(() => {
  cleanup();
  router.push.mockClear();
});
const team: ChDrillRow = { id: 'd1', source: 'team', name: 'Clock drill', area: 'putting', areaLabel: 'Putting', kind: 'skill', minutes: 20, players: 'pairs', levels: 'Par 6' };
const lib: ChDrillRow = { id: 'l1', source: 'lib', name: 'Gate drill', area: 'short_game', areaLabel: 'Short game', kind: 'skill', minutes: 15, players: null, levels: null };
const detail = (r: ChDrillRow): ChDrillDetail => ({ ...r, setup: '', goal: '', equipment: [], scoring: [], tags: [], mediaUrl: null, usedIn: 4, archived: false });

/** FID-PRAC-1: the Practice tabs are real pages. */
describe('Practice library', () => {
  it('Drills filters by search and by area, and says when nothing matches', async () => {
    render(<ToastProvider><DrillsPage preview teamId="t" team={[team]} library={[lib]} /></ToastProvider>);
    expect(screen.getByText('Clock drill')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Short game' }));
    expect(screen.queryByText('Clock drill')).toBeNull();
    expect(screen.getByText('Gate drill')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'All' }));
    await userEvent.type(screen.getByRole('searchbox'), 'zzz');
    expect(screen.getByText('No drills match “zzz”')).toBeTruthy();
  });
  it('the areas are one row that shows its clipped edge, and each list is a shelf of drills', () => {
    render(<ToastProvider><DrillsPage preview teamId="t" team={[team]} library={[lib]} /></ToastProvider>);
    const areas = screen.getByRole('group', { name: 'Area' });
    expect(areas.classList.contains('ch-hscroll')).toBe(true);
    expect(areas.querySelectorAll('button').length).toBe(9);
    expect([...document.querySelectorAll('.ch-prc-list')].every((list) => list.classList.contains('is-drills'))).toBe(true);
  });
  it('the tabs take two rows of two only when a label would not fit its column', () => {
    // A phone's row: 350 inside the well, 4 between tabs. "Templates" is about 63 wide at the default Text Size and 86 at the largest.
    expect(tabsFitOneRow(63, 350, 4, 4)).toBe(true);
    expect(tabsFitOneRow(86, 350, 4, 4)).toBe(false);
    // Not laid out yet (no width to read): stay on one row instead of guessing.
    expect(tabsFitOneRow(0, 0, 4, 4)).toBe(true);
    render(<ToastProvider><DrillsPage preview teamId="t" team={[team]} library={[lib]} /></ToastProvider>);
    expect(document.querySelector('.ch-prc-tabs')!.classList.contains('is-two')).toBe(false);
  });
  it('a team drill edits and archives; a library drill only copies', () => {
    const { unmount } = render(<ToastProvider><DrillPage preview teamId="t" drill={detail(team)} /></ToastProvider>);
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
    expect(screen.getByText('Used in 4 plans')).toBeTruthy();
    unmount();
    render(<ToastProvider><DrillPage preview teamId="t" drill={detail(lib)} /></ToastProvider>);
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Copy to your bank' })).toBeTruthy();
  });
  it('Use on a starter opens New plan with it', async () => {
    render(<ToastProvider><TemplatesPage preview teamId="t" templates={[]} /></ToastProvider>);
    await userEvent.click(screen.getByRole('button', { name: /^Three-station rotation\s*Session/ }));
    expect(router.push).toHaveBeenCalledWith('/golf/dashboard/practice?new=1&template=three-stations');
  });
});
