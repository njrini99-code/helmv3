/**
 * Common free time across a set of players — the derivation the calendar
 * needs and nothing in this repo computes.
 *
 * WHY THIS IS A PURE FUNCTION, NOT SQL AND NOT A COMPONENT
 * -------------------------------------------------------
 * `getPlayerAvailability` (src/app/golf/actions/golf.ts) returns BUSY
 * intervals per player: `{ start, end, type, title? }[]`, instants as ISO
 * strings. "Everyone free 2:00-4:00 PM" is derived from those, and both
 * consumers of the derivation need the SAME arithmetic applied the SAME
 * way:
 *
 *   <=8 players selected -> one track per player plus an ALL FREE track
 *   whole roster         -> ranked windows with an N-of-M count, and the
 *                           ids of whoever blocks an otherwise-complete
 *                           window (so the UI can say "Maya has class"
 *                           instead of rendering fourteen avatars)
 *
 * One computation serves both: `allFreeWindows` is the ALL FREE track,
 * `rankedWindows` is the ranked list. Doing it in a component would fork
 * the arithmetic per view; doing it in SQL would put it out of reach of
 * fixture-driven tests. So: no React, no I/O, no Supabase client, no
 * `Date.now()` — testable with plain fixtures, exactly as
 * `computeDbHealthDelta` is.
 *
 * THE TIMEZONE RULE (audit P237)
 * ------------------------------
 * Intersect in the COACH'S LOCAL DAY. `getPlayerAvailability` takes a 4th
 * `timezoneOffset` argument precisely because UTC bucketing put an evening
 * event on the wrong day in western timezones; a free-window finder that
 * re-buckets by UTC reintroduces that bug one layer up.
 *
 * `zone` therefore accepts two things, and the second is not a luxury:
 *
 *   number  minutes WEST of UTC — the `Date.getTimezoneOffset()` convention
 *           the FairwayCalendar call site already passes. Exact parity with
 *           today's behaviour.
 *   string  an IANA zone name, resolved AT EACH INSTANT. A single sampled
 *           `getTimezoneOffset()` is a snapshot, and the month view spans a
 *           DST transition: sample 240 in late October and every November
 *           day's local boundaries are an hour off. The fixed-offset form
 *           is correct only within one offset regime.
 *
 * Deliberately NOT routed through `getZonedDateParts` / `getValidTimezone`
 * (src/lib/calendar/timezone.ts): `getValidTimezone` silently substitutes
 * `DEFAULT_TIMEZONE` for an unrecognised zone, which turns "we cannot
 * resolve this zone" into "America/New_York" with no signal — the P237
 * failure mode wearing a different hat. The local helper below returns
 * `null` instead, and the day lands in `unresolvedDays` so a reader can
 * tell "no free windows" apart from "we could not compute this day".
 * `offsetMinutesFor` in ./timezone.ts is the wall-clock->offset direction
 * only, single-pass, and documents itself as the offset "near that date";
 * the sweep needs instant->offset as well, and needs it exact.
 */

/**
 * One busy interval. Structurally satisfied by `SerializedBusyPeriod` from
 * `getPlayerAvailability`, so `availByPlayer.get(id)` passes straight in
 * with no mapping — `type` and `title` are ignored here on purpose. Which
 * KIND of busy a block is matters to the per-player track renderer; it
 * cannot matter to an intersection, where busy is busy.
 */
export interface BusyInterval {
  /** ISO instant. */
  start: string;
  /** ISO instant. */
  end: string;
}

/** One player's busy list, keyed by the id the caller selects players with. */
export interface PlayerBusy {
  playerId: string;
  busy: readonly BusyInterval[];
}

/**
 * Fixed offset in minutes WEST of UTC (`Date.getTimezoneOffset()`), or an
 * IANA zone name. See the module header for why both exist.
 */
export type LocalZone = number | string;

/** Wall-clock bounds of a usable day, in minutes from local midnight. */
export interface WorkingWindow {
  /** Inclusive start. 6am = 360. */
  startMinute: number;
  /** Exclusive end. 9pm = 1260; midnight-to-midnight is 0 -> 1440. */
  endMinute: number;
}

