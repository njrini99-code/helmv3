import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
const phone = vi.hoisted(() => ({ on: true }));
vi.mock('../lib/use-phone', () => ({ useChPhone: () => phone.on }));

import { DockProvider, PhoneDock, ResumeRoundCard, resumeRoundLabel, ThumbDock } from '../shell/Dock';
import { PhoneChromeProvider, usePhoneImmersive } from '../shell/phone-chrome';

const ROUND = { id: '6f1c2a8e-4b5d-4c3e-9f7a-1b2c3d4e5f60', course: 'Oakmont CC', hole: 7 };
const code = (c: string) => document.querySelector<HTMLElement>(`[data-ch-code="${c}"]`);

function Immersive() {
  usePhoneImmersive(true);
  return null;
}

function Harness({ pathname = '/golf/dashboard', round = ROUND as typeof ROUND | null, children }: { pathname?: string; round?: typeof ROUND | null; children?: React.ReactNode }) {
  return (
    <PhoneChromeProvider>
      <DockProvider>
        <div className="ch-root">
          {children}
          <PhoneDock round={round} pathname={pathname} />
        </div>
      </DockProvider>
    </PhoneChromeProvider>
  );
}

afterEach(() => {
  phone.on = true;
});

describe('the phone dock (P001-C1)', () => {
  it('CH-1821: resumes the round in progress, named for the course and hole', () => {
    render(<Harness />);
    const link = screen.getByRole('link', { name: 'Resume round, Oakmont CC · Hole 7' });
    expect(link.getAttribute('href')).toBe(`/golf/dashboard/rounds/continue/${ROUND.id}`);
    expect(code('CH-1820')!.hidden).toBe(false);
  });

  it('CH-1821: is not offered on the round’s own screens, and the dock stays undrawn without one', () => {
    render(<Harness pathname={`/golf/dashboard/rounds/continue/${ROUND.id}`} />);
    expect(screen.queryByRole('link', { name: /Resume round/ })).toBeNull();
    expect(code('CH-1820')!.hidden).toBe(true);
  });

  it('CH-1820: hides with the tab bar under a pushed screen', () => {
    render(
      <Harness>
        <Immersive />
      </Harness>,
    );
    expect(code('CH-1820')!.hidden).toBe(true);
  });

  it('CH-1820: a page’s controls ride in the dock on a phone and stay out of it on desktop', () => {
    const { rerender } = render(
      <Harness round={null}>
        <ThumbDock label="Calendar view">
          <button type="button">Week</button>
        </ThumbDock>
      </Harness>,
    );
    const dock = code('CH-1820')!;
    expect(dock.hidden).toBe(false);
    expect(screen.getByRole('group', { name: 'Calendar view' }).closest('.ch-dock')).toBe(dock);
    act(() => {
      phone.on = false;
    });
    rerender(
      <Harness round={null}>
        <ThumbDock label="Calendar view">
          <button type="button">Week</button>
        </ThumbDock>
      </Harness>,
    );
    expect(screen.queryByRole('group', { name: 'Calendar view' })).toBeNull();
    expect(code('CH-1820')!.hidden).toBe(true);
  });

  it('CH-1822: the desktop sidebar card resumes the round', () => {
    render(<ResumeRoundCard round={ROUND} />);
    expect(code('CH-1822')!.getAttribute('href')).toBe(`/golf/dashboard/rounds/continue/${ROUND.id}`);
    expect(resumeRoundLabel({ ...ROUND, hole: null })).toBe('Oakmont CC');
  });
});

describe('the dock and the keyboard (CH-1820)', () => {
  it('steps aside for a field on the page, never for a field in the dock', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const css = readFileSync(join(__dirname, '../styles/shell.css'), 'utf8');
    expect(css).toMatch(/\.ch-root:has\(\.ch-canvas input:focus\) \.ch-dock/);
    expect(css).not.toMatch(/\.ch-root:has\(input:focus\) \.ch-dock/);
    expect(css).toMatch(/body\.keyboard-open \[data-ui='clubhouse'\] \.ch-dock:has\(:focus\) \{\s*bottom: calc\(var\(--keyboard-height, 0px\) \+ 8px\);/);
  });
});
