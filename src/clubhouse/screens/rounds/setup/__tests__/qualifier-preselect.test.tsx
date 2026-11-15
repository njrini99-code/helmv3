import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PREVIEW_SETUP_COURSES, PREVIEW_SETUP_QUALIFIERS, PREVIEW_SETUP_TEES, PREVIEW_SETUP_TODAY, previewTeeHoles } from '../../../../preview/fixtures-setup';
import { RoundSetup } from '../RoundSetup';
import type { ChSetupForm, ChSetupPorts, ChSetupQualifier } from '../shape';
import { ToastProvider } from '../../../../ui/Toast';
import '../../../../__tests__/dialog-polyfill';

/**
 * Round type from the course (owner, 2026-11-11): when the course and tees just picked are exactly one open qualifier's,
 * Round type is set to Qualifier with a line saying why, and the player can change it. With no match, or several, the
 * type stays as it was (Practice). The page never chooses over a type the player chose.
 */
afterEach(cleanup);
const ok = <T,>(data: T) => Promise.resolve({ ok: true as const, data });
const FALL = PREVIEW_SETUP_QUALIFIERS[0]!;
const WHY = 'Set to Qualifier because this course and these tees are Fall qualifier 2’s.';

function setup(qualifiers: ChSetupQualifier[] | null = PREVIEW_SETUP_QUALIFIERS) {
  const start = vi.fn((_form: ChSetupForm) => ok({ roundId: 'r-1' }));
  const ports: ChSetupPorts = {
    listCourses: vi.fn(() => ok(PREVIEW_SETUP_COURSES)),
    listTees: vi.fn((id: string) => ok(PREVIEW_SETUP_TEES[id] ?? [])),
    teeHoles: vi.fn((id: string) => ok(previewTeeHoles(id))),
    start,
  };
  render(
    <ToastProvider>
      <RoundSetup ports={ports} qualifiers={qualifiers} today={PREVIEW_SETUP_TODAY} backHref="/golf/dashboard/rounds" onStarted={vi.fn()} />
    </ToastProvider>,
  );
  return { start, user: userEvent.setup() };
}
const type = (name: string) => within(screen.getByRole('radiogroup', { name: 'Round type' })).getByRole('radio', { name });
const checked = (name: string) => type(name).getAttribute('aria-checked') === 'true';
async function pickFinley(user: ReturnType<typeof userEvent.setup>, tees: 'Blue' | 'White', from: 'Browse courses' | 'Change course' = 'Browse courses') {
  await user.click(screen.getByRole('button', { name: from }));
  await user.click(await within(document.querySelector('[data-ch-code="CH-11510"]')!).findByRole('button', { name: /^Finley GC/ }));
  await user.click(await screen.findByRole('button', { name: new RegExp(`Play the ${tees} tees`) }));
  await waitFor(() => expect(screen.getByRole('region', { name: 'Scorecard' })).toBeInTheDocument());
}
const started = async (user: ReturnType<typeof userEvent.setup>, start: ReturnType<typeof setup>['start']) => {
  await user.click(screen.getByRole('button', { name: /Start round/ }));
  await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
  return start.mock.calls[0]![0];
};

