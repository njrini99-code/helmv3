import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** F-0034 (audit 2026-10-29): Home's player links prefetch the player's stats on press, and the first rows while idle. */
vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
import { PREVIEW_HOME } from '../../../preview/fixtures';
import { Leaderboard } from '../Leaderboard';

afterEach(cleanup);

describe('Home player links are fetched ahead (F-0034)', () => {
  it('each leaderboard name is marked data-ch-ahead with the player’s stats', () => {
    render(<Leaderboard data={PREVIEW_HOME.leaderboard} />);
    const first = PREVIEW_HOME.leaderboard.rows[0]!;
    const link = screen.getAllByRole('link').find((a) => a.textContent?.includes(first.name))!;
    expect(link.getAttribute('data-ch-ahead')).toBe(`/golf/dashboard/stats?player=${first.playerId}`);
  });
});
