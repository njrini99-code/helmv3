'use client';

import { UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { ChQDetail } from '../../data/qualifiers';
import { Avatar } from '../../ui/Avatar';
import { Badge } from '../../ui/Badge';
import { Icon } from '../../ui/Icon';
import { InlineNotice } from '../../ui/Notices';
import { plural, type ChQStatus } from './model';
import { ToPar } from './parts';

/** The detail's side sections, shared by desktop (QualifierDetail) and the phone (QualifierDetailPhone). */

export function Selections({ data, status, topScore }: { data: ChQDetail; status: ChQStatus; topScore: number }) {
  const router = useRouter();
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
    if (data.selectionsError || !data.selections) {
      return (
        <section className="ch-qf-side" aria-labelledby="ch-qf-sel">
          {head}
          <InlineNotice code="CH-09207" title="The confirmed squad didn’t load." body="The leaderboard is right; the squad list is missing until it loads." onRetry={() => router.refresh()} />
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

export function Courses({ data }: { data: ChQDetail }) {
  const router = useRouter();
  return (
    <section className="ch-qf-side" aria-labelledby="ch-qf-courses">
      <div className="ch-qf-panel__head">
        <div>
          <h2 id="ch-qf-courses">Course per round</h2>
          <p className="ch-num">
            {plural(data.numRounds, 'round')}
            {data.par != null ? ` · par ${data.par}` : ''}
          </p>
        </div>
      </div>
      {data.coursesError ? (
        <InlineNotice code="CH-09206" title="The round courses didn’t load." body="The standings are right; which course each round is on is missing until it loads." onRetry={() => router.refresh()} />
      ) : (
        <ol className="ch-qf-list">
          {data.roundCourses.map((c) => (
            <li key={c.number}>
              <span className="ch-qf-rn">{c.number}</span>
              <b>{c.course ?? 'Course not set'}</b>
              <span className="ch-qf-list__m">{[c.teeName, c.par != null ? `Par ${c.par}` : null].filter(Boolean).join(' · ')}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
