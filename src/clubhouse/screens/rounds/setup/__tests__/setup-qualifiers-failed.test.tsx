import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PREVIEW_SETUP_COURSES, PREVIEW_SETUP_TEES, PREVIEW_SETUP_TODAY, previewTeeHoles } from '../../../../preview/fixtures-setup';
import { RoundSetup } from '../RoundSetup';
import type { ChSetupPorts, ChSetupQualifier } from '../shape';
import { ToastProvider } from '../../../../ui/Toast';
import '../../../../__tests__/dialog-polyfill';

/** F-0013 (audit 2026-10-29): a qualifier list that failed to load looked like "no qualifier"; it says so up front, with Try again. */
const ok = <T,>(data: T) => Promise.resolve({ ok: true as const, data });
function show(qualifiers: ChSetupQualifier[] | null) {
  const ports: ChSetupPorts = {
    listCourses: vi.fn(() => ok(PREVIEW_SETUP_COURSES)),
    listTees: vi.fn((id: string) => ok(PREVIEW_SETUP_TEES[id] ?? [])),
    teeHoles: vi.fn((id: string) => ok(previewTeeHoles(id))),
    start: vi.fn(() => ok({ roundId: 'r-1' })),
  };
  render(
    <ToastProvider>
      <RoundSetup ports={ports} qualifiers={qualifiers} today={PREVIEW_SETUP_TODAY} backHref="/golf/dashboard/rounds" onStarted={vi.fn()} />
    </ToastProvider>,
  );
}
const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`) as HTMLElement | null;

describe('New round when the qualifier list fails (F-0013)', () => {
  it('a practice round shows CH-11211 with Try again on first render', () => {
    show(null);
    const notice = code('CH-11211');
    expect(notice).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('a list that loaded empty shows neither', () => {
    show([]);
    expect(code('CH-11211')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });
});
