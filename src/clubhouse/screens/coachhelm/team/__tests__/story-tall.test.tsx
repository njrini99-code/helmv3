import { act, cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StoriesCard } from '../Stories';

vi.mock('../../../../lib/use-phone', () => ({ useChPhone: () => true }));

const brief = {
  week: 'Week of Oct 26',
  counts: null,
  reads: [
    { id: 'r1', kind: 'read', who: 'Eli Brandt', title: 'Two doubles from penalties', href: '/x', behind: 'Both drives went into the hazard.', next: null },
    { id: 'r2', kind: 'read', who: 'Cole Bennett', title: 'Putting cost him three', href: '/y', behind: 'Three three-putts.', next: null },
  ],
  working: [],
} as never;

function openViewer() {
  render(<StoriesCard brief={brief} themes={null} failed={false} players={[]} phone rounds={null} autoOpen onDesk={() => {}} onAction={() => {}} />);
  return document.querySelector('.story') as HTMLElement;
}

describe('a story body too tall for the screen (MOB-TEAM-3)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('scrolls, and the timer waits for the reader', () => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(900);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(400);
    vi.useFakeTimers();
    const viewer = openViewer();
    const body = viewer.querySelector('.sto-b') as HTMLElement;
    expect(body.className).toContain('is-tall');
    const before = screen.getByRole('dialog').getAttribute('aria-label');
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe(before);
  });

  it('a story that fits keeps the viewer owning the drag', () => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(400);
    const viewer = openViewer();
    expect((viewer.querySelector('.sto-b') as HTMLElement).className).not.toContain('is-tall');
  });

  it('CSS lets only the tall body pan, centred without clipping its top', () => {
    const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/coachhelm-team.css'), 'utf8');
    expect(css).toMatch(/\.sto-b\.is-tall \{\s*touch-action: pan-y;/);
    expect(css).toMatch(/\.sto-b \{[^}]*justify-content:safe center/);
  });
});