export interface CommonFreeTimeInput {
  /** Local calendar days, `YYYY-MM-DD`. Order is irrelevant; output is sorted. */
  days: readonly string[];
  zone: LocalZone;
  players: readonly PlayerBusy[];
  /** Defaults to 06:00-21:00, the axis the availability tracks render. */
  workingWindow?: WorkingWindow;
  /**
   * Windows shorter than this are dropped. Default 30 — below that is not a
   * practice slot, it is a gap between two obligations, and surfacing it
   * pushes the real answers off the list.
   */
  minWindowMinutes?: number;
}

export interface FreeWindow {
  /** The local calendar day this window belongs to, `YYYY-MM-DD`. */
  dayIso: string;
  /** ISO instant. */
  startIso: string;
  /** ISO instant. */
  endIso: string;
  /**
   * WALL-CLOCK minutes from local midnight — what positions a block on a
   * 6a-9p axis without the renderer redoing zone maths.
   *
   * On a DST day these do NOT agree with `durationMinutes`:
   * `endMinute - startMinute` is the wall-clock span and `durationMinutes`
   * is real elapsed time, and on a transition day they differ by 60. Both
   * are correct for their own job — the axis is drawn in wall clock, the
   * ranking compares actual available time. Pinned by test.
   *
   * ALWAYS FINITE. Worth stating because a consumer will write
   * `left: ${startMinute / 1440 * 100}%`, and `NaN%` is not an error — it is
   * a block that silently does not render. The guarantee holds because a day
   * whose zone cannot be resolved is diverted to `unresolvedDays` before any
   * window is built, so the resolution that produces these two numbers is
   * already known to succeed. Pinned by assertion, not left incidental.
   */
  startMinute: number;
  endMinute: number;
  /** Real elapsed minutes between the two instants. */
  durationMinutes: number;
  /** Input `players` order, so a colour-by-index consumer stays stable. */
  freePlayerIds: string[];
  /** Input `players` order. Empty means an "everyone free" window. */
  busyPlayerIds: string[];
  freeCount: number;
  totalPlayers: number;
}

export interface CommonFreeTimeResult {
  /** After de-duplication by `playerId`. */
  totalPlayers: number;
  /** `busyPlayerIds` empty, in chronological order. The ALL FREE track. */
  allFreeWindows: FreeWindow[];
  /** freeCount DESC, then duration DESC, then start ASC. */
  rankedWindows: FreeWindow[];
  /**
   * Days whose zone offset could not be resolved (an unrecognised IANA
   * name) or which are not a parseable `YYYY-MM-DD`. Reported rather than
   * guessed: a silent UTC fallback here IS audit P237.
   */
  unresolvedDays: string[];
}

const MS_PER_MINUTE = 60_000;
const DEFAULT_WORKING_WINDOW: WorkingWindow = { startMinute: 6 * 60, endMinute: 21 * 60 };
const DEFAULT_MIN_WINDOW_MINUTES = 30;
const DAY_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface Span {
  startMs: number;
  endMs: number;
}

/**
 * Merge overlapping AND TOUCHING spans.
 *
 * Touching is the case worth naming: `[9:00, 10:00)` and `[10:00, 11:00)`
 * do not overlap, and a merge that only handles `<` leaves them as two
 * spans meeting at a point. So the comparison is `<=`.
 *
 * Be precise about what that costs if it is wrong, because the obvious
 * claim — "it becomes a zero-length free window" — is false here and was
 * checked: the sweep collects boundaries into a Set, so the duplicated
 * 10:00 collapses and both halves still read as busy. The consequence is
 * borne by the EXPORTED helper's other consumer, the per-player track
 * renderer, which draws two abutting blocks with a hairline seam where one
 * continuous block belongs. Pinned by a direct test rather than through
 * `computeCommonFreeTime`, which does not distinguish the two.
 *
 * Zero-length and reversed spans (`end <= start`) are dropped at the door.
 * They are real: `src/lib/calendar/availability.ts` records production rows
 * where a single-day all-day event serialised to a zero-length busy period.
 * A zero-length busy block must not split a free window in two.
 * Unparseable instants are dropped for the same reason — a `NaN` boundary
 * poisons every comparison it reaches.
 *
 * Exported because the per-player track renderer wants the same merge, and
 * because it is worth pinning on its own.
 */
