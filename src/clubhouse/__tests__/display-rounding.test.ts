import { describe, expect, it } from 'vitest';
import { hits, ratchet, ROOT, walk } from './_scan';

/**
 * CONS-15: a figure is rounded for display in `lib/format.ts` only (formatAvg, formatSG, formatHcp, formatPct,
 * formatDistance, formatSigned, formatFixed), so one metric reads at one precision everywhere. The files below still
 * call `.toFixed(` themselves (some for display, some for geometry or logic, which belong on `Math.round`); their counts
 * may only fall, toward none.
 */
const ALLOW_TOFIXED: Record<string, number> = {
  'data/coachhelm-chat-thread.ts': 2,
  'data/coachhelm-dive-shape.ts': 2,
  'data/coachhelm-engine-shape.ts': 1,
  'data/coachhelm-ladder-shape.ts': 2,
  'data/coachhelm-map.ts': 3,
  'data/coachhelm-monday-brief-shape.ts': 1,
  'data/coachhelm-read-shape.ts': 1,
  'data/coachhelm-standing-shape.ts': 6,
  'data/coachhelm-strokes.ts': 2,
  'data/hub.ts': 1,
  'data/leg-rows.ts': 1,
  'data/player-home.ts': 3,
  'data/recruiting-shape.ts': 1,
  'data/roster.ts': 1,
  'data/round-debrief-shape.ts': 2,
  'data/stats-filter.ts': 1,
  'data/stats-team.ts': 1,
  'lib/motion.ts': 1,
  'lib/nav-motion.ts': 1,
  'lib/sg.ts': 1,
  'preview/fixtures-stats.ts': 1,
  'preview/playground-tokens.ts': 1,
  'screens/auth/GolfScene.tsx': 3,
  'screens/auth/SceneLayers.tsx': 2,
  'screens/auth/SceneMount.tsx': 1,
  'screens/auth/scene-geometry.ts': 4,
  'screens/calendar/extras.tsx': 1,
  'screens/home/HomePhone.tsx': 1,
  'screens/home/PlayerGame.tsx': 5,
  'screens/home/TeamForm.tsx': 1,
  'screens/messages/files.ts': 1,
  'screens/roster/Roster.tsx': 2,
  'screens/roster/format.ts': 1,
  'screens/rounds/round-insights.ts': 1,
  'screens/settings/course-location.tsx': 1,
  'screens/stats/GoalSheet.tsx': 1,
  'screens/stats/StatsPlayer.tsx': 2,
  'screens/stats/StatsTeam.tsx': 1,
  'screens/stats/StatsTeamIslands.tsx': 3,
  'screens/stats/TeamRank.tsx': 1,
  'screens/stats/charts.tsx': 1,
  'screens/stats/mix-rows.ts': 1,
  'screens/stats/round-trend.ts': 2,
  'screens/stats/team-rank.ts': 2,
  'shell/PullToRefresh.tsx': 3,
  'shell/phone-chrome.tsx': 2,
  'shell/use-edge-swipe.ts': 1,
  'ui/PageHero.tsx': 1,
  'ui/charts/Line.tsx': 3,
};

describe('one number formatter (CONS-15)', () => {
  it('display rounding goes through lib/format', () => {
    const r = ratchet(
      hits(/\.toFixed\(/, walk(ROOT, /\.tsx?$/)).filter((h) => h.file !== 'lib/format.ts'),
      ALLOW_TOFIXED,
    );
    expect(r.over).toEqual([]);
    expect(r.stale).toEqual([]);
  });
});
