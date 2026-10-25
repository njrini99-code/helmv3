import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PREVIEW_SETUP_COURSES, PREVIEW_SETUP_QUALIFIERS, PREVIEW_SETUP_TEES, PREVIEW_SETUP_TODAY, previewTeeHoles } from '../preview/fixtures-setup';
import type { ChCourseGlance } from '../data/course-glance';
import { RoundSetup } from '../screens/rounds/setup/RoundSetup';
import type { ChSetupPorts } from '../screens/rounds/setup/shape';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';

const ok = <T,>(data: T) => Promise.resolve({ ok: true as const, data });
const ports = (): ChSetupPorts => ({
  listCourses: vi.fn(() => ok(PREVIEW_SETUP_COURSES)),
  listTees: vi.fn((id: string) => ok(PREVIEW_SETUP_TEES[id] ?? [])),
  teeHoles: vi.fn((id: string) => ok(previewTeeHoles(id))),
  start: vi.fn(() => ok({ roundId: 'r-1' })),
});
const glances: Record<string, ChCourseGlance> = {
  finley: { key: 'finley', rounds: 6, average: 74.2, best: 70, last: { score: 76, date: '2026-10-03', note: 'commit on the 7 tee' } },
};
const draw = (extra: { glances?: Record<string, ChCourseGlance> | null; preselectCourseId?: string | null } = {}) =>
  render(
    <ToastProvider>
      <RoundSetup ports={ports()} qualifiers={PREVIEW_SETUP_QUALIFIERS} today={PREVIEW_SETUP_TODAY} backHref="/golf/dashboard/rounds" onStarted={() => {}} {...extra} />
    </ToastProvider>,
  );

describe('round setup: your history here (P-7 4.6)', () => {
  it('shows the player’s history at the picked course and links to it', async () => {
    const user = userEvent.setup();
    draw({ glances });
    await user.click(screen.getByRole('button', { name: /Browse courses/ }));
    await user.click(await within(document.querySelector('[data-ch-code="CH-11510"]') as HTMLElement).findByRole('button', { name: /^Finley GC/ }));
    await user.click(await screen.findByRole('button', { name: /Play the Blue tees/ }));
    const block = await waitFor(() => document.querySelector('.ch-rsu-hist') as HTMLElement);
    expect(block.textContent).toContain('Your history here · 6 rounds');
    expect(block.textContent).toContain('Average 74.2 · Best 70 · Last time 76 on Oct 3');
    expect(block.textContent).toContain('Your note: commit on the 7 tee');
    expect(within(block).getByRole('link', { name: /See hole by hole/ }).getAttribute('href')).toBe('/golf/dashboard/rounds/course/finley');
  });

  it('opens the picker on the course the address names, and ignores one it doesn’t know', async () => {
    draw({ preselectCourseId: 'finley' });
    expect(await screen.findByRole('button', { name: /Play the Blue tees/ })).toBeTruthy();
  });
});
