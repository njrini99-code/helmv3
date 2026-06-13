/**
 * TeamSwitcher — render-mode + gating contract.
 *
 *   - PILL toggle ("Men's | Women's") when exactly 2 teams with distinct
 *     genders; active segment is the helm-green filled pill.
 *   - DROPDOWN fallback for >2 teams or missing/duplicate genders.
 *   - Renders NOTHING when canSwitch is false (assistants, single-team head
 *     coaches) or when only one team exists.
 *   - Selecting the inactive segment calls the setActiveTeam server action.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const setActiveTeamMock = vi.fn(async (_teamId: string) => ({ success: true as const }));
vi.mock('@/app/golf/actions/team-switcher', () => ({
  setActiveTeam: (teamId: string) => setActiveTeamMock(teamId),
}));

import { TeamSwitcher } from '../TeamSwitcher';

const MENS = { id: 'team-m', name: "Men's Golf", gender: 'mens' };
const WOMENS = { id: 'team-w', name: "Women's Golf", gender: 'womens' };
const THIRD = { id: 'team-x', name: 'Development Squad', gender: 'mens' };

describe('TeamSwitcher', () => {
  beforeEach(() => {
    setActiveTeamMock.mockClear();
  });

  it("renders the Men's | Women's pill toggle for exactly 2 teams with distinct genders", () => {
    render(<TeamSwitcher teams={[WOMENS, MENS]} activeTeamId="team-m" canSwitch />);

    const group = screen.getByRole('radiogroup', { name: 'Switch team view' });
    expect(group).toBeInTheDocument();

    const mens = screen.getByRole('radio', { name: /Men's team/ });
    const womens = screen.getByRole('radio', { name: /Women's team/ });
    expect(mens).toHaveAttribute('aria-checked', 'true');
    expect(womens).toHaveAttribute('aria-checked', 'false');

    // Men's segment comes first (label order "Men's | Women's").
    const radios = screen.getAllByRole('radio');
    expect(radios[0]).toHaveTextContent("Men's");
    expect(radios[1]).toHaveTextContent("Women's");
  });

  it('clicking the inactive segment calls setActiveTeam with that team id', async () => {
    render(<TeamSwitcher teams={[MENS, WOMENS]} activeTeamId="team-m" canSwitch />);

    fireEvent.click(screen.getByRole('radio', { name: /Women's team/ }));

    await waitFor(() => {
      expect(setActiveTeamMock).toHaveBeenCalledWith('team-w');
    });
  });

  it('clicking the ACTIVE segment is a no-op', async () => {
    render(<TeamSwitcher teams={[MENS, WOMENS]} activeTeamId="team-m" canSwitch />);

    fireEvent.click(screen.getByRole('radio', { name: /Men's team/ }));

    await waitFor(() => {
      expect(setActiveTeamMock).not.toHaveBeenCalled();
    });
  });

  it('falls back to the dropdown for >2 teams', () => {
    render(<TeamSwitcher teams={[MENS, WOMENS, THIRD]} activeTeamId="team-m" canSwitch />);

    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Switch active team' })).toBeInTheDocument();
  });

  it('falls back to the dropdown when the 2 teams share a gender', () => {
    render(
      <TeamSwitcher
        teams={[MENS, { ...THIRD, id: 'team-m2' }]}
        activeTeamId="team-m"
        canSwitch
      />,
    );

    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Switch active team' })).toBeInTheDocument();
  });

  it('falls back to the dropdown when a gender is missing', () => {
    render(
      <TeamSwitcher
        teams={[MENS, { id: 'team-u', name: 'Unset', gender: '' }]}
        activeTeamId="team-m"
        canSwitch
      />,
    );

    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Switch active team' })).toBeInTheDocument();
  });

  it('renders NOTHING when canSwitch is false (multi-team assistant)', () => {
    const { container } = render(
      <TeamSwitcher teams={[MENS, WOMENS]} activeTeamId="team-m" canSwitch={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders NOTHING for a single team (women's head coach) even when canSwitch is erroneously true", () => {
    const { container } = render(
      <TeamSwitcher teams={[WOMENS]} activeTeamId="team-w" canSwitch />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('pill segments meet the 44px tap-target minimum', () => {
    render(<TeamSwitcher teams={[MENS, WOMENS]} activeTeamId="team-m" canSwitch />);
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio.className).toContain('min-h-[44px]');
    }
  });

  it('active pill segment is the filled accent (white text + shadow); inactive is transparent warm', () => {
    render(<TeamSwitcher teams={[MENS, WOMENS]} activeTeamId="team-m" canSwitch />);
    const mens = screen.getByRole('radio', { name: /Men's team/ });
    const womens = screen.getByRole('radio', { name: /Women's team/ });
    // Active = filled accent pill: white text + soft shadow (the fill colour is
    // applied via an inline team-accent var, asserted in team-theme.test.ts).
    expect(mens.className).toContain('text-white');
    expect(mens.className).toContain('shadow-soft');
    expect(mens.getAttribute('style') ?? '').toMatch(/background/i);
    // Inactive = transparent warm.
    expect(womens.className).toContain('bg-transparent');
    expect(womens.className).toContain('text-warm-500');
  });

  it('flips optimistically and reports the picked gender via onOptimisticSwitch', async () => {
    const onOptimisticSwitch = vi.fn();
    render(
      <TeamSwitcher teams={[MENS, WOMENS]} activeTeamId="team-m" canSwitch onOptimisticSwitch={onOptimisticSwitch} />,
    );

    fireEvent.click(screen.getByRole('radio', { name: /Women's team/ }));

    // Optimistic: women's becomes checked immediately (before any refresh).
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /Women's team/ })).toHaveAttribute('aria-checked', 'true');
    });
    expect(screen.getByRole('radio', { name: /Men's team/ })).toHaveAttribute('aria-checked', 'false');
    expect(onOptimisticSwitch).toHaveBeenCalledWith('womens');
  });
});
