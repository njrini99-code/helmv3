import '../../../__tests__/dialog-polyfill';
import { LazyMotion, domAnimation } from 'motion/react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PREVIEW_TEAM_STATS } from '../../../preview/fixtures-stats';
import { usePageKeysNow } from '../../../shell/command/page-keys';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }) }));
vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));

const { TeamCharts } = await import('../StatsTeamIslands');

afterEach(cleanup);

/** What the shortcuts sheet would list under "On {page}". */
let sheet: ReturnType<typeof usePageKeysNow> = null;
function SheetProbe() {
  const now = usePageKeysNow();
  useEffect(() => {
    sheet = now;
  }, [now]);
  return null;
}

describe('Stats team · the player list walks with the arrow keys (B11, row 63)', () => {
  it('Up and Down walk the players, Home and End go to the ends, the list is one Tab stop, and the sheet lists the keys', () => {
    render(
      <LazyMotion features={domAnimation}>
        <div className="ch-root" data-ui="clubhouse">
          <TeamCharts data={PREVIEW_TEAM_STATS} />
          <SheetProbe />
        </div>
      </LazyMotion>,
    );
    const rows = [...document.querySelectorAll<HTMLElement>('.ch-lg__tbl .ch-lg__a')];
    expect(rows.length).toBeGreaterThan(2);
    expect(rows.filter((r) => r.tabIndex === 0)).toHaveLength(1);
    act(() => rows[0]!.focus());
    fireEvent.keyDown(rows[0]!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rows[1]);
    fireEvent.keyDown(rows[1]!, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(rows[0]);
    fireEvent.keyDown(rows[0]!, { key: 'End' });
    expect(document.activeElement).toBe(rows.at(-1));
    fireEvent.keyDown(rows.at(-1)!, { key: 'Home' });
    expect(document.activeElement).toBe(rows[0]);
    expect(sheet).toEqual({ page: 'Stats', keys: [{ label: 'Move between players', keys: ['Up', 'Down'] }] });
    expect(screen.getByRole('table', { name: 'Strokes gained by leg per player' })).toBeTruthy();
  });
});
