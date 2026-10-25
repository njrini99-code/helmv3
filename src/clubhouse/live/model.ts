import { playOrder } from '@/lib/golf/round-session/play-order';
import { formatToPar } from '../lib/format';
import { formatClock } from '../lib/dates';
import { restyleClock } from '../lib/clock-format';

/**
 * Live rounds (P-6): the one shape every live surface reads. A lane is one player's round in progress, whether it came
 * from the live table (`golf_round_live`), from the v0 poll of `golf_rounds` and `golf_holes`, or later from the
 * tournament feed. Everything here is pure: the loader, the hook and the screens only draw what these functions say.
 *
 * `currentHole` is a hole NUMBER (use-new-round-session stores `startIndex + 1`; round-partial.ts: "currentHole is still
 * the hole NUMBER"). The play order is used only to order the beads (`beadOrder`) and to find the next unscored hole.
 */

export type LiveRoundType = 'practice' | 'qualifier' | 'tournament';
export type LiveShare = 'off' | 'coaches' | 'team';
export type LivePhase = 'on_course' | 'finished' | 'posted' | 'stopped';
export type LiveSource = 'live' | 'poll' | 'tour';

/** One hole of a lane. `at` is the server's receive time of the score (null when unknown, as on a first poll). */
export interface LiveHole {
  n: number;
  par: number | null;
  yds: number | null;
  score: number | null;
  at: string | null;
}

export interface LiveLane {
  roundId: string;
  playerId: string;
  name: string;
  initials: string;
  roundType: LiveRoundType;
  qualifierId: string | null;
  qualifierRound: number | null;
  courseId: string | null;
  courseName: string | null;
  roundDate: string;
  holesPlanned: 9 | 18;
  /** The hole number the round started on (a shotgun start), 1 for an ordinary round. */
  startPosition: number;
  /** The hole number the player is on, from `golf_rounds.current_hole`, or null when unknown. */
  currentHole: number | null;
  share: LiveShare;
  phase: LivePhase;
  thru: number;
  toPar: number | null;
  strokes: number | null;
  holes: LiveHole[];
  lastHoleAt: string | null;
  heardAt: string;
  startedAt: string | null;
  endedAt: string | null;
  seq: number;
  source: LiveSource;
}

/** A tracked tournament round is shown by the tournament's own live view; Home links to it (open call b). */
export interface LiveEventRow {
  tournamentId: string;
  name: string;
}

export interface LiveSnapshot {
  teamId: string;
  lanes: LiveLane[];
  events: LiveEventRow[];
  /** player id to display name, kept so a poll or a broadcast never needs the roster again. */
  roster: Record<string, string>;
  /** The team's time zone, for today and yesterday in every later read. */
  zone: string;
  fetchedAt: string;
  /** Where the lanes came from: the live table, or the v0 poll (no practice, no sharing yet). */
  source: 'live' | 'poll';
  /** The viewer has a round of their own on the course (their team's live lanes are withheld, Rule 4.3a and D-85). */
  viewerOnCourse: boolean;
  /** The read failed: the card keeps what it has and says so (CH-16604). */
  error: boolean;
}

export const EMPTY_SNAPSHOT = (teamId: string): LiveSnapshot => ({
  teamId,
  lanes: [],
  events: [],
  roster: {},
  zone: 'America/New_York',
  fetchedAt: new Date(0).toISOString(),
  source: 'poll',
  viewerOnCourse: false,
  error: false,
});

// ---------------------------------------------------------------------------------------------------------------------
// Shapes of a hole

export type HoleKind = 'eagle' | 'birdie' | 'par' | 'bogey' | 'double' | 'unplayed' | 'unknown';

/** A scored hole by its result against par: eagle or better, birdie, par, bogey, double or worse. No par is `unknown`. */
export function holeKind(score: number | null, par: number | null): HoleKind {
  if (score == null) return 'unplayed';
  if (par == null) return 'unknown';
  const d = score - par;
  return d <= -2 ? 'eagle' : d === -1 ? 'birdie' : d === 0 ? 'par' : d === 1 ? 'bogey' : 'double';
}

/** To-par from the scored holes that have a par. Null when none do. */
export function toParOf(holes: ReadonlyArray<Pick<LiveHole, 'par' | 'score'>>): number | null {
  let total: number | null = null;
  for (const h of holes) if (h.score != null && h.par != null) total = (total ?? 0) + (h.score - h.par);
  return total;
}

