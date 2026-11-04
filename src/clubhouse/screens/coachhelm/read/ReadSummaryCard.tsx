'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { ChReadSummary } from '../../../data/coachhelm-read-view-shape';
import { Icon } from '../../../ui/Icon';
import { ReadLadder } from './ReadLadder';

/** The Board's one read: the whole card opens it, pressing at 0.97. Exported for Team and Lenses (02-PLAN 6.1). */
export function ReadSummaryCard({ s, who, href }: { s: ChReadSummary; who: string | null; href: string | null }) {
  const inner = (
    <>
      <div className="k">
        <span>
          {who ? `${who} · ` : ''}
          {s.area}
        </span>
        <span className={'st' + (s.stale ? ' plain' : '')}>{s.stale ? 'Out of date' : s.stance}</span>
      </div>
      <h3>{s.title}</h3>
      <div className="hero">
        <b>{s.value}</b>
        {s.valueNote && <span>{s.valueNote}</span>}
      </div>
      {s.ladder && <ReadLadder ladder={s.ladder} onGreen />}
      <div className="cause">
        <span className={`tier ${s.tier.kind}`}>{s.tier.word}</span>
        <span>{s.causeLine}</span>
      </div>
      <div className="ffoot">
        {s.worth && <span className="worth">Worth about {s.worth} a round</span>}
        <span className="num">{s.foot}</span>
      </div>
      {s.stale && (
        <p className="stale" data-ch-code="CH-13903">
          {s.stale}
        </p>
      )}
      {href && (
        <div className="open">
          <span>Open the read</span>
          <Icon icon={ChevronRight} size={14} />
        </div>
      )}
    </>
  );
  return href ? (
    <Link className={'feat ch-hr-feat tap' + (s.stale ? ' is-out' : '')} href={href} data-ch-press-scale=".97" aria-label={`Open the read: ${s.title}`}>
      {inner}
    </Link>
  ) : (
    <article className={'feat ch-hr-feat' + (s.stale ? ' is-out' : '')}>{inner}</article>
  );
}
