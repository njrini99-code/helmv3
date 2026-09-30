import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PREVIEW_SETUP_COURSES, PREVIEW_SETUP_QUALIFIERS, PREVIEW_SETUP_TEES, PREVIEW_SETUP_TODAY, previewTeeHoles } from '../preview/fixtures-setup';
import { RoundSetup } from '../screens/rounds/setup/RoundSetup';
import { addCourseIssue } from '../screens/rounds/setup/AddCourseSheet';
import { blankHoles, editedCount, groupCourses, holeIssue, holesForRound, setupBlocker, type ChSetupForm, type ChSetupPorts, type ChSetupQualifier, type ChSetupTee } from '../screens/rounds/setup/shape';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';

const ok = <T,>(data: T) => Promise.resolve({ ok: true as const, data });
const fail = (error = 'nope') => Promise.resolve({ ok: false as const, error });

function setup(over: Partial<ChSetupPorts> = {}, qualifiers: ChSetupQualifier[] | null = PREVIEW_SETUP_QUALIFIERS) {
  const ports: ChSetupPorts = {
    listCourses: vi.fn(() => ok(PREVIEW_SETUP_COURSES)),
    listTees: vi.fn((id: string) => ok(PREVIEW_SETUP_TEES[id] ?? [])),
    teeHoles: vi.fn((id: string) => ok(previewTeeHoles(id))),
    start: vi.fn(() => ok({ roundId: 'r-1' })),
    ...over,
  };
  const onStarted = vi.fn();
  render(
    <ToastProvider>
      <RoundSetup ports={ports} qualifiers={qualifiers} today={PREVIEW_SETUP_TODAY} backHref="/golf/dashboard/rounds" onStarted={onStarted} />
    </ToastProvider>,
  );
  return { ports, onStarted, user: userEvent.setup() };
}
const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`) as HTMLElement | null;
const dock = () => document.getElementById('ch-rsu-dock-s')!;
const startBtn = () => screen.getByRole('button', { name: /Start round|Starting/ });

async function pickFinleyBlue(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Browse courses/ }));
  await user.click(await within(code('CH-11510')!).findByRole('button', { name: /^Finley GC/ }));
  await user.click(await screen.findByRole('button', { name: /Play the Blue tees/ }));
  await waitFor(() => expect(screen.getByRole('region', { name: 'Scorecard' })).toBeInTheDocument());
}

describe('Round setup: rules', () => {
  const holes = previewTeeHoles('finley-blue');
  const form: ChSetupForm = {
    pick: { courseId: 'finley', courseName: 'Finley GC', place: null, teeId: 'finley-blue', teeName: 'Blue', teeColor: 'blue', rating: null, slope: null, yards: null },
    type: 'practice',
    date: PREVIEW_SETUP_TODAY,
    count: 18,
    nine: 'front',
    holes,
    baseline: holes,
    qualifierId: null,
    qualifierRound: null,
    saveCourse: false,
  };

  it('plays the chosen nine of an 18-hole card', () => {
    expect(holesForRound(holes, 18, 'front')).toHaveLength(18);
    expect(holesForRound(holes, 9, 'back')[0]!.n).toBe(10);
    expect(holesForRound(holes, 9, 'front').at(-1)!.n).toBe(9);
    expect(holesForRound(holes.slice(0, 9), 9, 'back')[0]!.n).toBe(1);
  });

  it('names the one thing that stops Start, in the order a player fixes it (CH-11107, CH-11109)', () => {
    expect(setupBlocker({ ...form, pick: null }, PREVIEW_SETUP_TODAY)).toBe('Choose a course to start');
    expect(setupBlocker({ ...form, date: '2026-10-15' }, PREVIEW_SETUP_TODAY)).toBe("The round's date can't be after today");
    expect(setupBlocker({ ...form, type: 'qualifier' }, PREVIEW_SETUP_TODAY)).toBe('Choose the qualifier round');
    expect(setupBlocker({ ...form, holes: holes.slice(0, 9) }, PREVIEW_SETUP_TODAY)).toBe('This card has 9 holes; play 9');
    expect(setupBlocker({ ...form, holes: holes.map((h) => (h.n === 4 ? { ...h, yards: '' } : h)) }, PREVIEW_SETUP_TODAY)).toBe('Hole 4 needs a yardage');
    // A blank hole on the unplayed nine doesn't stop a 9-hole round.
    expect(setupBlocker({ ...form, count: 9, holes: holes.map((h) => (h.n === 14 ? { ...h, yards: '' } : h)) }, PREVIEW_SETUP_TODAY)).toBeNull();
    expect(setupBlocker(form, PREVIEW_SETUP_TODAY)).toBeNull();
    expect(holeIssue({ n: 2, par: 4, yards: '0' })).toBe('Hole 2 needs a yardage');
  });

  it('counts edited holes, groups courses and searches them', () => {
    expect(
      editedCount(
        holes.map((h) => (h.n === 3 ? { ...h, par: 4 } : h)),
        holes,
      ),
    ).toBe(1);
    expect(editedCount(holes, null)).toBe(0);
    expect(groupCourses(PREVIEW_SETUP_COURSES, '').map((g) => g.label)).toEqual(['Recently played', 'Team courses', 'Course library']);
    expect(groupCourses(PREVIEW_SETUP_COURSES, 'durham')).toEqual([{ key: 'results', label: 'Results', courses: [PREVIEW_SETUP_COURSES[3], PREVIEW_SETUP_COURSES[4]] }]);
    expect(groupCourses(PREVIEW_SETUP_COURSES, 'zzz')).toEqual([]);
    expect(
      blankHoles(9)
        .map((h) => h.par)
        .reduce((a, b) => a + b, 0),
    ).toBe(36);
  });

  it('CH-11108 the add-a-course checks', () => {
    const f = { name: 'Chapel Ridge', rating: '', slope: '', teeName: 'Blue' };
    expect(addCourseIssue(0, { ...f, name: 'CR' }, [])).toBe('Enter the course’s name');
    expect(addCourseIssue(1, { ...f, teeName: '' }, [])).toBe('Name the tees you’re playing');
    expect(addCourseIssue(1, { ...f, rating: '90' }, [])).toBe('A course rating is between 55 and 80');
    expect(addCourseIssue(1, { ...f, slope: '200' }, [])).toBe('A slope is between 55 and 155');
    expect(addCourseIssue(1, f, [])).toBeNull();
    expect(addCourseIssue(2, f, blankHoles(9))).toBe('Hole 1 needs a yardage');
  });
});

describe('Round setup: picking a course', () => {
  it('CH-11309 before a course, Start waits and the scorecard holds its place', () => {
    setup();
    expect(code('CH-11309')).toHaveTextContent('Your scorecard appears here once you pick a course and tees.');
    expect(dock()).toHaveTextContent('Choose a course to start');
    expect(startBtn()).toBeDisabled();
  });

  it('CH-11510 the library, grouped and searchable (CH-11310), then the tees', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /Browse courses/ }));
    expect(await screen.findByRole('region', { name: 'Recently played' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Course library' })).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox', { name: 'Search courses' }), 'zzz');
    expect(code('CH-11310')).toHaveTextContent('No courses match “zzz”');
    await user.clear(screen.getByRole('searchbox', { name: 'Search courses' }));
    await user.click(within(code('CH-11510')!).getByRole('button', { name: /^Finley GC/ }));
    expect(await screen.findByRole('button', { name: 'Play the Blue tees, 6,984 yards' })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Play the Gold tees, not ready yet/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Courses' }));
    expect(await screen.findByRole('region', { name: 'Team courses' })).toBeInTheDocument();
  });

  it('CH-11403 the library is on its way, in the shape of its rows', async () => {
    const { user } = setup({ listCourses: vi.fn(() => new Promise<never>(() => {})) });
    await user.click(screen.getByRole('button', { name: /Browse courses/ }));
    expect(code('CH-11403')).toHaveAttribute('aria-busy', 'true');
  });

  it('picking tees loads the scorecard; edits are counted and marked', async () => {
    const { user, ports } = setup();
    await pickFinleyBlue(user);
    expect(ports.teeHoles).toHaveBeenCalledWith('finley-blue');
    expect(dock()).toHaveTextContent('Finley GC · Blue · 18 holes · Par 72');
    expect(startBtn()).toBeEnabled();
    await user.click(within(screen.getByRole('radiogroup', { name: 'Hole 3 par' })).getByRole('radio', { name: '4' }));
    expect(screen.getByText('1 hole edited for this round')).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Hole 3 par' }).closest('.ch-rsu-hole')).toHaveClass('is-edited');
    expect(screen.getByRole('radiogroup', { name: 'Hole 4 par' }).closest('.ch-rsu-hole')).not.toHaveClass('is-edited');
    expect(dock()).toHaveTextContent('Par 73');
  });

  it('a 9-hole tee plays 9, and 18 is off', async () => {
    const { user } = setup({ teeHoles: vi.fn((id: string) => ok(previewTeeHoles(id).slice(0, 9))) });
    await pickFinleyBlue(user);
    expect(dock()).toHaveTextContent('Finley GC · Blue · 9 holes · Par 36');
    expect(within(screen.getByRole('radiogroup', { name: 'Holes' })).getByRole('radio', { name: '18 holes' })).toBeDisabled();
  });

  it('a slow tee read for a course left behind never replaces the next course’s tees', async () => {
    let late: (v: { ok: true; data: ChSetupTee[] }) => void = () => {};
    const listTees = vi.fn((id: string) => (id === 'finley' ? new Promise<{ ok: true; data: ChSetupTee[] }>((r) => (late = r)) : ok([])));
    const { user } = setup({ listTees });
    await user.click(screen.getByRole('button', { name: /Browse courses/ }));
    await user.click(await within(code('CH-11510')!).findByRole('button', { name: /^Finley GC/ }));
    await user.click(screen.getByRole('button', { name: 'Courses' }));
    await user.click(await within(code('CH-11510')!).findByRole('button', { name: /^Governors Club/ }));
    await waitFor(() => expect(code('CH-11311')).toHaveTextContent('Governors Club has no tees'));
    late({ ok: true, data: PREVIEW_SETUP_TEES.finley! });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole('button', { name: /Play the Blue tees/ })).toBeNull();
  });

  it('9 holes: the back nine is chosen and totalled', async () => {
    const { user } = setup();
    await pickFinleyBlue(user);
    await user.click(within(screen.getByRole('radiogroup', { name: 'Holes' })).getByRole('radio', { name: '9 holes' }));
    await user.click(screen.getByRole('radio', { name: 'Back 9' }));
    expect(screen.getByRole('radiogroup', { name: 'Hole 10 par' })).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Hole 1 par' })).toBeNull();
    expect(dock()).toHaveTextContent('9 holes · Par 36');
  });

  it('CH-11209 the library didn’t load, with Try again', async () => {
    const listCourses = vi.fn().mockReturnValueOnce(fail()).mockReturnValue(ok(PREVIEW_SETUP_COURSES));
    const { user } = setup({ listCourses });
    await user.click(screen.getByRole('button', { name: /Browse courses/ }));
    await waitFor(() => expect(code('CH-11209')).toHaveTextContent("The course library didn't load"));
    await user.click(within(code('CH-11209')!).getByRole('button', { name: /Try again/ }));
    expect(await screen.findByRole('region', { name: 'Recently played' })).toBeInTheDocument();
  });

  it('CH-11208 the tees didn’t load; CH-11311 a course with no playable tees', async () => {
    const { user } = setup({ listTees: vi.fn((id: string) => (id === 'finley' ? fail() : ok(PREVIEW_SETUP_TEES[id] ?? []))) });
    await user.click(screen.getByRole('button', { name: /Browse courses/ }));
    await user.click(await within(code('CH-11510')!).findByRole('button', { name: /^Finley GC/ }));
    await waitFor(() => expect(code('CH-11208')).toHaveTextContent("The tees at Finley GC didn't load"));
    await user.click(screen.getByRole('button', { name: 'Courses' }));
    await user.click(await screen.findByRole('button', { name: /Chapel Ridge GC/ }));
    await waitFor(() => expect(code('CH-11311')).toHaveTextContent('Chapel Ridge GC has no tees ready to play yet'));
  });

  it('CH-11210 the scorecard didn’t load: Start waits, Try again reloads it', async () => {
    const teeHoles = vi
      .fn()
      .mockReturnValueOnce(fail())
      .mockReturnValue(ok(previewTeeHoles('finley-blue')));
    const { user } = setup({ teeHoles });
    await user.click(screen.getByRole('button', { name: /Browse courses/ }));
    await user.click(await within(code('CH-11510')!).findByRole('button', { name: /^Finley GC/ }));
    await user.click(await screen.findByRole('button', { name: /Play the Blue tees/ }));
    await waitFor(() => expect(code('CH-11210')).not.toBeNull());
    expect(dock()).toHaveTextContent('The scorecard didn’t load');
    expect(startBtn()).toBeDisabled();
    await user.click(within(code('CH-11210')!).getByRole('button', { name: /Try again/ }));
    await waitFor(() => expect(screen.getByRole('region', { name: 'Scorecard' })).toBeInTheDocument());
    expect(teeHoles).toHaveBeenLastCalledWith('finley-blue');
  });
});

describe('Round setup: details and starting', () => {
  it('Start sends the round and opens it; CH-11007 a failed start retries and still opens it', async () => {
    const start = vi
      .fn()
      .mockReturnValueOnce(fail('The server is busy'))
      .mockReturnValue(ok({ roundId: 'r-2' }));
    const { user, onStarted } = setup({ start });
    await pickFinleyBlue(user);
    await user.click(startBtn());
    await waitFor(() => expect(code('CH-11007')).toHaveTextContent("Couldn't start your round at Finley GC"));
    expect(onStarted).not.toHaveBeenCalled();
    expect(start.mock.calls[0]![0]).toMatchObject({ pick: { teeId: 'finley-blue' }, count: 18, type: 'practice', date: PREVIEW_SETUP_TODAY });
    await user.click(within(code('CH-11007')!).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(onStarted).toHaveBeenCalledWith('r-2'));
  });

  it('CH-11109 a date after today stops Start', async () => {
    const { user } = setup();
    await pickFinleyBlue(user);
    const date = screen.getByLabelText('Date');
    await user.clear(date);
    await user.type(date, '2026-10-20');
    expect(code('CH-11109')).not.toBeNull();
    expect(dock()).toHaveTextContent("The round's date can't be after today");
    expect(startBtn()).toBeDisabled();
  });

  it('the open qualifier plays its course and tees, and says which round it is', async () => {
    const { user, ports } = setup();
    await user.click(screen.getByRole('button', { name: /Fall qualifier 2/ }));
    await waitFor(() => expect(screen.getByRole('region', { name: 'Scorecard' })).toBeInTheDocument());
    expect(ports.teeHoles).toHaveBeenCalledWith('finley-blue');
    expect(screen.getByText('This counts as round 3 of 3 in Fall qualifier 2.')).toBeInTheDocument();
    expect(within(screen.getByRole('radiogroup', { name: 'Round type' })).getByRole('radio', { name: 'Qualifier' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /Pinehurst travel qualifier/ })).toBeDisabled();
  });

  it('CH-11312 no qualifier open; CH-11211 the qualifiers didn’t load', async () => {
    const first = setup({}, []);
    await first.user.click(screen.getByRole('radio', { name: 'Qualifier' }));
    expect(code('CH-11312')).toHaveTextContent('No qualifier is open for you right now');
    document.body.innerHTML = '';
    const second = setup({}, null);
    await second.user.click(screen.getByRole('radio', { name: 'Qualifier' }));
    expect(code('CH-11211')).toHaveTextContent("Your qualifiers didn't load");
  });

  it('CH-11511 a course typed in by hand becomes the round’s, saved when asked', async () => {
    const { user, ports } = setup();
    await user.click(screen.getByRole('button', { name: /Browse courses/ }));
    await user.click(await screen.findByRole('button', { name: /Add a course/ }));
    const sheet = code('CH-11511')!;
    const next = () => within(sheet).getByRole('button', { name: /Next|Use this course/ });
    expect(next()).toBeDisabled();
    await user.type(within(sheet).getByLabelText('Course name'), 'Chapel Ridge GC');
    await user.click(within(sheet).getByRole('radio', { name: '9 holes' }));
    await user.click(next());
    await user.click(within(sheet).getByRole('radio', { name: 'Blue' }));
    expect(within(sheet).getByLabelText('Tee name')).toHaveValue('Blue');
    await user.click(next());
    expect(code('CH-11108')).toHaveTextContent('Hole 1 needs a yardage');
    for (let n = 1; n <= 9; n++) await user.type(within(sheet).getByLabelText(`Hole ${n} yardage`), String(300 + n));
    await user.click(next());
    expect(within(sheet).getByText('Chapel Ridge GC')).toBeInTheDocument();
    expect(within(sheet).getByRole('checkbox')).toBeChecked();
    await user.click(next());
    expect(dock()).toHaveTextContent('Chapel Ridge GC · Blue · 9 holes · Par 36');
    await user.click(startBtn());
    await waitFor(() => expect(ports.start).toHaveBeenCalled());
    expect(vi.mocked(ports.start).mock.calls[0]![0]).toMatchObject({ pick: { courseId: null, teeId: null, courseName: 'Chapel Ridge GC' }, count: 9, saveCourse: true });
  });
});
