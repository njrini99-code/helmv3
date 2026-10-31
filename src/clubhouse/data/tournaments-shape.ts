/**
 * P016 Tournaments: rows to the view shapes of `screens/tournaments/types.ts`. Pure (no I/O, no clock: `now` is passed
 * in), so the loaders (`tournaments.ts`), the tests and the preview fixtures agree on one answer. The team math is the
 * engines': `scoring.ts` (counting sets, team rounds and the event), `standings.ts` (places and W-L-T). This module only
 * maps vocabularies and assembles.
 *
 * Mappings the stored rows and the view types do not share (each named where it is done):
 *   - event kind: `ncaa_regional` / `ncaa_championship` are the views' `regional` / `national`;
 *   - round status: `suspended_weather` / `suspended_other` are `suspended`; a final round of an event marked official
 *     (`official_at`) is `official`;
 *   - squad: there is no squad column until held file 4 (100300), so every entry is the A squad and a field team's
 *     squad is B only when the coach marked it `is_b_team`;
 *   - records: `standings.ts` counts `{ wins, losses, ties }`, the views read `{ w, l, t }`;
 *   - a round's par: the tee's total par, else the course's, else 72 (36 for nine holes) — the one stand-in, because a
 *     round's par is not nullable in the view and a round with no course still has to read to par.
 */
import { formatOf, teamEvent, teamRound, type ChTourPlayerScore, type ChTourTeamRound as EngineTeamRound } from '../screens/tournaments/scoring';
import { placeField, recordFromFinish, type ChTourRecord as EngineRecord } from '../screens/tournaments/standings';
import type {
  ChTourAvailability,
  ChTourCount,
  ChTourCourse,
  ChTourEntry,
  ChTourEvent,
  ChTourEventKind,
  ChTourField,
  ChTourFieldTeam,
  ChTourHoleLedger,
  ChTourLineupState,
  ChTourMood,
  ChTourPlayer,
  ChTourPlayerRound,
  ChTourRecord,
  ChTourRound,
  ChTourRoundStatus,
  ChTourSeason,
  ChTourTeamRound,
  ChTourTrust,
  TeamEventResult,
  TourFormat,
} from '../screens/tournaments/types';
import type {
  TourDbEventKind,
  TourDbRoundStatus,
  TourEntryRow,
  TourFieldScoreRow,
  TourFieldTeamRow,
  TourPlayerRoundRow,
  TourRoundLineupRow,
  TourRoundRow,
  TourRow,
  TourTeamSeasonRow,
} from '@/lib/golf/tournaments-tables';
import { seasonLabelOf } from '../lib/season-start';

// ── Seasons ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** A college season runs August to July: `2026-10-05` is in `2026-27`. */
export function seasonIdOf(date: string): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const start = m >= 8 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

export function seasonOf(id: string, gender: 'mens' | 'womens', profile: TourTeamSeasonRow | null): ChTourSeason {
  const start = Number(id.slice(0, 4));
  const division = profile?.division && profile.division !== 'other' ? profile.division : null;
  return {
    id,
    label: seasonLabelOf(`${start}-08-01`),
    start: `${start}-08-01`,
    end: `${start + 1}-07-31`,
    division,
    gender,
    conference: profile?.conference ?? null,
    ranking: profile?.official_rank != null && profile.official_rank_at ? { value: profile.official_rank, enteredAt: profile.official_rank_at } : null,
  };
}

/** Every season with an event, plus the current one, newest first. */
export function seasonsFor(eventDates: readonly string[], today: string, gender: 'mens' | 'womens', profiles: readonly TourTeamSeasonRow[]): ChTourSeason[] {
  const ids = new Set([seasonIdOf(today), ...eventDates.map(seasonIdOf)]);
  const byId = new Map(profiles.map((p) => [p.season, p]));
  return [...ids].sort((a, b) => b.localeCompare(a)).map((id) => seasonOf(id, gender, byId.get(id) ?? null));
}

