import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Class awareness (P-10), player side: the Class status panel on Classes (what they are doing now, what coaches see,
 * the sharing switch, No class today, the quiet notices) and the class detail's status switch and exams. Every new
 * Classes code in docs/clubhouse/catalog/classes.md (CH-12070 to CH-12076, CH-12170 to CH-12172, CH-12270, CH-12570,
 * CH-12870), found by its number.
 */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard/classes' }));
vi.mock('@/app/golf/actions/calendar-sync', () => ({ syncClassToCalendar: vi.fn(), removeClassFromCalendar: vi.fn() }));
vi.mock('@/app/golf/actions/schedule-image', () => ({ extractClassesFromScheduleImage: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }));
const live = vi.hoisted(() => ({
  day: null as import('../data/class-day-shape').ChMyClassDay | null,
  status: 'ready' as 'idle' | 'loading' | 'ready' | 'error',
  now: null as number | null,
  refetch: vi.fn(async () => {}),
  refetchMine: vi.fn(async () => {}),
}));
vi.mock('../lib/use-class-day', () => ({
  useMyClassDay: (opts: { enabled?: boolean } = {}) => ({ day: opts.enabled === false ? null : live.day, status: live.status, now: live.now, refetch: live.refetch }),
  refetchMyClassDay: live.refetchMine,
}));
// The pickers are their own components with their own tests; here a date or a time is a plain input so a test can set any value.
vi.mock('../ui/DateField', () => ({ DateField: ({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) => <input aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} /> }));
vi.mock('../ui/TimeField', () => ({ TimeField: ({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) => <input aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} /> }));
import './dialog-polyfill';

import type { ChMyClassDay, ChClassBlock, ChClassDayPlayer } from '../data/class-day-shape';
import type { ChClassesWrites } from '../screens/classes/writes';
import type { ChClassStatusWrites, ChExam } from '../screens/classes/class-status-writes';
import { ClassesView } from '../screens/classes/ClassesView';
import { PREVIEW_CLASSES } from '../preview/fixtures-classes';
import { ClubhouseMarker } from '../shell/context';
import { ToastProvider } from '../ui/Toast';

const ROLE = 'player' as const;
const TODAY = '2026-10-14';
const z = (hhmm: string, day = TODAY) => `${day}T${hhmm}:00.000Z`;
const at = (hhmm: string) => Date.parse(z(hhmm));
const ECON = PREVIEW_CLASSES.classes.list.find((c) => c.code === 'ECON 310')!;
const STAT = PREVIEW_CLASSES.classes.list.find((c) => c.code === 'STAT 201')!;
const block = (id: string, from: string, to: string, label: string): ChClassBlock => ({ classId: id, label, kind: 'class', source: 'pattern', startsAt: z(from), endsAt: z(to) });
const BLOCKS = [block(ECON.id, '14:10', '15:25', 'ECON 310 - Intermediate Macroeconomics'), block('c-engl', '17:25', '18:15', 'ENGL 105 - Writing in the Disciplines')];
const me = (over: Partial<ChClassDayPlayer> = {}): ChClassDayPlayer => ({ playerId: 'p1', firstName: 'Jonah', lastName: 'Okafor', avatarUrl: null, tracked: true, holds: true, onCourse: false, offToday: false, away: null, blocks: BLOCKS, ...over });
const myDay = (over: Partial<ChMyClassDay> = {}): ChMyClassDay => ({
  on: TODAY,
  teamId: 't1',
  teamTimeZone: 'America/New_York',
  classTimeZone: 'America/New_York',
  term: { id: 't', label: 'Fall 2026', classesStart: '2026-08-24', classesEnd: '2026-12-11', examsEnd: '2026-12-18', timeZone: 'America/New_York', phase: 'classes' },
  settings: { shareStatus: true, holdPushes: true },
  player: me(),
  blocks: BLOCKS,
  untaggedClasses: 0,
  unusableClasses: [],
  held: null,
  fetchedAt: Date.now(),
  ...over,
});

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
async function expectCode(c: string, text?: RegExp) {
  await waitFor(() => expect(code(c)).not.toBeNull());
  if (text) expect(code(c)!.textContent).toMatch(text);
}

