'use client';

import { CalendarPlus, Flag, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import type { ChRosterPlayer } from '../../data/roster';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { FormLine } from '../../ui/FormLine';
import { Icon } from '../../ui/Icon';
import { InlineNotice } from '../../ui/Notices';
import { formatFixed, formatSigned, formatToPar, NO_DATA } from '../../lib/format';
import { rebuiltHref } from '../../shell/nav';
import { CoachNote, type NoteSaved } from './RosterPeek';
import { formatHcp, rowNote } from './format';

/**
 * A player on the phone, pushed from the list (`?player=`): who they are,
 * Message and Plan 1:1, their figures and form, recent rounds, the real facts
 * we hold (D-51, never invented), and the coach's note (D-56). Its screen,
 * top bar and ⋯ action sheet are RosterPhone's.
 */
export function RosterProfile({
  p,
  notesLocked,
  statsError,
  onNoteSaved,
}: {
  p: ChRosterPlayer;
  notesLocked: boolean;
  statsError: boolean;
  onNoteSaved: NoteSaved;
}) {
  const note = rowNote(p, statsError);
  const messageHref = rebuiltHref(`/golf/dashboard/messages?player=${p.id}`);
  const planHref = rebuiltHref(`/golf/dashboard/calendar?new=1&with=${p.id}`);
  const roundsHref = rebuiltHref(`/golf/dashboard/stats?player=${p.id}&window=season&tab=rounds`);
  const identity = [p.classYear, p.gradYear ? `Class of ${p.gradYear}` : null, p.status === 'inactive' ? 'Inactive' : null].filter(Boolean).join(' · ');
  const place = [p.hometown, p.highSchool].filter(Boolean).join(' · ');
  const facts = [
    ['Hometown', p.hometown],
    ['High school', p.highSchool],
    ['Class of', p.gradYear ? String(p.gradYear) : null],
    ['Jersey', p.jersey],
    ['Member', p.joined ? p.joined.replace(/^Joined /, 'Since ') : null],
  ].filter((f): f is [string, string] => !!f[1]);
  const sg = p.sgPerRound;

  return (
    <article className="ch-rsm-prof">
      <section className="ch-rsm-hero">
        <Avatar name={p.name} size={64} />
        <h2>{p.name}</h2>
        {identity && <p className="ch-rsm-hero__id">{identity}</p>}
        {place && <p className="ch-rsm-hero__m">{place}</p>}
        {(messageHref || planHref) && (
          <div className="ch-rsm-hero__act">
            {messageHref && (
              <Button leftIcon={MessageSquare} href={messageHref} feel="press">
                Message
              </Button>
            )}
            {planHref && (
              <Button leftIcon={CalendarPlus} href={planHref} feel="press">
                Plan 1:1
              </Button>
            )}
          </div>
        )}
      </section>

      <dl className="ch-rsm-figs">
        <div>
          <dt>Scoring avg</dt>
          <dd className="ch-num">{formatFixed(p.avg)}</dd>
        </div>
        <div>
          <dt>Handicap</dt>
          <dd className="ch-num">{formatHcp(p.handicap)}</dd>
        </div>
        <div>
          <dt>SG / round</dt>
          <dd className={'ch-num' + (sg == null ? '' : sg >= 0 ? ' is-gain' : ' is-loss')}>{sg == null ? NO_DATA : formatSigned(sg)}</dd>
        </div>
      </dl>

      {statsError ? (
        <InlineNotice
          code="CH-3202"
          title="Season stats didn't load."
          body="Averages, form and recent rounds are missing until the rounds load. The error has been reported."
        />
      ) : (
        <section className="ch-rsm-panel" aria-labelledby={`trend-${p.id}`}>
          <div className="ch-rsm-panel__h">
            <b id={`trend-${p.id}`}>Scoring trend</b>
            {p.trend.length > 0 && (
              <span className="ch-num">
                Last {p.trend.length} {p.trend.length === 1 ? 'round' : 'rounds'}
              </span>
            )}
          </div>
          <div className="ch-rsm-trend">
            {p.trend.length === 0 ? (
              <p className="ch-rsm-trend__empty" data-ch-code="CH-3305">
                No 18-hole rounds this season. Form appears once rounds are posted.
              </p>
            ) : (
              <>
                {p.trend.length >= 3 && (
                  <FormLine data={p.trend} width={330} height={84} earlyBelow={3} bare label={`${p.name}, last rounds: ${p.trend.join(', ')}`} />
                )}
                <div className="ch-rsm-trend__lg">
                  {p.trend.length >= 3 && <span className="ch-num">{p.trend[0]}</span>}
                  <span className={note?.tone === 'warning' ? 'is-warning' : undefined}>{note?.text}</span>
                  {p.trend.length >= 3 && <span className="ch-num">{p.trend[p.trend.length - 1]}</span>}
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {p.recent.length > 0 && (
        <section className="ch-rsm-panel" aria-labelledby={`recent-${p.id}`}>
          <div className="ch-rsm-panel__h">
            <b id={`recent-${p.id}`}>Recent rounds</b>
            {roundsHref && p.rounds > 0 && (
              <Link href={roundsHref} className="ch-rsm-panel__link ch-num" aria-label={`All ${p.rounds} rounds this season`}>
                All {p.rounds}
              </Link>
            )}
          </div>
          {p.recent.map((r) => (
            <div key={r.id} className="ch-rsm-rd">
              <span className="ch-rsm-rd__ic" aria-hidden="true">
                <Icon icon={Flag} size={15} />
              </span>
              <span className="ch-rsm-rd__b">
                <b>{r.course}</b>
                <span>{r.date}</span>
              </span>
              <span className="ch-rsm-rd__v">
                <b className="ch-num">{r.score}</b>
                <span className={'ch-num ch-rs-topar' + (r.toPar != null && r.toPar < 0 ? ' is-under' : '')}>{formatToPar(r.toPar)}</span>
              </span>
            </div>
          ))}
        </section>
      )}

      {facts.length > 0 && (
        <section className="ch-rsm-panel ch-rsm-about" aria-labelledby={`about-${p.id}`}>
          <b id={`about-${p.id}`}>About</b>
          <dl className="ch-rsm-facts">
            {facts.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section className="ch-rsm-panel ch-rsm-note">
        <CoachNote key={p.id} p={p} locked={notesLocked} onSaved={onNoteSaved} />
      </section>
    </article>
  );
}
