/**
 * P-10 class awareness: the shapes the two class-day RPCs answer with, and the defensive parse from the snake_case
 * payload. Pure: nothing here reads a clock, a database or the browser, so the loaders, the hooks, the screens and
 * the tests run the same parse.
 *
 * `golf_team_class_day` (a coach) answers one object per active player. `golf_my_class_day` (a player) answers the
 * player's own day plus `player`, the exact object a coach's payload holds for them, built from the same SQL, so the
 * player's "Coaches see" preview cannot drift from the coach view. There is no `shared` key anywhere: a player with no
 * schedule and a player who turned sharing off read the same to a coach (only `tracked` is sent).
 *
 * Every parse fails open. A wrong top-level shape is `null` (the caller shows nothing). A block that does not parse is
 * dropped, never guessed: a missing block can only mean "not in class", which is the safe direction.
 */

export type ChClassBlockKind = 'class' | 'exam';
export type ChClassBlockSource = 'pattern' | 'calendar' | 'exam';

export type ChClassBlock = {
  classId: string | null;
  /** The class name as stored ("STAT 201 - Probability"); the UI shows `classLabel(label)`, never this whole. */
  label: string;
  kind: ChClassBlockKind;
  source: ChClassBlockSource;
  /** ISO instants. */
  startsAt: string;
  endsAt: string;
};

export type ChClassAway = { destination: string | null; returnDate: string | null; confirmed: boolean };

export type ChClassDayPlayer = {
  playerId: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  /** Sharing on and at least one usable class (or exam block) in the term. */
  tracked: boolean;
  /** Tracked, and the player's class-hold switch is on. */
  holds: boolean;
  onCourse: boolean;
  /** A team break or a no-class day covers the date. */
  offToday: boolean;
  away: ChClassAway | null;
  blocks: ChClassBlock[];
};

export type ChTermPhase = 'classes' | 'exams';

export type ChClassTerm = {
  id: string;
  label: string;
  /** YYYY-MM-DD. */
  classesStart: string;
  classesEnd: string;
  examsEnd: string;
  timeZone: string;
  phase: ChTermPhase;
};

export type ChClassDay = {
  /** The date the payload is for, YYYY-MM-DD in the class zone. */
  on: string;
  teamTimeZone: string;
  /** The zone the date was taken in: the covering term's zone, else the team's. */
  classTimeZone: string;
  term: ChClassTerm | null;
  nextTerm: { id: string; label: string; classesStart: string } | null;
  players: ChClassDayPlayer[];
  /** Client clock when the payload arrived (staleness for the offline rule). */
  fetchedAt: number;
};

export type ChUnusableReason = 'times' | 'days' | 'calendar_mismatch';
export type ChUnusableClass = { classId: string; reason: ChUnusableReason };

export type ChMyClassDay = {
  on: string;
  teamId: string;
  teamTimeZone: string;
  classTimeZone: string;
  term: ChClassTerm | null;
  settings: { shareStatus: boolean; holdPushes: boolean };
  /** What coaches see for this player: the exact object the coach payload holds. Null when the player has no team. */
  player: ChClassDayPlayer | null;
  /** The player's own blocks, computed whatever the sharing switch says. */
  blocks: ChClassBlock[];
  untaggedClasses: number;
  unusableClasses: ChUnusableClass[];
  /** Unread held pushes only (read and deleted messages leave the count). Null when nothing is held. */
  held: { count: number; releaseAt: string | null } | null;
  fetchedAt: number;
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const bool = (v: unknown, fallback = false): boolean => (typeof v === 'boolean' ? v : fallback);
const isoOk = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));
const dayOk = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

function toBlock(raw: unknown): ChClassBlock | null {
  if (!isRecord(raw)) return null;
  const { starts_at: startsAt, ends_at: endsAt } = raw;
  if (!isoOk(startsAt) || !isoOk(endsAt)) return null;
  if (Date.parse(endsAt) <= Date.parse(startsAt)) return null;
  const kind: ChClassBlockKind = raw.kind === 'exam' ? 'exam' : 'class';
  const source: ChClassBlockSource = raw.source === 'calendar' ? 'calendar' : raw.source === 'exam' ? 'exam' : 'pattern';
  return { classId: str(raw.class_id), label: typeof raw.label === 'string' ? raw.label : '', kind, source, startsAt, endsAt };
}