export const thruOf = (holes: ReadonlyArray<Pick<LiveHole, 'score'>>): number => holes.filter((h) => h.score != null).length;

/** The hole numbers in the order they are played: start 10 of 18 is 10..18 then 1..9. */
export function beadOrder(lane: Pick<LiveLane, 'holesPlanned' | 'startPosition'>): number[] {
  return playOrder(lane.holesPlanned, lane.startPosition).map((i) => i + 1);
}

/** The lane's holes in play order, one per planned hole: a hole with no data yet is a placeholder. */
export function orderedHoles(lane: Pick<LiveLane, 'holesPlanned' | 'startPosition' | 'holes'>): LiveHole[] {
  const byNumber = new Map(lane.holes.map((h) => [h.n, h]));
  return beadOrder(lane).map((n) => byNumber.get(n) ?? { n, par: null, yds: null, score: null, at: null });
}

/**
 * The hole the player plays next: the hole they are on when it has no score yet, else the first unscored hole after it
 * in play order, else the first unscored hole of the round. Null when every planned hole is scored.
 */
export function nextHole(lane: Pick<LiveLane, 'holesPlanned' | 'startPosition' | 'holes' | 'currentHole'>): { hole: number; par: number | null; yds: number | null } | null {
  const order = beadOrder(lane);
  const byNumber = new Map(lane.holes.map((h) => [h.n, h]));
  const open = (n: number) => byNumber.get(n)?.score == null;
  const cur = lane.currentHole;
  let pick: number | undefined;
  if (cur != null && order.includes(cur)) {
    const from = order.indexOf(cur);
    pick = [...order.slice(from), ...order.slice(0, from)].find(open);
  } else {
    pick = order.find(open);
  }
  if (pick == null) return null;
  const h = byNumber.get(pick);
  return { hole: pick, par: h?.par ?? null, yds: h?.yds ?? null };
}

// ---------------------------------------------------------------------------------------------------------------------
// Freshness (4.1): measured from the last score and from the last time the phone was heard

const MIN = 60_000;
export const STALE_AFTER_MS = 10 * MIN;
export const QUIET_AFTER_MS = 90 * MIN;
export const GONE_AFTER_MS = 4 * 60 * MIN;
/** A posted or stopped lane stays on Home for this long (4.2, 4.10). */
export const FINISHED_ON_HOME_MS = 30 * MIN;

export type LaneFreshness =
  | { kind: 'fresh' }
  | { kind: 'stale'; minutes: number }
  | { kind: 'quiet'; since: string }
  | { kind: 'stopped'; thru: number }
  | { kind: 'gone' };

const ms = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

/** How far to trust a lane. A posted lane is final; a stopped one says so; the rest age with the phone's silence. */
export function laneFreshness(lane: Pick<LiveLane, 'phase' | 'thru' | 'heardAt' | 'lastHoleAt' | 'startedAt'>, now: number): LaneFreshness {
  if (lane.phase === 'stopped') return { kind: 'stopped', thru: lane.thru };
  if (lane.phase === 'posted') return { kind: 'fresh' };
  const heard = ms(lane.heardAt);
  if (heard == null) return { kind: 'fresh' };
  const sinceHeard = now - heard;
  if (sinceHeard < STALE_AFTER_MS) return { kind: 'fresh' };
  const hole = ms(lane.lastHoleAt) ?? ms(lane.startedAt) ?? heard;
  const sinceHole = now - hole;
  if (sinceHeard >= GONE_AFTER_MS && sinceHole >= GONE_AFTER_MS) return { kind: 'gone' };
  if (sinceHeard >= QUIET_AFTER_MS && sinceHole >= QUIET_AFTER_MS) return { kind: 'quiet', since: lane.heardAt };
  if (sinceHole < STALE_AFTER_MS) return { kind: 'fresh' };
  return { kind: 'stale', minutes: Math.floor(sinceHeard / MIN) };
}

/**
 * The one on-course rule other plans may read (S-13): a player is on the course when their live row is on_course or
 * finished and was heard from in the last 10 minutes. `golf_live_viewer_on_course` (the privacy gate) keeps 4 hours on
 * purpose, see `viewerWithheld`.
 */
export function isOnCourse(lane: Pick<LiveLane, 'phase' | 'heardAt'>, now: number): boolean {
  if (lane.phase !== 'on_course' && lane.phase !== 'finished') return false;
  const heard = ms(lane.heardAt);
  return heard != null && now - heard < STALE_AFTER_MS;
}