// ── People and courses ──────────────────────────────────────────────────────────────────────────────────────────

export interface TourPlayerInput {
  id: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  graduationYear: number | null;
  /** `golf_team_members.status`; anything but active is alumni (kept with the events they played). */
  status: string | null;
  /** `golf_team_members.availability`. */
  availability: string | null;
}

/** "Junior", "Graduated 2026", or empty when the roster has no class year. */
export function classYear(graduationYear: number | null, seasonEndYear: number): string {
  if (graduationYear == null) return '';
  const left = graduationYear - seasonEndYear;
  if (left < 0) return `Graduated ${graduationYear}`;
  return ['Senior', 'Junior', 'Sophomore', 'Freshman'][left] ?? 'Freshman';
}

function availabilityOf(value: string | null): ChTourAvailability {
  if (value === 'injured') return 'injured';
  if (value === 'away') return 'not_travelling';
  return 'available';
}

export function playerOf(p: TourPlayerInput, seasonEndYear: number): ChTourPlayer {
  const first = (p.firstName ?? '').trim();
  const last = (p.lastName ?? '').trim();
  const name = [first, last].filter(Boolean).join(' ') || 'Player';
  const initials = ((first[0] ?? '') + (last[0] ?? '')).toUpperCase() || name.slice(0, 1).toUpperCase();
  return {
    id: p.id,
    name,
    first: first || name,
    initials,
    year: classYear(p.graduationYear, seasonEndYear),
    avatarUrl: p.avatarUrl,
    alumni: p.status !== 'active',
    availability: availabilityOf(p.availability),
  };
}

export interface TourCourseInput {
  id: string;
  name: string;
  par: number | null;
  rating: number | null;
  tees: string | null;
}

export function courseOf(c: TourCourseInput, holes: 9 | 18 = 18): ChTourCourse {
  return { id: c.id, name: c.name, tees: c.tees ?? '', par: c.par ?? (holes === 9 ? 36 : 72), rating: c.rating, holes: [] };
}

// ── One event ───────────────────────────────────────────────────────────────────────────────────────────────────

const EVENT_KIND: Record<TourDbEventKind, ChTourEventKind> = {
  regular: 'regular',
  conference: 'conference',
  ncaa_regional: 'regional',
  ncaa_championship: 'national',
  exhibition: 'exhibition',
};

export function roundStatusOf(status: TourDbRoundStatus, official: boolean): ChTourRoundStatus {
  if (status === 'suspended_weather' || status === 'suspended_other') return 'suspended';
  if (status === 'final') return official ? 'official' : 'final';
  return status;
}

const TRUST_OF_ROUND: Record<ChTourRoundStatus, ChTourTrust> = { upcoming: 'upcoming', live: 'live', suspended: 'suspended', final: 'final', official: 'official' };

/** What a linked GolfHelm round brings: its total once completed, and whether holes and strokes gained exist. */
export interface TourLinkedRound {
  total: number | null;
  completed: boolean;
  holes: boolean;
  shots: boolean;
}

export interface TourRawRound extends TourRoundRow {
  /** yyyy-mm-dd of the round day on the team's clock (from its golf_events row). */
  date: string;
  /** One player's par for the round (the tee's, else the course's); null when neither is known. */
  par: number | null;
  /** Its calendar entry is cancelled: the round will not be played, so it never holds the event open. */
  cancelled?: boolean;
}

export interface TourRawEvent {
  t: TourRow;
  rounds: TourRawRound[];
  entries: TourEntryRow[];
  roundLineups: TourRoundLineupRow[];
  playerRounds: TourPlayerRoundRow[];
  /** Linked golf_rounds by id. */
  linked: Record<string, TourLinkedRound>;
  fieldTeams: TourFieldTeamRow[];
  fieldScores: TourFieldScoreRow[];
}

const parOf = (r: TourRawRound, holes: 9 | 18) => r.par ?? (holes === 9 ? 36 : 72);

