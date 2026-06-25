// =============================================================================
// src/lib/baseball/class-conflict-engine.ts
//
// Packet: video-classes — the PURE Class Conflict Engine (V6 §Class Conflict
// Engine). No I/O, no Supabase, no React: it takes a player's classes +
// the team's calendar obligations and returns derived conflicts with severity,
// honest confidence, source refs (BOTH sides), and a recommended ops action.
//
// CONTROLLING SPEC: v6_video_classes_automation_system.md §Class Conflict Engine
//   Inputs:  player classes, team calendar events, lift sessions, travel,
//            practices, games, study hall.
//   Outputs: player conflict list (+ severity).
//   Severity:
//     hard          -> class overlaps a MANDATORY event/lift/practice/game/
//                      travel departure.
//     soft          -> back-to-back location/travel proximity issue.
//     watch         -> high credit load + travel + low compliance.
//     informational -> player unavailable for an OPTIONAL station.
//
// HONESTY (zip non-negotiable: never emit a false "high"):
//   - Classes store day-of-week + wall-clock time (no date). A team obligation
//     is a concrete timestamp range. We can only assert an overlap when the
//     obligation's weekday matches a class day AND the wall-clock windows
//     overlap. Because the class side is recurring-by-weekday (not a dated
//     instance), confidence is CAPPED below 0.7 unless the class carries an
//     explicit semester/term we can trust. This matches the V2 AI rule
//     "confidence is below 0.7 when data is partial".
//   - We never invent a conflict from missing data: a class with no times, or an
//     obligation with no start, yields NO conflict (it is surfaced upstream as a
//     data-quality gap, not a false academic flag).
//
// NO GOLF: no round/hole/tee/course vocabulary. Recalibrated for 12-25 player
// rosters and box-score-only programs (small samples are normal here).
// =============================================================================

import type {
  BaseballClassConflictSeverity,
  BaseballConflictObligationKind,
  BaseballConflictActionType,
  BaseballSignalSourceRef,
} from '@/lib/types/baseball-video-classes';

// -----------------------------------------------------------------------------
// Inputs (normalized, source-agnostic — caller maps DB rows to these)
// -----------------------------------------------------------------------------

/** Canonical 3-letter weekday tokens we normalize class days to. */
export type Weekday = 'Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat';

const WEEKDAYS: readonly Weekday[] = [
  'Sun',
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
];

/** A player's class meeting (from baseball_player_classes). */
export interface ClassInput {
  classId: string;
  playerId: string;
  className: string;
  /** Raw day tokens as stored (e.g. ['Mon','Wed','Fri'] or ['MWF']). */
  days: string[];
  /** Wall-clock "HH:MM[:SS]"; null if unknown (then no conflict is derivable). */
  startTime: string | null;
  endTime: string | null;
  building?: string | null;
  room?: string | null;
  credits?: number | null;
  semester?: string | null;
}

/** A team obligation the player is expected at (event/game/practice/lift/travel). */
export interface ObligationInput {
  kind: BaseballConflictObligationKind;
  /** The id on the corresponding table (event_id | game_id | practice_id). */
  id: string;
  label: string;
  /** ISO timestamp; null if unknown (then no conflict is derivable). */
  startsAt: string | null;
  /** ISO timestamp; may be null for an open-ended obligation. */
  endsAt: string | null;
  isMandatory: boolean;
  /** Optional location for soft back-to-back proximity detection. */
  location?: string | null;
}

/** Per-player context used for the 'watch' severity (credit load / compliance). */
export interface PlayerConflictContext {
  playerId: string;
  /** Sum of enrolled credits this term (null if unknown). */
  totalCredits?: number | null;
  /** Recent ack/attendance compliance in [0,1] (null if unknown). */
  complianceRate?: number | null;
  /** Whether the player has travel in the window being evaluated. */
  hasTravelInWindow?: boolean;
}

// -----------------------------------------------------------------------------
// Output
// -----------------------------------------------------------------------------

