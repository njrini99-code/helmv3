import { LazyMotion, domAnimation } from 'motion/react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChCsvFile } from '../lib/csv';
import './dialog-polyfill';

const toast = vi.fn();
const saved: ChCsvFile[] = [];
const save = vi.fn(async (f: ChCsvFile, _opts: { share: boolean }) => {
  saved.push(f);
  return 'downloaded' as const;
});
vi.mock('../lib/csv', async (orig) => ({ ...(await orig<typeof import('../lib/csv')>()), saveCsv: (f: ChCsvFile, o: { share: boolean }) => save(f, o) }));
vi.mock('../ui/Toast', async (orig) => ({ ...(await orig<typeof import('../ui/Toast')>()), useToast: () => toast, useDelayedToast: () => () => () => {} }));
vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('../lib/use-refresh', () => ({ useRefresh: () => ({ refresh: vi.fn(), refreshing: false }) }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/golf/dashboard/rounds',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: false }) }));
vi.mock('@/app/golf/actions/round-partial', () => ({ deleteInProgressRound: vi.fn() }));
vi.mock('@/app/golf/actions/rounds-export', () => ({ readRoundHolesForExport: vi.fn() }));
vi.mock('@/lib/utils/emergency-save', () => ({ clearEmergencySave: vi.fn(), markRoundDiscarded: vi.fn() }));

const { ExportRounds } = await import('../screens/rounds/ExportRounds');
const { RoundsLibrary } = await import('../screens/rounds/RoundsLibrary');
const { TeamRounds } = await import('../screens/rounds/TeamRounds');
const { ExportStandings } = await import('../screens/qualifiers/ExportStandings');
const { PREVIEW_ROUNDS } = await import('../preview/fixtures-rounds');
const { PREVIEW_TEAM_ROUNDS } = await import('../preview/fixtures-team-rounds');
const { previewHoles } = await import('../preview/export-holes');
const { CrumbProvider } = await import('../shell/crumbs');
const { PhoneChromeProvider } = await import('../shell/phone-chrome');

/**
 * Export (launch readiness F-02): Rounds and Team rounds (CH-11080 when the holes don't load or the file is refused,
 * CH-11480 while they load), a qualifier's standings (CH-09080) and an event's results (CH-16082). Each builds one
 * spreadsheet-safe CSV through lib/csv.ts; the files themselves are pinned by the builders' own tests.
 */
beforeEach(() => {
  toast.mockReset();
  save.mockClear();
  saved.length = 0;
});
afterEach(cleanup);

const shell = (node: ReactNode) => (
  <LazyMotion features={domAnimation}>
    <CrumbProvider>
      <PhoneChromeProvider>
        <div className="ch-root" data-ui="clubhouse">
          {node}
        </div>
      </PhoneChromeProvider>
    </CrumbProvider>
  </LazyMotion>
);

const ROUNDS = PREVIEW_ROUNDS.rounds.list;
const ok = (ids: string[]) =>
  Promise.resolve({ success: true as const, data: Object.fromEntries(ids.map((id) => [id, previewHoles(ROUNDS.find((r) => r.id === id)!)])) });

describe('Export rounds', () => {
  it('CH-11480, 110980: reads the holes at the press, says it is exporting, then exports every round with its holes', async () => {
    type Read = Awaited<ReturnType<typeof ok>>;
    let land: (v: Read) => void = () => {};
    const read = vi.fn(
      (_ids: string[]) =>
        new Promise<Read>((r) => {
          land = r;
        }),
    );
    render(shell(<ExportRounds rounds={ROUNDS} team={false} name={['rounds']} read={read} />));
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    const key = await screen.findByRole('button', { name: /Exporting/ });
    expect(key).toHaveAttribute('aria-busy', 'true');
    expect(key.querySelector('[data-ch-code="CH-11480"]')).not.toBeNull();
    // A round posted as a total only has no holes to read.
    expect(read.mock.calls[0]![0]).toEqual(ROUNDS.filter((r) => !r.totalOnly).map((r) => r.id));
    await act(async () => land(await ok(read.mock.calls[0]![0])));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const f = saved[0]!;
    expect(f.name).toMatch(/^rounds-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(f.rows).toHaveLength(ROUNDS.length);
    const first = ROUNDS[0]!;
    const holes = f.rows[0]!.slice(15, 15 + first.holes);
    expect(holes.reduce<number>((a, v) => a + (v as number), 0)).toBe(first.score);
    expect(save.mock.calls[0]![1]).toEqual({ share: false });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: `Rounds exported · ${ROUNDS.length} rounds` }));
    expect(screen.getByRole('button', { name: 'Export' })).not.toHaveAttribute('aria-busy');
  });

  it('CH-11080: the holes didn’t load, so nothing is exported and the toast says so', async () => {
    const read = vi.fn(() => Promise.resolve({ success: false as const, error: 'The holes didn’t load.' }));
    render(shell(<ExportRounds rounds={ROUNDS} team={false} name={['rounds']} read={read} />));
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ tone: 'error', title: 'Couldn’t export the rounds', code: 'CH-11080', body: expect.stringContaining('didn’t load') }),
      ),
    );
    expect(save).not.toHaveBeenCalled();
    // A read that throws (offline) is the same failure.
    toast.mockReset();
    cleanup();
    render(shell(<ExportRounds rounds={ROUNDS} team={false} name={['rounds']} read={() => Promise.reject(new Error('Failed to fetch'))} />));
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ code: 'CH-11080', body: expect.stringContaining('didn’t load') })));
  });

  it('CH-11080: the browser refuses the file, and the toast says to try again or use a computer', async () => {
    save.mockRejectedValueOnce(new Error('blocked'));
    render(shell(<ExportRounds rounds={ROUNDS} team={false} name={['rounds']} read={(ids) => ok(ids)} />));
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ tone: 'error', code: 'CH-11080', body: expect.stringContaining('export from a computer') })),
    );
  });

  it('the player’s Rounds: Export in the tools row takes the rounds the search leaves', async () => {
    const read = vi.fn((ids: string[]) => ok(ids));
    render(shell(<RoundsLibrary data={PREVIEW_ROUNDS} playerId="p1" writes={{ discard: vi.fn() }} readHoles={read} />));
    const tools = document.querySelector('.ch-rd-tools') as HTMLElement;
    const course = ROUNDS[0]!.course;
    fireEvent.change(within(tools).getByRole('searchbox'), { target: { value: course } });
    fireEvent.click(within(tools).getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const shown = ROUNDS.filter((r) => r.course.toLowerCase().includes(course.toLowerCase()));
    expect(saved[0]!.rows.map((r) => r[1])).toEqual(shown.map((r) => r.course));
    expect(saved[0]!.head[0]).toBe('Date');
  });

  it('the coach’s Team rounds: Export takes the player picked, and names the file for the team and the player', async () => {
    const read = vi.fn(() => Promise.resolve({ success: true as const, data: {} }));
    render(shell(<TeamRounds data={PREVIEW_TEAM_ROUNDS} teamId="t1" readHoles={read} />));
    const tools = document.querySelector('.ch-rd-tools') as HTMLElement;
    fireEvent.click(within(tools).getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(saved[0]!.head[0]).toBe('Player');
    expect(saved[0]!.rows).toHaveLength(PREVIEW_TEAM_ROUNDS.rounds.list.length);
    expect(saved[0]!.name).toMatch(/-rounds-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});

describe('Export standings', () => {
  const board = {
    rows: [
      {
        playerId: 'a',
        name: 'Ava Lindqvist',
        classYear: 'Junior',
        position: 1,
        tied: false,
        played: 1,
        toPar: -2,
        total: 70,
        avg: 70,
        shortRounds: 0,
        move: null,
        missed: false,
        state: 'qualifying' as const,
        rounds: [{ id: 'x', playerId: 'a', number: 1, total: 70, toPar: -2, date: '2026-10-01', course: null, holesPlayed: 18 }],
      },
    ],
    unscored: [],
  };

  it('90980: exports the board it is given, and says how many players went', async () => {
    render(shell(<ExportStandings name="Spring Qualifier" board={board} numRounds={2} />));
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(saved[0]!.rows[0]).toEqual([1, 'Ava Lindqvist', 'Junior', 70, null, 70, -2, 1, 70, 'Qualifying']);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Standings exported · 1 player' }));
  });

  it('CH-09080: the browser refuses the file', async () => {
    save.mockRejectedValueOnce(new Error('blocked'));
    render(shell(<ExportStandings name="Spring Qualifier" board={board} numRounds={2} label="Export standings" variant="secondary" size="md" />));
    fireEvent.click(screen.getByRole('button', { name: 'Export standings' }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ tone: 'error', title: 'Couldn’t export the standings', code: 'CH-09080' })),
    );
  });
});

describe('Export results', () => {
  const tab = { tab: 'overview' as const, round: 'all' as const, view: 'team' as const, holes: 'to-par' as const };

  it('CH-16082, 160980: Who counted carries Export once there are scores; a refused file says so', async () => {
    const { EventDesk } = await import('../screens/tournaments/EventDesk');
    const { event, pr, ROSTER, COURSE } = await import('../screens/tournaments/import/__tests__/fixtures');
    const desk = (ev = event()) => ({
      now: '2026-10-21T18:00:00Z',
      teamName: 'Demo University',
      event: ev,
      players: ROSTER,
      courses: { pin: COURSE },
      holes: null,
      findings: [],
      story: null,
      review: null,
      travel: null,
      adviceGivers: [],
      previous: null,
      errors: {},
    });
    // No scores yet: nothing to export.
    const empty = render(shell(<EventDesk data={desk()} search={tab} load="ready" phone={false} />)).container;
    expect(within(empty.querySelector('[aria-labelledby="ch-tour-desk-who-t"]') as HTMLElement).queryByRole('button', { name: 'Export' })).toBeNull();
    cleanup();
    const scored = event({ playerRounds: [pr({ playerId: 'ava', roundNumber: 1, total: 70, toPar: -2, count: 'counted' })] });
    const c = render(shell(<EventDesk data={desk(scored)} search={tab} load="ready" phone={false} />)).container;
    const who = c.querySelector('[aria-labelledby="ch-tour-desk-who-t"]') as HTMLElement;
    fireEvent.click(within(who).getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(saved[0]!.name).toMatch(/^fall-invitational-results-/);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Results exported · 6 players' }));
    save.mockRejectedValueOnce(new Error('blocked'));
    fireEvent.click(within(who).getByRole('button', { name: 'Export' }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ tone: 'error', title: 'Couldn’t export Fall Inv.’s results', code: 'CH-16082' })),
    );
  });
});
