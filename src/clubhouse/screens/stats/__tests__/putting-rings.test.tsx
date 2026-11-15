import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PuttingRings } from '../charts';
import { puttBelowTour } from '../putt-bands';

/**
 * Stats Team's putting rings (stats and charts audit 2026-11-15, CH-18): one rule with the Putting bands chart on the same page,
 * a band grades against the Tour from 30 putts, and every band is a ring (the sixth, longest band never drew).
 */
afterEach(cleanup);

const band = (label: string, made: number, attempts: number, bench: number | null = 50) => ({ label, made, attempts, bench });
const SIX = [band('0–3 ft', 40, 41, 99), band('3–5 ft', 30, 36, 88), band('5–10 ft', 14, 40, 56), band('10–15 ft', 6, 30, 30), band('15–25 ft', 4, 31, 15), band('25+ ft', 1, 32, 5)];

describe('PuttingRings · one rule, every band (CH-18)', () => {
  it('six bands draw six rings and six labels', () => {
    const { container } = render(<PuttingRings bands={SIX} />);
    expect(container.querySelectorAll('.ch-pg-ring')).toHaveLength(6);
    expect([...container.querySelectorAll('.ch-pg-band')].map((t) => t.textContent)).toEqual(SIX.map((b) => b.label));
  });

  it('a band of 12 putts well under the Tour has no grade; the same rate over 30 putts does', () => {
    expect(puttBelowTour(band('5–10 ft', 3, 12, 56))).toBe(false);
    expect(puttBelowTour(band('5–10 ft', 8, 32, 56))).toBe(true);
    const { container } = render(<PuttingRings bands={[band('5–10 ft', 3, 12, 56), band('10–15 ft', 4, 32, 30)]} />);
    expect(container.querySelectorAll('.ch-pg-pct.is-below')).toHaveLength(1);
  });
});

describe('Team putting bars · every band the note names (CH-18)', () => {
  it('the preview team’s six bands draw six rows, so the 25+ ft band the note calls below the Tour is on screen', async () => {
    const { Putting } = await import('../StatsTeamPhone');
    const { PREVIEW_TEAM_STATS } = await import('../../../preview/fixtures-stats');
    const bands = PREVIEW_TEAM_STATS.putting!.bands;
    expect(bands).toHaveLength(6);
    const { container } = render(<Putting data={PREVIEW_TEAM_STATS} covered={false} />);
    const rows = [...container.querySelectorAll('.ch-stm-putt__r')].map((r) => r.querySelector('span')!.textContent);
    expect(rows).toEqual(bands.map((b) => b.label));
    const note = container.querySelector('.ch-stm-note')!.textContent!;
    for (const b of bands.filter(puttBelowTour)) expect(note).toContain(b.label.replace(' ft', ' ft'));
  });
});