export function mergeSpans(spans: readonly Span[]): Span[] {
  const usable = spans
    .filter((s) => Number.isFinite(s.startMs) && Number.isFinite(s.endMs) && s.endMs > s.startMs)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  const merged: Span[] = [];
  for (const span of usable) {
    const last = merged[merged.length - 1];
    if (last && span.startMs <= last.endMs) {
      if (span.endMs > last.endMs) last.endMs = span.endMs;
    } else {
      merged.push({ startMs: span.startMs, endMs: span.endMs });
    }
  }
  return merged;
}

/**
 * The zone's UTC offset (minutes west, `getTimezoneOffset()` convention) AT
 * a given instant. Exact: `Intl` is asked what wall clock the zone shows at
 * that instant, and the difference from the instant itself IS the offset.
 * `null` for an unrecognised zone — never a fallback.
 */
function offsetAtInstant(instantMs: number, timeZone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(new Date(instantMs));

    const field: Record<string, string> = {};
    for (const part of parts) field[part.type] = part.value;
    // Some locales/zones render midnight as hour 24.
    const hour = field.hour === '24' ? '00' : field.hour;

    const wallAsUtc = Date.UTC(
      Number(field.year),
      Number(field.month) - 1,
      Number(field.day),
      Number(hour),
      Number(field.minute),
      Number(field.second),
    );
    if (!Number.isFinite(wallAsUtc)) return null;

    return Math.round((instantMs - wallAsUtc) / MS_PER_MINUTE);
  } catch {
    // Invalid IANA name. The caller records the day as unresolved.
    return null;
  }
}

/**
 * The instant at which `zone`'s wall clock reads `dayIso` + `minute`.
 *
 * Two passes, because the offset depends on the instant and the instant
 * depends on the offset. Treat the wall reading as if it were UTC, ask the
 * zone for its offset there, apply it, then re-ask at the corrected instant
 * and apply again. That second pass is what makes a boundary near a DST
 * transition land on the right side of it; a single pass is only right when
 * the offset happens not to change across the ~14h it can be wrong by.
 *
 * `null` propagates an unresolvable zone.
 */
function wallClockToInstant(dayIso: string, minute: number, zone: LocalZone): number | null {
  const midnightAsUtc = Date.parse(`${dayIso}T00:00:00.000Z`);
  if (!Number.isFinite(midnightAsUtc)) return null;
  const wallAsUtc = midnightAsUtc + minute * MS_PER_MINUTE;

  // Local = UTC - offset, so UTC = local + offset (offset positive west).
  if (typeof zone === 'number') {
    if (!Number.isFinite(zone)) return null;
    return wallAsUtc + zone * MS_PER_MINUTE;
  }

  const firstGuessOffset = offsetAtInstant(wallAsUtc, zone);
  if (firstGuessOffset === null) return null;
  const firstGuess = wallAsUtc + firstGuessOffset * MS_PER_MINUTE;

  const refinedOffset = offsetAtInstant(firstGuess, zone);
  if (refinedOffset === null) return null;
  return wallAsUtc + refinedOffset * MS_PER_MINUTE;
}

/**
 * The wall-clock minute of an instant, relative to `dayIso`'s local midnight.
 *
 * The `null` offset branch is unreachable from `computeCommonFreeTime`: it
 * resolves both day boundaries in the same zone FIRST and diverts the day to
 * `unresolvedDays` if either fails, so by the time a window exists the zone
 * is known to resolve. The branch is kept rather than asserted away because
 * this is a private helper someone may later call from a new code path, and
 * the honest answer to "what minute is this" for an unresolvable zone is not
 * zero. `FreeWindow.startMinute` documents the finiteness guarantee that
 * ordering buys, and a test pins it.
 */