/**
 * One player's par for an event round from the tee's or course's par, which is stored for eighteen holes. A nine-hole
 * event plays half of it (rounded, as the comparison pool does); a par that is already a nine's (under 45) stays.
 */
export function eventRoundPar(par18: number | null | undefined, holesPerRound: number | null | undefined): number | null {
  if (par18 == null) return null;
  return holesPerRound === 9 && par18 >= 45 ? Math.round(par18 / 2) : par18;
}

/** The engine's team round in the views' shape (`reason` and `missing` are optional there). */
export function teamRoundView(r: EngineTeamRound, roundNumber: number, roundEventId: string, par: number): ChTourTeamRound {
  return {
    kind: r.kind,
    total: r.total,
    toPar: r.toPar,
    counting: r.counting,
    dropped: r.dropped,
    tiedAtBoundary: r.tiedAtBoundary,
    ...(r.reason ? { reason: r.reason } : {}),
    ...(r.missing.length ? { missing: r.missing } : {}),
    roundNumber,
    roundEventId,
    par,
  };
}

const recordView = (r: EngineRecord): ChTourRecord => ({ w: r.wins, l: r.losses, t: r.ties });

function countOf(role: ChTourEntry['role'], playerId: string, r: EngineTeamRound | null): ChTourCount {
  if (role === 'individual') return 'individual';
  if (!r || (r.kind !== 'complete' && r.kind !== 'live')) return 'none';
  if (r.counting.includes(playerId)) return 'counted';
  if (r.tiedAtBoundary.includes(playerId)) return 'tie';
  return r.dropped.includes(playerId) ? 'dropped' : 'none';
}

function lineLabel(kind: 'advance' | 'cut' | 'match_play', places: number): string {
  if (kind === 'cut') return `Cut after ${places}`;
  if (kind === 'match_play') return `Top ${places} to match play`;
  return `Top ${places} advance`;
}

export function lineupStateOf(t: TourRow, rounds: readonly TourRawRound[], entries: readonly TourEntryRow[], format: TourFormat, now: string): ChTourLineupState {
  const firstTee = rounds.find((r) => r.round_number === 1)?.first_tee_at ?? null;
  const locksAt = firstTee ? new Date(Date.parse(firstTee) - t.lock_minutes * 60_000).toISOString() : null;
  const published = t.lineup_published_at;
  const shown = published != null && Date.parse(published) <= Date.parse(now);
  // An individual event has no lineup size: each player entered is set (the form sends no team size, so the
  // stored default of 5 read "0 of 5 set" beside three entered players).
  const individual = format.kind === 'individual';
  const set = entries.filter((e) => e.role === (individual ? 'individual' : 'lineup')).length;
  const status: ChTourLineupState['status'] = t.lineup_locked_at
    ? 'locked'
    : published && shown
      ? 'published'
      : published
        ? 'scheduled'
        : entries.length
          ? 'draft'
          : 'none';
  // Who saw the reveal is held file 4's receipts table: unknown until then, never zero.
  return { status, locksAt, publishAt: published && !shown ? published : null, publishedAt: published && shown ? published : null, seen: null, set, of: individual ? set : format.players };
}

/**
 * One event from its rows. Rounds that have not started and have no score add no team round; a player's score is the
 * entered total, else the linked GolfHelm round's once it is completed (D-82: golf_rounds is never changed).
 */
const GENERIC_TAIL = /\s+(invitational|intercollegiate|classic|championships?|tournament|open|collegiate|cup)$/i;

/**
 * The event's name for tight places. The first word alone made "Tar" of the Tar Heel Invitational and "Fall vs Fall" of
 * two fall events (audit 2026-10-31): a short name stays whole, a long one drops its generic last words, else keeps two.
 */
export function eventShortName(name: string): string {
  const full = name.trim();
  if (full.length <= 20) return full;
  let s = full;
  while (GENERIC_TAIL.test(s)) s = s.replace(GENERIC_TAIL, '');
  if (s && s !== full && s.length <= 24) return s;
  return full.split(/\s+/).slice(0, 2).join(' ');
}