function classWrites(over: Partial<ChClassesWrites> = {}): ChClassesWrites {
  return {
    save: vi.fn(async () => ({ success: true })),
    remove: vi.fn(async () => ({ success: true })),
    removeAll: vi.fn(async () => ({ success: true })),
    sync: vi.fn(async () => ({ success: true })),
    importRows: vi.fn(async () => ({ success: true })),
    read: vi.fn(async () => ({ ok: true as const, rows: [], warnings: [] })),
    ...over,
  } as unknown as ChClassesWrites;
}
function statusWrites(over: Partial<ChClassStatusWrites> = {}) {
  const exams: ChExam[] = [];
  const w = {
    setShare: vi.fn(async () => ({ success: true })),
    markNoClass: vi.fn(async () => ({ success: true, data: { ids: ['x1'] } })),
    undoNoClass: vi.fn(async () => ({ success: true })),
    setClassStatusEnabled: vi.fn(async () => ({ success: true })),
    tagUntagged: vi.fn(async () => ({ success: true })),
    loadExams: vi.fn(async () => [...exams]),
    addExam: vi.fn(async (v: { on: string; start: string; end: string; label: string }) => {
      exams.push({ id: 'e1', ...v });
      return { success: true, data: { id: 'e1' } };
    }),
    removeExam: vi.fn(async (id: string) => {
      exams.splice(0, exams.length, ...exams.filter((e) => e.id !== id));
      return { success: true };
    }),
    ...over,
  };
  return w as typeof w & ChClassStatusWrites;
}
function show(opts: { aware?: boolean; writes?: ChClassesWrites; status?: ChClassStatusWrites } = {}) {
  const status = opts.status ?? statusWrites();
  const writes = opts.writes ?? classWrites();
  const view = render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <ClubhouseMarker role={ROLE} classAwareness={opts.aware !== false}>
          <div className="ch-root" data-ui="clubhouse">
            <ClassesView data={PREVIEW_CLASSES} writes={writes} statusWrites={opts.aware === false ? undefined : status} />
          </div>
        </ClubhouseMarker>
      </ToastProvider>
    </LazyMotion>,
  );
  return { status, writes, view };
}
const panel = () => document.querySelector('.ch-ca-panel') as HTMLElement | null;

beforeEach(() => {
  hapticSpy.mockClear();
  router.push.mockClear();
  live.day = myDay();
  live.status = 'ready';
  live.now = at('14:30');
  live.refetch.mockClear();
  live.refetchMine.mockClear();
});
afterEach(() => cleanup());

describe('Class status panel', () => {
  it('shows the player’s own state, the row a coach reads, and the true sentence about the team calendar', () => {
    show();
    const p = within(panel()!);
    expect(p.getByText('In class until 11:25 AM', { selector: 'p' })).toBeTruthy();
    expect(p.getByText('ECON 310 - Intermediate Macroeconomics')).toBeTruthy();
    expect(p.getByRole('group', { name: 'Coaches see Jonah Okafor: In class until 11:25 AM' })).toBeTruthy();
    expect(p.getByText(/Coaches see the line above\. Your classes, with their times and rooms, are on the team calendar, which your coaches and teammates can see\./)).toBeTruthy();
    // The old claims are gone.
    expect(document.body.textContent).not.toMatch(/Teammates never|Room hidden from coaches/);
    expect(panel()!.getAttribute('data-ch-code')).toBe('CH-12870');
  });

  it('with the flag off there is no panel and the page says what it said', () => {
    show({ aware: false });
    expect(panel()).toBeNull();
    expect(document.body.textContent).toContain('Your teammates don’t see them.');
  });

  it('with the flag on the old "teammates don’t see them" line is corrected', () => {
    show();
    expect(document.body.textContent).not.toContain('Your teammates don’t see them.');
    expect(document.body.textContent).toContain('which your teammates can see too');
  });

  it('with sharing off, coaches see "No class status" and the player still sees their own state', () => {
    live.day = myDay({ settings: { shareStatus: false, holdPushes: true }, player: me({ tracked: false }) });
    show();
    const p = within(panel()!);
    expect(p.getByText('In class until 11:25 AM', { selector: 'p' })).toBeTruthy();
    expect(p.getByText('No class status')).toBeTruthy();
    expect((p.getByRole('switch', { name: 'Share class status with coaches' }) as HTMLInputElement).checked).toBe(false);
  });

  it('before the coach confirms the term it says what it is waiting for, and offers no No class today', () => {
    live.day = myDay({ term: null, player: me({ tracked: false, blocks: [] }), blocks: [] });
    show();
    const p = within(panel()!);
    expect(p.getByText('Class status starts when your coach sets this term’s dates')).toBeTruthy();
    expect(p.queryByRole('button', { name: /No class today/ })).toBeNull();
  });

  it('CH-12270 a read that failed says so, with Try again', async () => {
    live.day = null;
    live.status = 'error';
    show();
    await expectCode('CH-12270', /Class status didn’t load\./);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(live.refetch).toHaveBeenCalled();
  });

  it('is an empty busy card while loading, and nothing at all when the RPC is not there yet', () => {
    live.day = null;
    live.status = 'loading';
    const first = show();
    expect(panel()!.getAttribute('aria-busy')).toBe('true');
    first.view.unmount();
    live.status = 'ready';
    show();
    expect(panel()).toBeNull();
  });
});