export interface DerivedConflict {
  playerId: string;
  classId: string;
  className: string;
  classDay: Weekday;
  classStart: string; // HH:MM
  classEnd: string; // HH:MM
  obligationKind: BaseballConflictObligationKind;
  eventId: string | null;
  gameId: string | null;
  practiceId: string | null;
  obligationLabel: string;
  obligationStart: string; // ISO
  obligationEnd: string | null; // ISO
  isMandatory: boolean;
  severity: BaseballClassConflictSeverity;
  overlapMinutes: number;
  /** Honest [0,1] — capped below 0.7 when the class side is recurring-only. */
  confidence: number;
  whyItMatters: string;
  sourceRefs: BaseballSignalSourceRef[];
  recommendedActionLabel: string;
  recommendedActionType: BaseballConflictActionType;
  /** Stable key so a re-derivation UPSERTs instead of cloning. */
  dedupeKey: string;
}

// -----------------------------------------------------------------------------
// Time helpers (pure)
// -----------------------------------------------------------------------------

/** Parse "HH:MM[:SS]" to minutes-since-midnight; null on bad input. */
export function parseClockToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function minutesToClock(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Normalize a stored day token to canonical weekdays. Handles 'MWF', 'TR',
 * 'Monday', 'Mon', 'M', etc. Returns [] on anything unrecognized. */
export function normalizeDays(raw: string[]): Weekday[] {
  const out = new Set<Weekday>();
  const add = (d: Weekday) => out.add(d);
  for (const tok of raw ?? []) {
    const s = (tok ?? '').trim();
    if (!s) continue;
    const lower = s.toLowerCase();
    // Full / abbreviated single tokens.
    if (lower.startsWith('sun')) { add('Sun'); continue; }
    if (lower.startsWith('mon')) { add('Mon'); continue; }
    if (lower.startsWith('tue')) { add('Tue'); continue; }
    if (lower.startsWith('wed')) { add('Wed'); continue; }
    if (lower.startsWith('thu')) { add('Thu'); continue; }
    if (lower.startsWith('fri')) { add('Fri'); continue; }
    if (lower.startsWith('sat')) { add('Sat'); continue; }
    // Compact patterns like 'MWF' / 'TR' / 'MTWRF' — iterate letters.
    // U=Sun, M=Mon, T=Tue, W=Wed, R=Thu, F=Fri, S=Sat (registrar convention).
    for (const ch of s.toUpperCase()) {
      switch (ch) {
        case 'U': add('Sun'); break;
        case 'M': add('Mon'); break;
        case 'T': add('Tue'); break;
        case 'W': add('Wed'); break;
        case 'R': add('Thu'); break;
        case 'F': add('Fri'); break;
        case 'S': add('Sat'); break;
        default: break;
      }
    }
  }
  // Preserve canonical week order.
  return WEEKDAYS.filter((d) => out.has(d));
}

/** Weekday of an ISO timestamp in a given IANA tz (defaults to local). */
export function weekdayOf(iso: string, timeZone?: string): Weekday | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  let idx: number;
  if (timeZone) {
    // Use Intl to get the weekday in the team's tz, then map to index.
    const wd = new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      timeZone,
    }).format(d);
    idx = WEEKDAYS.indexOf(wd as Weekday);
    if (idx < 0) return null;
  } else {
    idx = d.getDay();
  }
  return WEEKDAYS[idx] ?? null;
}

/** Local wall-clock minutes-since-midnight of an ISO ts (optionally in a tz). */
function clockMinutesOf(iso: string, timeZone?: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  if (timeZone) {
    const parts = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone,
    }).formatToParts(d);
    const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 'NaN');
    const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 'NaN');
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return (h % 24) * 60 + m;
  }
  return d.getHours() * 60 + d.getMinutes();
}

/** Overlap (minutes) of two [start,end) wall-clock intervals; 0 if disjoint. */
function overlapMinutes(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): number {
  const lo = Math.max(aStart, bStart);
  const hi = Math.min(aEnd, bEnd);
  return Math.max(0, hi - lo);
}

// -----------------------------------------------------------------------------
// Engine
// -----------------------------------------------------------------------------

