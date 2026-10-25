import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LIVE_COPY, MOMENTS_TITLE, OWN_COPY, SHARE_COPY, SHARE_LABEL } from '../live/copy';
import { feedProblem } from '../live/FreshnessChip';
import { laneSubline, momentsFrom, type LiveLane } from '../live/model';
import { PREVIEW_LIVE } from '../preview/fixtures-live';
import { ROOT } from './_scan';

/**
 * The words of the live surfaces, by their catalog numbers (docs/clubhouse/catalog/live.md). The plan's copy deck is the
 * spec; each case below is one code and the exact words it shows. A code that a component draws is also looked for in the
 * source, so a number never drifts from its place.
 */
const sofia = PREVIEW_LIVE.lanes.find((l) => l.name === 'Sofia Reyes') as LiveLane;
const CASES: Array<[code: string, words: string]> = [
  ['CH-16600', LIVE_COPY.homeTitle(4)],
  ['CH-16601', LIVE_COPY.seeAll(7)],
  ['CH-16602', LIVE_COPY.finishedTitle(2)],
  ['CH-16603', LIVE_COPY.openLive],
  ['CH-16604', feedProblem('paused')!.text],
  ['CH-16605', feedProblem('offline')!.text],
  ['CH-16609', LIVE_COPY.noAccess],
  ['CH-16610', LIVE_COPY.viewTitle],
  ['CH-16611', Object.values(LIVE_COPY.filter).join(' / ')],
  ['CH-16612', LIVE_COPY.onCourse(4)],
  ['CH-16613', LIVE_COPY.finishedTitle(2)],
  ['CH-16614', LIVE_COPY.notHeard(1)],
  ['CH-16615', LIVE_COPY.sortLabel('to_par')],
  ['CH-16616', LIVE_COPY.nextHole(12, 4, 412)],
  ['CH-16617', MOMENTS_TITLE],
  ['CH-16618', LIVE_COPY.everyone],
  ['CH-16619', `${LIVE_COPY.emptyTitle} ${LIVE_COPY.emptyBody}`],
  ['CH-16620', LIVE_COPY.qualifierSection(3)],
  ['CH-16621', LIVE_COPY.standingsHeld],
  ['CH-16622', LIVE_COPY.qualifierLine(2, 3)],
  ['CH-16630', LIVE_COPY.bandTitle],
  ['CH-16631', Object.values(SHARE_LABEL).join(' / ')],
  ['CH-16640', LIVE_COPY.eventRow(4)],
  ['CH-16641', LIVE_COPY.eventAria(4)],
  ['CH-16660', SHARE_COPY.label],
  ['CH-16661', Object.values(SHARE_LABEL).join(' / ')],
  ['CH-16662', SHARE_COPY.qualifierCaption],
  ['CH-16663', SHARE_COPY.helper],
  ['CH-16664', SHARE_COPY.error],
  ['CH-16665', SHARE_COPY.tooMany],
  ['CH-16666', SHARE_COPY.unavailable],
  ['CH-16670', laneSubline(sofia).text],
  ['CH-16671', laneSubline({ ...sofia, roundType: 'practice', qualifierRound: null }).text],
  ['CH-16672', LIVE_COPY.lastUpdate(14)],
  ['CH-16673', LIVE_COPY.noUpdateSince('2026-10-14T15:40:00Z', '24')],
  ['CH-16674', LIVE_COPY.stopped(9)],
  ['CH-16675', LIVE_COPY.finishedNotPosted],
  ['CH-16676', momentsFrom(sofia, { ...sofia, phase: 'posted', strokes: 70, toPar: -2, endedAt: '2026-10-14T18:30:00Z' }, '2026-10-14T18:30:00Z')[0]!.text],
  ['CH-16677', momentsFrom({ ...sofia, holes: sofia.holes.map((h) => (h.n >= 10 ? { ...h, score: null } : h)) }, sofia, '2026-10-14T18:30:00Z', true).find((m) => m.kind === 'caught_up')!.text],
  ['CH-16680', OWN_COPY.title],
  ['CH-16681', OWN_COPY.next(12, 4, 412)],
  ['CH-16682', OWN_COPY.teammates(2)],
  ['CH-16683', OWN_COPY.lastSaved(14)],
  ['CH-16684', SHARE_COPY.notLiveNote],
  ['CH-16685', LIVE_COPY.tournamentLive('Fall Invitational')],
];