export function shapeEvent(raw: TourRawEvent, now: string): ChTourEvent {
  const { t } = raw;
  const format: TourFormat = formatOf(t.format, t.players_per_team, t.counting, t.holes_per_round);
  const official = t.official_at != null;
  const rounds = [...raw.rounds].sort((a, b) => a.round_number - b.round_number);
  const viewRounds: ChTourRound[] = rounds.map((r) => ({
    roundEventId: r.round_event_id,
    eventId: t.id,
    number: r.round_number,
    date: r.date,
    courseId: r.course_id ?? t.course_id ?? '',
    startType: r.start_type,
    firstTeeAt: r.first_tee_at,
    status: roundStatusOf(r.status, official),
    par: parOf(r, format.holes),
    thirtySix: rounds.filter((x) => x.date === r.date).length > 1,
  }));

  const entries: ChTourEntry[] = [...raw.entries]
    .sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99) || a.player_id.localeCompare(b.player_id))
    .map((e) => ({ playerId: e.player_id, role: e.role, slot: e.slot, squad: 'A' }));

  const playerRounds: ChTourPlayerRound[] = [];
  const teamRounds: ChTourTeamRound[] = [];
  const engineRounds: EngineTeamRound[] = [];
  for (const [i, r] of rounds.entries()) {
    const view = viewRounds[i]!;
    // Who played this round: the snapshot taken at lock (after any substitution), else the entries.
    const snapshot = raw.roundLineups.filter((l) => l.round_event_id === r.round_event_id);
    const field = snapshot.length ? snapshot.map((l) => ({ playerId: l.player_id, role: l.role, slot: l.slot })) : entries.map((e) => ({ playerId: e.playerId, role: e.role, slot: e.slot }));
    const rows = new Map(raw.playerRounds.filter((p) => p.round_event_id === r.round_event_id).map((p) => [p.player_id, p]));
    const scores: ChTourPlayerScore[] = field
      .filter((f) => f.role !== 'alternate')
      .map((f) => {
        const row = rows.get(f.playerId);
        const linked = row?.round_id ? raw.linked[row.round_id] : undefined;
        const total = row?.entered_total ?? (linked?.completed ? linked.total : null);
        return { playerId: f.playerId, role: f.role, slot: f.slot, total, status: row?.status ?? 'ok' };
      });
    const started = r.status !== 'upcoming' || scores.some((s) => s.total != null);
    const result = started ? teamRound(scores, format, view.par) : null;
    if (result) {
      engineRounds.push(result);
      teamRounds.push(teamRoundView(result, r.round_number, r.round_event_id, view.par * format.counting));
    }
    for (const s of scores) {
      const row = rows.get(s.playerId);
      if (!row && s.total == null && !started) continue;
      const linked = row?.round_id ? raw.linked[row.round_id] : undefined;
      playerRounds.push({
        eventId: t.id,
        roundEventId: r.round_event_id,
        roundNumber: r.round_number,
        playerId: s.playerId,
        role: s.role,
        slot: s.slot,
        squad: 'A',
        total: s.total,
        toPar: s.total != null ? s.total - view.par : null,
        status: s.status,
        source: row?.entered_total != null ? 'coach' : 'card',
        trust: TRUST_OF_ROUND[view.status],
        roundId: row?.round_id ?? null,
        holesKnown: !!linked?.holes && row?.entered_total == null,
        shotData: !!linked?.shots && row?.entered_total == null,
        officialTotal: null,
        count: countOf(s.role, s.playerId, result),
      });
    }
  }

  const ev = engineRounds.length ? teamEvent(engineRounds) : null;
  const result: TeamEventResult | null = ev && ev.kind !== 'none' ? { kind: ev.kind, total: ev.total, toPar: ev.toPar, rounds: teamRounds, droppedTotal: ev.droppedTotal } : null;

  // A round cancelled on the calendar will never be final: the event completes on the rounds that are played.
  const played = rounds.filter((r) => !r.cancelled);
  const cancelled = rounds.length > 0 && played.length === 0;
  const allFinal = played.length > 0 && played.every((r) => r.status === 'final');
  const anyStarted = played.some((r) => r.status !== 'upcoming');
  const status: ChTourEvent['status'] = allFinal ? 'complete' : anyStarted ? 'live' : 'upcoming';
  const suspended = rounds.some((r) => r.status === 'suspended_weather' || r.status === 'suspended_other');
  const trust: ChTourTrust = official ? 'official' : allFinal ? 'final' : suspended ? 'suspended' : anyStarted ? 'live' : 'upcoming';
  const mood: ChTourMood = status === 'upcoming' ? 'prep' : status === 'live' ? 'live' : 'result';

  const field = shapeField(raw, teamRounds, format, viewRounds);
  const us = field?.teams.find((x) => x.us) ?? null;
  // The place is among the teams with an entered score, so it is "of" them: "T2 of 10" with five entered claimed a place
  // among teams nobody had scored.
  const finish = us && us.placeN != null && us.place ? { place: us.place, placeN: us.placeN, of: field!.entered } : null;
  const team = playerRounds.filter((p) => p.role !== 'individual' && p.total != null);

  return {
    id: t.id,
    seasonId: seasonIdOf(t.start_date),
    name: t.name,
    short: eventShortName(t.name),
    host: t.host,
    startDate: t.start_date,
    endDate: t.end_date,
    courseIds: [...new Set(viewRounds.map((r) => r.courseId).filter(Boolean))],
    format,
    kind: EVENT_KIND[t.event_kind],
    tiebreak: t.tiebreak,
    status,
    cancelled,
    trust,
    mood,
    rounds: viewRounds,
    entries,
    playerRounds,
    team: { rounds: teamRounds, result },
    field,
    finish,
    record: field && status === 'complete' ? fieldRecord(raw.fieldTeams, field) : null,
    coverage: { scorecards: team.length, withShots: team.filter((p) => p.shotData).length },
    resultsUrl: t.results_url,
    lineup: lineupStateOf(t, rounds, raw.entries, format, now),
    note: null,
    legacy: false,
    createdAt: t.created_at ?? null,
  };
}

