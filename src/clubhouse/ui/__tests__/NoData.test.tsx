import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { hits, ratchet, ROOT, slack, walk } from '../../__tests__/_scan';
import { NO_DATA } from '../../lib/format';
import { NoData } from '../NoData';

afterEach(cleanup);

describe('NoData (row 46)', () => {
  it('shows the dash to the eye and says "No data" to a screen reader', () => {
    const { container } = render(<NoData />);
    const dash = container.querySelector('[aria-hidden="true"]');
    expect(dash?.textContent).toBe(NO_DATA);
    expect(container.querySelector('.ch-sr-only')?.textContent).toBe('No data');
  });
  it('takes a word that fits the context', () => {
    const { container } = render(<NoData label="Not played" />);
    expect(container.querySelector('.ch-sr-only')?.textContent).toBe('Not played');
  });
  it('reads at the tertiary ink', () => {
    const css = readFileSync(join(__dirname, '../../styles/ui.css'), 'utf8');
    expect(css).toMatch(/\.ch-nodata \{\s*color: var\(--ch-text-tertiary\);/);
  });
});

/**
 * Row 46: a figure that can be empty renders <NoData />, not the bare NO_DATA string. What is left is counted per file
 * and only falls: string-typed props (a chart's or a meter's value, a row of string cells), aria labels, SVG text,
 * formatters, a dash whose own words sit beside it, and files other lanes own (stats, CoachHelm data). Lines that name
 * NO_DATA, imports aside.
 */
describe('bare NO_DATA dashes (row 46)', () => {
  it('only fall, file by file', () => {
    const files = walk(ROOT, /\.tsx?$/).filter((f) => !/[/\\](lib[/\\]format|ui[/\\]NoData)\.ts/.test(f));
    const found = hits(/\bNO_DATA\b/, files).filter((h) => !/^import\b/.test(h.text));
    expect(ratchet(found, BARE_NO_DATA)).toEqual({ over: [], stale: [] });
    expect(slack(found, BARE_NO_DATA)).toEqual([]);
  });
});

/** Lines with a bare NO_DATA per file on 2026-10-24 (row 46). Only falls. */
const BARE_NO_DATA: Record<string, number> = {
  'data/coachhelm-chat-thread.ts': 7,
  'data/coachhelm-standing-shape.ts': 1,
  'screens/home/PlayerGame.tsx': 2,
  'screens/home/TeamLegs.tsx': 2,
  'screens/roster/Roster.tsx': 2,
  'screens/roster/RosterPeek.tsx': 2,
  'screens/roster/RosterPhone.tsx': 1,
  'screens/roster/RosterProfile.tsx': 1,
  'screens/rounds/card/card-model.ts': 2,
  'screens/rounds/card/draw-card.ts': 1,
  'screens/rounds/card/RoundCard.tsx': 1,
  'screens/rounds/parts.tsx': 4,
  'screens/rounds/RoundReview.tsx': 8,
  'screens/rounds/RoundZones.tsx': 2,
  'screens/stats/charts.tsx': 1,
  'screens/stats/detail.tsx': 1,
  'screens/stats/dev-format.ts': 1,
  'screens/stats/GameDetail.tsx': 7,
  'screens/stats/GameMore.tsx': 11,
  'screens/stats/OverviewZones.tsx': 2,
  'screens/stats/putt-bands.ts': 1,
  'screens/stats/RoundsExtra.tsx': 9,
  'screens/stats/StatsPlayer.tsx': 3,
  'screens/stats/StatsTeam.tsx': 1,
  'screens/stats/StatsTeamIslands.tsx': 1,
  'screens/stats/StatsTeamPhone.tsx': 1,
  'screens/stats/TeamTape.tsx': 1,
  'ui/ScoreMark.tsx': 1,
};
