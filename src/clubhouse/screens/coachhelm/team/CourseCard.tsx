'use client';

import { useChPhone } from '../../../lib/use-phone';
import { Notice } from './parts';
import { Badge } from '../../../ui/Badge';
import { formatWith } from '../../../lib/dates';
import { pluralWord } from '../../../lib/plural';

import { useRef, useState } from 'react';
import { courseReads, type ChTeamBoardData, type ChTeamPlayer, type ChTourRow } from '../../../data/coachhelm-team-shape';
import type { CourseHistory, CourseHistoryRow } from '@/lib/coachhelm/v3/team-board/course-shape';
import { formatFixed, MINUS } from '../../../lib/format';
import { Chevron, ReadRow } from './parts';
import { useContentIn } from './team-motion';

const COURSE_CAP = 4;
const READ_CAP = 3;

/** To par: "+6.4", "E" at zero (AC-COURSE-02). */
export const toPar = (v: number): string => {
  const r = Math.round(v * 10) / 10;
  return r === 0 ? 'E' : `${r < 0 ? MINUS : '+'}${formatFixed(Math.abs(r), 1)}`;
};

/** A calendar day, never moved by the viewer's zone (CP-TEAM-16). */
export const day = (iso: string) => formatWith(new Date(`${iso}T00:00:00Z`), { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** The weekly line, lowest score on top; it draws once and a Show more doesn't redraw it (AC-COURSE-03, AC-COURSEALL-03). */
function Trend({ history }: { history: CourseHistory }) {
  const w = 320;
  const h = 118;
  const L = 6;
  const R = 40;
  const T = 14;
  const B = 24;
  const weeks = history.weeks;
  const season = history.season ?? 0;
  const vs = [...weeks.map((p) => p.value), season];
  const lo = Math.min(...vs) - 0.35;
  const hi = Math.max(...vs) + 0.35;
  const n = weeks.length;
  const x = (i: number) => L + (n < 2 ? (w - L - R) / 2 : (i * (w - L - R)) / (n - 1));
  const y = (v: number) => T + ((v - lo) / (hi - lo)) * (h - T - B);
  const pts = weeks.map((p, i) => [x(i), y(p.value)] as const);
  const last = pts[n - 1];
  const first = weeks[0];
  const newest = weeks[n - 1];
  if (!first || !newest || !last) return null;
  return (
    <svg className="trend" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Team average to par, week by week this season, from ${toPar(first.value)} in the week of ${day(first.start)} to ${toPar(newest.value)} in the week of ${day(newest.start)}. Season ${toPar(season)}. Higher on the chart is better.`}>
      <line className="gl" x1={L} x2={w - R + 8} y1={h - B + 6} y2={h - B + 6} />
      <line className="av" x1={L} x2={w - R + 8} y1={y(season)} y2={y(season)} />
      <text className="avl" x={w - R + 12} y={y(season) + 4}>
        {toPar(season)}
      </text>
      <path className="ln" d={'M' + pts.map((p) => `${Math.round(p[0] * 10) / 10} ${Math.round(p[1] * 10) / 10}`).join(' L')} />
      {pts.map((p, i) => (
        <circle key={weeks[i]!.start} className={'d' + (i === n - 1 ? ' last' : '')} cx={p[0]} cy={p[1]} r={i === n - 1 ? 4.6 : 3.1} />
      ))}
      <text className="lv" x={last[0]} y={last[1] - 10} textAnchor="middle">
        {toPar(newest.value)}
      </text>
      {weeks.map((p, i) => {
        const m = day(p.start).slice(0, 3);
        if (i > 0 && day(weeks[i - 1]!.start).slice(0, 3) === m) return null;
        return (
          <text key={p.start} className="mo" x={x(i)} y={h - 4} textAnchor={i === 0 ? 'start' : 'middle'}>
            {m}
          </text>
        );
      })}
    </svg>
  );
}

const TOUR_WORDS: Record<ChTourRow['id'], { label: string; unit: string; fmt: (v: number) => string }> = {
  scoring_par_3: { label: 'Par 3s', unit: 'a hole', fmt: (v) => signed2(v) },
  scoring_par_4: { label: 'Par 4s', unit: 'a hole', fmt: (v) => signed2(v) },
  scoring_par_5: { label: 'Par 5s', unit: 'a hole', fmt: (v) => signed2(v) },
  penalty_rate_per_round: { label: 'Penalty strokes', unit: 'a round', fmt: (v) => formatFixed(v, 1) },
  big_number_rate: { label: 'Double or worse', unit: 'of holes', fmt: (v) => `${formatFixed(v, 1)}%` },
  opening_hole_delta: { label: 'First hole', unit: 'vs average hole', fmt: (v) => signed2(v) },
};
function signed2(v: number): string {
  return `${v < 0 ? MINUS : '+'}${formatFixed(Math.abs(v), 2)}`;
}

function CourseRow({ row, season, readCount, onCourse }: { row: CourseHistoryRow; season: number; readCount: number; onCourse: (id: string) => void }) {
  const d = Math.round((row.value - season) * 10) / 10;
  return (
    <button type="button" className="cr tapp" data-ch-press-scale=".97" data-ch-team-course={row.id} onClick={() => onCourse(row.id)}>
      <span className="cn">
        <b>{row.name}</b>
        <span>
          {row.rounds} rounds · last {day(row.last)}
          {readCount ? ` · ${readCount} ${pluralWord(readCount, 'read', 'reads')}` : ''}
        </span>
      </span>
      <span className="cv">
        <b>{toPar(row.value)}</b>
        <span className={d > 0 ? 'l' : d < 0 ? 'g' : 'e'}>{d ? `${formatFixed(Math.abs(d), 1)} ${d > 0 ? 'over' : 'under'} season` : 'Level with season'}</span>
      </span>
      <Chevron />
    </button>
  );
}

/** The Course tab: scoring history, the reads with no spot, team against Tour, courses (S-TEAM.course). */
export function CourseCard({ data, initialAll = false, onRead, onCourse, onRetry }: { initialAll?: boolean; data: ChTeamBoardData; onRead: (id: string) => void; onCourse: (id: string) => void; onRetry?: () => void }) {
  const phone = useChPhone();
  const card = useRef<HTMLElement | null>(null);
  useContentIn(card, 'course', '.ch, .cmh, .crsw, .cmr, .shpw');
  const [allCourses, setAllCourses] = useState(initialAll);
  const [allReads, setAllReads] = useState(initialAll);
  const list = data.players.list;
  const reads = courseReads(list);
  const byId = new Map<string, ChTeamPlayer>(list.map((p) => [p.id, p]));
  const history = data.course.history;
  const season = history?.season ?? 0;
  const failed = (
    <div role="status">
      <Notice title="Couldn’t load this part" onRetry={onRetry} />
    </div>
  );
  const chip =
    history?.last4 == null ? (
      <Badge>Early season</Badge>
    ) : (
      <Badge tone={history.last4 < season ? 'positive' : history.last4 > season ? 'warning' : 'neutral'}>Last 4 weeks {toPar(history.last4)}</Badge>
    );
  const courses = history?.courses ?? [];
  const shownCourses = allCourses ? courses : courses.slice(0, COURSE_CAP);
  const shownReads = allReads ? reads : reads.slice(0, READ_CAP);
  const courseReadCount = (row: CourseHistoryRow) => reads.filter((r) => r.courseId === row.id).length;
  const historyBlock = history ? (
    <div className="cmh">
      <div className="cmk">
        <b>{toPar(season)}</b>
        <span>
          a round to par
          <br />
          This season · {history.rounds} rounds
        </span>
        {chip}
      </div>
      <Trend history={history} />
      <div className="tkey">
        <span>
          <i className="kl" />
          Team, week by week
        </span>
        <span>
          <i className="ka" />
          Season
        </span>
        <span>Higher is better</span>
      </div>
    </div>
  ) : (
    failed
  );
  const coursesBlock = history ? (
    <div className="crsw">
      <div className="subh">Courses this season · {courses.length}</div>
      <div className="crs">
        {shownCourses.map((row) => (
          <CourseRow key={row.id} row={row} season={season} readCount={courseReadCount(row)} onCourse={onCourse} />
        ))}
      </div>
      {courses.length > COURSE_CAP && (
        <button type="button" className="more" aria-expanded={allCourses} data-ch-team-more="courses" onClick={() => setAllCourses((v) => !v)}>
          {allCourses ? 'Show fewer' : `Show all ${courses.length} courses`}
        </button>
      )}
    </div>
  ) : null;
  const readsBlock = (
    <div className="cmr">
      <div className="subh">
        What CoachHelm sees here{reads.length ? ` · ${reads.length} open ${pluralWord(reads.length, 'read', 'reads')}` : ''}
      </div>
      <div className="rds">
        {shownReads.map((r) => {
          const p = byId.get(r.playerId);
          return p ? <ReadRow key={r.id} player={p} read={r} onOpen={onRead} /> : null;
        })}
        {!reads.length && <p className="nordss">No course or scoring reads yet. Penalties, big numbers, par scoring and the first hole get read once a player has enough rounds to stand behind it.</p>}
      </div>
      {reads.length > READ_CAP && (
        <button type="button" className="more" aria-expanded={allReads} data-ch-team-more="reads" onClick={() => setAllReads((v) => !v)}>
          {allReads ? 'Show fewer' : `Show ${reads.length - READ_CAP} more`}
        </button>
      )}
    </div>
  );
  const against = (
    <div className="shpw">
      <div className="subh">Team against Tour · {history?.last4 == null && history ? `from ${history.rounds} rounds` : 'this season'}</div>
      {data.course.against ? (
        <div className="shape">
          {data.course.against.map((row) => {
            const w = TOUR_WORDS[row.id];
            return (
              <div key={row.id}>
                <span className="sl">{w.label}</span>
                <span className="sv">{row.team == null ? '—' : w.fmt(row.team)}</span>
                {row.team != null && (
                  <span className="st">
                    {w.unit}
                    {row.tour != null ? ` · Tour ${w.fmt(row.tour)}` : ''}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        failed
      )}
    </div>
  );
  return (
    <section ref={card} className="card spot cm" data-spot="" data-ch-team-card="spot" aria-label="Course and scoring">
      <div className="ch">
        <h4>Course and scoring</h4>
        <span className="meta">Not on the hole · {reads.length ? `${reads.length} open ${pluralWord(reads.length, 'read', 'reads')}` : 'No open reads yet'}</span>
      </div>
      {/* One layout in the DOM (FID-TEAM-20). */}
      {phone ? (
        <div className="ch-htb-coursephone">
          {historyBlock}
          {readsBlock}
          {against}
          {coursesBlock}
        </div>
      ) : (
        <div className="spl ch-htb-coursedesk">
          <div className="spl-l">
            {historyBlock}
            {coursesBlock}
          </div>
          <div className="spl-r">
            {readsBlock}
            {against}
          </div>
        </div>
      )}
    </section>
  );
}
