import { EMPTY_SNAPSHOT, beadOrder, thruOf, toParOf, type LiveHole, type LiveLane, type LivePhase, type LiveRoundType, type LiveSnapshot } from '../live/model';
import { initials } from '../lib/names';

/**
 * Live rounds sample data (docs/clubhouse/catalog/live.md): the Sunday afternoon of the 14 October 2026 qualifier,
 * read at 2:40 pm Eastern. Names are made up. Every state of the plan's 4.12 has a fixture: a busy day, one player,
 * thirty, nobody, a failing feed, a lane gone stale and one gone quiet, finished rounds, a late batch.
 */
export const PREVIEW_LIVE_NOW = Date.parse('2026-10-14T18:40:00Z');
const NOW = PREVIEW_LIVE_NOW;
/** A uuid-shaped id from a short name, so the links built from it pass the route patterns (rounds/[uuid], qualifiers/[uuid]). */
const uid = (name: string) => `00000000-0000-4000-8000-${[...name].map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('').slice(0, 12).padEnd(12, '0')}`;
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();
const PARS = [4, 5, 4, 3, 4, 4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];
const YDS = [388, 512, 401, 176, 372, 419, 534, 158, 395, 410, 366, 181, 521, 388, 407, 165, 548, 402];

/** Scores for holes in play order from `start`: `scores[0]` is the first hole played. */
function holes(scores: Array<number | null>, opts: { start?: number; planned?: 9 | 18; every?: number; newest?: number } = {}): LiveHole[] {
  const planned = opts.planned ?? 18;
  const order = beadOrder({ holesPlanned: planned, startPosition: opts.start ?? 1 });
  const every = opts.every ?? 14;
  return order.map((n, i) => ({
    n,
    par: PARS[n - 1] ?? 4,
    yds: YDS[n - 1] ?? null,
    score: scores[i] ?? null,
    // The newest score arrived a few minutes ago; each earlier one `every` minutes before it.
    at: scores[i] == null ? null : ago((opts.newest ?? 3) + (scores.filter((s) => s != null).length - 1 - i) * every),
  })).sort((a, b) => a.n - b.n);
}

interface Spec {
  id: string;
  name: string;
  type?: LiveRoundType;
  round?: number | null;
  scores: Array<number | null>;
  heard?: number;
  phase?: LivePhase;
  start?: number;
  planned?: 9 | 18;
  current?: number | null;
  endedAgo?: number;
  strokes?: number | null;
}

function lane(s: Spec): LiveLane {
  const planned = s.planned ?? 18;
  const hs = holes(s.scores, { start: s.start, planned, newest: (s.heard ?? 2) + 1 });
  const thru = thruOf(hs);
  const type = s.type ?? 'qualifier';
  const last = hs.filter((h) => h.at).map((h) => h.at as string).sort().at(-1) ?? null;
  const phase: LivePhase = s.phase ?? (thru >= planned ? 'finished' : 'on_course');
  return {
    roundId: uid(`r${s.id}`),
    playerId: uid(`p${s.id}`),
    name: s.name,
    initials: initials(s.name),
    roundType: type,
    qualifierId: type === 'qualifier' ? uid('qlive') : null,
    qualifierRound: type === 'qualifier' ? (s.round ?? 2) : null,
    courseId: 'c-pine',
    courseName: 'Pine Hollow GC',
    roundDate: '2026-10-14',
    holesPlanned: planned,
    startPosition: s.start ?? 1,
    currentHole: s.current ?? null,
    share: type === 'practice' ? 'coaches' : 'coaches',
    phase,
    thru,
    toPar: toParOf(hs),
    strokes: thru ? hs.reduce((a, h) => a + (h.score ?? 0), 0) : null,
    holes: hs,
    lastHoleAt: last,
    heardAt: ago(s.heard ?? 2),
    startedAt: ago(200),
    endedAt: phase === 'posted' || phase === 'stopped' ? ago(s.endedAgo ?? 5) : null,
    seq: 1,
    source: 'live',
  };
}

