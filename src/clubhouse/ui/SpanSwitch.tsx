'use client';

import { SPAN_LABEL, type ChSpan } from '../data/span';
import { Segmented } from './Segmented';

/**
 * "This season | All time": which rounds a figure rests on (data/span.ts). The season is the default; All time is Fairway's basis
 * (every round type, no date cut), so a Clubhouse number can be set beside the Fairway one. The caller owns the address
 * (`?range=all`), so a reload or a shared link shows the same figures; this only draws the choice. `labels` names a span the way the
 * caller's figure reads it: Home's default is each player's last ten, so its pill says "Last 10", never "This season" (F-0002).
 */
export function SpanSwitch({ value, onChange, hook, size = 'sm', labels }: { value: ChSpan; onChange: (v: ChSpan) => void; hook?: string; size?: 'sm' | 'md'; labels?: Partial<Record<ChSpan, string>> }) {
  return (
    <div className="ch-span" data-ch-span={value}>
      <Segmented<ChSpan> weight="filter"
        size={size}
        label="Rounds shown"
        hook={hook}
        value={value}
        onChange={onChange}
        options={[
          { value: 'season', label: labels?.season ?? SPAN_LABEL.season },
          { value: 'all', label: labels?.all ?? SPAN_LABEL.all },
        ]}
      />
    </div>
  );
}