/** The privacy rule (Rule 4.3a, D-85): a player with a round on the course within 4 hours sees no teammates' lanes. */
export function viewerWithheld(own: Pick<LiveLane, 'phase' | 'heardAt'> | null | undefined, now: number): boolean {
  if (!own || (own.phase !== 'on_course' && own.phase !== 'finished')) return false;
  const heard = ms(own.heardAt);
  return heard != null && now - heard < GONE_AFTER_MS;
}

// ---------------------------------------------------------------------------------------------------------------------
// Lists

export type LiveGroups = { onCourse: LiveLane[]; finished: LiveLane[]; quiet: LiveLane[] };
export type LiveSort = 'to_par' | 'thru' | 'name' | 'tee';

const byToPar = (a: LiveLane, b: LiveLane) => {
  const x = a.toPar ?? Number.POSITIVE_INFINITY;
  const y = b.toPar ?? Number.POSITIVE_INFINITY;
  return x - y || b.thru - a.thru || a.name.localeCompare(b.name);
};

export function sortLanes(lanes: readonly LiveLane[], by: LiveSort): LiveLane[] {
  const out = [...lanes];
  if (by === 'to_par') return out.sort(byToPar);
  if (by === 'thru') return out.sort((a, b) => b.thru - a.thru || byToPar(a, b));
  if (by === 'name') return out.sort((a, b) => a.name.localeCompare(b.name) || a.roundId.localeCompare(b.roundId));
  return out.sort((a, b) => (ms(a.startedAt) ?? Number.POSITIVE_INFINITY) - (ms(b.startedAt) ?? Number.POSITIVE_INFINITY) || a.name.localeCompare(b.name));
}

/** A posted or stopped lane stays in the lists until the end of its day (posted) or 30 minutes (stopped). */
function endedVisible(lane: LiveLane, now: number): boolean {
  const ended = ms(lane.endedAt) ?? ms(lane.heardAt);
  if (ended == null) return true;
  if (lane.phase === 'stopped') return now - ended < FINISHED_ON_HOME_MS;
  return true;
}

/** On the course, finished today, and not heard from; lanes gone past 4 hours drop out. Each group sorted by `by`. */
export function groupLanes(lanes: readonly LiveLane[], now: number, by: LiveSort = 'to_par'): LiveGroups {
  const g: LiveGroups = { onCourse: [], finished: [], quiet: [] };
  for (const lane of lanes) {
    if (lane.phase === 'posted' || lane.phase === 'stopped') {
      if (endedVisible(lane, now)) g.finished.push(lane);
      continue;
    }
    const f = laneFreshness(lane, now);
    if (f.kind === 'gone') continue;
    (f.kind === 'quiet' ? g.quiet : g.onCourse).push(lane);
  }
  return { onCourse: sortLanes(g.onCourse, by), finished: sortLanes(g.finished, by), quiet: sortLanes(g.quiet, by) };
}

/** Home keeps a finished lane for 30 minutes after it posted (4.2). */
export function homeLanes(lanes: readonly LiveLane[], now: number): { live: LiveLane[]; finished: LiveLane[] } {
  const g = groupLanes(lanes, now, 'to_par');
  const recent = g.finished.filter((l) => {
    const ended = ms(l.endedAt) ?? ms(l.heardAt);
    return ended == null || now - ended < FINISHED_ON_HOME_MS;
  });
  // A lane not heard from for 90 minutes waits in the live view's own group; the card counts only who is out and reporting.
  return { live: g.onCourse, finished: recent };
}

export const ROUND_TYPE_LABEL: Record<LiveRoundType, string> = { practice: 'Practice', qualifier: 'Qualifier', tournament: 'Tournament' };

/** `qualifying` is the legacy spelling of a qualifier round; anything unknown is practice. */
export function normalizeRoundType(raw: string | null | undefined): LiveRoundType {
  if (raw === 'qualifier' || raw === 'qualifying') return 'qualifier';
  if (raw === 'tournament') return 'tournament';
  return 'practice';
}

// ---------------------------------------------------------------------------------------------------------------------
// Words

