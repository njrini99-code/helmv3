'use client';

import { RotateCw, UserPlus } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';
import type { ChQDetailCore, ChQDetailSecondary } from '../../data/qualifiers';
import { Avatar } from '../../ui/Avatar';
import { Badge } from '../../ui/Badge';
import { Icon } from '../../ui/Icon';
import { InlineNotice } from '../../ui/Notices';
import { useRefresh } from '../../lib/use-refresh';
import { plural, type ChQStatus } from './model';
import type { LiveFeedView } from './live';
import { ToPar } from './parts';
import { CoursesSkeleton, Streamed } from './streamed';

/** The detail's side sections, shared by desktop (QualifierDetail) and the phone (QualifierDetailPhone). */

/** The standings on screen are the last good ones: the read that would have replaced them failed (CH-09220). */
export function StaleStandings() {
  const { refresh, refreshing } = useRefresh();
  return (
    <InlineNotice
      code="CH-09220"
      title="These standings may be out of date"
      body="The latest scores didn’t load, so this is the last list that did. Try again to bring it up to date."
      onRetry={refresh}
      retrying={refreshing}
    />
  );
}

const CLOCK = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
/** "4:12 PM": when the standings on screen were read, in the reader's own time. */
export function clockLabel(at: number): string {
  return CLOCK.format(new Date(at));
}

/**
 * The board's honest Live chip (P009-B2, D1). "Live · updated 4:12 PM" only while the realtime feed is subscribed;
 * "Paused · standings from 4:12 PM" with Refresh when it dropped or the tab slept long (StaleStandings' Try again,
 * without its "didn't load", since nothing failed to load); nothing after the last day, where the status pill says Ended (D3).
 * The dot is static (D-33). The time is set after hydration only, so the server's paint never disagrees with the reader's clock.
 */
export function LiveChip({ view }: { view: LiveFeedView }) {
  const { feed, version, updatedAt: fixed, refresh: onRefresh, ended } = view;
  const [refreshing, start] = useTransition();
  // When the standings on screen were read: stamped after hydration when a read lands (only this chip draws again).
  const [stamped, setStamped] = useState<number | null>(null);
  useEffect(() => setStamped(Date.now()), [version]);
  const updatedAt = fixed ?? stamped;
  // Past its last day the status pill above already says "Ended · n rounds outstanding" (D3): the board claims no feed.
  if (ended || feed === 'off') return null;
  const at = updatedAt != null ? clockLabel(updatedAt) : null;
  if (feed === 'paused') {
    return (
      <span className="ch-qf-feed" data-feed="paused" role="status">
        <Badge tone="warning">{at ? `Paused · standings from ${at}` : 'Paused'}</Badge>
        <button
          type="button"
          className="ch-qf-feed__refresh"
          disabled={refreshing}
          aria-busy={refreshing || undefined}
          onClick={() => start(() => onRefresh())}
        >
          <Icon icon={RotateCw} size={13} />
          {refreshing ? 'Refreshing' : 'Refresh'}
        </button>
      </span>
    );
  }
  return (
    <span className="ch-qf-feed" data-feed={feed}>
      {feed === 'live' ? (
        <Badge tone="accent" dot>
          {at ? `Live · updated ${at}` : 'Live'}
        </Badge>
      ) : (
        <Badge tone="neutral">{at ? `Connecting · standings from ${at}` : 'Connecting'}</Badge>
      )}
    </span>
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
          <InlineNotice code="CH-09207" title="The confirmed squad didn’t load" body={squadMissing} onRetry={refresh} retrying={refreshing} />
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
          <InlineNotice code="CH-09221" title="Pick notes didn’t load" body="The squad is right; the coach’s notes on the picks are missing until they load." onRetry={refresh} retrying={refreshing} />
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
    return <InlineNotice code="CH-09206" title="The round courses didn’t load" body="The standings are right; which course each round is on is missing until it loads." onRetry={refresh} retrying={refreshing} />;
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
