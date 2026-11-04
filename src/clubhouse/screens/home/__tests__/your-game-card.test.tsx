import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LEG_TREND, SHS_LEG_TREND } from '../../../data/leg-rows';
import { PREVIEW_PLAYER_HOME } from '../../../preview/fixtures-player-home';
import { previewShsHome } from '../../../preview/fixtures-stats-redesign';
import { ownLegHref, PlayerGame } from '../PlayerGame';

describe('Your game with the flag on', () => {
  it('reads ten rounds; the flag off keeps seven', () => {
    expect(SHS_LEG_TREND).toBe(10);
    expect(LEG_TREND).toBe(7);
  });
  it('each leg links to its part', () => {
    expect(ownLegHref('tee')).toBe('/golf/dashboard/stats#gm-tee');
    render(<PlayerGame data={PREVIEW_PLAYER_HOME} phone shs />);
    expect(document.querySelectorAll('a[data-ch="home-leg"]')).toHaveLength(4);
  });
  it('shows no pill under the third round', () => {
    render(<PlayerGame data={previewShsHome('early')!} phone shs />);
    expect(screen.queryByText(/ SG$/)).toBeNull();
    expect(screen.getByText(/starts from the third round/)).toBeTruthy();
  });
  it('the flag off draws no leg link', () => {
    render(<PlayerGame data={PREVIEW_PLAYER_HOME} phone />);
    expect(document.querySelectorAll('a[data-ch="home-leg"]')).toHaveLength(0);
  });
});