/** "Qualifier · R2 · 12 · Par 4" for a qualifier, "Practice · 12 · Par 4" otherwise (CH-16670, CH-16671). */
export function laneSubline(lane: LiveLane): { code: 'CH-16670' | 'CH-16671'; text: string } {
  const next = nextHole(lane);
  const place = next ? [`${next.hole}`, next.par != null ? `Par ${next.par}` : null].filter(Boolean) : [];
  const withRound = lane.roundType === 'qualifier' && lane.qualifierRound != null;
  const parts = [ROUND_TYPE_LABEL[lane.roundType], withRound ? `R${lane.qualifierRound}` : null, ...place].filter(Boolean);
  return { code: withRound ? 'CH-16670' : 'CH-16671', text: parts.join(' · ') };
}

/** "thru 9", or F once every planned hole is scored. */
export function thruText(lane: Pick<LiveLane, 'thru' | 'holesPlanned' | 'phase'>): string {
  if (lane.phase === 'posted' || lane.phase === 'finished' || (lane.thru >= lane.holesPlanned && lane.thru > 0)) return 'F';
  return lane.thru > 0 ? `thru ${lane.thru}` : 'not started';
}

/** The figure a lane carries in its to-par column. */
export const toParText = (toPar: number | null) => formatToPar(toPar);

/** "under par" in words: "2 under par", "even par", "3 over par". Used by VoiceOver and the live region. */
export function toParWords(toPar: number | null): string {
  if (toPar == null) return 'no score yet';
  if (toPar === 0) return 'even par';
  return `${Math.abs(toPar)} ${toPar < 0 ? 'under' : 'over'} par`;
}

/** The time of day in the viewer's clock (12 or 24 hours), for "No update since 11:40". */
export function clockText(iso: string, hours: '12' | '24' = '12'): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return restyleClock(formatClock(t), hours);
}

