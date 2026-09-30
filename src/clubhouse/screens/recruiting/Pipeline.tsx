'use client';

import { ChevronDown } from 'lucide-react';
import { CH_STAGES, stageMeta, type ChStage } from '../../data/recruiting-shape';
import { haptic } from '../../lib/haptics';
import { Icon } from '../../ui/Icon';

/**
 * The pipeline timeline (Main board; the phone's compact one is `compact`): the four stages left to right on one
 * line, each a button with its count, and on desktop its blurb and its share of the list. A stage is a filter: the
 * list shows only its prospects until it is pressed again. The counts are the whole list's, whatever the search says.
 */
export function Pipeline({
  counts,
  shares,
  total,
  stage,
  onPick,
  onShowAll,
  compact = false,
}: {
  counts: Record<ChStage, number>;
  /** Whole-percent shares that add up to 100, or null while the list is empty. */
  shares: Record<ChStage, number> | null;
  total: number;
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
                {!compact && <span className="ch-rec-pipe__share ch-num">{shares ? `${shares[s.value]}% of list` : '—'}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
