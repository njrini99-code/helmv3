import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PREVIEW_SETUP_COURSES, PREVIEW_SETUP_QUALIFIERS, PREVIEW_SETUP_TEES, PREVIEW_SETUP_TODAY, previewTeeHoles } from '../preview/fixtures-setup';
import { RoundSetup } from '../screens/rounds/setup/RoundSetup';
import type { ChSetupHole, ChSetupPorts } from '../screens/rounds/setup/shape';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';

/**
 * The new-round screen's scorecard read (owner rule 4, 2026-10-01): the last tee choice wins. A slow answer for a tee the player has
 * moved on from is dropped, never shown under the new tee, and never over holes the player typed in by hand. Each case holds the reads
 * open and answers them out of order.
 */

type Holes = { ok: true; data: ChSetupHole[] };
const ok = <T,>(data: T) => Promise.resolve({ ok: true as const, data });

/** A read the test answers by hand, per tee. */
function deferred() {
  const open = new Map<string, (v: Holes) => void>();
  const teeHoles = vi.fn((teeId: string) => new Promise<Holes>((resolve) => open.set(teeId, resolve)));
  const answer = (teeId: string) => open.get(teeId)!({ ok: true, data: previewTeeHoles(teeId) });
  return { teeHoles, answer };
}

function setup(teeHoles: ChSetupPorts['teeHoles']) {
  const ports: ChSetupPorts = {
    listCourses: vi.fn(() => ok(PREVIEW_SETUP_COURSES)),
    listTees: vi.fn((id: string) => ok(PREVIEW_SETUP_TEES[id] ?? [])),
    teeHoles,
    start: vi.fn(() => ok({ roundId: 'r-1' })),
  };
  render(
    <ToastProvider>
      <RoundSetup ports={ports} qualifiers={PREVIEW_SETUP_QUALIFIERS} today={PREVIEW_SETUP_TODAY} backHref="/golf/dashboard/rounds" onStarted={vi.fn()} />
    </ToastProvider>,
  );
  return userEvent.setup();
}
const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`) as HTMLElement | null;
const dock = () => document.getElementById('ch-rsu-dock-s')!;
const yardOf = (n: number) => (screen.getByLabelText(`Hole ${n} yardage`) as HTMLInputElement).value;
type User = ReturnType<typeof userEvent.setup>;

async function openFinley(user: User, button: 'Browse courses' | 'Change course') {
  await user.click(screen.getByRole('button', { name: new RegExp(button) }));
  await user.click(await within(code('CH-11510')!).findByRole('button', { name: /^Finley GC/ }));
}
const playTee = async (user: User, tee: 'Blue' | 'White') => user.click(await screen.findByRole('button', { name: new RegExp(`Play the ${tee} tees`) }));

describe('Round setup: the last tee choice wins (rule 4)', () => {
  const white = previewTeeHoles('finley-white')[0]!.yards;

  it('a late answer for the first tee never replaces the holes of the second tee chosen after it', async () => {
    // The cases here tell the tees apart by hole 1's yardage, so the fixtures must differ (a guard on the test, not the screen).
    expect(previewTeeHoles('finley-blue')[0]!.yards).not.toBe(white);
    const { teeHoles, answer } = deferred();
    const user = setup(teeHoles);
    await openFinley(user, 'Browse courses');
    await playTee(user, 'Blue');
    await waitFor(() => expect(teeHoles).toHaveBeenCalledWith('finley-blue'));
    await openFinley(user, 'Change course');
    await playTee(user, 'White');
    await waitFor(() => expect(teeHoles).toHaveBeenCalledWith('finley-white'));

    // The second tee answers first; the first answers late.
    answer('finley-white');
    await waitFor(() => expect(yardOf(1)).toBe(white));
    answer('finley-blue');
    await new Promise((r) => setTimeout(r, 0));
    expect(yardOf(1)).toBe(white);
    expect(dock()).toHaveTextContent('Finley GC · White · 18 holes');
  });

  it('an answer for the first tee that lands before the second tee’s is dropped too: the card waits for the tee on screen, then shows it', async () => {
    const { teeHoles, answer } = deferred();
    const user = setup(teeHoles);
    await openFinley(user, 'Browse courses');
    await playTee(user, 'Blue');
    await waitFor(() => expect(teeHoles).toHaveBeenCalledWith('finley-blue'));
    await openFinley(user, 'Change course');
    await playTee(user, 'White');
    await waitFor(() => expect(teeHoles).toHaveBeenCalledWith('finley-white'));

    answer('finley-blue');
    await new Promise((r) => setTimeout(r, 0));
    // Still the second tee's scorecard on its way: nothing of the first tee is drawn, and Start waits.
    expect(code('CH-11405')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByLabelText('Hole 1 yardage')).toBeNull();
    expect(dock()).toHaveTextContent('Loading the scorecard');
    answer('finley-white');
    await waitFor(() => expect(yardOf(1)).toBe(white));
  });

  it('a failure for the first tee, late, does not turn the second tee’s scorecard into an error', async () => {
    const reads = new Map<string, (v: { ok: false; error: string } | Holes) => void>();
    const teeHoles = vi.fn((teeId: string) => new Promise<{ ok: false; error: string } | Holes>((resolve) => reads.set(teeId, resolve)));
    const user = setup(teeHoles as ChSetupPorts['teeHoles']);
    await openFinley(user, 'Browse courses');
    await playTee(user, 'Blue');
    await waitFor(() => expect(teeHoles).toHaveBeenCalledWith('finley-blue'));
    await openFinley(user, 'Change course');
    await playTee(user, 'White');
    await waitFor(() => expect(teeHoles).toHaveBeenCalledWith('finley-white'));

    reads.get('finley-white')!({ ok: true, data: previewTeeHoles('finley-white') });
    await waitFor(() => expect(yardOf(1)).toBe(white));
    reads.get('finley-blue')!({ ok: false, error: 'late and failed' });
    await new Promise((r) => setTimeout(r, 0));
    expect(code('CH-11210')).toBeNull();
    expect(yardOf(1)).toBe(white);
  });

  it('a late answer for a tee never overwrites the holes of a course the player typed in by hand afterwards', async () => {
    const { teeHoles, answer } = deferred();
    const user = setup(teeHoles);
    await openFinley(user, 'Browse courses');
    await playTee(user, 'Blue');
    await waitFor(() => expect(teeHoles).toHaveBeenCalledWith('finley-blue'));

    // Add a course by hand while the Blue card is still on its way.
    await user.click(screen.getByRole('button', { name: /Change course/ }));
    await user.click(await screen.findByRole('button', { name: /Add a course/ }));
    const sheet = code('CH-11511')!;
    const next = () => within(sheet).getByRole('button', { name: /Next|Use this course/ });
    await user.type(within(sheet).getByLabelText('Course name'), 'Chapel Ridge GC');
    await user.click(within(sheet).getByRole('radio', { name: '9 holes' }));
    await user.click(next());
    await user.click(within(sheet).getByRole('radio', { name: 'Blue' }));
    await user.click(next());
    for (let n = 1; n <= 9; n++) await user.type(within(sheet).getByLabelText(`Hole ${n} yardage`), String(300 + n));
    await user.click(next());
    await user.click(next());
    await waitFor(() => expect(dock()).toHaveTextContent('Chapel Ridge GC · Blue · 9 holes · Par 36'));
    expect(yardOf(1)).toBe('301');

    answer('finley-blue');
    await new Promise((r) => setTimeout(r, 0));
    expect(yardOf(1)).toBe('301');
    expect(dock()).toHaveTextContent('Chapel Ridge GC · Blue · 9 holes · Par 36');
  });
});