describe('The sharing switch', () => {
  it('turning it off writes at once, refreshes the day, and offers Undo', async () => {
    const { status } = show();
    await userEvent.click(within(panel()!).getByRole('switch', { name: 'Share class status with coaches' }));
    await waitFor(() => expect(status.setShare).toHaveBeenCalledWith(false));
    await waitFor(() => expect(live.refetchMine).toHaveBeenCalled());
    expect(await screen.findByText('Coaches no longer see when you’re in class')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(status.setShare).toHaveBeenLastCalledWith(true));
  });

  it('CH-12070 a refused write puts the switch back and says so', async () => {
    const { status } = show({ status: statusWrites({ setShare: vi.fn(async () => ({ success: false, error: 'nope' })) }) });
    const sw = within(panel()!).getByRole('switch', { name: 'Share class status with coaches' }) as HTMLInputElement;
    await userEvent.click(sw);
    await expectCode('CH-12070', /Couldn’t stop sharing your class status/);
    await waitFor(() => expect(sw.checked).toBe(true));
    expect(status.setShare).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Coaches no longer see when you’re in class')).toBeNull();
  });
});

describe('No class today', () => {
  const open = async () => {
    await userEvent.click(within(panel()!).getByRole('button', { name: /No class today/ }));
    return screen.findByRole('dialog', { name: 'No class today', hidden: true });
  };

  it('lists today’s remaining and current classes, with "All my classes today" chosen', async () => {
    show();
    const dialog = await open();
    expect(within(dialog).getByText('ECON 310')).toBeTruthy();
    expect(within(dialog).getByText('10:10 to 11:25 AM')).toBeTruthy();
    expect(within(dialog).getByText('ENGL 105')).toBeTruthy();
    expect((within(dialog).getByRole('radio', { name: 'All my classes today' }) as HTMLInputElement).checked).toBe(true);
  });

  it('marks every class, then offers Undo, which deletes the rows', async () => {
    const { status } = show();
    const dialog = await open();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mark no class' }));
    await waitFor(() => expect(status.markNoClass).toHaveBeenCalledWith({ on: TODAY, classId: null }));
    expect(hapticSpy).toHaveBeenCalledWith('success');
    expect(await screen.findByText('No classes today')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(status.undoNoClass).toHaveBeenCalledWith(['x1']));
  });

  it('marks one class, and names it', async () => {
    const { status } = show();
    const dialog = await open();
    await userEvent.click(within(dialog).getByRole('radio', { name: /ECON 310/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mark no class' }));
    await waitFor(() => expect(status.markNoClass).toHaveBeenCalledWith({ on: TODAY, classId: ECON.id }));
    expect(await screen.findByText('No class today for ECON 310')).toBeTruthy();
  });

  it('CH-12071 a refused write keeps the sheet open and says so; CH-12072 a refused undo says so', async () => {
    const { status } = show({ status: statusWrites({ markNoClass: vi.fn().mockResolvedValueOnce({ success: false, error: 'no' }).mockResolvedValue({ success: true, data: { ids: ['x1'] } }), undoNoClass: vi.fn(async () => ({ success: false, error: 'no' })) }) });
    const dialog = await open();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mark no class' }));
    await expectCode('CH-12071', /Couldn’t mark no class/);
    expect(screen.getByRole('dialog', { name: 'No class today', hidden: true })).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mark no class' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await expectCode('CH-12072', /Couldn’t undo/);
    expect(status.undoNoClass).toHaveBeenCalled();
  });
});

describe('Quiet notices', () => {
  it('CH-12073 tags classes with no term, once the write lands, and a refused tag says so', async () => {
    live.day = myDay({ untaggedClasses: 2 });
    const { status } = show({ status: statusWrites({ tagUntagged: vi.fn().mockResolvedValueOnce({ success: false, error: 'no' }).mockResolvedValue({ success: true }) }) });
    expect(within(panel()!).getByText('2 classes aren’t tagged with a term')).toBeTruthy();
    await userEvent.click(within(panel()!).getByRole('button', { name: 'Tag as Fall 2026' }));
    await expectCode('CH-12073', /Couldn’t tag your classes/);
    await userEvent.click(within(panel()!).getByRole('button', { name: 'Tag as Fall 2026' }));
    await waitFor(() => expect(status.tagUntagged).toHaveBeenLastCalledWith('Fall 2026'));
    await waitFor(() => expect(live.refetchMine).toHaveBeenCalled());
  });

  it('a calendar mismatch re-syncs that class through the calendar sync the page already uses', async () => {
    live.day = myDay({ unusableClasses: [{ classId: ECON.id, reason: 'calendar_mismatch' }] });
    const { writes } = show();
    expect(within(panel()!).getByText('ECON 310’s calendar times don’t match')).toBeTruthy();
    await userEvent.click(within(panel()!).getByRole('button', { name: 'Re-sync' }));
    await waitFor(() => expect(writes.sync).toHaveBeenCalledTimes(1));
    expect((writes.sync as ReturnType<typeof vi.fn>).mock.calls[0]![0].id).toBe(ECON.id);
  });

  it('a class that cannot be used opens its form to fix the times', async () => {
    live.day = myDay({ unusableClasses: [{ classId: STAT.id, reason: 'times' }] });
    show();
    expect(within(panel()!).getByText('STAT 201 isn’t used for class status')).toBeTruthy();
    await userEvent.click(within(panel()!).getByRole('button', { name: 'Fix times' }));
    expect(await screen.findByRole('dialog', { name: 'Edit class', hidden: true })).toBeTruthy();
  });
});

describe('Class detail', () => {
  const openStat = async () => {
    await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${STAT.code}`) }));
    return screen.findByRole('dialog', { name: STAT.name, hidden: true });
  };

  it('adds nothing with the flag off', async () => {
    show({ aware: false });
    const dialog = await openStat();
    expect(within(dialog).queryByText('Use for class status')).toBeNull();
    expect(within(dialog).queryByText('Add an exam')).toBeNull();
  });

  it('CH-12074 the switch writes the class’s status, and a refused write says so', async () => {
    const { status } = show({ status: statusWrites({ setClassStatusEnabled: vi.fn().mockResolvedValueOnce({ success: false, error: 'no' }).mockResolvedValue({ success: true }) }) });
    const dialog = await openStat();
    const sw = within(dialog).getByRole('switch', { name: 'Use for class status' }) as HTMLInputElement;
    expect(sw.checked).toBe(true);
    await userEvent.click(sw);
    await expectCode('CH-12074', /Couldn’t change class status for this class/);
    await waitFor(() => expect(sw.checked).toBe(true));
    await userEvent.click(sw);
    await waitFor(() => expect(status.setClassStatusEnabled).toHaveBeenLastCalledWith(STAT.id, false));
    await waitFor(() => expect(sw.checked).toBe(false));
  });

  const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
  const startExam = async () => {
    const dialog = await openStat();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add an exam' }));
    return screen.findByRole('dialog', { name: 'Add an exam', hidden: true });
  };

  it('adds an exam labelled with the class code, lists it, and asks before removing it (CH-12570)', async () => {
    const { status } = show();
    const sheet = await startExam();
    expect((within(sheet).getByRole('textbox', { name: 'Name' }) as HTMLInputElement).value).toBe('STAT 201 exam');
    fill('Exam date', '2026-12-14');
    fill('Exam start', '09:00');
    fill('Exam end', '11:00');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Add exam' }));
    await waitFor(() => expect(status.addExam).toHaveBeenCalledWith({ on: '2026-12-14', start: '09:00', end: '11:00', label: 'STAT 201 exam' }));
    expect(hapticSpy).toHaveBeenCalledWith('success');
    const list = await screen.findByRole('list', { name: 'Exams', hidden: true });
    expect(within(list).getByText(/STAT 201 exam · Dec 14/)).toBeTruthy();
    await userEvent.click(within(list).getByRole('button', { name: /^Remove STAT 201 exam on Dec 14/ }));
    await expectCode('CH-12570', /Remove STAT 201 exam on Dec 14\?/);
    expect(status.removeExam).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(status.removeExam).toHaveBeenCalledWith('e1'));
  });

  it('CH-12170, CH-12171 and CH-12172 say what is wrong before anything is sent', async () => {
    const { status } = show();
    const sheet = await startExam();
    fill('Exam date', '2026-12-14');
    fill('Exam start', '09:00');
    fill('Exam end', '08:00');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Add exam' }));
    await expectCode('CH-12170', /The exam must end after it starts\./);
    fill('Exam end', '14:00');
    await expectCode('CH-12171', /Exams can be up to 4 hours\./);
    fill('Exam end', '11:00');
    fill('Exam date', '2027-02-01');
    await expectCode('CH-12172', /Pick a date in Fall 2026\./);
    expect(status.addExam).not.toHaveBeenCalled();
  });

  it('CH-12075 a refused add keeps the sheet; CH-12076 a refused remove keeps the exam', async () => {
    const exam: ChExam = { id: 'e9', on: '2026-12-14', start: '09:00', end: '11:00', label: 'STAT 201 exam' };
    const { status } = show({
      status: statusWrites({ loadExams: vi.fn(async () => [exam]), addExam: vi.fn(async () => ({ success: false, error: 'no' })), removeExam: vi.fn(async () => ({ success: false, error: 'no' })) }),
    });
    const sheet = await startExam();
    fill('Exam date', '2026-12-14');
    fill('Exam start', '09:00');
    fill('Exam end', '11:00');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Add exam' }));
    await expectCode('CH-12075', /Couldn’t add the exam/);
    expect(screen.getByRole('dialog', { name: 'Add an exam', hidden: true })).toBeTruthy();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Cancel' }));
    const list = await screen.findByRole('list', { name: 'Exams', hidden: true });
    await userEvent.click(within(list).getByRole('button', { name: /^Remove/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    await expectCode('CH-12076', /Couldn’t remove the exam/);
    expect(status.removeExam).toHaveBeenCalledWith('e9');
    expect(code('CH-12570')).not.toBeNull();
  });
});

describe('The empty state', () => {
  it('says coaches will see when the player is in class, only with the flag on', () => {
    const empty = { ...PREVIEW_CLASSES, classes: { list: [], error: false } };
    const status = statusWrites();
    const on = render(
      <LazyMotion features={domAnimation}>
        <ToastProvider>
          <ClubhouseMarker role={ROLE} classAwareness>
            <ClassesView data={empty} writes={classWrites()} statusWrites={status} />
          </ClubhouseMarker>
        </ToastProvider>
      </LazyMotion>,
    );
    expect(document.body.textContent).toContain('Coaches will see when you’re in class, and your pushes wait until class ends.');
    on.unmount();
    render(
      <LazyMotion features={domAnimation}>
        <ToastProvider>
          <ClassesView data={empty} writes={classWrites()} />
        </ToastProvider>
      </LazyMotion>,
    );
    expect(document.body.textContent).toContain('Your coach can see when you’re busy');
  });
});
