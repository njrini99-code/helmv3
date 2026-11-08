import { describe, expect, it } from 'vitest';
import { columnUnits, columnWithUnit, DATA_DICTIONARY, DATA_READING_PROMPT, DATA_QUIRKS, describeDictionary, noteFor, ROUND_LINES_COLUMNS, ROUND_LINES_DICTIONARY, UNKNOWN_ENTRIES } from '../data-dictionary';
import { TEAM_QUERY_TABLE_NAMES, TEAM_QUERY_TABLES, looseRule } from '../team-query-allowlist';

describe('the data dictionary', () => {
  it('has an entry for every table and every column query_team_data allows, and for nothing else', () => {
    expect(Object.keys(DATA_DICTIONARY).sort()).toEqual([...TEAM_QUERY_TABLE_NAMES].sort());
    for (const t of TEAM_QUERY_TABLE_NAMES) {
      const allowed = [...looseRule(t)!.columns].sort();
      const described = Object.keys((DATA_DICTIONARY as Record<string, Record<string, unknown>>)[t]!).sort();
      expect(described, t).toEqual(allowed);
    }
  });

  it('has an entry for every round_lines column', () => {
    expect(Object.keys(ROUND_LINES_DICTIONARY).sort()).toEqual([...ROUND_LINES_COLUMNS].sort());
  });

  it('says what each column means, and never leaves a meaning empty', () => {
    for (const [t, cols] of Object.entries({ ...DATA_DICTIONARY, round_lines: ROUND_LINES_DICTIONARY })) {
      for (const [col, n] of Object.entries(cols as Record<string, { means: string; unit: string }>)) {
        expect(n.means.trim().length, `${t}.${col}`).toBeGreaterThan(8);
        expect(n.unit, `${t}.${col}`).toBeTruthy();
      }
    }
  });

  it('gives the units the code shows: yards for tee shots, feet for putts and approach proximity, percent 0 to 100, strokes for strokes gained', () => {
    expect(noteFor('golf_round_stats_cache', 'driving_distance_avg')!.unit).toBe('yards');
    expect(noteFor('golf_player_stats_cache', 'driving_distance_average')!.unit).toBe('yards');
    expect(noteFor('golf_player_stats_cache', 'approach_proximity_average')!.unit).toBe('feet');
    expect(noteFor('golf_player_stats_cache', 'putt_make_pct_5_10ft')!.unit).toBe('percent');
    expect(noteFor('golf_player_stats_cache', 'gir_percentage')!.means).toMatch(/0 to 100/);
    for (const col of ['strokes_gained_total', 'strokes_gained_tee', 'strokes_gained_approach', 'strokes_gained_around_green', 'strokes_gained_putting']) {
      expect(noteFor('golf_rounds', col)!.unit).toBe('strokes');
      expect(noteFor('golf_rounds', col)!.sign).toMatch(/negative loses strokes/i);
    }
    expect(noteFor('golf_player_stats_cache', 'approach_proximity_average')!.sign).toBe('Lower is better.');
    expect(noteFor('golf_rounds', 'score_to_par')!.sign).toMatch(/negative is under par/i);
  });

  it('says when a column is empty, so an in-progress or total-only round is not read as zero', () => {
    expect(noteFor('golf_rounds', 'total_putts')!.null_when).toMatch(/total-only/);
    expect(noteFor('golf_rounds', 'strokes_gained_total')!.null_when).toMatch(/not finished/);
    expect(noteFor('golf_round_stats_cache', 'driving_distance_avg')!.null_when).toBeTruthy();
    expect(noteFor('golf_round_stats_cache', 'updated_at')!.means).toMatch(/NOT the day the round was played/);
  });

  it('records the known quirks of the data', () => {
    const q = DATA_QUIRKS.join(' ');
    expect(q).toMatch(/several rounds on one day/);
    expect(q).toMatch(/total only/);
    expect(q).toMatch(/practice, qualifier or tournament/);
    expect(q).toMatch(/9-hole round/);
    expect(q).toMatch(/not always against the Tour/);
    expect(q).toMatch(/"15\.3 ft", never "15\.3"/);
  });

  it('keeps the value lists the schema fixes (checked against the migrations)', () => {
    expect(noteFor('golf_goals', 'state')!.values).toBe('active, paused, achieved, missed, partial, abandoned, pending_baseline');
    expect(noteFor('golf_team_seasons', 'division')!.values).toBe('d1, d2, d3, naia, njcaa, other');
    expect(noteFor('golf_event_attendance', 'attendance_status')!.values).toBe('present, late, no_show');
    expect(noteFor('golf_tournaments', 'format')!.values).toMatch(/5c4/);
  });

  it('lists the columns whose unit the code does not show, for the owner', () => {
    expect(UNKNOWN_ENTRIES.map((e) => `${e.table}.${e.column}`)).toEqual(['golf_player_focus_areas.priority']);
  });

  it('puts the unit after each column in the compact description, and the guide with it', () => {
    expect(columnWithUnit('golf_rounds', 'total_score')).toBe('total_score[strokes]');
    expect(columnWithUnit('golf_player_stats_cache', 'approach_proximity_average')).toBe('approach_proximity_average[ft]');
    expect(columnWithUnit('golf_rounds', 'round_date')).toBe('round_date');
    expect(describeDictionary()).toMatch(/several rounds on one day/);
    expect(columnUnits('golf_rounds', ['round_date', 'total_putts', 'strokes_gained_putting'])).toEqual({ total_putts: 'count', strokes_gained_putting: 'strokes' });
  });

  it('is not behind the allowlist: a table in TEAM_QUERY_TABLES has its dictionary', () => {
    expect(Object.keys(TEAM_QUERY_TABLES).length).toBe(Object.keys(DATA_DICTIONARY).length);
  });

  it('has a compact prompt that says the unit, the sign, the empty value and the cut, in under 900 characters', () => {
    expect(DATA_READING_PROMPT).toMatch(/"15\.3 ft"/);
    expect(DATA_READING_PROMPT).toMatch(/negative strokes-gained/);
    expect(DATA_READING_PROMPT).toMatch(/never zero/);
    expect(DATA_READING_PROMPT).toMatch(/first N of M rows/);
    expect(DATA_READING_PROMPT.length).toBeLessThan(900);
  });
});
