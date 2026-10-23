import { describe, expect, it } from 'vitest';
import { hits, ratchet, ROOT, walk } from '../../__tests__/_scan';
import { plural, pluralWord } from '../plural';

/** CONS-14: one plural rule. The inline `n === 1 ? 'x' : 'xs'` ternaries below may only fall, toward none. */
const ALLOW_TERNARY: Record<string, number> = {
  'data/classes-shape.ts': 1,
  'data/coachhelm-chat-thread.ts': 3,
  'data/coachhelm-dive-shape.ts': 1,
  'data/coachhelm-monday-brief-shape.ts': 2,
  'data/coachhelm-shape.ts': 1,
  'data/coachhelm-team-pattern.ts': 1,
  'data/coachhelm-track-record-shape.ts': 1,
  'data/leg-rows.ts': 1,
  'data/recruiting-shape.ts': 2,
  'data/round-scope.ts': 1,
  'data/shell.ts': 1,
  'data/stats-filter.ts': 2,
  'data/stats-team.ts': 3,
  'screens/calendar/Calendar.tsx': 3,
  'screens/calendar/CalendarPhone.tsx': 3,
  'screens/calendar/inspector.tsx': 5,
  'screens/calendar/month.tsx': 1,
  'screens/calendar/views.tsx': 2,
  'screens/classes/ClassDetail.tsx': 1,
  'screens/classes/ClassesView.tsx': 1,
  'screens/classes/ImportSchedule.tsx': 5,
  'screens/classes/parts.tsx': 5,
  'screens/classes/writes.ts': 1,
  'screens/coachhelm/CoachBoard.tsx': 1,
  'screens/coachhelm/CoursePlan.tsx': 1,
  'screens/coachhelm/MyCoursePlan.tsx': 1,
  'screens/coachhelm/PlayerBoard.tsx': 3,
  'screens/coachhelm/chat/ActionCard.tsx': 1,
  'screens/coachhelm/views/CoachBrief.tsx': 1,
  'screens/coachhelm/views/DeepDive.tsx': 5,
  'screens/coachhelm/views/HowYouPlay.tsx': 1,
  'screens/coachhelm/views/Standing.tsx': 6,
  'screens/home/CoachAsks.tsx': 2,
  'screens/home/Countdown.tsx': 1,
  'screens/home/DayCard.tsx': 1,
  'screens/home/HomePhone.tsx': 2,
  'screens/home/Leaderboard.tsx': 1,
  'screens/home/Week.tsx': 1,
  'screens/home/model.ts': 2,
  'screens/hub/parts.tsx': 2,
  'screens/hub/sheets.tsx': 1,
  'screens/messages/MessagesPhone.tsx': 1,
  'screens/messages/MessagesView.tsx': 1,
  'screens/messages/announcements.tsx': 1,
  'screens/qualifiers/QualifierForm.tsx': 1,
  'screens/qualifiers/QualifiersList.tsx': 1,
  'screens/qualifiers/model.ts': 1,
  'screens/qualifiers/parts.tsx': 3,
  'screens/recruiting/Pipeline.tsx': 2,
  'screens/recruiting/RecruitingPhone.tsx': 1,
  'screens/roster/InviteByEmail.tsx': 2,
  'screens/roster/Roster.tsx': 2,
  'screens/roster/RosterPeek.tsx': 4,
  'screens/roster/RosterPhone.tsx': 2,
  'screens/roster/RosterProfile.tsx': 1,
  'screens/roster/TeamRoster.tsx': 1,
  'screens/roster/TeamRosterPhone.tsx': 1,
  'screens/roster/format.ts': 1,
  'screens/roster/useJoinRequests.ts': 1,
  'screens/rounds/RoundReview.tsx': 5,
  'screens/rounds/RoundZones.tsx': 3,
  'screens/rounds/RoundsLibrary.tsx': 3,
  'screens/rounds/TeamRounds.tsx': 3,
  'screens/rounds/entry/InProgressConflictDialog.tsx': 1,
  'screens/rounds/entry/RoundTypeSheet.tsx': 1,
  'screens/rounds/recover/RoundRecover.tsx': 3,
  'screens/rounds/round-insights.ts': 1,
  'screens/rounds/setup/CoursePicker.tsx': 1,
  'screens/rounds/setup/HoleConfig.tsx': 1,
  'screens/rounds/track/CourseView.tsx': 1,
  'screens/rounds/track/RoundTracking.tsx': 1,
  'screens/rounds/track/parts.tsx': 3,
  'screens/settings/CoachHelm.tsx': 1,
  'screens/settings/model.ts': 1,
  'screens/settings/phone/CoachHelmPhone.tsx': 1,
  'screens/stats/GameDetail.tsx': 5,
  'screens/stats/GameMore.tsx': 1,
  'screens/stats/OverviewZones.tsx': 2,
  'screens/stats/StatsPlayer.tsx': 1,
  'screens/stats/StatsPlayerPhone.tsx': 3,
  'screens/stats/StatsTeam.tsx': 1,
  'screens/stats/StatsTeamIslands.tsx': 2,
  'screens/stats/StatsTeamPhone.tsx': 2,
  'screens/stats/charts.tsx': 2,
  'screens/stats/leg-rows.ts': 1,
  'screens/stats/links.ts': 1,
  'screens/stats/mix-rows.ts': 1,
  'screens/stats/notes.ts': 1,
  'screens/stats/putt-bands.ts': 1,
  'screens/stats/reads-line.ts': 3,
  'screens/stats/team-rank.ts': 1,
  'screens/whats-new/WhatsNew.tsx': 2,
  'shell/OfflineBanner.tsx': 1,
};

describe('one plural helper (CONS-14)', () => {
  it('English plurals, with the count or without', () => {
    expect(plural(1, 'round')).toBe('1 round');
    expect(plural(0, 'round')).toBe('0 rounds');
    expect(plural(2, 'match', 'matches')).toBe('2 matches');
    expect(pluralWord(1, 'player')).toBe('player');
    expect(pluralWord(3, 'player')).toBe('players');
  });

  it('one plural helper', () => {
    expect(hits(/function plural\b|const plural\s*=/, walk(ROOT, /\.tsx?$/)).filter((h) => h.file !== 'lib/plural.ts')).toEqual([]);
    const r = ratchet(hits(/===\s*1\s*\?\s*['"`][^'"`]*['"`]\s*:\s*['"`][^'"`]*s['"`]/, walk(ROOT, /\.tsx?$/)), ALLOW_TERNARY);
    expect(r.over).toEqual([]);
    expect(r.stale).toEqual([]);
  });
});
