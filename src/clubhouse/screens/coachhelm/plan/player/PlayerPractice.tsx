'use client';

import { ClipboardList, FolderClosed } from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { Icon } from '../../../../ui/Icon';
import { LargeTitle } from '../../../../ui/LargeTitle';

export interface PlayerStop {
  time: string;
  place: string;
  line: string;
  now?: boolean;
  next?: boolean;
}
export interface PlayerPracticeData {
  context: string;
  title: string;
  when: string;
  focus: string;
  group: { name: string; mates: string[] } | null;
  stops: PlayerStop[];
  documents: string | null;
  planHref: string | null;
}

/** A player's Practice page (S-PLY.practice): their own stops only, with Now and Next. A player's model never carries a Why, an Aim or another group's stops. */
export function PlayerPractice({ data, everyone }: { data: PlayerPracticeData; everyone: ReactNode }) {
  const [tab, setTab] = useState<'mine' | 'all'>('mine');
  return (
    <main className="ch-page ch-cpv ch-cpv-ply" data-ch="player-practice">
      <LargeTitle>Practice</LargeTitle>
      <p className="ctx">{data.context}</p>
      <section className="art">
        <header className="art-h">
          <span className="tile">
            <Icon icon={ClipboardList} size={18} />
          </span>
          <div className="hd">
            <span className="t">{data.title}</span>
            <span className="m">{data.when}</span>
          </div>
        </header>
        {data.focus && <div className="focus">{data.focus}</div>}
        {data.group && (
          <div className="grpl">
            <span className="avs" aria-hidden="true">
              {data.group.mates.slice(0, 3).map((m) => (
                <span className="av" key={m}>
                  {m.slice(0, 2).toUpperCase()}
                </span>
              ))}
            </span>
            <span>
              <b>Group {data.group.name}</b>
              {data.group.mates.length > 0 && ` · with ${data.group.mates.join(' and ')}`}
            </span>
          </div>
        )}
      </section>
      <div className="seg2" role="tablist" aria-label="Whose plan">
        <button type="button" role="tab" aria-selected={tab === 'mine'} className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>
          Your practice
        </button>
        <button type="button" role="tab" aria-selected={tab === 'all'} className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>
          Everyone
        </button>
      </div>
      {tab === 'mine' ? (
        <section className="art" aria-label="Your stops">
          {data.stops.map((s) => (
            <div className="stop" key={s.time + s.place}>
              <span className="tm ch-num">{s.time}</span>
              <div>
                <div className="pl">{s.place}</div>
                <div className="dr">{s.line}</div>
              </div>
              {s.now ? <span className="now">Now</span> : s.next ? <span className="nx">Next</span> : <span />}
            </div>
          ))}
        </section>
      ) : (
        everyone
      )}
      {data.documents && (
        <section className="art">
          <header className="art-h is-center">
            <span className="tile">
              <Icon icon={FolderClosed} size={18} />
            </span>
            <div className="hd">
              <span className="t">In Documents</span>
              <span className="m">{data.documents}</span>
            </div>
            {data.planHref && (
              <Link className="btn-s" href={data.planHref}>
                Open the plan
              </Link>
            )}
          </header>
        </section>
      )}
    </main>
  );
}
