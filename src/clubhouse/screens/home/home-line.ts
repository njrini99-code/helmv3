import type { ChClassDay } from '../../data/class-day-shape';
import type { ChScheduleCoverage } from '../../data/class-day';
import { HOME_LINE_FROM_HOUR, HOME_LINE_UNTIL_HOUR, minutesOfDay, statusClock, teamNow, windowRange, type ChStatusTextOptions } from '../../data/class-status';
import { clockFromMinutes } from '../../lib/clock-format';
import { plural } from '../../lib/plural';

/**
 * P-10 class awareness: the line on Coach Home ("4 of 9 in class now" / "Everyone out of class from 2:15 PM"), as a
 * pure function of the payload, the instant and the clock. It is a line, not a card: it says what is true, never
 * "everyone free" (untracked players and practices are unknown), and it is hidden whenever there is nothing true and
 * useful to say: a weekend, a team-wide no-class day, outside 7 AM to 7 PM team time, after the last block, and with no
 * term and no schedules (the Classes page owns onboarding).
 *
 * Fail open: every missing input hides the line.
 */
export type HomeLine = {
  line1: string;
  line2: string | null;
  /** Where a tap goes: the In class now sheet, or straight to the Term sheet when no term covers today. */
  opens: 'sheet' | 'term';
  /** The whole line as one sentence for assistive tech. */
  label: string;
};

const DATE = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });

/** "Mon, Aug 24" from YYYY-MM-DD. */
export function shortDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : DATE.format(d);
}

const isWeekend = (iso: string) => {
  const dow = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return dow === 0 || dow === 6;
};

function make(line1: string, line2: string | null, opens: HomeLine['opens'] = 'sheet'): HomeLine {
  return { line1, line2, opens, label: [line1, line2, opens === 'term' ? 'Opens term dates' : 'Opens class status'].filter(Boolean).join('. ') };
}

export function homeLineFor(input: { day: ChClassDay | null; now: number | null; opts: ChStatusTextOptions | null; coverage: ChScheduleCoverage | null }): HomeLine | null {
  const { day, now, opts, coverage } = input;
  if (!day || now == null || !opts) return null;
  const zone = day.classTimeZone;
  const minutes = minutesOfDay(now, zone);
  if (minutes == null || minutes < HOME_LINE_FROM_HOUR * 60 || minutes >= HOME_LINE_UNTIL_HOUR * 60) return null;
  if (isWeekend(day.on)) return null;
  const total = day.players.length;
  if (total === 0) return null;
  if (day.players.every((p) => p.offToday)) return null;

  if (!day.term) {
    if (day.nextTerm) {
      return make(`Classes start ${shortDate(day.nextTerm.classesStart)}`, coverage && coverage.players > 0 ? `${coverage.players} of ${total} have added classes` : null);
    }
    if (coverage && coverage.players > 0) {
      return make('Set this term’s dates to show class status', `${[coverage.label, `${coverage.players} of ${total} have added classes`].filter(Boolean).join(' · ')}`, 'term');
    }
    return null;
  }

  const tn = teamNow(day, now);
  const inBlock = tn.inClassNow + tn.inExamNow;

  if (tn.tracked * 2 < total) {
    const shared = `Class schedules shared by ${tn.tracked} of ${total}`;
    return inBlock > 0 ? make(`${inBlock} of ${tn.tracked} tracked in class now`, shared) : make(shared, 'Ask for schedules');
  }

  if (day.term.phase === 'exams') {
    return make(inBlock > 0 ? `Exams · ${inBlock} in an exam now` : 'Exams · no one in an exam now', `Exams end ${shortDate(day.term.examsEnd)}`);
  }

  if (tn.lastEndAt == null || (inBlock === 0 && now >= tn.lastEndAt)) return null;

  const cutoff = clockFromMinutes(HOME_LINE_UNTIL_HOUR * 60, opts.clock).replace(':00 ', ' ');
  const fw = tn.freeWindow;
  const window =
    fw === 'none_before_cutoff'
      ? `No hour with everyone out of class before ${cutoff}`
      : fw && fw.to == null
        ? `Everyone out of class from ${statusClock(fw.from, opts) ?? ''}`.trim()
        : fw
          ? `Everyone out of class ${windowRange(fw.from, fw.to, opts) ?? ''}`.trim()
          : null;

  if (inBlock > 0) return make(`${inBlock} of ${total} in class now`, window);
  if (tn.firstClassAt != null && now < tn.firstClassAt) {
    const t = statusClock(tn.firstClassAt, opts);
    return t ? make(`First class ${t}`, window) : null;
  }
  const next = tn.nextClass && statusClock(tn.nextClass.at, opts);
  return make('No one in class now', next && tn.nextClass ? `Next class ${next} · ${plural(tn.nextClass.count, 'player')}` : window);
}
