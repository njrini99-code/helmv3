import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PREVIEW_ROSTER } from '../../../preview/fixtures-roster';
import { RosterSpread } from '../RosterSpread';

vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: false }) }));
afterEach(() => cleanup());

const ticks = () => Array.from(document.querySelectorAll('.ch-rs-sp__axis span')).map((s) => Number(s.textContent));

/** The team's pill sits on the axis row and reads its own value; a tick under it would show through ("Team ₇73.0"). */
describe('Roster spread axis', () => {
  it('leaves out the tick the team pill covers, and keeps the rest', () => {
    const players = PREVIEW_ROSTER.players;
    const { unmount } = render(<RosterSpread players={players} teamAvg={null} onOpen={() => {}} />);
    const all = ticks();
    unmount();
    expect(all.length).toBeGreaterThan(2);
    const at = all[Math.floor(all.length / 2)]!;
    render(<RosterSpread players={players} teamAvg={at} onOpen={() => {}} />);
    const shown = ticks();
    expect(shown).not.toContain(at);
    expect(shown.length).toBeGreaterThanOrEqual(all.length - 2);
    expect(document.querySelector('.ch-rs-sp__team span')!.textContent).toBe(`Team ${at.toFixed(1)}`);
  });
});
