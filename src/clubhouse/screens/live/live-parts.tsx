'use client';

import { ArrowDownUp } from 'lucide-react';
import { useId } from 'react';
import { LIVE_COPY } from '../../live/copy';
import { plural } from '../../lib/plural';
import { PlayerLane } from '../../live/PlayerLane';
import type { LiveGroups, LiveLane, LiveSort } from '../../live/model';
import { Icon } from '../../ui/Icon';
import { Menu, type MenuItem } from '../../ui/Menu';
import { Segmented } from '../../ui/Segmented';
import type { LiveViewState } from './use-live-view';

/** Pieces the phone and desktop live views share. */

const GROUPS: ReadonlyArray<{ key: keyof LiveGroups; title: (n: number) => string; code: string }> = [
  { key: 'onCourse', title: LIVE_COPY.onCourse, code: 'CH-16612' },
  { key: 'finished', title: LIVE_COPY.finishedTitle, code: 'CH-16613' },
  { key: 'quiet', title: LIVE_COPY.notHeard, code: 'CH-16614' },
];

export function LiveGroupsList({ v, onOpen, density }: { v: LiveViewState; onOpen: (l: LiveLane) => void; density: 'full' | 'compact' }) {
  const id = useId();
  return (
    <div className="ch-lv-groups" data-ch-lv-list="" {...v.holdProps}>
      {GROUPS.map((g) => {
        const lanes = v.groups[g.key];
        if (!lanes.length) return null;
        return (
          <section key={g.key} className="ch-lv-group" aria-labelledby={`${id}-${g.key}`}>
            <h2 id={`${id}-${g.key}`} className="ch-lv-group__label" data-ch-code={g.code}>
              {g.title(lanes.length)}
            </h2>
            <div className="ch-lv-card">
              <ul className="ch-lv-list" aria-labelledby={`${id}-${g.key}`}>
                {lanes.map((l) => (
                  <PlayerLane
                    key={l.roundId}
                    lane={l}
                    density={density}
                    now={v.now}
                    hours={v.hours}
                    change={v.live.changes.get(l.roundId)}
                    reduced={v.reduced}
                    selected={v.selectedId === l.roundId}
                    onOpen={onOpen}
                    actions
                  />
                ))}
              </ul>
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** The filter, shown only while two or more round types have lanes (CH-16611). */
export function LiveFilter({ v }: { v: LiveViewState }) {
  if (v.types.length < 2) return null;
  return (
    <div data-ch-code="CH-16611">
      <Segmented
        label="Round type"
        size="sm"
        block
        value={v.filter}
        onChange={v.setFilter}
        options={[{ value: 'all' as const, label: LIVE_COPY.filter.all }, ...v.types.map((t) => ({ value: t, label: LIVE_COPY.filter[t] }))]}
      />
    </div>
  );
}

const SORT_ORDER: readonly LiveSort[] = ['to_par', 'thru', 'name', 'tee'];

/** The sort menu (CH-16615), with the live region's "Announce updates" switch and the refresh hint (6, 7). */
export function LiveSortMenu({ v }: { v: LiveViewState }) {
  const items: MenuItem[] = [
    ...SORT_ORDER.map((s): MenuItem => ({ label: LIVE_COPY.sort[s], checked: v.sort === s, onSelect: () => v.setSort(s) })),
    { kind: 'separator' },
    { label: 'Announce updates', checked: v.announce, onSelect: () => v.setAnnounce(!v.announce) },
    { label: 'Refresh now (R)', onSelect: () => void v.live.refresh() },
  ];
  return (
    <div data-ch-code="CH-16615">
      <Menu
        label="Sort and settings"
        items={items}
        trigger={(p) => (
          <button type="button" className="ch-lv-sort" {...p}>
            <Icon icon={ArrowDownUp} size={14} />
            <span>{LIVE_COPY.sortLabel(v.sort)}</span>
          </button>
        )}
      />
    </div>
  );
}

/** "2 updates" while a held update waits; a tap lets it in (5L.8.3). */
export function UpdatedPill({ v }: { v: LiveViewState }) {
  if (v.live.pending <= 0) return null;
  return (
    <button type="button" className="ch-lv-pill" onClick={v.live.applyPending} role="status">
      {plural(v.live.pending, 'update')}
    </button>
  );
}

export function LiveEmpty() {
  return (
    <div className="ch-lv-empty" data-ch-code="CH-16619">
      <p className="ch-lv-empty__title">{LIVE_COPY.emptyTitle}</p>
      <p className="ch-lv-empty__body">{LIVE_COPY.emptyBody}</p>
    </div>
  );
}
