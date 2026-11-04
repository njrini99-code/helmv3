'use client';

import { useEffect, useState } from 'react';
import type { TaskVisual } from '@/lib/coachhelm/v3/chat/action-types';
import { readQuickChatWeek, type QuickChatWeek } from '@/app/golf/actions/coachhelm-ask';

type Cal = Extract<TaskVisual, { kind: 'cal' }>;
type Msg = Extract<TaskVisual, { kind: 'msg' }>;
type Qual = Extract<TaskVisual, { kind: 'qual' }>;

const hours = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) + (m ?? 0) / 60;
};
const clock = (h: number) => `${h % 12 || 12} ${h < 12 || h === 24 ? 'AM' : 'PM'}`;
const dayLong = (date: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
const time12 = (t: string) => {
  const v = hours(t);
  const h = Math.floor(v);
  const m = Math.round((v - h) * 60);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

/** Week strip, day rail, the new block, the facts. Hour lines 32pt apart from y 12: start − 1h to end + 1h. */
export function EventVisual({ visual, landed, removed }: { visual: Cal; landed: boolean; removed: boolean }) {
  const [week, setWeek] = useState<QuickChatWeek | null>(null);
  useEffect(() => {
    let live = true;
    void readQuickChatWeek(visual.date).then((w) => live && setWeek(w));
    return () => {
      live = false;
    };
  }, [visual.date]);
  const start = visual.start ? hours(visual.start) : null;
  const end = visual.end ? hours(visual.end) : null;
  const first = start == null ? 8 : Math.max(0, Math.floor(start) - 1);
  const lines = Array.from({ length: 5 }, (_, i) => first + i);
  const y = (h: number) => 12 + (h - first) * 32;
  return (
    <>
      <div className="cal-wk">
        {(week?.days ?? [{ date: visual.date, hasEvent: false }]).map((d) => (
          <i key={d.date} className={d.date === visual.date ? 'on' : undefined}>
            <small>{dayLong(d.date, { weekday: 'narrow' })}</small>
            <b>{Number(d.date.slice(8))}</b>
            <em className={d.hasEvent ? '' : 'n'} />
            {d.date === visual.date && landed && <em className="new" style={{ position: 'absolute', bottom: 7 }} />}
          </i>
        ))}
      </div>
      <div className="rail">
        {lines.map((h, i) => (
          <div className="hr" key={h} style={{ top: 12 + i * 32 }}>
            <span>{clock(h)}</span>
          </div>
        ))}
        {(week?.items ?? []).map((it) => {
          const at = new Date(it.start);
          const h = at.getUTCHours() + at.getUTCMinutes() / 60;
          return h >= first && h <= first + 4 ? (
            <div className="blk old" key={it.start + it.title} style={{ top: y(h), height: 24, padding: '4px 10px' }}>
              <b>{it.title}</b>
            </div>
          ) : null;
        })}
        {start != null && end != null && !removed && (
          <div className="blk new" style={{ top: y(start), height: Math.max(24, (end - start) * 32 - 2) }}>
            <b>{visual.title}</b>
            {visual.where && <span>{visual.where}</span>}
          </div>
        )}
      </div>
      <dl className="facts">
        <div className="fact">
          <dt>When</dt>
          <dd>{`${dayLong(visual.date, { weekday: 'short', day: 'numeric', month: 'short' })}${visual.start && visual.end ? `, ${time12(visual.start)} to ${time12(visual.end)}` : ', all day'}`}</dd>
        </div>
        <div className="fact">
          <dt>Where</dt>
          <dd className={visual.where ? undefined : 'unset'}>{visual.where ?? 'Not set'}</dd>
        </div>
        <div className="fact">
          <dt>Who</dt>
          <dd>{visual.who}</dd>
        </div>
        <div className="fact">
          <dt>RSVP</dt>
          <dd className={visual.rsvp ? undefined : 'unset'}>{visual.rsvp ? 'Asked' : 'Not asked'}</dd>
        </div>
      </dl>
    </>
  );
}

/** The thread, the draft bubble, tone chips that redraft through a new turn. */
export function MessageVisual({ visual, sent, phase, onTone }: { visual: Msg; sent: boolean; phase: string; onTone?: (t: string) => void }) {
  const [tone, setTone] = useState('Plain');
  return (
    <>
      <div className="mthread">
        <div className="mthread__h">
          {visual.thread} <span>· {visual.count}</span>
        </div>
        {visual.last && <div className="mb them">{visual.last}</div>}
        <div className={'mb draft' + (sent ? ' sent' : '')}>{visual.draft}</div>
        <div className="mmeta">{phase === 'held' ? 'Sending after Undo' : phase === 'done' ? 'Delivered' : phase === 'undone' ? 'Unsent · back to draft' : 'Draft · only you can see this'}</div>
      </div>
      {!sent && onTone && (
        <div className="mtone">
          {['Plain', 'Warmer', 'Shorter'].map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={tone === t}
              onClick={() => {
                setTone(t);
                onTone(t);
              }}
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

const nextDay = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function QualifierVisual({ visual }: { visual: Qual }) {
  const scored = visual.total - visual.picks;
  return (
    <>
      <div className="qrounds">
        {Array.from({ length: visual.rounds }, (_, i) => (
          <div className="qr" key={i}>
            <small>Round {i + 1}</small>
            <b>{dayLong(nextDay(visual.start, i), { weekday: 'short', day: 'numeric' })}</b>
          </div>
        ))}
      </div>
      <dl className="facts">
        <div className="fact">
          <dt>Travel</dt>
          <dd>
            <span className="seats">
              {Array.from({ length: visual.total }, (_, i) => (
                <span key={i} className={'seat on' + (i >= scored ? ' pick' : '')} />
              ))}
            </span>
            <span>
              {scored} by score · {visual.picks} your {visual.picks === 1 ? 'pick' : 'picks'}
            </span>
          </dd>
        </div>
        <div className="fact">
          <dt>Field</dt>
          <dd>{visual.field} players</dd>
        </div>
        <div className="fact">
          <dt>Entry ends</dt>
          <dd className={visual.deadline ? undefined : 'unset'}>{visual.deadline ?? 'Not set'}</dd>
        </div>
      </dl>
    </>
  );
}
