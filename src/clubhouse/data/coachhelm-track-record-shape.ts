/**
 * The coach's Track record (P013, `?view=track-record`; supercharge 02 §9 and 03 §7.3): how often the reads CoachHelm showed this
 * team held when they were rechecked, by claim level and by family, and what the staff said about them. Kept apart from the server
 * loader (data/coachhelm-track-record.ts) so the screen, the preview and the tests all word it with the code the page does.
 *
 * Words and counts only: a level or a family with fewer than `TRACK_RECORD_MIN_RECHECKED` rechecked reads says "Not enough yet" and
 * how many it has, never a share of tiny numbers. No percent is printed anywhere; the bar beside a level that has enough is the
 * same count drawn, with the target as a thin line.
 */
import {
  RUNG_TARGETS,
  TRACK_RECORD_MIN_RECHECKED,
  type FamilyRow,
  type RungRow,
  type RungTarget,
  type TrackRecord,
} from '@/lib/coachhelm/v3/track-record/track-record';
import type { LadderRung } from '@/lib/coachhelm/v3/support/ladder';
import { plural } from '../lib/plural';

export const COACH_TRACK_RECORD_HREF = '/golf/dashboard/coachhelm?view=track-record';
export const COACH_BOARD_HREF = '/golf/dashboard/coachhelm';

/** The claim ladder's words (02 §6), as every CoachHelm surface prints them. */
export const RUNG_WORD: Record<LadderRung, string> = {
  seen_repeatedly: 'Seen repeatedly',
  observed: 'Observed',
  likely: 'Likely',
  working_hypothesis: 'Working hypothesis',
  not_enough_yet: 'Not enough yet',
};

/** The insight families' names, by `insight_type`. A family not listed reads as its type in sentence case. */
const FAMILY_LABEL: Record<string, string> = {
  putt_distance: 'Putting by distance',
  putt_bias: 'Putt miss side',
  putt_slope_bias: 'Putting on slopes',
  approach_miss: 'Approach misses',
  tee_strategy: 'Tee strategy',
  composite: 'Combined reads',
  course_management: 'Course management',
  scrambling: 'Scrambling',
  par_scoring: 'Scoring by par',
  warmup_hole: 'Opening holes',
  pressure_gap: 'Pressure gap',
};

