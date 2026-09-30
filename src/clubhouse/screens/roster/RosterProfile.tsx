'use client';

import { BarChart3, CalendarPlus, Ellipsis, Flag, MessageSquare, UserMinus } from 'lucide-react';
import Link from 'next/link';
import type { ChRosterPlayer } from '../../data/roster';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { FormLine } from '../../ui/FormLine';
import { Icon } from '../../ui/Icon';
import { Menu, type MenuItem } from '../../ui/Menu';
import { InlineNotice } from '../../ui/Notices';
import { formatFixed, formatSigned, formatToPar, NO_DATA } from '../../lib/format';
import { rebuiltHref } from '../../shell/nav';
import { CoachNote } from './RosterPeek';
import { formatHcp, rowNote } from './format';

/**
 * A player on the phone, pushed from the list (`?player=`): who they are,
 * Message and Plan 1:1, their figures and form, recent rounds, the real facts
 * we hold (D-51, never invented), and the coach's note (D-56).
 *
 * The ⋯ menu (View stats, Remove from team) becomes the foundation's action
 * sheet once it lands (D-54). Until then it is the shared Menu.
 */
export function RosterProfile({
  p,
  notesLocked,
  statsError,
  onRemove,
}: {
  p: ChRosterPlayer;
  notesLocked: boolean;
  statsError: boolean;
  onRemove: (p: ChRosterPlayer) => void;
}) {
  const note = rowNote(p, statsError);
  const messageHref = rebuiltHref(`/golf/dashboard/messages?player=${p.id}`);
  const planHref = rebuiltHref(`/golf/dashboard/calendar?new=1&with=${p.id}`);
  const statsHref = rebuiltHref(`/golf/dashboard/stats?player=${p.id}`);
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
  const menu: MenuItem[] = [
    ...(statsHref ? [{ label: 'View stats', icon: BarChart3, href: statsHref } as MenuItem, { kind: 'separator' } as MenuItem] : []),
    { label: 'Remove from team', icon: UserMinus, danger: true, onSelect: () => onRemove(p) },
  ];
  const sg = p.sgPerRound;

  return (
    <article className="ch-rsm-prof">
      <div className="ch-rsm-prof__bar">
        <Menu
          label={`Actions for ${p.name}`}
          items={menu}
          trigger={(t) => (
            <button type="button" className="ch-btn ch-btn--ghost ch-iconbtn ch-rsm-prof__more" aria-label="More actions" {...t}>
              <Icon icon={Ellipsis} size={18} />
            </button>
          )}
        />
      </div>

      <section className="ch-rsm-hero">
        <Avatar name={p.name} size={64} />
        <h1>{p.name}</h1>
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
        <CoachNote key={p.id} p={p} locked={notesLocked} />
      </section>
    </article>
  );
}