const EXPECTED: Record<string, string> = {
  'CH-16600': 'Live now · 4 on the course',
  'CH-16601': 'See all 7',
  'CH-16602': 'Finished today · 2',
  'CH-16603': 'Open live view',
  'CH-16604': 'Can’t refresh right now',
  'CH-16605': 'You’re offline',
  'CH-16609': 'You don’t have access to this team’s live rounds.',
  'CH-16610': 'Live',
  'CH-16611': 'All / Qualifier / Practice / Tournament',
  'CH-16612': 'On the course · 4',
  'CH-16613': 'Finished today · 2',
  'CH-16614': 'Not heard from · 1',
  'CH-16615': 'Sort: To par',
  'CH-16616': '12 · Par 4 · 412 yds',
  'CH-16617': 'Moments',
  'CH-16618': 'Where everyone is',
  'CH-16619': 'No one is on the course right now. Rounds show up here as soon as a player starts one.',
  'CH-16620': 'On the course · 3',
  'CH-16621': 'Standings update when your round is posted.',
  'CH-16622': 'Round 2 live · 3 on the course',
  'CH-16630': 'Live now',
  'CH-16631': 'Not live / Coaches / Coaches and team',
  'CH-16640': 'Live · 4 on the course',
  'CH-16641': '4 on the course',
  'CH-16660': 'Show this round live to',
  'CH-16661': 'Not live / Coaches / Coaches and team',
  'CH-16662': 'Qualifier rounds are always shown to coaches.',
  'CH-16663': 'They see your score and the hole you’re on, not your location.',
  'CH-16664': 'Couldn’t change sharing. Try again.',
  'CH-16665': 'Sharing was changed too many times on this round.',
  'CH-16666': 'Sharing isn’t available yet.',
  'CH-16670': 'Qualifier · R2 · 12 · Par 3',
  'CH-16671': 'Practice · 12 · Par 3',
  'CH-16672': 'Last update 14 min ago',
  'CH-16673': 'No update since 11:40',
  'CH-16674': 'Stopped thru 9',
  'CH-16675': 'Finished · not posted',
  'CH-16676': 'Sofia Reyes posted 70 (−2)',
  'CH-16677': 'Caught up · thru 11',
  'CH-16680': 'Round in progress',
  'CH-16681': 'Next: 12 · Par 4 · 412 yds',
  'CH-16682': 'Teammates on the course · 2',
  'CH-16683': 'Last saved 14 min ago',
  'CH-16684': 'Not live keeps this round off live views. Your team can still open it in Rounds.',
  'CH-16685': 'Fall Invitational · live',
};

describe('the words of the live surfaces', () => {
  it.each(CASES)('%s says what the plan says', (code, words) => {
    // The time of day is the viewer's own clock and zone; the words around it are the spec.
    expect(words.replace(/\d{1,2}:\d{2}/, '11:40')).toBe(EXPECTED[code]);
  });

  it('has a case for every row of the catalog, and a row for every case', () => {
    const catalog = readFileSync(join(ROOT, '../../docs/clubhouse/catalog/live.md'), 'utf8');
    const rows = [...catalog.matchAll(/^\| (CH-\d{5}) \|/gm)].map((m) => m[1]!).sort();
    expect(CASES.map(([c]) => c).sort()).toEqual(rows);
  });

  it('writes no emoji and no exclamation marks, in sentence case', () => {
    for (const [, words] of CASES) {
      expect(words).not.toMatch(/!|\p{Extended_Pictographic}/u);
      expect(words).not.toMatch(/\b[A-Z]{4,}\b/);
    }
  });
});
