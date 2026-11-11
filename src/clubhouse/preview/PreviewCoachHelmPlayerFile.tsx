'use client';

import { ACTIVE_FOCUS_DUPLICATE_ERROR } from '@/lib/coachhelm/focus-areas/duplicate-guard';
import type { PlayerFileCard } from '../data/coachhelm-views-shape';
import { FileSkeleton } from '../screens/coachhelm/file/FileSkeleton';
import { PlayerFile } from '../screens/coachhelm/file/PlayerFile';
import { YourWeek } from '../screens/coachhelm/file/YourWeek';
import { PREVIEW_FILE_ROSTER, previewPlayerFile, previewPlayerWeek } from './fixtures-coachhelm-player-file';
import { CAST } from './cast';

const wait = <T,>(v: T, ms = 600) => new Promise<T>((r) => setTimeout(() => r(v), ms));

/** The file and "Your week" on fake writes. Nothing reaches the server. */
export function PreviewCoachHelmPlayerFile({ state = 'accepted', viewer, lens, at }: { state?: string; viewer?: string; lens?: string; at?: string }) {
  if (state === 'loading') return <FileSkeleton first={CAST.eli.first} />;
  const fail = state === 'failwrites';
  const res = fail ? ({ success: false, error: 'Preview: refused' } as const) : ({ success: true } as const);
  if (viewer === 'player') {
    if (state === 'failed') return <YourWeek load={{ status: 'failed' }} />;
    // CoachHelm off for the player's team (CH-13304), with the coach's words; `off-bare` has none.
    if (state === 'off' || state === 'off-bare') return <YourWeek load={{ status: 'off', reason: state === 'off' ? 'We are pausing AI insights until after the spring qualifier' : null }} />;
    return <YourWeek load={{ status: 'ready', data: previewPlayerWeek(state) }} writes={{ accept: () => wait(res), decline: () => wait(res) }} />;
  }
  const assign = () => wait(state === 'duplicate' ? ({ success: false, error: ACTIVE_FOCUS_DUPLICATE_ERROR } as const) : res);
  return (
    <PlayerFile
      load={state === 'failed' ? { status: 'failed' } : { status: 'ready', data: previewPlayerFile(state) }}
      roster={PREVIEW_FILE_ROSTER}
      at={at as PlayerFileCard | undefined}
      initialLens={lens === 'lens' || lens === 'player' ? 'player' : 'coach'}
      writes={{ assign, dismiss: () => wait(res), undo: () => wait(res) }}
      saveIntent={() => wait(fail ? { ok: false, error: 'Preview: refused' } : { ok: true })}
    />
  );
}
