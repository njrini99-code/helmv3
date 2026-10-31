import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { code, hits, ratchet, ROOT, walk, type Hit } from './_scan';
import { Avatar, AVATAR_SIZES, type AvatarSize } from '../ui/Avatar';

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

describe('avatar initials on the type scale (F-0073)', () => {
  const STEPS = ['11px', '12px', '13px', '14px', '22px'];
  const typeOf = (size: AvatarSize | number) => /--ch-av-type:\s*(\d+px)/.exec(renderToStaticMarkup(createElement(Avatar, { name: 'Ann Lee', size })))?.[1];
  it.each(Object.keys(AVATAR_SIZES) as AvatarSize[])('step %s sets its initials on a scale step', (size) => {
    expect(STEPS).toContain(typeOf(size));
  });
  it('a numeric size takes the nearest step', () => {
    expect(typeOf(22)).toBe('11px');
    expect(typeOf(40)).toBe('14px');
    expect(typeOf(56)).toBe('22px');
  });
  it('the coin no longer sizes its initials as a share of itself', () => {
    const ui = readFileSync(join(ROOT, 'styles/ui.css'), 'utf8');
    expect(ui).not.toContain('* 0.34');
    expect(ui).toMatch(/\.ch-avatar \{[^}]*font: 600 [^;]*var\(--ch-av-type, 13px\)/);
  });
});
