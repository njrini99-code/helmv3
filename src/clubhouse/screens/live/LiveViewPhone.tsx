'use client';

import { useRouter } from 'next/navigation';
import { LIVE_COPY } from '../../live/copy';
import { FreshnessChip } from '../../live/FreshnessChip';
import { LiveAnnouncer } from '../../live/LiveAnnouncer';
import { PhoneTop } from '../../shell/phone-chrome';
import { FAILURE_COPY, InlineNotice } from '../../ui/Notices';
import { PlayerLiveSheet } from './PlayerLiveSheet';
import { LiveEmpty, LiveFilter, LiveGroupsList, LiveSortMenu, UpdatedPill } from './live-parts';
import type { LiveViewState } from './use-live-view';
import '../../styles/live.css';

/** The live view on a phone (4.3): a pushed screen, the feed chip on the right, one card per group, a sheet per player. */
export function LiveViewPhone({ v }: { v: LiveViewState }) {
  const router = useRouter();
  const back = () => (typeof window !== 'undefined' && window.history.length > 1 ? router.back() : router.push('/golf/dashboard'));
  const total = v.groups.onCourse.length + v.groups.finished.length + v.groups.quiet.length;
  return (
    <main className="ch-lv ch-lv--phone" aria-labelledby="ch-lv-title">
      <PhoneTop back={{ label: 'Home', onBack: back }} title={<span data-ch-code="CH-16610">{LIVE_COPY.viewTitle}</span>} titleId="ch-lv-title" action={<FreshnessChip feed={v.failed ? 'connecting' : v.live.feed} updatedAt={v.live.updatedAt} onRefresh={v.live.refresh} />} />
      <div className="ch-lv-tools">
        <LiveFilter v={v} />
        {total > 1 && <LiveSortMenu v={v} />}
      </div>
      <UpdatedPill v={v} />
      {v.failed ? (
        <InlineNotice code="CH-16604" title={LIVE_COPY.cantRefresh} body={FAILURE_COPY.page} onRetry={() => void v.live.refresh()} />
      ) : total === 0 ? (
        <LiveEmpty />
      ) : (
        <LiveGroupsList v={v} density="full" onOpen={(l) => v.select(l.roundId)} />
      )}
      <LiveAnnouncer moments={v.live.moments} enabled={v.announce} />
      <PlayerLiveSheet lane={v.selected} moments={v.live.moments} now={v.now} coach hours={v.hours} onClose={() => v.select(null)} />
    </main>
  );
}
