'use client';

import Link from 'next/link';
import { plural } from '../../../lib/plural';
import { ChevronDown } from 'lucide-react';
import { coachBoardFor } from '../../../data/coachhelm-views-shape';
import { Avatar } from '../../../ui/Avatar';
import { Icon } from '../../../ui/Icon';
import type { ChReadView } from '../../../data/coachhelm-read-view-shape';
import type { ChViewVoice } from '../../../data/coachhelm-views-shape';

/** The player's reads by where on the hole. A row replaces the address: rail titles aren't counted as shown, only the open read is. */
export function ReadsRail({ view, current, voice, hrefOf }: { view: ChReadView; current: string; voice: ChViewVoice; hrefOf: (id: string) => string }) {
  return (
    <nav className="card lg ch-hr-rail" aria-label={voice.role === 'coach' ? `${voice.first}’s reads` : 'Your reads'}>
      <div className="ch-hr-railh">
        {voice.role === 'coach' && <Avatar name={voice.name} id={voice.playerId} size="md" />}
        {voice.role === 'coach' && view.team?.length ? (
          <details className="ch-hr-swr">
            <summary>
              <b>{voice.name}</b>
              <Icon icon={ChevronDown} size={14} />
            </summary>
            <div className="pop">
              {view.team.map((p) => (
                <Link prefetch={false} key={p.id} href={coachBoardFor(p.id)} aria-current={p.id === voice.playerId ? 'true' : undefined}>
                  {p.name}
                </Link>
              ))}
            </div>
          </details>
        ) : (
          <b>{voice.role === 'coach' ? voice.name : 'Your reads'}</b>
        )}
        <span>
          {plural(view.counts.insights, 'open read')}
          {view.read?.headline.foot.through ? ` · Through ${view.read.headline.foot.through}` : ''}
        </span>
      </div>
      {view.rail.map((g) => (
        <div key={g.label}>
          <h5>{g.label}</h5>
          {g.rows.map((r) => (
            <Link prefetch={false} key={r.id} className={'lr' + (r.id === current ? ' on' : '')} href={hrefOf(r.id)} replace scroll={false} aria-current={r.id === current ? 'page' : undefined}>
              <span className={`sdot ${r.tone}`} />
              <div className="c">
                {r.title}
                <span>{r.sub}</span>
              </div>
              <span className="v">{r.value}</span>
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
