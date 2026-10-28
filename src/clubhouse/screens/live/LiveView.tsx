'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { LIVE_COPY } from '../../live/copy';
import { FreshnessChip } from '../../live/FreshnessChip';
import { LiveAnnouncer } from '../../live/LiveAnnouncer';
import type { LiveSnapshot } from '../../live/model';
import type { LiveScope } from '../../live/scope';
import { useRovingRows } from '../../lib/roving';
import { useChPhone } from '../../lib/use-phone';
import { FAILURE_COPY, InlineNotice } from '../../ui/Notices';
import { LargeTitle } from '../../ui/LargeTitle';
import { CourseRibbon, PlayerLiveBody, PlayerLiveSheet, PlayerPanelHead } from './PlayerLiveSheet';
import { LiveViewPhone } from './LiveViewPhone';
import { LiveEmpty, LiveFilter, LiveGroupsList, LiveSortMenu, UpdatedPill } from './live-parts';
import { reportDeskWidth, useLiveView, useNarrow, type LiveViewState } from './use-live-view';
import '../../styles/live.css';

/**
 * The live view (4.3, /golf/dashboard/live): every player who is out, in groups, with the feed's freshness, a sort, and
 * the player's round one tap away. Phone: a pushed screen with sheets. Wide: the lanes on the left and a panel on the
 * right (a sheet below 1080 px, or whenever the desk itself is narrower than the split needs). Server data first; the
 * polls change only what changed.
 */
export function LiveView({ initial, scope, denied = false, frozen = false, now }: { initial: LiveSnapshot; scope?: LiveScope; denied?: boolean; frozen?: boolean; now?: number }) {
  const v = useLiveView(initial, scope, frozen, now);
  const phone = useChPhone();
  if (denied) return <LiveDenied />;
  if (phone) return <LiveViewPhone v={v} />;
  return <LiveViewDesk v={v} />;
}

export function LiveDenied() {
  return (
    <main className="ch-lv ch-lv--denied">
      <p className="ch-lv-empty__title" data-ch-code="CH-16609">
        {LIVE_COPY.noAccess}
      </p>
    </main>
  );
}

function LiveViewDesk({ v }: { v: LiveViewState }) {
  const narrow = useNarrow();
  const root = useRef<HTMLElement>(null);
  useRovingRows(root, '.ch-lv-hit');
  const total = v.groups.onCourse.length + v.groups.finished.length + v.groups.quiet.length;
  const failed = v.live.snapshot.error && v.live.lanes.length === 0;

  // The split needs SPLIT_MIN_PX of the desk's own width; measured before paint so the panel never draws and then folds.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    // A desk that is not laid out (hidden, or a test DOM) measures 0: it reports nothing, so the viewport decides.
    const report = (width: number) => reportDeskWidth(width > 0 ? width : null);
    report(el.clientWidth - paddingX(el));
    const ro = new ResizeObserver(([entry]) => {
      if (entry) report(entry.contentRect.width);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      reportDeskWidth(null);
    };
  }, []);

  // Escape clears the selection and hands focus back to the lane; R reads now when no field has focus (6).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.metaKey || e.ctrlKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.matches?.('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === 'Escape' && v.selectedId) {
        const id = v.selectedId;
        v.select(null);
        window.requestAnimationFrame(() => root.current?.querySelector<HTMLElement>(`[data-round="${CSS.escape(id)}"] .ch-lv-hit`)?.focus());
      } else if ((e.key === 'r' || e.key === 'R') && !v.selectedId) {
        void v.live.refresh();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [v]);

  return (
    <main ref={root} className="ch-lv ch-lv--desk" aria-labelledby="ch-lv-title" data-canopy="">
      <header className="ch-lv-head" data-canopy-head="">
        <div>
          <span className="ch-lv-eyebrow">Today</span>
          <LargeTitle id="ch-lv-title">
            <span data-ch-code="CH-16610">{LIVE_COPY.viewTitle}</span>
          </LargeTitle>
        </div>
        <FreshnessChip feed={v.live.feed} updatedAt={v.live.updatedAt} onRefresh={v.live.refresh} />
      </header>
      <div className="ch-lv-tools">
        <LiveFilter v={v} />
        {total > 1 && <LiveSortMenu v={v} />}
        <UpdatedPill v={v} />
      </div>
      {failed ? (
        <InlineNotice code="CH-16604" title={LIVE_COPY.cantRefresh} body={FAILURE_COPY.page} onRetry={() => void v.live.refresh()} />
      ) : total === 0 ? (
        <LiveEmpty />
      ) : (
        <div className="ch-lv-split" data-panel={narrow ? 'sheet' : 'side'}>
          <LiveGroupsList v={v} density="full" onOpen={(l) => v.select(l.roundId)} />
          {!narrow && (
            <aside className="ch-lv-panel" data-lenis-prevent="" aria-label={v.selected ? `${v.selected.name}, round` : LIVE_COPY.everyone}>
              {v.selected ? (
                <>
                  <PlayerPanelHead lane={v.selected} />
                  <PlayerLiveBody lane={v.selected} moments={v.live.moments} now={v.now} coach hours={v.hours} />
                </>
              ) : (
                <>
                  <h2 className="ch-lv-panel__title" data-ch-code="CH-16618">
                    {LIVE_COPY.everyone}
                  </h2>
                  <CourseRibbon lanes={v.everyone} label={LIVE_COPY.everyone} />
                </>
              )}
            </aside>
          )}
        </div>
      )}
      <LiveAnnouncer moments={v.live.moments} enabled={v.announce} />
      {narrow && <PlayerLiveSheet lane={v.selected} moments={v.live.moments} now={v.now} coach hours={v.hours} onClose={() => v.select(null)} />}
    </main>
  );
}

function paddingX(el: HTMLElement): number {
  const cs = window.getComputedStyle(el);
  return (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
}
