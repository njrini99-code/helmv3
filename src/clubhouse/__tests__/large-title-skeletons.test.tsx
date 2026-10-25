import { cleanup, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ClassesSkeleton } from '../screens/classes/ClassesSkeleton';
import { CoachHelmSkeleton } from '../screens/coachhelm/CoachHelmSkeleton';
import { HubSkeleton } from '../screens/hub/HubSkeleton';
import { MessagesSkeleton } from '../screens/messages/MessagesSkeleton';
import { QualifiersSkeleton } from '../screens/qualifiers/QualifiersSkeleton';
import { RecruitingSkeleton } from '../screens/recruiting/RecruitingSkeleton';
import { RosterSkeleton } from '../screens/roster/RosterSkeleton';
import { RoundsSkeleton } from '../screens/rounds/RoundsSkeleton';
import { TeamRoundsSkeleton } from '../screens/rounds/TeamRoundsSkeleton';
import { SettingsSkeleton } from '../screens/settings/SettingsSkeleton';
import { StatsSkeletonFor } from '../screens/stats/StatsRouteSkeleton';

/**
 * B10.2 / CONS-13, owner decision 4 (2026-10-24): every phone section root draws the one large title, and its loading
 * skeleton draws the same title block, so the bar's title stays hidden from the skeleton to the page and nothing jumps
 * as the page lands. One case per section root's route skeleton (the one its loading.tsx mounts).
 *
 * Not listed, on purpose (shell/large-title.tsx): Home, whose green hero is its own head, and Calendar, whose month is
 * the content's heading, not the page's name. Both keep the bar's title. (Owner question: decision 4 says "every phone
 * section root"; the exclusion predates it.)
 */
const ROOTS: ReadonlyArray<[string, () => ReactElement]> = [
  ['CoachHelm (coach)', () => <CoachHelmSkeleton view="coach" />],
  ['CoachHelm (player)', () => <CoachHelmSkeleton view="player" />],
  ['Messages', () => <MessagesSkeleton />],
  ['Team Hub', () => <HubSkeleton />],
  ['Roster', () => <RosterSkeleton />],
  ['Team stats', () => <StatsSkeletonFor profile={false} />],
  ['My stats', () => <StatsSkeletonFor profile coach={false} />],
  ['Rounds (player)', () => <RoundsSkeleton />],
  ['Rounds (coach)', () => <TeamRoundsSkeleton />],
  ['Qualifiers', () => <QualifiersSkeleton />],
  ['Recruiting', () => <RecruitingSkeleton />],
  ['Classes', () => <ClassesSkeleton />],
  ['Settings', () => <SettingsSkeleton />],
];

describe('phone section-root skeletons draw the large title (owner decision 4, CONS-13)', () => {
  const real = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({ ...real(q), matches: q === '(max-width: 820px)' })) as typeof window.matchMedia;
  });
  afterEach(() => {
    window.matchMedia = real;
    cleanup();
  });

  it.each(ROOTS)('%s', (_name, skeleton) => {
    const { container } = render(skeleton());
    const titles = container.querySelectorAll('[data-ch-large-title]');
    expect(titles.length).toBe(1);
    // The skeleton's block, never a real heading: the page's own title arrives with the page.
    expect(titles[0]!.classList.contains('ch-large-title')).toBe(true);
    expect(titles[0]!.getAttribute('aria-hidden')).toBe('true');
  });
});