function toBlocks(raw: unknown): ChClassBlock[] {
  if (!Array.isArray(raw)) return [];
  const out: ChClassBlock[] = [];
  for (const b of raw) {
    const block = toBlock(b);
    if (block) out.push(block);
  }
  return out.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

function toAway(raw: unknown): ChClassAway | null {
  if (!isRecord(raw)) return null;
  return {
    destination: str(raw.destination),
    returnDate: dayOk(raw.return_date) ? raw.return_date : null,
    confirmed: raw.confirmed === true,
  };
}

/** One player object, the coach payload's element or the player's own `player`. Null when it has no id. */
export function toClassDayPlayer(raw: unknown): ChClassDayPlayer | null {
  if (!isRecord(raw)) return null;
  const playerId = str(raw.player_id);
  if (!playerId) return null;
  return {
    playerId,
    firstName: str(raw.first_name),
    lastName: str(raw.last_name),
    avatarUrl: str(raw.avatar_url),
    tracked: bool(raw.tracked),
    // A hold needs tracking; an untracked player can never read as held.
    holds: bool(raw.tracked) && bool(raw.holds),
    onCourse: bool(raw.on_course),
    offToday: bool(raw.off_today),
    away: toAway(raw.away),
    blocks: toBlocks(raw.blocks),
  };
}

function toTerm(raw: unknown): ChClassTerm | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  const label = str(raw.label);
  const timeZone = str(raw.time_zone);
  if (!id || !label || !timeZone) return null;
  if (!dayOk(raw.classes_start) || !dayOk(raw.classes_end) || !dayOk(raw.exams_end)) return null;
  return {
    id,
    label,
    classesStart: raw.classes_start,
    classesEnd: raw.classes_end,
    examsEnd: raw.exams_end,
    timeZone,
    phase: raw.phase === 'exams' ? 'exams' : 'classes',
  };
}

function toNextTerm(raw: unknown): ChClassDay['nextTerm'] {
  if (!isRecord(raw)) return null;
  const id = str(raw.id);
  const label = str(raw.label);
  if (!id || !label || !dayOk(raw.classes_start)) return null;
  return { id, label, classesStart: raw.classes_start };
}

/** The coach payload, or null when its top-level shape is wrong. */
export function toClassDay(raw: unknown, fetchedAt: number = Date.now()): ChClassDay | null {
  if (!isRecord(raw) || !dayOk(raw.on) || !Array.isArray(raw.players)) return null;
  const teamTimeZone = str(raw.team_time_zone);
  if (!teamTimeZone) return null;
  const players: ChClassDayPlayer[] = [];
  for (const p of raw.players) {
    const player = toClassDayPlayer(p);
    if (player) players.push(player);
  }
  return {
    on: raw.on,
    teamTimeZone,
    classTimeZone: str(raw.class_time_zone) ?? teamTimeZone,
    term: toTerm(raw.term),
    nextTerm: toNextTerm(raw.next_term),
    players,
    fetchedAt,
  };
}

function toUnusable(raw: unknown): ChUnusableClass[] {
  if (!Array.isArray(raw)) return [];
  const out: ChUnusableClass[] = [];
  for (const u of raw) {
    if (!isRecord(u)) continue;
    const classId = str(u.class_id);
    const reason = u.reason;
    if (classId && (reason === 'times' || reason === 'days' || reason === 'calendar_mismatch')) out.push({ classId, reason });
  }
  return out;
}

function toHeld(raw: unknown): ChMyClassDay['held'] {
  if (!isRecord(raw)) return null;
  const count = typeof raw.count === 'number' && Number.isFinite(raw.count) ? Math.max(0, Math.floor(raw.count)) : 0;
  if (count === 0) return null;
  return { count, releaseAt: isoOk(raw.release_at) ? raw.release_at : null };
}

/** The player's own payload, or null when its top-level shape is wrong or the player has no team. */
export function toMyClassDay(raw: unknown, fetchedAt: number = Date.now()): ChMyClassDay | null {
  if (!isRecord(raw) || !dayOk(raw.on)) return null;
  const teamId = str(raw.team_id);
  const teamTimeZone = str(raw.team_time_zone);
  if (!teamId || !teamTimeZone) return null;
  const settings = isRecord(raw.settings) ? raw.settings : {};
  const untagged = typeof raw.untagged_classes === 'number' && Number.isFinite(raw.untagged_classes) ? Math.max(0, Math.floor(raw.untagged_classes)) : 0;
  return {
    on: raw.on,
    teamId,
    teamTimeZone,
    classTimeZone: str(raw.class_time_zone) ?? teamTimeZone,
    term: toTerm(raw.term),
    settings: { shareStatus: bool(settings.share_status, true), holdPushes: bool(settings.hold_pushes, true) },
    player: toClassDayPlayer(raw.player),
    blocks: toBlocks(raw.blocks),
    untaggedClasses: untagged,
    unusableClasses: toUnusable(raw.unusable_classes),
    held: toHeld(raw.held),
    fetchedAt,
  };
}
