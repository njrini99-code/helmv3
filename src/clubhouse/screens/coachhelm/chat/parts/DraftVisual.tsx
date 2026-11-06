'use client';

import { Megaphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { readQuickChatWeek } from '@/app/golf/actions/coachhelm-ask';
import type { ActionProposal, TaskVisual } from '@/lib/coachhelm/v3/chat/action-types';
import { clockIn, type QuickChatWeek } from '@/lib/coachhelm/v3/chat/quick-chat-week';
import { formatWith } from '../../../../lib/dates';
import { pluralWord } from '../../../../lib/plural';
import { useQcSeam } from '../../../../shell/quick-chat/qc-seam';
import { Icon } from '../../../../ui/Icon';

type Cal = Extract<TaskVisual, { kind: 'cal' }>;
type Qual = Extract<TaskVisual, { kind: 'qual' }>;

const hoursOf = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) + (m ?? 0) / 60;
};
const clock12 = (v: number) => {
  const h = Math.floor(v);
  const m = Math.round((v - h) * 60);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}`;
};
const hourLabel = (h: number) => `${h % 12 || 12}`;
const dayWord = (date: string, opts: Intl.DateTimeFormatOptions) => formatWith(new Date(`${date}T12:00:00Z`), { ...opts, timeZone: 'UTC' });
const plusDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Five days holding the draft's day: the working week, or the five that end on a weekend day. */
function fiveDays(date: string): string[] {
  const dow = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
  const start = dow <= 4 ? plusDays(date, -dow) : plusDays(date, 4 - dow);
  return Array.from({ length: 5 }, (_, i) => plusDays(start, i));
}

/** How many hours the grid shows; the body is 132 tall, an hour line every 30. */
const SPAN = 4.4;

/**
 * E-WK: the real week the draft will land in. The draft's day shows that day's own events as busy blocks, and every day says by its dot whether it
 * has one, from the same read the quick chat's card uses. The open slot breathes until the write lands, then the event takes it.
 */
export function WeekDraft({ visual, state }: { visual: Cal; state: 'draft' | 'landing' | 'landed' | 'gone' }) {
  const seam = useQcSeam();
  const [week, setWeek] = useState<QuickChatWeek | null>(seam?.week ?? null);
  useEffect(() => {
    if (seam) return;
    let live = true;
    void readQuickChatWeek(visual.date)
      .then((w) => {
        if (live) setWeek(w);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [visual.date, seam]);

  const start = visual.start ? hoursOf(visual.start) : null;
  const end = visual.end ? hoursOf(visual.end) : null;
  const first = start == null ? 8 : Math.max(0, Math.floor(start) - 1);
  const pct = (h: number) => ((h - first) / SPAN) * 100;
  const days = fiveDays(visual.date);
  const zone = week?.timeZone ?? 'UTC';
  const busy = (week?.items ?? []).flatMap((it) => {
    const at = clockIn(it.start, zone);
    const from = at.hours + at.minutes / 60;
    const until = it.end ? clockIn(it.end, zone) : null;
    const to = until ? until.hours + until.minutes / 60 : from + 1;
    return to > first && from < first + SPAN ? [{ key: it.start + it.title, title: it.title, from: Math.max(from, first), to: Math.min(to, first + SPAN) }] : [];
  });
  const hasEvent = (d: string) => week?.days.find((x) => x.date === d)?.hasEvent ?? false;
  const place = start != null && end != null ? { top: `${pct(start)}%`, height: `${Math.max(((end - start) / SPAN) * 100, 16)}%` } : { top: '0%', height: '16%' };
  return (
    <div className="ch-ak-wk" role="img" aria-label={`${dayWord(visual.date, { weekday: 'long', month: 'short', day: 'numeric' })}: ${visual.title}${busy.length ? `, with ${busy.length} other ${pluralWord(busy.length, 'event', 'events')} that day` : ''}`}>
      <div className="wh" aria-hidden="true">
        <i />
        {days.map((d) => (
          <span key={d} className={d === visual.date ? 'on' : undefined}>
            <small>{dayWord(d, { weekday: 'short' })}</small>
            <b className="ch-num">{Number(d.slice(8))}</b>
            <em className={d === visual.date && state !== 'gone' && state !== 'draft' ? 'is-new' : hasEvent(d) ? 'is-busy' : 'is-free'} />
          </span>
        ))}
      </div>
      <div className="wb" aria-hidden="true">
        <div className="hrs ch-num">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} style={{ top: `${(i / SPAN) * 100}%` }}>
              {hourLabel(first + i)}
            </span>
          ))}
        </div>
        {days.map((d) => (
          <div key={d} className={'col' + (d === visual.date ? ' on' : '')}>
            {d === visual.date && (
              <>
                {busy.map((b) => (
                  <div key={b.key} className="busy" style={{ top: `${pct(b.from)}%`, height: `${((b.to - b.from) / SPAN) * 100}%` }}>
                    {b.title}
                  </div>
                ))}
                {state === 'draft' || state === 'gone' ? (
                  <div className={'slot' + (state === 'draft' ? ' is-open' : '')} style={place} />
                ) : (
                  <div className={'slot is-ev' + (state === 'landing' ? ' is-landing' : '')} style={place}>
                    <b>{visual.title}</b>
                    {start != null && <span className="ch-num">{clock12(start)}</span>}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const fact = (p: ActionProposal, label: string) => p.facts.find((f) => f.label === label)?.value ?? null;

/** E-LOCKP: an announcement as a player's phone will show it, in the coach's own words. Normal and Urgent push alike, so the banner shows for both. */
export function LockPreview({ proposal, team }: { proposal: ActionProposal; team?: string }) {
  const urgent = /urgent/i.test(fact(proposal, 'Urgency') ?? '');
  const title = fact(proposal, 'Title') ?? proposal.summary;
  const body = fact(proposal, 'Message');
  // The lock screen's clock is this screen's own, read once: a preview of the phone, not a figure from a read.
  const [now] = useState(() => new Date());
  return (
    <div className="ch-ak-lock" aria-hidden="true">
      <div className="tm">
        <b className="ch-num" suppressHydrationWarning>
          {clock12(now.getHours() + now.getMinutes() / 60)}
        </b>
      </div>
      <div className="ban">
        <span className="app">
          <Icon icon={Megaphone} size={15} />
        </span>
        <span className="tx">
          <small>
            {team && <em>{team}</em>}
            <span className={urgent ? 'is-urgent' : undefined}>{urgent ? 'Urgent · now' : 'Announcement · now'}</span>
          </small>
          <b>{title}</b>
          {body && <span className="bd">{body}</span>}
        </span>
      </div>
    </div>
  );
}

/** E-QUAL: the rounds as cards, and the travel seats filled by score, then the coach's picks. */
export function QualDraft({ visual }: { visual: Qual }) {
  const scored = Math.max(0, visual.total - visual.picks);
  return (
    <div className="ch-ak-qual" aria-hidden="true">
      <div className="rds">
        {Array.from({ length: visual.rounds }, (_, i) => {
          const d = plusDays(visual.start, i);
          return (
            <div className="rd" key={d} style={{ ['--ch-i' as string]: i }}>
              <span className="tile">
                <small>{dayWord(d, { weekday: 'short' })}</small>
                <b className="ch-num">{Number(d.slice(8))}</b>
              </span>
              <span>
                <b>Round {i + 1}</b>
              </span>
            </div>
          );
        })}
      </div>
      <div className="sts">
        <span className="bar">
          {Array.from({ length: visual.total }, (_, i) => (
            <i key={i} className={i >= scored ? 'pick' : undefined} style={{ ['--ch-i' as string]: i }} />
          ))}
        </span>
        <span className="ch-num">
          {scored} by score{visual.picks ? ` · ${visual.picks} your ${pluralWord(visual.picks, 'pick', 'picks')}` : ''}
        </span>
      </div>
    </div>
  );
}