export interface DetectConflictsOptions {
  /** IANA tz the obligation timestamps are interpreted in (program tz). */
  timeZone?: string;
  /** Credit-load threshold above which a high-load player earns a 'watch'. */
  highCreditLoad?: number; // default 15
  /** Compliance below this (with travel) earns a 'watch'. */
  lowComplianceRate?: number; // default 0.7
  /** Minutes between a class end and an obligation start that count as a soft
   * back-to-back proximity conflict (location change risk). */
  backToBackMinutes?: number; // default 15
}

const DEFAULTS: Required<Omit<DetectConflictsOptions, 'timeZone'>> = {
  highCreditLoad: 15,
  lowComplianceRate: 0.7,
  backToBackMinutes: 15,
};

function srcRef(
  table: string,
  id: string,
  label: string,
  visibility: BaseballSignalSourceRef['visibility'],
): BaseballSignalSourceRef {
  return { source_table: table, source_id: id, label, visibility };
}

function obligationFkColumns(o: ObligationInput): {
  eventId: string | null;
  gameId: string | null;
  practiceId: string | null;
  table: string;
} {
  switch (o.kind) {
    case 'game':
      return { eventId: null, gameId: o.id, practiceId: null, table: 'baseball_games' };
    case 'practice':
      return { eventId: null, gameId: null, practiceId: o.id, table: 'baseball_practices' };
    // event / lift / travel / study_hall all live on baseball_events.
    default:
      return { eventId: o.id, gameId: null, practiceId: null, table: 'baseball_events' };
  }
}

/**
 * Detect class-vs-obligation conflicts for ONE player. Pure + deterministic.
 *
 * @param classes      this player's class meetings
 * @param obligations  this player's team obligations (already filtered to ones
 *                     the player is expected at — caller scopes attendance)
 * @param ctx          player credit-load / compliance context for 'watch'
 * @param opts         thresholds + program time zone
 */
