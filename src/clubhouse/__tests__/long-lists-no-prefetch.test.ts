import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A `<Link>` prefetches once it is on screen, one RSC request a row. Ask's history alone made about 20 on opening. A row
 * in a list turns that off: `usePressPrefetch` and the idle first rows fetch what a reader is about to open.
 */
const LIST_ROWS = [
  'screens/coachhelm/chat/History.tsx',
  'ui/Ledger.tsx',
  'ui/WeekStrip.tsx',
  'screens/rounds/parts.tsx',
  'screens/coachhelm/read/ReadsRail.tsx',
  'screens/coachhelm/read/cards.tsx',
  'screens/stats/StatsTeamIslands.tsx',
  'screens/stats/StatsTeam.tsx',
  'screens/stats/StatsTeamPhone.tsx',
  'screens/stats/StatsPlayer.tsx',
  'screens/stats/StatsPlayerPhoneShs.tsx',
  'screens/stats/StatsPlayerPhone.tsx',
  'screens/home/Leaderboard.tsx',
  'screens/home/TeamLegs.tsx',
  'screens/home/CoachQueue.tsx',
  'screens/home/LiveNowCard.tsx',
  'screens/home/HomePhone.tsx',
  'screens/home/DayCard.tsx',
  'screens/hub/parts.tsx',
  'screens/hub/widgets.tsx',
  'screens/coachhelm/chat/Evidence.tsx',
  'screens/coachhelm/chat/ActionCard.tsx',
  'screens/coachhelm/views/DeepDive.tsx',
  'screens/coachhelm/views/CoachBrief.tsx',
  'screens/coachhelm/views/KeepReading.tsx',
  'screens/coachhelm/CoachBoard.tsx',
  'screens/rounds/HoleMap.tsx',
  'screens/rounds/CoursePage.tsx',
  'screens/rounds/RoundsLibrary.tsx',
  'screens/tournaments/History.tsx',
  'screens/tournaments/SeasonLedger.tsx',
  'screens/tournaments/RoundCard.tsx',
  'screens/qualifiers/QualifiersList.tsx',
  'screens/qualifiers/RoundsShowcase.tsx',
];

describe('rows in a long list do not prefetch on sight', () => {
  it.each(LIST_ROWS)('%s', (file) => {
    const src = readFileSync(join(process.cwd(), 'src/clubhouse', file), 'utf8');
    const links = src.match(/<Link\b[^>]*?>/gs) ?? [];
    expect(links.some((l) => l.includes('prefetch={false}'))).toBe(true);
  });
});
