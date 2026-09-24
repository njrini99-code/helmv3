// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/golf/actions/development', () => ({
  createFocusArea: vi.fn(),
  recordFocusAreaOutcome: vi.fn(),
}));

import { CoachGenomeView } from '../CoachGenomeView';
import { GenomeEmpty } from '../GenomeEmpty';
import { GenomeCompareStrands } from '../GenomeCompareStrands';
import { PlayerGenomeProfile } from '../PlayerGenomeProfile';
import { buildStrand, type StrandStandingInput } from '../strand-model';

function row(metric_id: string, over: Partial<StrandStandingInput> = {}): StrandStandingInput {
  return { metric_id, player_value: 0, team_avg: null, team_n: 8, team_pct: 50, pga_value: null, ...over };
}

const rows = [
  row('gir_pct', { player_value: 65, team_avg: 55, pga_value: 67 }),
  row('putts_made_3_5ft_pct', { player_value: 80, team_avg: 90, pga_value: 94 }),
  row('approach_proximity_125_175ft', {
    player_value: 30,
    team_avg: 32,
    pga_value: 27,
    pga_omitted: true,
    pga_omitted_reason: 'basis_mismatch',
  }),
];

function renderCoach(roundsOnFile: number) {
  const samples = { roundsOnFile, rounds90: 6 };
  return render(
    <CoachGenomeView
      playerId="p1"
      playerName="Owen Hart"
      firstName="Owen"
      traits={buildStrand(rows, samples)}
      samples={samples}
      archetype="Bomber off the tee, misses right"
      coachId="c1"
      tendencies={<div>tendencies</div>}
    />,
  );
}

describe('CoachGenomeView', () => {
  it('leads with name, archetype and a one-sentence verdict, with no composite score', () => {
    const { container } = renderCoach(24);
    expect(screen.getByRole('heading', { level: 1, name: 'Owen Hart' })).toBeTruthy();
    expect(screen.getByText('Bomber off the tee, misses right')).toBeTruthy();
    expect(screen.getByText(/^Owen is ahead of the team on 2 of 3 skills;/)).toBeTruthy();
    expect(container.textContent).not.toMatch(/composite|game strength/i);
    expect(container.textContent).not.toMatch(/\d+%\s*confidence/i);
    expect(container.querySelector('[data-slot="genome-strand"]')).toBeTruthy();
    // No radar.
    expect(container.querySelector('.recharts-polar-grid, [data-slot="genome-radar"]')).toBeNull();
  });

  it('draws a rung per trait and a Team / Tour switch', () => {
    const { container } = renderCoach(24);
    expect(container.querySelectorAll('[data-trait-id]').length).toBeGreaterThanOrEqual(19);
    const sw = screen.getByRole('radiogroup');
    expect(within(sw).getAllByRole('radio')).toHaveLength(2);
  });

  it('says the read is thin on a small sample, as a word with n', () => {
    renderCoach(4);
    expect(screen.getAllByText(/Thin read, n=4/).length).toBeGreaterThan(0);
  });
});

describe('GenomeEmpty', () => {
  it('is honest and offers exactly one action', () => {
    render(<GenomeEmpty playerId="a1" playerName="Audit Player" firstName="Audit" />);
    expect(screen.getByText('No rounds on file')).toBeTruthy();
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]!.getAttribute('href')).toBe('/golf/dashboard/messages?player=a1');
  });
});

describe('GenomeCompareStrands', () => {
  it('aligns two strands and ranks the splits', () => {
    const a = { playerId: 'a', name: 'Owen Hart', traits: buildStrand(rows, { roundsOnFile: 24, rounds90: null }), roundsOnFile: 24, genomeRefreshed: 'today', genomeRoundsBasis: 6 };
    const b = {
      playerId: 'b',
      name: 'Cole Park',
      traits: buildStrand([row('gir_pct', { player_value: 50, team_avg: 55 }), row('putts_made_3_5ft_pct', { player_value: 85, team_avg: 90 })], { roundsOnFile: 21, rounds90: null }),
      roundsOnFile: 21,
      genomeRefreshed: null,
      genomeRoundsBasis: null,
    };
    const { container } = render(<GenomeCompareStrands roster={[{ id: 'a', name: 'Owen Hart' }, { id: 'b', name: 'Cole Park' }]} a={a} b={b} />);
    expect(screen.getByText(/Owen leads on 1 of 2 skills they share|They split 1 and 1 across 2 shared skills/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Where they differ most' })).toBeTruthy();
    expect(container.querySelectorAll('[data-trait-id]').length).toBeGreaterThanOrEqual(38);
  });

  it('asks for players when none are picked', () => {
    render(<GenomeCompareStrands roster={[]} a={null} b={null} />);
    expect(screen.getByText(/Pick two players/)).toBeTruthy();
  });
});

describe('PlayerGenomeProfile', () => {
  it('shows the shape in words, with no score numbers', () => {
    const { container } = render(
      <PlayerGenomeProfile
        dimensions={[
          { id: 'driver_usage', label: 'Driver usage', score: 82, qualitative: 'Bomber' },
          { id: 'back_nine_delta', label: 'Back nine', score: 40, qualitative: 'Fades late' },
          { id: 'weather', label: 'Weather', score: null, qualitative: null },
        ]}
        strengths={[{ id: 'driver_usage', label: 'Driver usage', qualitative: 'Bomber' }]}
        watchouts={[]}
        courseProfile="You favour long courses."
        roundsBasis={12}
        roundFloor={8}
      />,
    );
    expect(screen.getByText('You favour long courses.')).toBeTruthy();
    expect(container.textContent).not.toMatch(/\b82\b|\b40\b/);
    expect(screen.getByText(/Needs more rounds: Weather/)).toBeTruthy();
  });

  it('shows an honest empty state with one action', () => {
    render(
      <PlayerGenomeProfile dimensions={[]} strengths={[]} watchouts={[]} courseProfile={null} roundsBasis={3} roundFloor={8} />,
    );
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Log a round' })).toBeTruthy();
  });
});
