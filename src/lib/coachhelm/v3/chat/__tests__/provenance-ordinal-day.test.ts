import { describe, it, expect } from 'vitest';
import { auditNumericClaims, collectDates, collectScopedNumbers } from '../provenance';

// Staging, 2026-10-29: "how did my team do this week" was withheld with
// unmatched_tokens ["26"]. get_team_overview's detail had every player's
// last_round_date at 2026-09-26; "September 26" passed the date audit, but
// "on the 26th" fell through to the numeric scan. (get_team_rounds' detail is
// folded in as team_rounds.)
const detail = {
  latest_round_date: '2026-09-26',
  players: [
    { name: 'Owen Carter', player_id: 'p1', last_round_date: '2026-09-26', rounds_recorded: 14, last_round_to_par: -1 },
    { name: 'Ethan Park', player_id: 'p2', last_round_date: '2026-09-26', rounds_recorded: 15, last_round_to_par: 1 },
  ],
  team_rounds: { since: '2026-10-22', round_count: 0, recent_rounds: [] },
};

const audit = (text: string) =>
  auditNumericClaims(text, [], [], collectScopedNumbers(detail), collectDates(detail, 'America/New_York'), 'America/New_York');

describe('auditNumericClaims: bare ordinal day of month', () => {
  it('accepts "the 26th" when an evidence date falls on the 26th', () => {
    const text =
      "No rounds were recorded this week (since October 22) — the most recent recorded rounds for every player are from September 26, over four weeks ago. Want me to pull up what happened in that last round on the 26th?";
    expect(audit(text)).toEqual([]);
  });

  it('still flags an ordinal day no evidence date falls on', () => {
    expect(audit('The last round was September 26, and the next one is on the 27th.').map((c) => c.text)).toEqual(['27']);
  });

  it('does not let an ordinal day support a bare statistic', () => {
    expect(audit('He played on the 26th and took 26 putts.').map((c) => c.text)).toEqual(['26']);
  });
});
