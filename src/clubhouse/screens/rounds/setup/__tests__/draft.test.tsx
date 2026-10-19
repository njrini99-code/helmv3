import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PREVIEW_SETUP_COURSES, PREVIEW_SETUP_QUALIFIERS, PREVIEW_SETUP_TEES, PREVIEW_SETUP_TODAY, previewTeeHoles } from '../../../../preview/fixtures-setup';
import { RouteScope } from '../../../../lib/session-state';
import { ToastProvider } from '../../../../ui/Toast';
import { readSetupDraft, restoreSetupDraft, setupDraftKey, writeSetupDraft } from '../draft';
import { RoundSetup } from '../RoundSetup';
import type { ChSetupForm, ChSetupPorts } from '../shape';
import '../../../../__tests__/dialog-polyfill';

const ok = <T,>(data: T) => Promise.resolve({ ok: true as const, data });
const SCOPE = '/golf/dashboard/rounds/new\u0000team-1';
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

afterEach(() => window.sessionStorage.clear());

function mount(viewerId: string | null, scope = SCOPE, start: ChSetupPorts['start'] = vi.fn(() => ok({ roundId: 'r-1' }))) {
  const ports: ChSetupPorts = {
    listCourses: vi.fn(() => ok(PREVIEW_SETUP_COURSES)),
    listTees: vi.fn((id: string) => ok(PREVIEW_SETUP_TEES[id] ?? [])),
    teeHoles: vi.fn((id: string) => ok(previewTeeHoles(id))),
    start,
  };
  return render(
    <RouteScope value={scope}>
      <ToastProvider>
        <RoundSetup ports={ports} qualifiers={PREVIEW_SETUP_QUALIFIERS} today={PREVIEW_SETUP_TODAY} backHref="/golf/dashboard/rounds" onStarted={() => {}} viewerId={viewerId} />
      </ToastProvider>
    </RouteScope>,
  );
}
const dock = () => document.getElementById('ch-rsu-dock-s')!;

async function pickFinleyBlue(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Browse courses/ }));
  await user.click(await within(document.querySelector('[data-ch-code="CH-11510"]') as HTMLElement).findByRole('button', { name: /^Finley GC/ }));
  await user.click(await screen.findByRole('button', { name: /Play the Blue tees/ }));
  await waitFor(() => expect(screen.getByRole('region', { name: 'Scorecard' })).toBeInTheDocument());
}

describe('New round setup kept for the tab', () => {
  it('is keyed by the page, its team and the signed-in player, and kept by none without both', () => {
    expect(setupDraftKey(SCOPE, 'p1')).not.toBe(setupDraftKey(SCOPE, 'p2'));
    expect(setupDraftKey(SCOPE, 'p1')).not.toBe(setupDraftKey('/golf/dashboard/rounds/new\u0000team-2', 'p1'));
    expect(setupDraftKey('', 'p1')).toBeNull();
    expect(setupDraftKey(SCOPE, null)).toBeNull();
  });

  it('keeps no photo, and no course whose scorecard has not landed', () => {
    const key = setupDraftKey(SCOPE, 'p1');
    writeSetupDraft(key, { ...form, coursePhoto: new File(['x'], 'c.jpg') });
    expect(readSetupDraft(key)).not.toHaveProperty('coursePhoto');
    writeSetupDraft(key, { ...form, holes: [] });
    expect(readSetupDraft(key)!.pick).toBeNull();
  });

  it('a kept qualifier that is no longer open comes back as a practice round', () => {
    const closed = restoreSetupDraft({ ...form, type: 'qualifier', qualifierId: 'gone', qualifierRound: 2 }, PREVIEW_SETUP_QUALIFIERS);
    expect(closed).toMatchObject({ type: 'practice', qualifierId: null, qualifierRound: null });
  });

  it('Back and return brings the course and tees back for the same player, never for another', async () => {
    const user = userEvent.setup();
    const first = mount('p1');
    await pickFinleyBlue(user);
    expect(dock()).toHaveTextContent('Finley GC · Blue · 18 holes');
    first.unmount();

    const again = mount('p1');
    await waitFor(() => expect(dock()).toHaveTextContent('Finley GC · Blue · 18 holes · Par 72'));
    again.unmount();

    mount('p2');
    expect(screen.getByRole('button', { name: /Browse courses/ })).toBeInTheDocument();
    expect(dock()).not.toHaveTextContent('Finley GC');
  });

  it('a round that starts clears it; a start that fails keeps it', async () => {
    const user = userEvent.setup();
    const key = setupDraftKey(SCOPE, 'p1');
    const failing = mount('p1', SCOPE, vi.fn(() => Promise.resolve({ ok: false as const, error: 'nope' })));
    await pickFinleyBlue(user);
    await user.click(screen.getByRole('button', { name: /Start round/ }));
    await waitFor(() => expect(readSetupDraft(key)?.pick?.courseName).toBe('Finley GC'));
    failing.unmount();

    const start = vi.fn(() => ok({ roundId: 'r-1' }));
    mount('p1', SCOPE, start);
    await waitFor(() => expect(dock()).toHaveTextContent('Finley GC'));
    await user.click(screen.getByRole('button', { name: /Start round/ }));
    await waitFor(() => expect(start).toHaveBeenCalled());
    await waitFor(() => expect(readSetupDraft(key)).toBeNull());
  });
});
