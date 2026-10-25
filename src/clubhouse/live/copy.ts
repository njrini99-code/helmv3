import { TERMS } from '../lib/glossary';
import { clockText, type LiveRoundType, type LiveSort } from './model';

/**
 * The words of the live surfaces (docs/clubhouse/catalog/tournaments.md, CH-166xx and CH-168xx). Sentence case, no emoji, no
 * exclamation marks. A code is written beside each string so the catalog check and the tests find it where it is used.
 */
export const LIVE_ROUTE = '/golf/dashboard/live';

export const LIVE_COPY = {
  /** CH-16600: Home card title. */
  homeTitle: (n: number) => `Live now · ${n} on the course`,
  /** CH-16601 */
  seeAll: (n: number) => `See all ${n}`,
  /** CH-16602, CH-16613 */
  finishedTitle: (n: number) => `Finished today · ${n}`,
  /** CH-16603 */
  openLive: 'Open live view',
  /** CH-16604 */
  cantRefresh: 'Can’t refresh right now',
  /** CH-16605 */
  offline: 'You’re offline',
  /** CH-16609 */
  noAccess: 'You don’t have access to this team’s live rounds.',
  /** CH-16610 */
  viewTitle: 'Live',
  /** CH-16611 */
  filter: { all: 'All', qualifier: 'Qualifier', practice: 'Practice', tournament: 'Tournament' } as const,
  /** CH-16612 */
  onCourse: (n: number) => `On the course · ${n}`,
  /** CH-16614 */
  notHeard: (n: number) => `Not heard from · ${n}`,
  /** CH-16615 */
  sort: { to_par: 'To par', thru: 'Thru', name: 'Name', tee: 'Tee time' } as Record<LiveSort, string>,
  sortLabel: (by: LiveSort) => `Sort: ${LIVE_COPY.sort[by]}`,
  /** CH-16616: the hole a player plays next. Yards are left out when unknown. */
  nextHole: (hole: number, par: number | null, yds: number | null) => [`${hole}`, par != null ? `Par ${par}` : null, yds != null ? `${yds} yds` : null].filter(Boolean).join(' · '),
  /** CH-16618 */
  everyone: 'Where everyone is',
  /** CH-16619 */
  emptyTitle: 'No one is on the course right now.',
  emptyBody: 'Rounds show up here as soon as a player starts one.',
  /** CH-16620 */
  qualifierSection: (n: number) => `On the course · ${n}`,
  /** CH-16621 */
  standingsHeld: 'Standings update when your round is posted.',
  /** CH-16622 */
  qualifierLine: (round: number, n: number) => `Round ${round} live · ${n} on the course`,
  /** CH-16630 */
  bandTitle: 'Live now',
  /** CH-16640 */
  eventRow: (n: number) => `Live · ${n} on the course`,
  /** CH-16641 */
  eventAria: (n: number) => `${n} on the course`,
  /** CH-16672 */
  lastUpdate: (minutes: number) => `Last update ${minutes} min ago`,
  /** CH-16673 */
  noUpdateSince: (iso: string, hours: '12' | '24') => `No update since ${clockText(iso, hours)}`,
  /** CH-16674 */
  stopped: (thru: number) => `Stopped thru ${thru}`,
  /** CH-16675 */
  finishedNotPosted: 'Finished · not posted',
  /** CH-16685: a tracked tournament round is shown by the tournament's own live view. */
  tournamentLive: (name: string) => `${name} · live`,
} as const;

/** The sharing words (slice 2). CH-16661 and CH-16631 use version 2 of open call (a): the first level reads "Not live". */
export const SHARE_COPY = {
  /** CH-16660 */
  label: 'Show this round live to',
  /** CH-16662 */
  qualifierCaption: 'Qualifier rounds are always shown to coaches.',
  /** CH-16663 */
  helper: 'They see your score and the hole you’re on, not your location.',
  /** CH-16664 */
  error: 'Couldn’t change sharing. Try again.',
  /** CH-16665 */
  tooMany: 'Sharing was changed too many times on this round.',
  /** CH-16666 */
  unavailable: 'Sharing isn’t available yet.',
  /** CH-16684 */
  notLiveNote: 'Not live keeps this round off live views. Your team can still open it in Rounds.',
} as const;

/** The player's own cards (slices 1 and 4). */
export const OWN_COPY = {
  /** CH-16680 */
  title: 'Round in progress',
  /** CH-16681 */
  next: (hole: number, par: number | null, yds: number | null) => `Next: ${LIVE_COPY.nextHole(hole, par, yds)}`,
  /** CH-16682 */
  teammates: (n: number) => `Teammates on the course · ${n}`,
  /** CH-16683 */
  lastSaved: (minutes: number) => `Last saved ${minutes} min ago`,
  /** The primary action of the own card. */
  resume: 'Resume round',
  /** The strokes gained legs of a practice round (4.4). The plan says "Short game"; the glossary (CONS-18) says Around the green. */
  legs: { tee: 'Off the tee', approach: 'Approach', short: TERMS.sgArg.long, putting: 'Putting' },
} as const;

/** CH-16617: Moments, the news in a round. */
export const MOMENTS_TITLE = 'Moments';

/** The share levels as the player reads them (CH-16661, CH-16631). The stored value for the first is still `off`. */
export const SHARE_LABEL = { off: 'Not live', coaches: 'Coaches', team: 'Coaches and team' } as const;

export const ROUND_TYPE_FILTERS: ReadonlyArray<'all' | LiveRoundType> = ['all', 'qualifier', 'practice', 'tournament'];