const SOFIA = lane({ id: 'sofia', name: 'Sofia Reyes', scores: [4, 5, 3, 3, 4, 4, 5, 3, 4, 3, 4], current: 12 });
const MATEO = lane({ id: 'mateo', name: 'Mateo Lind', scores: [4, 5, 4, 3, 5, 4, 5, 3, 5, 4, 4, 3, 7], current: 14, round: 2 });
const PRIYA = lane({ id: 'priya', name: 'Priya Shah', scores: [4, 4, 4, 3, 4, 3, 5, 3, 4, 4, 3], current: 12 });
const JONAH = lane({ id: 'jonah', name: 'Jonah Okafor', type: 'practice', scores: [4, 5, 5, 3, 4, 4], current: 7 });
const ELLIS = lane({ id: 'ellis', name: 'Ellis Grant', scores: [4, 6, 4, 4, 4, 4, 5, 3, 4, 5], heard: 14, current: 11 });
const NOOR = lane({ id: 'noor', name: 'Noor Haddad', scores: [4, 5, 4, 3, 4, 4, 5, 4], heard: 105, current: 9 });
const POSTED = lane({ id: 'ada', name: 'Ada Lin', scores: [4, 5, 4, 3, 4, 4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4], phase: 'posted', endedAgo: 12 });
const STOPPED = lane({ id: 'ben', name: 'Ben Fox', scores: [4, 5, 4, 3, 5, 4, 5, 3, 4], phase: 'stopped', endedAgo: 8 });
const SHOTGUN = lane({ id: 'eli', name: 'Eli Brooks', scores: [4, 5, 4, 3, 4, 4], start: 10, current: 16 });
const NINE = lane({ id: 'sam', name: 'Sam Whitfield', scores: [4, 5, 4, 3], planned: 9, current: 5 });

const snap = (lanes: LiveLane[], extra: Partial<LiveSnapshot> = {}): LiveSnapshot => ({
  ...EMPTY_SNAPSHOT('preview-team'),
  lanes,
  roster: Object.fromEntries(lanes.map((l) => [l.playerId, l.name])),
  fetchedAt: new Date(NOW).toISOString(),
  source: 'live',
  ...extra,
});

/** Four on the course, one stale, one quiet, one posted: the busy qualifier afternoon. */
export const PREVIEW_LIVE = snap([SOFIA, MATEO, PRIYA, JONAH, ELLIS, NOOR, POSTED]);
export const PREVIEW_LIVE_ONE = snap([SOFIA]);
export const PREVIEW_LIVE_EMPTY = snap([]);
export const PREVIEW_LIVE_FAILED = snap([], { error: true });
export const PREVIEW_LIVE_FINISHED = snap([POSTED, STOPPED]);
export const PREVIEW_LIVE_STARTS = snap([SHOTGUN, NINE, SOFIA]);
/** A tracked tournament round: Home shows its row, not a lane (open call b). */
export const PREVIEW_LIVE_EVENT = snap([SOFIA, PRIYA], { events: [{ tournamentId: 'tour-fall', name: 'Fall Invitational' }] });
/** The feed has gone down after the page loaded (the card keeps its lanes and says so). */
export const PREVIEW_LIVE_LONG_NAMES = snap([lane({ id: 'long', name: 'Bartholomew Featherstonehaugh-Villiers', scores: [4, 5, 4], current: 4 }), SOFIA]);

/** Thirty players, a qualifier day: "See all 30". */
export const PREVIEW_LIVE_MANY: LiveSnapshot = snap(
  Array.from({ length: 30 }, (_, i) =>
    lane({ id: `m${i}`, name: `Player ${String.fromCharCode(65 + (i % 26))}${i}`, scores: Array.from({ length: 2 + (i % 14) }, (_, k) => PARS[k]! + ((i + k) % 5 === 0 ? -1 : (i + k) % 7 === 0 ? 1 : 0)), heard: 1 + (i % 6) }),
  ),
);

export const PREVIEW_LIVE_STATES: Record<string, LiveSnapshot> = {
  busy: PREVIEW_LIVE,
  one: PREVIEW_LIVE_ONE,
  empty: PREVIEW_LIVE_EMPTY,
  failed: PREVIEW_LIVE_FAILED,
  finished: PREVIEW_LIVE_FINISHED,
  starts: PREVIEW_LIVE_STARTS,
  event: PREVIEW_LIVE_EVENT,
  longnames: PREVIEW_LIVE_LONG_NAMES,
  many: PREVIEW_LIVE_MANY,
};

export function previewLive(state: string | undefined): LiveSnapshot {
  return PREVIEW_LIVE_STATES[state ?? ''] ?? PREVIEW_LIVE;
}
