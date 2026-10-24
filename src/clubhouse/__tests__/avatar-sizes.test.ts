import { relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { code, hits, ratchet, ROOT, walk, type Hit } from './_scan';

/**
 * CONS-33: an avatar takes one of ui/Avatar's steps (`size="sm"`). The numeric sizes below wait on the owner's step
 * scale (24/28/36/40/64 is the spec's proposal) and may only fall; a size already on a step was moved to its name.
 */
function numeric(): Hit[] {
  const out: Hit[] = [];
  for (const f of walk(undefined, /\.tsx$/)) {
    for (const m of code(f).matchAll(/<(Avatar|ProspectAvatar)\b[^>]*?\bsize=\{([^}]*)\}/g)) {
      out.push({ file: relative(ROOT, f), line: 0, text: `${m[1]} size={${m[2]}}` });
    }
  }
  return out;
}

const ALLOW_NUMERIC: Record<string, number> = {
  'preview/ComponentGallery.tsx': 1,
  'screens/calendar/Calendar.tsx': 1,
  'screens/calendar/class-group.tsx': 1,
  'screens/calendar/editor.tsx': 1,
  'screens/calendar/inspector.tsx': 3,
  'screens/coachhelm/CoachBoard.tsx': 3,
  'screens/coachhelm/chat/Evidence.tsx': 1,
  'screens/home/HomePhone.tsx': 1,
  'screens/home/LatestRound.tsx': 1,
  'screens/hub/parts.tsx': 2,
  'screens/hub/sheets.tsx': 1,
  'screens/messages/MessagesPhone.tsx': 3,
  'screens/messages/MessagesView.tsx': 6,
  'screens/messages/announcements.tsx': 2,
  'screens/onboard/CoachSteps.tsx': 1,
  'screens/onboard/MemberCard.tsx': 1,
  'screens/onboard/Steps.tsx': 1,
  'screens/qualifiers/QualifierDetail.tsx': 2,
  'screens/qualifiers/QualifierForm.tsx': 1,
  'screens/qualifiers/QualifierSections.tsx': 2,
  'screens/qualifiers/QualifierSelection.tsx': 5,
  'screens/recruiting/RecruitingDesktop.tsx': 2,
  'screens/recruiting/RecruitingPhone.tsx': 2,
  'screens/roster/Roster.tsx': 1,
  'screens/roster/RosterPeek.tsx': 1,
  'screens/roster/RosterPhone.tsx': 1,
  'screens/roster/RosterRequests.tsx': 1,
  'screens/roster/RosterSpread.tsx': 1,
  'screens/roster/TeamRoster.tsx': 1,
  'screens/stats/StatsPlayer.tsx': 1,
  'screens/stats/StatsPlayerPhone.tsx': 1,
  'screens/stats/StatsTeam.tsx': 1,
  'screens/stats/StatsTeamIslands.tsx': 2,
  'shell/AccountSheet.tsx': 1,
  'shell/Sidebar.tsx': 1,
  'shell/command/Palette.tsx': 1,
  'ui/PlayerPeek.tsx': 1,
};

const hits_ = () => hits(/ch-(rs-face|rec-av|ox-av)\b/, walk(undefined, /\.(tsx|css)$/));
const ALLOW_OWN: Record<string, number> = {
  'screens/onboard/CoachSteps.tsx': 1,
  'screens/onboard/Steps.tsx': 1,
  'screens/recruiting/parts.tsx': 1,
  'screens/roster/Roster.tsx': 1,
  'screens/roster/RosterSkeleton.tsx': 1,
  'screens/roster/TeamRoster.tsx': 1,
  'styles/base.css': 1,
  'styles/onboard.css': 2,
  'styles/recruiting.css': 8,
  'styles/roster.css': 32,
};

describe('avatar sizes on a set (CONS-33)', () => {
  it('no new numeric avatar size', () => {
    const r = ratchet(numeric(), ALLOW_NUMERIC);
    expect(r.over).toEqual([]);
    expect(r.stale).toEqual([]);
  });
  it('the old own-avatar classes do not grow', () => {
    const r = ratchet(hits_(), ALLOW_OWN);
    expect(r.over).toEqual([]);
    expect(r.stale).toEqual([]);
  });
});