/** The field table: our row from our own team rounds, every other team from the totals the coach entered (D-83). */
export function shapeField(raw: TourRawEvent, teamRounds: readonly ChTourTeamRound[], format: TourFormat, rounds: readonly ChTourRound[]): ChTourField | null {
  if (!raw.fieldTeams.length) return null;
  const n = rounds.length;
  const teamPar = rounds.reduce((sum, r) => sum + r.par, 0) * format.counting;
  const scores = (id: string) => raw.fieldScores.filter((s) => s.field_team_id === id);
  const rows = raw.fieldTeams.map((ft) => {
    const own = scores(ft.id);
    const byRound: Array<number | null> = Array.from({ length: n }, (_, i) => {
      if (ft.is_us) return teamRounds.find((tr) => tr.roundNumber === i + 1)?.total ?? null;
      return own.find((s) => s.round_number === i + 1)?.total ?? null;
    });
    const complete = byRound.length > 0 && byRound.every((v) => v != null);
    const total = complete ? byRound.reduce<number>((a, b) => a + (b ?? 0), 0) : ft.is_us ? null : ft.final_total;
    const enteredAt = own.map((s) => s.entered_at).sort().at(-1) ?? null;
    const thru = own.find((s) => s.round_number === n)?.thru ?? null;
    return { ft, byRound, total, enteredAt, thru };
  });
  // Field rows carry totals only (no dropped scores or cards), so an NCAA or playoff tie stays shared until the coach
  // enters the host's place (final_place, below).
  const places = placeField(rows.map((r) => ({ id: r.ft.id, total: r.total, seed: r.ft.seed })), raw.t.tiebreak);
  const placeById = new Map(places.map((p) => [p.id, p]));
  const teams: ChTourFieldTeam[] = rows.map((r) => {
    const p = placeById.get(r.ft.id);
    // A place the coach entered (from the host's sheet) wins over our arithmetic.
    const placeN = r.ft.final_place ?? p?.place ?? null;
    const place = r.ft.final_place != null ? `${r.ft.final_place_tied ? 'T' : ''}${r.ft.final_place}` : p?.place != null ? p.label : null;
    return {
      id: r.ft.id,
      name: r.ft.name,
      us: r.ft.is_us,
      squad: r.ft.is_b_team ? 'B' : 'A',
      sameDivision: r.ft.same_division,
      seed: r.ft.seed,
      rounds: r.byRound,
      total: r.total,
      toPar: r.total != null ? r.total - teamPar : null,
      place,
      placeN,
      thru: r.thru,
      enteredAt: r.enteredAt,
      source: r.ft.is_us ? 'card' : 'coach',
    };
  });
  const line = raw.t.line_kind && raw.t.line_value ? { kind: raw.t.line_kind, label: lineLabel(raw.t.line_kind, raw.t.line_value), places: raw.t.line_value } : null;
  const asOf = teams.map((x) => x.enteredAt).filter((x): x is string => !!x).sort().at(-1) ?? null;
  return { size: raw.t.field_size ?? teams.length, entered: teams.filter((x) => x.total != null).length, teams, line, asOf };
}

