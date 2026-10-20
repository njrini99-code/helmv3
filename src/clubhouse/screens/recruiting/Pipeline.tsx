'use client';

import { ChevronDown } from 'lucide-react';
import { CH_STAGES, stageMeta, type ChStage } from '../../data/recruiting-shape';
import { haptic } from '../../lib/haptics';
import { Icon } from '../../ui/Icon';

/**
 * The pipeline timeline (Main board; the phone's compact one is `compact`): the four stages left to right on one
 * line, each a button with its count, and on desktop its blurb. A stage is a filter: the list shows only its prospects
 * until it is pressed again. The counts are the whole list's, whatever the search says. The share of the list is not
 * drawn (P014 finding #4: it repeated four times and "Offered 0% of list" read oddly); the count says it.
 */
export function Pipeline({
  counts,
  total,
  summary = null,
  stage,
  onPick,
  onShowAll,
  compact = false,
}: {
  counts: Record<ChStage, number>;
  total: number;
  /** C1: "2 visits this month · 1 decision due", only while next steps exist. */
  summary?: string | null;
  stage: ChStage | null;
  onPick: (s: ChStage | null) => void;
  onShowAll?: () => void;
  compact?: boolean;
}) {
  const empty = total === 0;
  return (
    <section className={'ch-rec-pipe' + (compact ? ' is-compact' : '')} aria-label="Pipeline" data-ch-code="CH-14601">
      {!compact && (
        <div className="ch-rec-pipe__head">
          <span className="ch-rec-pipe__sum">
            <b>Pipeline</b>
            <span className="ch-num">
              {empty ? 'Nobody yet. Stages fill as you add prospects.' : `${total} ${total === 1 ? 'prospect' : 'prospects'} · ${counts.committed} committed`}
              {!empty && summary && <span className="ch-rec-pipe__next"> · {summary}</span>}
            </span>
          </span>
          {stage && onShowAll && (
            <button type="button" className="ch-rec-pipe__all" onClick={onShowAll}>
              Show all <span className="ch-num">{total}</span>
              <Icon icon={ChevronDown} size={14} />
            </button>
          )}
        </div>
      )}
      <div className="ch-rec-pipe__line" role="group" aria-label="Filter by stage" data-ch-code="CH-14801">
        <span className="ch-rec-pipe__seg is-1" aria-hidden="true" />
        <span className="ch-rec-pipe__seg is-2" aria-hidden="true" />
        <span className="ch-rec-pipe__seg is-3" aria-hidden="true" />
        {CH_STAGES.map((s) => {
          const on = stage === s.value;
          const n = counts[s.value];
          return (
            <button
              key={s.value}
              type="button"
              className={`ch-rec-pipe__stage is-${s.value}`}
              aria-pressed={on}
              aria-label={`${s.label}, ${n} ${n === 1 ? 'prospect' : 'prospects'}`}
              disabled={empty}
              onClick={() => {
                // CH-14701: a stage picked as the filter is a selection.
                haptic('select');
                onPick(on ? null : s.value);
              }}
            >
              <span className="ch-rec-pipe__dot ch-num">{n}</span>
              <span className="ch-rec-pipe__txt">
                <b>{s.label}</b>
                {!compact && <span>{on ? 'Showing only these' : stageMeta(s.value).blurb}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
