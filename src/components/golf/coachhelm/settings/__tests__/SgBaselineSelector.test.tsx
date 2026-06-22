// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const getTeamSgBaseline = vi.fn();
const setTeamSgBaseline = vi.fn();

vi.mock('@/app/golf/actions/team-sg-baseline', () => ({
  getTeamSgBaseline: (...args: unknown[]) => getTeamSgBaseline(...args),
  setTeamSgBaseline: (...args: unknown[]) => setTeamSgBaseline(...args),
}));

import { SgBaselineSelector } from '@/components/golf/coachhelm/settings/SgBaselineSelector';

// jsdom doesn't implement scrollIntoView; the Select calls it when the dropdown opens.
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe('SgBaselineSelector', () => {
  beforeEach(() => {
    getTeamSgBaseline.mockReset();
    setTeamSgBaseline.mockReset();
  });

  it('loads the team baseline and reflects it in the selector', async () => {
    getTeamSgBaseline.mockResolvedValue({
      success: true,
      data: { baseline: 'womens', isExplicit: false, gender: 'womens' },
    });

    render(<SgBaselineSelector />);

    // After the async load resolves, the trigger shows the current baseline label.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Women/ })).toBeTruthy();
    });
    // Women's teams get the women's-default helper copy.
    expect(screen.getByText(/Women’s teams default to the Women’s baseline\./)).toBeTruthy();
  });

  it('persists a new baseline and shows the recomputed confirmation', async () => {
    getTeamSgBaseline.mockResolvedValue({
      success: true,
      data: { baseline: 'womens', isExplicit: false, gender: 'womens' },
    });
    setTeamSgBaseline.mockResolvedValue({ success: true });

    render(<SgBaselineSelector />);

    const trigger = await screen.findByRole('button', { name: /Women/ });
    fireEvent.click(trigger); // open the dropdown

    const pgaOption = await screen.findByRole('option', { name: /PGA Tour/ });
    fireEvent.click(pgaOption);

    await waitFor(() => {
      expect(setTeamSgBaseline).toHaveBeenCalledWith('pga_tour');
    });
    await waitFor(() => {
      expect(screen.getByText(/Saved — SG recomputed/)).toBeTruthy();
    });
  });

  it('surfaces a recoverable error (not a silent empty Select) when the load fails', async () => {
    // P085 — getTeamSgBaseline returns {success:false} when the team can't be
    // resolved. The component must show the error, not a silent empty selector.
    getTeamSgBaseline.mockResolvedValue({ success: false, error: 'No team assigned' });

    render(<SgBaselineSelector />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('No team assigned');
    });
    // The empty Select trigger must NOT render on load failure.
    expect(screen.queryByRole('button', { name: /baseline|PGA|Women|NCAA|Scratch/i })).toBeNull();
  });

  it('surfaces the error message when the save fails', async () => {
    getTeamSgBaseline.mockResolvedValue({
      success: true,
      data: { baseline: 'pga_tour', isExplicit: true, gender: 'mens' },
    });
    setTeamSgBaseline.mockResolvedValue({ success: false, error: 'Saved, but recompute failed — try again' });

    render(<SgBaselineSelector />);

    const trigger = await screen.findByRole('button', { name: /PGA Tour/ });
    fireEvent.click(trigger);

    const d1Option = await screen.findByRole('option', { name: /NCAA D1/ });
    fireEvent.click(d1Option);

    await waitFor(() => {
      expect(setTeamSgBaseline).toHaveBeenCalledWith('ncaa_d1');
    });
    await waitFor(() => {
      expect(screen.getByText(/recompute failed/)).toBeTruthy();
    });
  });
});