export function familyLabel(family: string): string {
  const known = FAMILY_LABEL[family];
  if (known) return known;
  const words = family.replace(/[_-]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Other';
}

export type ChTrackTone = 'good' | 'warn' | 'plain';

export interface ChTrackRung {
  id: LadderRung;
  word: string;
  /** "12 of 14 held", or "Not enough yet". */
  line: string;
  /** What the line stands on: the rechecked count still needed, or the target and where the level sits against it. */
  sub: string;
  tone: ChTrackTone;
  /** Drawn only once the level has enough rechecked reads: the held count over the rechecked count, and the target in tenths. */
  bar: { held: number; of: number; target: number | null } | null;
}

export interface ChTrackFamily {
  id: string;
  label: string;
  line: string;
  sub: string;
}

export type ChTrackRecord =
  /** The database cannot answer yet (the function the read needs is not applied): said as such, never as "nothing shown". */
  | { state: 'unavailable' }
  | {
      state: 'ready';
      /** "Aug 1": where the window starts. */
      since: string;
      /** The program line, 02 §9. */
      program: string;
      /** Reads shown before the claim ladder, counted in the program line and in no level; null when none. */
      unrated: string | null;
      /** The staff's corrections, 03 §7.3; null when corrections are not recorded yet. */
      corrections: string | null;
      rungs: ChTrackRung[];
      families: ChTrackFamily[];
      /** Nothing shown in the window. */
      empty: boolean;
    };


function targetWords(target: RungTarget | null): string {
  if (!target) return 'No target set for this level';
  return target.kind === 'at_least' ? `Target: at least ${target.tenths} in 10 hold` : `Expected: fewer than ${target.tenths} in 10 hold`;
}

function rungView(row: RungRow, sinceWord: string): ChTrackRung {
  const word = RUNG_WORD[row.rung];
  const target = RUNG_TARGETS[row.rung];
  if (row.standing === 'not_enough') {
    const sub =
      row.shown === 0
        ? `None shown since ${sinceWord}`
        : `${row.rechecked} of ${row.shown} rechecked so far. Judged from ${TRACK_RECORD_MIN_RECHECKED}`;
    return { id: row.rung, word, line: 'Not enough yet', sub, tone: 'plain', bar: null };
  }
  const line = `${row.held} of ${row.rechecked} held`;
  const said =
    row.standing === 'on_target'
      ? 'on target'
      : row.standing === 'too_strict'
        ? 'held too often, so its floors may be too strict'
        : row.standing === 'below_target'
          ? target?.kind === 'below'
            ? 'held more often than expected'
            : 'below target'
          : null;
  const sub = said ? `${targetWords(target)}; ${said}` : targetWords(target);
  const tone: ChTrackTone = row.standing === 'on_target' ? 'good' : row.standing === 'no_target' ? 'plain' : 'warn';
  return { id: row.rung, word, line, sub, tone, bar: { held: row.held, of: row.rechecked, target: target?.tenths ?? null } };
}

function familyView(row: FamilyRow): ChTrackFamily {
  const parts = [`${row.shown} shown`];
  const enough = row.standing !== 'not_enough';
  if (!enough) parts.push(`${row.rechecked} rechecked`);
  if (enough && row.cleared) parts.push(`${row.cleared} cleared`);
  if (enough && row.contradicted) parts.push(`${row.contradicted} contradicted`);
  if (row.not_this) parts.push(`${row.not_this} not this`);
  if (row.confirm) parts.push(plural(row.confirm, 'good read'));
  return {
    id: row.family,
    label: familyLabel(row.family),
    line: enough ? `${row.held} of ${row.rechecked} held` : 'Not enough yet',
    sub: parts.join(' · '),
  };
}

function programLine(tr: TrackRecord, sinceWord: string): string {
  const p = tr.program;
  const shown = `Since ${sinceWord} CoachHelm showed ${plural(p.shown, 'read')} on this team.`;
  if (p.rechecked === 0) return `${shown} None has been rechecked yet: a read is rechecked once its player has 3 more rounds, or 20 more attempts in its family.`;
  const parts = [
    `${p.held} held when rechecked`,
    `${p.cleared} cleared on ${p.cleared === 1 ? 'its' : 'their'} own`,
    `${p.contradicted} ${p.contradicted === 1 ? 'was' : 'were'} contradicted by later rounds`,
  ];
  const waiting = p.shown - p.rechecked;
  return `${shown} ${parts.join(', ')}.${waiting > 0 ? ` ${waiting} not rechecked yet.` : ''}`;
}

function correctionsLine(tr: TrackRecord): string {
  const c = tr.corrections;
  const parts = [
    c.not_this ? `${c.not_this} not this` : null,
    c.wrong_cause ? plural(c.wrong_cause, 'wrong cause', 'wrong causes') : null,
    c.already_on_it ? `${c.already_on_it} already on it` : null,
    c.snooze ? `${c.snooze} show later` : null,
    c.confirm ? plural(c.confirm, 'good read') : null,
  ].filter((s): s is string => s != null);
  if (parts.length === 0) return 'Your staff has not marked any of these reads yet.';
  const later =
    c.not_this + c.wrong_cause > 0
      ? `; ${tr.correctedThenCleared} of the not this and wrong cause ${tr.correctedThenCleared === 1 ? 'read' : 'reads'} cleared on ${tr.correctedThenCleared === 1 ? 'its' : 'their'} own later`
      : '';
  return `Your staff marked ${parts.join(', ')}${later}.`;
}

/** "Aug 1" from an ISO date (the window's start), in UTC so the server and the client agree. */
export function sinceWord(isoDate: string): string {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return 'the season start';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function toChTrackRecord(tr: TrackRecord, opts: { since: string; correctionsAvailable: boolean }): ChTrackRecord {
  const since = sinceWord(opts.since);
  const unratedShown = tr.unrated.shown;
  return {
    state: 'ready',
    since,
    program: programLine(tr, since),
    unrated:
      unratedShown > 0
        ? `${plural(unratedShown, 'read')} ${unratedShown === 1 ? 'was' : 'were'} shown before reads carried a level, so ${unratedShown === 1 ? 'it counts' : 'they count'} above and in no level below.`
        : null,
    corrections: opts.correctionsAvailable ? correctionsLine(tr) : null,
    rungs: tr.rungs.map((r) => rungView(r, since)),
    families: tr.families.map(familyView),
    empty: tr.program.shown === 0,
  };
}
