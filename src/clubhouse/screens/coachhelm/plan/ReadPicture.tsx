'use client';

import { formatSigned } from '../../../lib/format';

/** What a finished practice read can draw under its step (S-ASK.read-pictures). Built on the server from that read's own result; never invented. */
export type ReadPictureData =
  | { kind: 'cal'; days: Array<{ day: string; date: string; event?: string; on?: boolean; other?: boolean }> }
  | { kind: 'sg'; title: string; rows: Array<{ label: string; value: number }> }
  | { kind: 'pd'; title: string; rows: Array<{ label: string; pct: number; tour: number | null }> }
  | { kind: 'cls'; lines: Array<{ label: string; tag: string; from: number; to: number; tone: 'class' | 'plan' }>; axis: Array<{ at: number; label: string }> }
  | { kind: 'dr'; cards: Array<{ name: string; kind: 'skill' | 'random' | 'pressure' }>; more: number };

const KIND = { skill: 'Skill', random: 'Random', pressure: 'Pressure' } as const;
const signed = (v: number) => formatSigned(v, 1);

export function ReadPicture({ picture }: { picture: ReadPictureData }) {
  if (picture.kind === 'cal')
    return (
      <div className="ch-cpv-vz" data-vz="cal">
        <div className="wk">
          {picture.days.map((d) => (
            <div key={d.date} className={'d' + (d.on ? ' on' : d.other ? ' ev' : '')}>
              <span>{d.day}</span>
              <b className="ch-num">{d.date}</b>
              {d.event && <span className="e">{d.event}</span>}
            </div>
          ))}
        </div>
      </div>
    );
  if (picture.kind === 'sg') {
    const max = Math.max(1, ...picture.rows.map((r) => Math.abs(r.value)));
    return (
      <div className="ch-cpv-vz" data-vz="sg">
        <div className="vh">{picture.title}</div>
        {picture.rows.map((r) => (
          <div className="sgr" key={r.label}>
            <span>{r.label}</span>
            <span className="tr">
              <i className="z" />
              <i className={'b ' + (r.value < 0 ? 'bn' : 'bp')} style={{ [r.value < 0 ? 'right' : 'left']: '50%', width: `${(Math.abs(r.value) / max) * 50}%` }} />
            </span>
            <span className={'v ch-num' + (r.value <= -0.5 ? ' lo' : '')}>{signed(r.value)}</span>
          </div>
        ))}
      </div>
    );
  }
  if (picture.kind === 'pd')
    return (
      <div className="ch-cpv-vz" data-vz="pd">
        <div className="vh">{picture.title}</div>
        {picture.rows.map((r) => (
          <div className="pdr" key={r.label}>
            <span>{r.label}</span>
            <span className="tr">
              <i className={'m' + (r.tour != null && r.tour - r.pct > 8 ? ' lo' : '')} style={{ width: `${r.pct}%` }} />
              {r.tour != null && <i className="t" style={{ left: `${r.tour}%` }} />}
            </span>
            <span className="v ch-num">{Math.round(r.pct)}%</span>
          </div>
        ))}
      </div>
    );
  if (picture.kind === 'cls')
    return (
      <div className="ch-cpv-vz" data-vz="cls">
        {picture.lines.map((l) => (
          <div className="ln" key={l.label}>
            <span>{l.label}</span>
            <span className="bx">
              <i className={l.tone === 'class' ? 'c' : 'r'} style={{ left: `${l.from}%`, width: `${l.to - l.from}%` }}>
                {l.tag}
              </i>
            </span>
          </div>
        ))}
        <div className="ax">
          {picture.axis.map((a) => (
            <span key={a.label} className="ch-num" style={{ left: `${a.at}%` }}>
              {a.label}
            </span>
          ))}
        </div>
      </div>
    );
  return (
    <div className="ch-cpv-vz" data-vz="dr">
      <div className="fan">
        {picture.cards.slice(0, 3).map((c, i) => (
          <div className="dc" key={c.name} style={{ ['--ch-fan-i' as string]: i - 1 }}>
            <span className="dcn">{c.name}</span>
            <span>
              <i className={`k-${c.kind}`} />
              {KIND[c.kind]}
            </span>
          </div>
        ))}
      </div>
      {picture.more > 0 && <span className="more ch-num">+{picture.more} more</span>}
    </div>
  );
}
