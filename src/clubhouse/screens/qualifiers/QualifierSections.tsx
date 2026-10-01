'use client';

import { UserPlus } from 'lucide-react';
import type { ChQDetailCore, ChQDetailSecondary } from '../../data/qualifiers';
import { Avatar } from '../../ui/Avatar';
import { Badge } from '../../ui/Badge';
import { Icon } from '../../ui/Icon';
import { InlineNotice } from '../../ui/Notices';
import { useRefresh } from '../../lib/use-refresh';
import { plural, type ChQStatus } from './model';
import { ToPar } from './parts';
import { CoursesSkeleton, Streamed } from './streamed';

/** The detail's side sections, shared by desktop (QualifierDetail) and the phone (QualifierDetailPhone). */

/** The standings on screen are the last good ones: the read that would have replaced them failed (CH-09220). */
export function StaleStandings() {
  const { refresh, refreshing } = useRefresh();
  return (
    <InlineNotice
      code="CH-09220"
      title="These standings may be out of date."
      body="The latest scores didn’t load, so this is the last list that did. Try again to bring it up to date."
      onRetry={refresh}
      retrying={refreshing}
    />
  );
}

export function Selections({ data, status, topScore }: { data: ChQDetailCore; status: ChQStatus; topScore: number }) {
  const { refresh, refreshing } = useRefresh();
  const coach = data.role === 'coach';
  const confirmed = data.selectionState === 'selected';
  if (!coach && !confirmed) return null;
  const b = data.board;
  const head = (
    <div className="ch-qf-panel__head">
      <div>
        <h2 id="ch-qf-sel">{confirmed ? 'Squad' : 'Selections'}</h2>
        <p className="ch-num">
          {data.squad}-player squad · {topScore} on score{data.picks ? ` · ${plural(data.picks, 'pick')}` : ''}
        </p>
      </div>
    </div>
  );

  if (confirmed) {
    // The names come from the entries, so a field that didn't load leaves the squad nameless: say so rather than list "A player".
    const squadMissing = data.entriesError
      ? 'The players’ names come with the field, which didn’t load, so the squad list is missing until it does.'
      : 'The leaderboard is right; the squad list is missing until it loads.';
    if (data.selectionsError || data.entriesError || !data.selections) {
      return (
        <section className="ch-qf-side" aria-labelledby="ch-qf-sel">
          {head}
          <InlineNotice code="CH-09207" title="The confirmed squad didn’t load." body={squadMissing} onRetry={refresh} retrying={refreshing} />
        </section>
      );
    }
    const order = new Map((b?.rows ?? []).map((r, i) => [r.playerId, i]));
    const squad = [...data.selections].sort(
      (x, y) => (x.type === y.type ? 0 : x.type === 'top_score' ? -1 : 1) || (order.get(x.playerId) ?? 99) - (order.get(y.playerId) ?? 99),
    );
    const reasons = squad.filter((s) => s.type === 'coach_pick' && s.reasoning);
    return (
      <section className="ch-qf-side" aria-labelledby="ch-qf-sel">
        {head}
        <ol className="ch-qf-list">
          {squad.map((s, i) => (
            <li key={s.playerId}>
              <span className="ch-qf-list__n">{i + 1}</span>
              <Avatar name={s.name} size={26} />
              <b>{s.name}</b>
              {s.type === 'coach_pick' && <Badge tone="accent">Pick</Badge>}
            </li>
          ))}
        </ol>
        {coach &&
          reasons.map((s) => (
            <p key={s.playerId} className="ch-qf-why">
              <b>Pick reasoning{reasons.length > 1 ? `, ${s.name}` : ''}.</b> {s.reasoning}
            </p>
          ))}
        {/* A failed read of the notes is not "no notes": the picks above stay, the missing notes are named. */}
        {coach && data.reasonsError && (
          <InlineNotice code="CH-09221" title="Pick notes didn’t load." body="The squad is right; the coach’s notes on the picks are missing until they load." onRetry={refresh} retrying={refreshing} />
        )}
      </section>
    );
  }

  const qualifying = b && status !== 'upcoming' ? b.rows.slice(0, topScore) : [];
  return (
    <section className="ch-qf-side" aria-labelledby="ch-qf-sel">
      {head}
      {!b ? (
        <p className="ch-qf-why">The squad shows here once the scores load.</p>
      ) : !qualifying.length ? (
        <p className="ch-qf-why">The squad fills in as rounds are submitted.</p>
      ) : (
        <>
          <div className="ch-qf-list__k">{status === 'completed' ? 'Qualified on score' : 'Qualifying now'}</div>
          <ol className="ch-qf-list">
            {qualifying.map((r, i) => (
              <li key={r.playerId}>
                <span className="ch-qf-list__n">{i + 1}</span>
                <Avatar name={r.name} size={26} />
                <b>{r.name}</b>
                <ToPar value={r.toPar} />
              </li>
            ))}
            {Array.from({ length: data.picks }, (_, i) => (
              <li key={`pick-${i}`} className="is-open">
                <span className="ch-qf-list__n">{qualifying.length + i + 1}</span>
                <span className="ch-qf-list__slot">
                  <Icon icon={UserPlus} size={13} />
                </span>
                <b>Coach’s pick</b>
                <span className="ch-qf-list__m">Open</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

/**
 * Course per round. It streams in behind the standings (the tees are read after them): the head and the rows' place are drawn at once,
 * and the rows fill in when the courses land.
 */
export function Courses({ data }: { data: ChQDetailCore }) {
  return (
    <section className="ch-qf-side" aria-labelledby="ch-qf-courses">
      <div className="ch-qf-panel__head">
        <div>
          <h2 id="ch-qf-courses">Course per round</h2>
          <p className="ch-num">
            {plural(data.numRounds, 'round')}
            <Streamed fallback={null}>{(s) => (s.par != null ? ` · par ${s.par}` : '')}</Streamed>
          </p>
        </div>
      </div>
      <Streamed fallback={<CoursesSkeleton rounds={data.numRounds} />}>{(s) => <CourseRows s={s} />}</Streamed>
    </section>
  );
}

function CourseRows({ s }: { s: ChQDetailSecondary }) {
  const { refresh, refreshing } = useRefresh();
  if (s.coursesError) {
    return <InlineNotice code="CH-09206" title="The round courses didn’t load." body="The standings are right; which course each round is on is missing until it loads." onRetry={refresh} retrying={refreshing} />;
  }
  return (
    <ol className="ch-qf-list">
      {s.roundCourses.map((c) => (
        <li key={c.number}>
          <span className="ch-qf-rn">{c.number}</span>
          <b>{c.course ?? 'Course not set'}</b>
          <span className="ch-qf-list__m">{[c.teeName, c.par != null ? `Par ${c.par}` : null].filter(Boolean).join(' · ')}</span>
        </li>
      ))}
    </ol>
  );
}