function fieldRecord(fieldTeams: readonly TourFieldTeamRow[], field: ChTourField): ChTourRecord | null {
  const us = field.teams.find((x) => x.us);
  if (!us) return null;
  const b = new Set(fieldTeams.filter((f) => f.is_b_team).map((f) => f.id));
  return recordView(recordFromFinish(us.id, field.teams.map((x) => ({ id: x.id, place: x.placeN, isBTeam: b.has(x.id), sameDivision: x.sameDivision }))));
}

// ── Holes ───────────────────────────────────────────────────────────────────────────────────────────────────────

export interface TourHoleRow {
  round_id: string;
  hole_number: number;
  par: number;
  score: number | null;
}

/** The hole ledger from the linked rounds' golf_holes (D-88: a card's holes, never edited here). */
export function shapeHoles(event: ChTourEvent, holes: readonly TourHoleRow[]): ChTourHoleLedger {
  const byRound = new Map<string, TourHoleRow[]>();
  for (const h of holes) byRound.set(h.round_id, [...(byRound.get(h.round_id) ?? []), h]);
  const size = event.format.holes;
  const cards: ChTourHoleLedger['cards'] = [];
  const totalsOnly: ChTourHoleLedger['totalsOnly'] = [];
  let pars: number[] | null = null;
  for (const pr of event.playerRounds) {
    if (pr.total == null) continue;
    const rows = pr.roundId && pr.holesKnown ? (byRound.get(pr.roundId) ?? []) : [];
    if (!rows.length) {
      totalsOnly.push({ playerId: pr.playerId, roundNumber: pr.roundNumber });
      continue;
    }
    const sorted = [...rows].sort((a, b) => a.hole_number - b.hole_number);
    pars ??= Array.from({ length: size }, (_, i) => sorted.find((h) => h.hole_number === i + 1)?.par ?? 4);
    cards.push({
      playerId: pr.playerId,
      roundNumber: pr.roundNumber,
      roundEventId: pr.roundEventId,
      holes: Array.from({ length: size }, (_, i) => {
        const h = sorted.find((x) => x.hole_number === i + 1);
        return { n: i + 1, par: h?.par ?? pars![i] ?? 4, strokes: h?.score ?? null, source: 'card' as const, disputed: false };
      }),
      startHole: 1,
    });
  }
  return { courseId: event.courseIds[0] ?? '', pars: pars ?? Array.from({ length: size }, () => 4), handicaps: Array.from({ length: size }, () => null), cards, totalsOnly };
}
