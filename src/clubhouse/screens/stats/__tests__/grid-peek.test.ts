import { describe, expect, it } from 'vitest';
import { PREVIEW_TEAM_DEMO } from '../../../preview/fixtures-stats';
import { gridPeek } from '../links';

describe('team grid peek', () => {
  it('carries the row\'s last round, so the hover card is not "Last round —" for a player who has one', () => {
    const tyler = PREVIEW_TEAM_DEMO.grid.find((g) => g.id === 'tyler')!;
    const peek = gridPeek(tyler);
    expect(peek.lastRound).toEqual(tyler.last);
    expect(peek.lastRound?.score).toBeGreaterThan(0);
    expect(peek.avg).toBe(tyler.avg);
  });

  it('is null (the card says so) only when the window has no scored round', () => {
    const owen = PREVIEW_TEAM_DEMO.grid.find((g) => g.id === 'owen')!;
    expect(gridPeek(owen).lastRound).toBeNull();
    expect(gridPeek({ id: 'x', name: 'X', rounds: 1, avg: null }).lastRound).toBeNull();
  });
});