function instantToWallMinute(instantMs: number, dayIso: string, zone: LocalZone): number {
  const midnightAsUtc = Date.parse(`${dayIso}T00:00:00.000Z`);
  const offset = typeof zone === 'number' ? zone : offsetAtInstant(instantMs, zone);
  if (offset === null) return NaN;
  const wallAsUtc = instantMs - offset * MS_PER_MINUTE;
  return Math.round((wallAsUtc - midnightAsUtc) / MS_PER_MINUTE);
}

/** De-duplicate by `playerId`, keeping input order and unioning busy lists. */
function dedupePlayers(players: readonly PlayerBusy[]): {
  ids: string[];
  busyById: Map<string, BusyInterval[]>;
} {
  const ids: string[] = [];
  const busyById = new Map<string, BusyInterval[]>();
  for (const player of players) {
    const existing = busyById.get(player.playerId);
    if (existing) {
      existing.push(...player.busy);
    } else {
      ids.push(player.playerId);
      busyById.set(player.playerId, [...player.busy]);
    }
  }
  return { ids, busyById };
}

interface Segment {
  startMs: number;
  endMs: number;
  busyIds: string[];
  key: string;
}

/**
 * Free windows across a set of players' busy intervals, in the coach's
 * local day.
 *
 * With ZERO players the result is empty, not "the whole window is free".
 * "All 0 players are free 6am-9pm" is vacuously true and useless, and a
 * consumer rendering it would announce a team-wide opening for a team
 * nobody selected.
 *
 * Windows in which NOBODY is free are dropped: a ranked list of times to
 * schedule at has no use for a row that cannot be scheduled. The
 * half-hourly busy-count histogram the whole-roster view also draws is a
 * different derivation over the same input and is not computed here.
 */