/** A lane in one sentence for VoiceOver (7): the beads are hidden, so everything they say is said here. */
export function laneAria(lane: LiveLane, now: number, hours: '12' | '24' = '12'): string {
  const f = laneFreshness(lane, now);
  const type = ROUND_TYPE_LABEL[lane.roundType] + (lane.roundType === 'qualifier' && lane.qualifierRound != null ? `, round ${lane.qualifierRound}` : '');
  if (lane.phase === 'posted') return `${lane.name}, finished, ${lane.strokes != null ? `${lane.strokes}, ` : ''}${toParWords(lane.toPar)}. ${type}.`;
  const where = lane.phase === 'finished' ? 'finished, not posted' : (() => {
    const next = nextHole(lane);
    return `through ${lane.thru}${next ? `, playing hole ${next.hole}${next.par != null ? `, par ${next.par}` : ''}` : ''}`;
  })();
  const tail =
    f.kind === 'stale' ? ` Last update ${f.minutes} minutes ago.` : f.kind === 'quiet' ? ` No update since ${clockText(f.since, hours)}.` : f.kind === 'stopped' ? ` Stopped through ${f.thru}.` : '';
  return `${lane.name}, ${toParWords(lane.toPar)} ${where}. ${type}.${tail}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Moments (5.1, 4.11): what a coach reads as news

export interface LiveMoment {
  /** Stable: the same hole scored the same way is one moment, however many polls or messages carry it. */
  id: string;
  roundId: string;
  kind: 'eagle' | 'birdie' | 'double' | 'triple' | 'caught_up' | 'posted';
  hole: number | null;
  at: string;
  text: string;
  /** For the live region: "Sofia Reyes, birdie on 12, now 3 under par." */
  announce: string;
}

const KIND_WORD: Record<'eagle' | 'birdie' | 'double' | 'triple', string> = { eagle: 'Eagle', birdie: 'Birdie', double: 'Double', triple: 'Triple' };

function momentKind(score: number, par: number | null): 'eagle' | 'birdie' | 'double' | 'triple' | null {
  if (par == null) return null;
  const d = score - par;
  return d <= -2 ? 'eagle' : d === -1 ? 'birdie' : d === 2 ? 'double' : d >= 3 ? 'triple' : null;
}

/** Holes that gained a score between two reads of a lane. */
export function gainedHoles(prev: LiveLane | undefined, next: LiveLane): LiveHole[] {
  const before = new Map((prev?.holes ?? []).map((h) => [h.n, h.score]));
  return next.holes.filter((h) => h.score != null && before.get(h.n) == null);
}

/**
 * The late rule (4.11): two or more holes gained a score in one read, so they did not just happen. A late batch gets no
 * wash and one "Caught up · thru n" line instead of one line per hole.
 */
export function isLate(prev: LiveLane | undefined, next: LiveLane): boolean {
  return !!prev && gainedHoles(prev, next).length >= 2;
}

/**
 * The news in a change of a lane. A correction on a played hole makes a line only when it becomes a result worth a
 * line and was not that result before. `prev` undefined (the first read) makes none: what was already true is not news.
 */
export function momentsFrom(prev: LiveLane | undefined, next: LiveLane, nowIso: string, late = isLate(prev, next)): LiveMoment[] {
  if (!prev) return [];
  const out: LiveMoment[] = [];
  const before = new Map(prev.holes.map((h) => [h.n, h]));
  for (const h of next.holes) {
    if (h.score == null) continue;
    const old = before.get(h.n);
    if (old?.score === h.score) continue;
    const kind = momentKind(h.score, h.par);
    if (!kind) continue;
    if (old?.score != null && momentKind(old.score, old.par) === kind) continue;
    const word = KIND_WORD[kind];
    const toPar = next.toPar;
    out.push({
      id: `${next.roundId}:${h.n}:${h.score}`,
      roundId: next.roundId,
      kind,
      hole: h.n,
      at: h.at ?? nowIso,
      text: `${word} on ${h.n}`,
      announce: `${next.name}, ${word.toLowerCase()} on ${h.n}${toPar != null ? `, now ${toParWords(toPar)}` : ''}.`,
    });
  }
  if (late) {
    out.push({
      id: `${next.roundId}:caught:${next.thru}`,
      roundId: next.roundId,
      kind: 'caught_up',
      hole: null,
      at: nowIso,
      text: `Caught up · thru ${next.thru}`,
      announce: `${next.name} caught up, through ${next.thru}.`,
    });
  }
  if (prev.phase !== 'posted' && next.phase === 'posted') {
    const total = next.strokes != null ? String(next.strokes) : 'a round';
    out.push({
      id: `${next.roundId}:posted`,
      roundId: next.roundId,
      kind: 'posted',
      hole: null,
      at: next.endedAt ?? nowIso,
      text: `${next.name} posted ${total} (${formatToPar(next.toPar)})`,
      announce: `${next.name} posted ${total}, ${toParWords(next.toPar)}.`,
    });
  }
  return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/** The wash a change puts on the to-par cell (D-100): birdie or better, double or worse, otherwise the selected tint. */
export type LiveWash = 'under' | 'over' | 'plain';

export function washOf(prev: LiveLane | undefined, next: LiveLane): LiveWash | null {
  if (!prev || isLate(prev, next)) return null;
  const gained = gainedHoles(prev, next);
  const changed = next.holes.filter((h) => h.score != null && prev.holes.find((p) => p.n === h.n)?.score !== h.score);
  const holes = gained.length ? gained : changed;
  if (!holes.length) return null;
  const worst = holes.map((h) => holeKind(h.score, h.par));
  if (worst.some((k) => k === 'eagle' || k === 'birdie')) return 'under';
  if (worst.some((k) => k === 'double')) return 'over';
  return 'plain';
}

// ---------------------------------------------------------------------------------------------------------------------
// Sparkline and the Lock Screen contract

/** Cumulative to-par over the holes played, in play order: the momentum line's points. */
export function momentum(lane: Pick<LiveLane, 'holesPlanned' | 'startPosition' | 'holes'>): number[] {
  const out: number[] = [];
  let run = 0;
  for (const h of orderedHoles(lane)) {
    if (h.score == null || h.par == null) continue;
    run += h.score - h.par;
    out.push(run);
  }
  return out;
}

export interface LiveRoundActivityState {
  toPar: number | null;
  thru: number;
  lastHoles: Array<{ n: number; score: number; par: number }>;
  next: { hole: number; par: number | null; yds: number | null } | null;
  phase: LivePhase;
  updatedAt: string;
}

/** The data contract the native Live Activity will read (8.18). Not wired to anything native here. */
export function toActivityState(lane: LiveLane): LiveRoundActivityState {
  const lastHoles = orderedHoles(lane)
    .filter((h): h is LiveHole & { score: number; par: number } => h.score != null && h.par != null)
    .slice(-3)
    .map((h) => ({ n: h.n, score: h.score, par: h.par }));
  return { toPar: lane.toPar, thru: lane.thru, lastHoles, next: nextHole(lane), phase: lane.phase, updatedAt: lane.heardAt };
}
