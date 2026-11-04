'use client';

import type { ReactNode } from 'react';
import { CalendarPlus, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import type { ChRosterHelm, ChRosterPlayer } from '../../data/roster';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { CrhLine } from '../../ui/CrhLine';
import { InlineNotice } from '../../ui/Notices';
import { Surface } from '../../ui/Surface';
import { changeTone, formatFixed, formatHcp, formatSigned, formatToPar } from '../../lib/format';
import { NoData } from '../../ui/NoData';
import { rebuiltHref } from '../../shell/nav';
import { AvailabilityPanel, CoachNote, HelmPanel, type AvailabilityControl, type NoteSaved } from './RosterPeek';
import { AVAILABILITY_WORD, rowNote, yearKeyOf, yearLineOf, type RosterClock } from './format';

/**
 * The pushed profile behind the lane's flag (06 8): centred head on the page, then cards in the order 05 S-ROSTER.profile.order gives:
 * This season, Scoring trend, Recent rounds, About, Availability, Coach's note, CoachHelm. Same data and writes as today's RosterProfile.
 */
export function RosterProfileCrh({
  p,
  notesLocked,
  statsError,
  onNoteSaved,
  availability,
  helm,
  clock,
  sgVs,
  onNoteDirty,
}: {
  p: ChRosterPlayer;
  notesLocked: boolean;
  statsError: boolean;
  onNoteSaved: NoteSaved;
  availability: AvailabilityControl;
  helm: ChRosterHelm;
  clock: RosterClock;
  /** The team's baseline name under SG / round ("vs Tour"). */
  sgVs: string;
  onNoteDirty: (dirty: boolean) => void;
}) {
  const note = rowNote({ ...p, availability: 'available' }, statsError);
  const messageHref = rebuiltHref(`/golf/dashboard/messages?player=${p.id}`);
  const planHref = rebuiltHref(`/golf/dashboard/calendar?new=1&with=${p.id}`);
  const roundsHref = rebuiltHref(`/golf/dashboard/stats?player=${p.id}&window=season&tab=rounds`);
  const year = yearKeyOf(p.gradYear, clock);
  const line = yearLineOf(p.gradYear, clock);
  const out = p.availability !== 'available' ? AVAILABILITY_WORD[p.availability] : null;
  const facts: Array<[string, ReactNode]> = [
    ['Hometown', p.hometown ?? <NoData />],
    ['High school', p.highSchool ?? <NoData />],
    ['Joined', p.joined ? p.joined.replace(/^Joined /, '') : <NoData />],
    ['Rounds this season', String(p.rounds)],
    ...(p.jersey ? ([['Jersey', p.jersey]] as Array<[string, ReactNode]>) : []),
  ];
  const sg = p.sgPerRound;
  return (
    <article className="ch-rsm-prof ch-rsx-prof">
      <section className="ch-rsx-head">
        <Avatar name={p.name} id={p.id} size="xl" year={year} dim={p.status === 'inactive'} />
        <h2>{p.name}</h2>
        {p.hometown && <p>{p.hometown}</p>}
        {line ? (
          <span className="ch-rs-ychip" data-year={year ?? undefined}>
            <i aria-hidden="true" />
            {[line, p.status === 'inactive' ? 'Inactive' : null, out].filter(Boolean).join(' · ')}
          </span>
        ) : p.status === 'inactive' || out ? (
          <span className="ch-rs-ychip">{[p.status === 'inactive' ? 'Inactive' : null, out].filter(Boolean).join(' · ')}</span>
        ) : null}
        {(messageHref || planHref) && (
          <div className="ch-rsx-head__btns">
            {messageHref && (
              <Button variant="primary" leftIcon={MessageSquare} href={messageHref} feel="press">
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

      <div className="ch-rsx-sec">
        <Surface variant="card" level={2} padded={false} title="This season" actions={<span className="ch-rsx-meta">Season</span>}>
          <dl className="ch-rsx-figs">
            <div>
              <dt>Scoring avg</dt>
              <dd className="ch-num">{formatFixed(p.avg)}</dd>
            </div>
            <div>
              <dt>Handicap</dt>
              <dd className="ch-num">{formatHcp(p.handicap)}</dd>
              <span className="ch-rsx-figs__f">Index</span>
            </div>
            <div>
              <dt>SG / round</dt>
              <dd className={'ch-num ' + (sg == null ? 'is-none' : changeTone(sg, false, 1))}>{sg == null ? <NoData /> : formatSigned(sg)}</dd>
              <span className="ch-rsx-figs__f">{sgVs}</span>
            </div>
          </dl>
        </Surface>
      </div>

      <div className="ch-rsx-sec is-tight">
        {statsError ? (
          <InlineNotice code="CH-3202" title="Season stats didn’t load" body="Averages, form and recent rounds are missing until the rounds load." />
        ) : (
          <Surface variant="card" level={2} padded={false} title="Scoring trend" actions={p.trend.length > 0 ? <span className="ch-rsx-meta ch-num">Last {p.trend.length}</span> : undefined} footerNote={p.trend.length > 0 ? note?.text : undefined}>
            <div className="ch-rsx-chart">
              {p.trend.length === 0 ? (
                <p className="ch-rsx-none" data-ch-code="CH-3305">
                  No 18-hole rounds this season. Form appears once rounds are posted.
                </p>
              ) : (
                <CrhLine data={p.trend} height={84} label={`${p.name}, last rounds: ${p.trend.join(', ')}`} meanLabel={`mean ${formatFixed(p.trend.reduce((a, b) => a + b, 0) / p.trend.length)}`} />
              )}
            </div>
          </Surface>
        )}
      </div>

      {p.recent.length > 0 && (
        <div className="ch-rsx-sec is-tight">
          <Surface
            variant="card"
            level={2}
            padded={false}
            title="Recent rounds"
            actions={
              roundsHref && p.rounds > 0 ? (
                <Link href={roundsHref} className="ch-rsx-link ch-num" aria-label={`All ${p.rounds} rounds this season`}>
                  All {p.rounds}
                </Link>
              ) : undefined
            }
          >
            <ul className="ch-group" style={{ ['--ch-group-inset' as string]: '16px' }}>
              {p.recent.map((r) => (
                <li key={r.id} className="ch-group__row" data-two-line="">
                  <span className="ch-rsx-row__b">
                    <b>{r.course}</b>
                    <span>{r.date}</span>
                  </span>
                  <span className="ch-rsx-well">
                    <b className="ch-num">{r.score}</b>
                    <span className={'ch-num' + (r.toPar != null && r.toPar < 0 ? ' is-under' : '')}>{formatToPar(r.toPar)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Surface>
        </div>
      )}

      <div className="ch-rsx-sec is-tight">
        <Surface variant="card" level={2} padded={false} title="About">
          <dl className="ch-rsx-facts">
            {facts.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </Surface>
      </div>

      <div className="ch-rsx-sec is-tight ch-rsx-panel">
        <AvailabilityPanel key={`avail-${p.id}`} p={p} control={availability} block />
      </div>
      <div className="ch-rsx-sec is-tight ch-rsx-panel">
        <CoachNote key={p.id} p={p} locked={notesLocked} onSaved={onNoteSaved} onDirty={onNoteDirty} />
      </div>
      <div className="ch-rsx-sec is-tight ch-rsx-panel">
        <HelmPanel p={p} helm={helm} />
      </div>
    </article>
  );
}
