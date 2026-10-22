import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { memberValue, toChTeamPatterns } from '../data/coachhelm-team-pattern';
import { PREVIEW_TEAM_PATTERNS } from '../preview/fixtures-coachhelm-patterns';
import { TeamPatterns } from '../screens/coachhelm/TeamPatterns';

describe('Team patterns (Slice 7b)', () => {
  it('maps nothing to no section', () => {
    expect(toChTeamPatterns({ patterns: [], below_threshold: 0, roster_with_reads: 3, roster_total: 5 }, new Map())).toBeNull();
  });

  it('formats member numbers in the read unit', () => {
    expect(memberValue(41.26, 'percent')).toBe('41.3%');
    expect(memberValue(1, 'strokes')).toBe('1 stroke');
    expect(memberValue(null, 'percent')).toBeNull();
  });

  it('the preview fixture runs the real computation: two patterns, one counted below', () => {
    const d = PREVIEW_TEAM_PATTERNS!;
    expect(d.rows.map((r) => r.title)).toEqual(['Approaches 50–125 yd · finishing short', 'Putts made 5–10 ft']);
    expect(d.rows[0]!.members).toBe('3 of 5 players with enough rounds');
    expect(d.rows[0]!.strokes).toBe('about 1.1 strokes a round across the team');
    expect(d.below).toBe('1 more read is shared by too few players to call a team pattern.');
  });

  it('draws the rows with the members behind a disclosure', () => {
    render(<TeamPatterns data={PREVIEW_TEAM_PATTERNS!} />);
    expect(screen.getByRole('heading', { name: 'Team patterns' })).toBeTruthy();
    expect(screen.getByText('Approaches 50–125 yd · finishing short')).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Players in Approaches 50–125 yd · finishing short' }).querySelectorAll('li')).toHaveLength(3);
    expect(screen.getByText('5 of 5 players have enough rounds for reads.')).toBeTruthy();
  });

  it('says so when nothing reaches the threshold', () => {
    render(<TeamPatterns data={{ rows: [], below: null, reach: '2 of 5 players have enough rounds for reads.' }} />);
    expect(screen.getByText('No read is shared by enough players to call a team pattern.')).toBeTruthy();
  });
});