export function computeCommonFreeTime(input: CommonFreeTimeInput): CommonFreeTimeResult {
  const workingWindow = input.workingWindow ?? DEFAULT_WORKING_WINDOW;
  const minWindowMinutes = input.minWindowMinutes ?? DEFAULT_MIN_WINDOW_MINUTES;
  const { ids: playerIds, busyById } = dedupePlayers(input.players);
  const totalPlayers = playerIds.length;

  const unresolvedDays: string[] = [];
  const windows: FreeWindow[] = [];

  if (totalPlayers === 0 || workingWindow.endMinute <= workingWindow.startMinute) {
    return { totalPlayers, allFreeWindows: [], rankedWindows: [], unresolvedDays };
  }

  // Sorted and de-duplicated so a caller passing days out of order, or twice,
  // gets one chronological result rather than a shuffled or doubled one.
  const days = [...new Set(input.days)].sort();

  for (const dayIso of days) {
    if (!DAY_ISO_PATTERN.test(dayIso)) {
      unresolvedDays.push(dayIso);
      continue;
    }
    const dayStartMs = wallClockToInstant(dayIso, workingWindow.startMinute, input.zone);
    const dayEndMs = wallClockToInstant(dayIso, workingWindow.endMinute, input.zone);
    if (dayStartMs === null || dayEndMs === null || !(dayEndMs > dayStartMs)) {
      unresolvedDays.push(dayIso);
      continue;
    }

    // Each player's busy, clipped to this day's window and merged. Clipping
    // BEFORE merging is what keeps a multi-day all-day event (stored as one
    // interval spanning the whole window) from being discarded as
    // out-of-range or from dragging boundaries outside the day.
    const mergedByPlayer = new Map<string, Span[]>();
    for (const playerId of playerIds) {
      const clipped: Span[] = [];
      for (const interval of busyById.get(playerId) ?? []) {
        const startMs = Date.parse(interval.start);
        const endMs = Date.parse(interval.end);
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
        const clipStart = Math.max(startMs, dayStartMs);
        const clipEnd = Math.min(endMs, dayEndMs);
        if (clipEnd > clipStart) clipped.push({ startMs: clipStart, endMs: clipEnd });
      }
      mergedByPlayer.set(playerId, mergeSpans(clipped));
    }

    // Sweep: cut the day at every busy boundary, then ask who is busy in
    // each resulting segment.
    const boundaries = new Set<number>([dayStartMs, dayEndMs]);
    for (const spans of mergedByPlayer.values()) {
      for (const span of spans) {
        boundaries.add(span.startMs);
        boundaries.add(span.endMs);
      }
    }
    const cuts = [...boundaries].sort((a, b) => a - b);

    const segments: Segment[] = [];
    for (let i = 0; i < cuts.length - 1; i += 1) {
      const startMs = cuts[i]!;
      const endMs = cuts[i + 1]!;
      const busyIds = playerIds.filter((playerId) =>
        (mergedByPlayer.get(playerId) ?? []).some(
          (span) => span.startMs < endMs && span.endMs > startMs,
        ),
      );
      segments.push({ startMs, endMs, busyIds, key: busyIds.join(' ') });
    }

    // Coalesce neighbours that share a busy set.
    //
    // While the per-player merge holds this is a NO-OP, and saying so is more
    // useful than the plausible story: every internal cut is some player's
    // block start or end, so that player's busy status necessarily differs
    // across it, so no two neighbours can share a set. Measured by mutation
    // — disabling this branch alone leaves all 37 tests green.
    //
    // It is kept because it is the third independent guard on one invariant
    // ("an unbroken free stretch is ONE window"), and the only one that
    // survives a bad boundary reaching the sweep. Measured the same way:
    // loosen BOTH length filters so a zero-length busy period gets through,
    // and the sweep cuts the day at an instant nobody is busy at — this
    // branch is what puts the two halves back together, and the suite stays
    // green. The boundary set is also the part of this function most likely
    // to grow; a half-hourly tick source for the roster histogram would
    // fragment every window in the output without it.
    const coalesced: Segment[] = [];
    for (const segment of segments) {
      const last = coalesced[coalesced.length - 1];
      if (last && last.key === segment.key && last.endMs === segment.startMs) {
        last.endMs = segment.endMs;
      } else {
        coalesced.push({ ...segment });
      }
    }

    for (const segment of coalesced) {
      const durationMinutes = Math.round((segment.endMs - segment.startMs) / MS_PER_MINUTE);
      if (durationMinutes < minWindowMinutes) continue;
      const busySet = new Set(segment.busyIds);
      const freePlayerIds = playerIds.filter((playerId) => !busySet.has(playerId));
      if (freePlayerIds.length === 0) continue;

      windows.push({
        dayIso,
        startIso: new Date(segment.startMs).toISOString(),
        endIso: new Date(segment.endMs).toISOString(),
        startMinute: instantToWallMinute(segment.startMs, dayIso, input.zone),
        endMinute: instantToWallMinute(segment.endMs, dayIso, input.zone),
        durationMinutes,
        freePlayerIds,
        busyPlayerIds: playerIds.filter((playerId) => busySet.has(playerId)),
        freeCount: freePlayerIds.length,
        totalPlayers,
      });
    }
  }

  // Chronological already (days sorted, sweep ascending), so allFree is a
  // straight filter. Ranking sorts a COPY — `windows` order is the
  // chronological contract allFreeWindows depends on.
  const allFreeWindows = windows.filter((w) => w.busyPlayerIds.length === 0);
  const rankedWindows = [...windows].sort(
    (a, b) =>
      b.freeCount - a.freeCount ||
      b.durationMinutes - a.durationMinutes ||
      // Start ASC is the tiebreak that makes the order total. Without it two
      // equally good windows swap places between renders on a different sort
      // implementation, and the "best window" a coach taps moves.
      Date.parse(a.startIso) - Date.parse(b.startIso) ||
      a.dayIso.localeCompare(b.dayIso),
  );

  return { totalPlayers, allFreeWindows, rankedWindows, unresolvedDays };
}