describe('Round type follows the course when it is exactly one open qualifier’s', () => {
  it('one match: Qualifier is chosen, its round is set, and a line says why', async () => {
    const { start, user } = setup();
    expect(checked('Practice')).toBe(true);
    await pickFinley(user, 'Blue');
    expect(checked('Qualifier')).toBe(true);
    expect(screen.getByText(WHY)).toHaveAttribute('role', 'status');
    // The qualifier's name is held on one line (no-break spaces), so the sentence wraps before it, never inside it.
    expect(screen.getByText(WHY).textContent).toContain('Fall\u00a0qualifier\u00a02’s.');
    expect(within(screen.getByRole('radiogroup', { name: 'Qualifier' })).getByRole('radio', { name: /Fall qualifier 2/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('This counts as round 3 of 3 in Fall qualifier 2.')).toBeInTheDocument();
    // The offer to play it is gone: it is already what this round is.
    expect(screen.queryByRole('button', { name: /Open qualifier/ })).toBeNull();
    expect(await started(user, start)).toMatchObject({ type: 'qualifier', qualifierId: FALL.id, qualifierRound: 3, pick: { courseId: 'finley', teeId: 'finley-blue' } });
  });

  it('no match (the same course from other tees): the type stays Practice and nothing is said', async () => {
    const { start, user } = setup();
    await pickFinley(user, 'White');
    expect(checked('Practice')).toBe(true);
    expect(screen.queryByText(/Set to Qualifier/)).toBeNull();
    expect(screen.getByRole('button', { name: /Open qualifier/ })).toBeInTheDocument();
    expect(await started(user, start)).toMatchObject({ type: 'practice', qualifierId: null, qualifierRound: null });
  });

  it('several matches: the type stays Practice', async () => {
    const { user } = setup([FALL, { ...FALL, id: 'q-fall-3', name: 'Fall qualifier 3', nextRound: 1, completed: 0 }]);
    await pickFinley(user, 'Blue');
    expect(checked('Practice')).toBe(true);
    expect(screen.queryByText(/Set to Qualifier/)).toBeNull();
  });

  it('a qualifier with no round open, or whose list did not load, never sets the type', async () => {
    const closed = setup([{ ...FALL, nextRound: null, blocked: 'All 3 rounds are in.' }]);
    await pickFinley(closed.user, 'Blue');
    expect(checked('Practice')).toBe(true);
    cleanup();
    const failed = setup(null);
    await pickFinley(failed.user, 'Blue');
    expect(checked('Practice')).toBe(true);
    expect(screen.queryByText(/Set to Qualifier/)).toBeNull();
  });

  it('the player can change it, and the page does not choose again', async () => {
    const { start, user } = setup();
    await pickFinley(user, 'Blue');
    await user.click(type('Practice'));
    expect(checked('Practice')).toBe(true);
    expect(screen.queryByText(/Set to Qualifier/)).toBeNull();
    // Picking the same tees again leaves the player's choice alone.
    await pickFinley(user, 'Blue', 'Change course');
    expect(checked('Practice')).toBe(true);
    expect(await started(user, start)).toMatchObject({ type: 'practice', qualifierId: null, qualifierRound: null });
  });

  it('a type the player chose first is never replaced', async () => {
    const { start, user } = setup();
    await user.click(type('Tournament'));
    await pickFinley(user, 'Blue');
    expect(checked('Tournament')).toBe(true);
    expect(screen.queryByText(/Set to Qualifier/)).toBeNull();
    expect(await started(user, start)).toMatchObject({ type: 'tournament', qualifierId: null });
  });

  it('a type the page chose goes back to Practice when the course changes to one that is no qualifier’s', async () => {
    const { start, user } = setup();
    await pickFinley(user, 'Blue');
    expect(checked('Qualifier')).toBe(true);
    await pickFinley(user, 'White', 'Change course');
    expect(checked('Practice')).toBe(true);
    expect(screen.queryByText(/Set to Qualifier/)).toBeNull();
    expect(await started(user, start)).toMatchObject({ type: 'practice', qualifierId: null, qualifierRound: null, pick: { teeId: 'finley-white' } });
  });

  it('playing the qualifier from its offer says which round it is, not why the page chose', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /Fall qualifier 2/ }));
    await waitFor(() => expect(screen.getByRole('region', { name: 'Scorecard' })).toBeInTheDocument());
    expect(checked('Qualifier')).toBe(true);
    expect(screen.queryByText(/Set to Qualifier/)).toBeNull();
    expect(screen.getByText('This counts as round 3 of 3 in Fall qualifier 2.')).toBeInTheDocument();
  });
});
