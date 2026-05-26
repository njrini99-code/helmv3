/**
 * W37 — weekly recap template tests.
 *
 * Builder hits Supabase; template is pure HTML generation. Lock the
 * template behavior since formatToPar + HTML escaping bugs would
 * land directly in coach inboxes.
 */

import { describe, it, expect } from 'vitest';
import { buildWeeklyRecapHtml } from '@/lib/coachhelm/v3/recap/template';
import type { WeeklyRecap } from '@/lib/coachhelm/v3/recap/builder';

function makeRecap(over: Partial<WeeklyRecap> = {}): WeeklyRecap {
  return {
    team_id: 't-1',
    team_name: 'Eagles',
    coach_first_name: 'Sam',
    week_start_iso: '2026-05-19T00:00:00.000Z',
    week_end_iso: '2026-05-26T00:00:00.000Z',
    totals: {
      rounds_played: 18,
      insights_surfaced: 12,
      goals_active: 5,
      avg_score_to_par: 2.4,
    },
    active_players: [
      { player_id: 'p1', name: 'Maya Chen', rounds: 4, avg_score_to_par: 1.5 },
      { player_id: 'p2', name: 'Sam Park', rounds: 3, avg_score_to_par: 3.0 },
    ],
    top_patterns: [
      { insight_type: 'putt_distance', player_count: 4 },
      { insight_type: 'scrambling', player_count: 2 },
    ],
    ...over,
  };
}

describe('buildWeeklyRecapHtml', () => {
  it('produces a subject line with team name + date range', () => {
    const r = buildWeeklyRecapHtml(makeRecap());
    expect(r.subject).toContain('Eagles');
    expect(r.subject).toMatch(/May/);
  });

  it('includes the coach first name in the greeting', () => {
    const { html, text } = buildWeeklyRecapHtml(makeRecap({ coach_first_name: 'Casey' }));
    expect(html).toContain('Hey Casey,');
    expect(text).toContain('Eagles');
  });

  it('renders avg score-to-par with sign', () => {
    expect(buildWeeklyRecapHtml(makeRecap({ totals: { rounds_played: 1, insights_surfaced: 0, goals_active: 0, avg_score_to_par: 3.2 } })).html)
      .toContain('+3.2');
    expect(buildWeeklyRecapHtml(makeRecap({ totals: { rounds_played: 1, insights_surfaced: 0, goals_active: 0, avg_score_to_par: -1.5 } })).html)
      .toContain('-1.5');
  });

  it('renders zero score-to-par as "E"', () => {
    const r = buildWeeklyRecapHtml(makeRecap({ totals: { rounds_played: 1, insights_surfaced: 0, goals_active: 0, avg_score_to_par: 0 } }));
    expect(r.html).toContain('>E<');
  });

  it('renders em-dash for null avg', () => {
    const r = buildWeeklyRecapHtml(makeRecap({ totals: { rounds_played: 0, insights_surfaced: 0, goals_active: 0, avg_score_to_par: null } }));
    expect(r.html).toContain('—');
  });

  it('shows empty-state italic when no rounds were played', () => {
    const r = buildWeeklyRecapHtml(makeRecap({ active_players: [] }));
    expect(r.html).toContain('No rounds played this week');
  });

  it('escapes HTML in team name (defends against XSS)', () => {
    const r = buildWeeklyRecapHtml(makeRecap({ team_name: '<script>bad</script>' }));
    expect(r.html).not.toContain('<script>bad');
    expect(r.html).toContain('&lt;script&gt;');
  });

  it('text version includes per-player rounds', () => {
    const { text } = buildWeeklyRecapHtml(makeRecap());
    expect(text).toContain('Maya Chen');
    expect(text).toContain('4 rounds');
  });
});