export function detectClassConflictsForPlayer(
  classes: ClassInput[],
  obligations: ObligationInput[],
  ctx: PlayerConflictContext,
  opts: DetectConflictsOptions = {},
): DerivedConflict[] {
  const cfg = { ...DEFAULTS, ...opts };
  const tz = opts.timeZone;
  const out: DerivedConflict[] = [];

  for (const cls of classes) {
    const cStart = parseClockToMinutes(cls.startTime);
    const cEnd = parseClockToMinutes(cls.endTime);
    // No derivable conflict from a class with no times — never fabricate.
    if (cStart === null || cEnd === null || cEnd <= cStart) continue;
    const classDays = normalizeDays(cls.days);
    if (classDays.length === 0) continue;

    for (const ob of obligations) {
      if (!ob.startsAt) continue; // no concrete time -> not derivable
      const obWeekday = weekdayOf(ob.startsAt, tz);
      if (!obWeekday || !classDays.includes(obWeekday)) continue;

      const obStartMin = clockMinutesOf(ob.startsAt, tz);
      if (obStartMin === null) continue;
      const obEndMin =
        ob.endsAt != null
          ? clockMinutesOf(ob.endsAt, tz) ?? obStartMin + 60
          : obStartMin + 60; // assume 60-min obligation when open-ended

      const overlap = overlapMinutes(cStart, cEnd, obStartMin, obEndMin);

      // Determine relationship: direct overlap vs back-to-back proximity.
      const gapAfterClass = obStartMin - cEnd; // >0 => obligation starts after class
      const isBackToBack =
        overlap === 0 && gapAfterClass >= 0 && gapAfterClass <= cfg.backToBackMinutes;

      if (overlap <= 0 && !isBackToBack) continue;

      // ---- Severity (V6 §Severity) -----------------------------------------
      let severity: BaseballClassConflictSeverity;
      if (overlap > 0 && ob.isMandatory) {
        severity = 'hard';
      } else if (isBackToBack) {
        severity = 'soft';
      } else {
        // Direct overlap with a NON-mandatory obligation = player unavailable
        // for an optional station -> informational, unless the player's load /
        // compliance context escalates it to 'watch'.
        const highLoad =
          (ctx.totalCredits ?? 0) >= cfg.highCreditLoad &&
          (ctx.hasTravelInWindow ?? false);
        const lowCompliance =
          ctx.complianceRate != null &&
          ctx.complianceRate < cfg.lowComplianceRate &&
          (ctx.hasTravelInWindow ?? false);
        severity = highLoad || lowCompliance ? 'watch' : 'informational';
      }

      // ---- Honest confidence -----------------------------------------------
      // Class side is recurring-by-weekday (not a dated instance), so we cap
      // confidence below 0.7 (V2 rule: partial data => <0.7). A class carrying a
      // trusted semester/term raises it slightly; a back-to-back proximity (no
      // hard overlap) is inherently softer.
      let confidence = 0.5;
      if (cls.semester) confidence = 0.65;
      if (isBackToBack) confidence = Math.min(confidence, 0.45);
      // Mandatory-overlap is the most certain class of conflict, but still
      // recurring-only -> ceiling 0.69 (never a false "high").
      if (severity === 'hard') confidence = Math.min(0.69, confidence + 0.1);

      const { eventId, gameId, practiceId, table } = obligationFkColumns(ob);

      const whyItMatters =
        severity === 'hard'
          ? `${cls.className} (${minutesToClock(cStart)}–${minutesToClock(cEnd)} ${obWeekday}) overlaps the mandatory "${ob.label}". The player cannot attend both.`
          : severity === 'soft'
            ? `${cls.className} ends at ${minutesToClock(cEnd)} and "${ob.label}" begins ${gapAfterClass} min later — tight turnaround${ob.location ? ` (location: ${ob.location})` : ''}.`
            : severity === 'watch'
              ? `${cls.className} overlaps "${ob.label}"; flagged for review given this player's credit load / compliance.`
              : `${cls.className} overlaps the optional "${ob.label}". The player is unavailable for it.`;

      const recommendedActionType: BaseballConflictActionType =
        severity === 'hard'
          ? 'player_task' // e.g. travel-letter / contingency task for ops
          : severity === 'soft'
            ? 'meeting_item'
            : 'player_note';
      const recommendedActionLabel =
        severity === 'hard'
          ? ob.kind === 'travel' || /bus|depart|travel/i.test(ob.label)
            ? 'Create travel-letter task for ops'
            : 'Create contingency task for staff'
          : severity === 'soft'
            ? 'Add to staff agenda: review tight turnaround'
            : 'Note player unavailable for this block';

      const sourceRefs: BaseballSignalSourceRef[] = [
        srcRef(
          'baseball_player_classes',
          cls.classId,
          `${cls.className} (${obWeekday} ${minutesToClock(cStart)}–${minutesToClock(cEnd)})`,
          'staff_only', // class detail is academic — staff-gated provenance
        ),
        srcRef(table, ob.id, ob.label, 'team'),
      ];

      out.push({
        playerId: cls.playerId,
        classId: cls.classId,
        className: cls.className,
        classDay: obWeekday,
        classStart: minutesToClock(cStart),
        classEnd: minutesToClock(cEnd),
        obligationKind: ob.kind,
        eventId,
        gameId,
        practiceId,
        obligationLabel: ob.label,
        obligationStart: ob.startsAt,
        obligationEnd: ob.endsAt,
        isMandatory: ob.isMandatory,
        severity,
        overlapMinutes: overlap,
        confidence,
        whyItMatters,
        sourceRefs,
        recommendedActionLabel,
        recommendedActionType,
        // dedupe: one open conflict per (player, class, obligation, weekday).
        dedupeKey: `class_conflict:${cls.playerId}:${cls.classId}:${ob.kind}:${ob.id}:${obWeekday}`,
      });
    }
  }

  // Stable order: hardest first, then by obligation start.
  out.sort((a, b) => {
    const sa = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sa !== 0) return sa;
    return a.obligationStart.localeCompare(b.obligationStart);
  });
  return out;
}

const SEVERITY_ORDER: Record<BaseballClassConflictSeverity, number> = {
  hard: 0,
  soft: 1,
  watch: 2,
  informational: 3,
};

/** Map a conflict severity to a Signal severity (V10 Signal Stack buckets). */
export function conflictToSignalSeverity(
  s: BaseballClassConflictSeverity,
): 'critical' | 'warning' | 'info' {
  switch (s) {
    case 'hard':
      return 'critical';
    case 'soft':
    case 'watch':
      return 'warning';
    default:
      return 'info';
  }
}
