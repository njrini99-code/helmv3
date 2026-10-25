'use client';

import { createClient } from '@/lib/supabase/client';
import { setLiveShare, setLivePrefs, setNextLiveShare, type LivePrefsResult, type LiveShareResult } from '@/app/golf/actions/round-live';
import { fromUntyped } from '@/lib/supabase/untyped';
import { chReport } from '../lib/track';
import { isMissing, type LiveClient } from './live-queries';
import type { LiveRoundType, LiveShare } from './model';
import { floorShare } from './share';

/**
 * What the sharing controls need from the outside (the setup field, the in-round sheet, Settings): the player's practice
 * default, which also says whether the live table exists yet, and the three writes. One shape, so the controls are
 * tested with a stand-in and the screens hand in the browser's.
 */
export interface LiveSharePorts {
  /** The practice default, or `null` when sharing is not there yet (the table is absent or the read failed): draw no control. */
  loadPrefs: () => Promise<{ practiceShare: LiveShare } | null>;
  /** Round setup: the level for the round about to be created. */
  setNext: (share: LiveShare, remember: boolean) => Promise<LiveShareResult>;
  /** The level a round in progress is at now, or `null` when sharing is not there yet. */
  loadRoundShare: (roundId: string, type: LiveRoundType) => Promise<LiveShare | null>;
  /** A round in progress. */
  setShare: (roundId: string, share: LiveShare, remember: boolean) => Promise<LiveShareResult>;
  /** Settings: the practice default. */
  setPrefs: (practiceShare: LiveShare) => Promise<LivePrefsResult>;
}

/** The player's own preference row, through their own session (RLS shows only theirs). */
export async function readPracticeShare(client: LiveClient): Promise<{ practiceShare: LiveShare } | null> {
  const { data, error } = await fromUntyped(client, 'golf_round_live_prefs').select('practice_share').limit(1).maybeSingle();
  if (error) {
    if (!isMissing(error)) chReport(error, { surface: 'live.prefs', severity: 'low' });
    return null;
  }
  const value = (data as { practice_share?: string } | null)?.practice_share;
  return { practiceShare: value === 'coaches' || value === 'team' ? value : 'off' };
}

/** The round's own live row, or (before its first save has made one) the level it will start at. */
export async function readRoundShare(client: LiveClient, roundId: string, type: LiveRoundType): Promise<LiveShare | null> {
  const { data, error } = await fromUntyped(client, 'golf_round_live').select('share').eq('round_id', roundId).maybeSingle();
  if (error) {
    if (!isMissing(error)) chReport(error, { surface: 'live.roundShare', severity: 'low' });
    return null;
  }
  const row = (data as { share?: string } | null)?.share;
  if (row === 'off' || row === 'coaches' || row === 'team') return row;
  const prefs = await readPracticeShare(client);
  return prefs ? floorShare(type, prefs.practiceShare) : null;
}

export const browserSharePorts: LiveSharePorts = {
  loadPrefs: async () => {
    try {
      return await readPracticeShare(createClient() as LiveClient);
    } catch (error) {
      chReport(error, { surface: 'live.prefs', severity: 'low' });
      return null;
    }
  },
  loadRoundShare: async (roundId, type) => {
    try {
      return await readRoundShare(createClient() as LiveClient, roundId, type);
    } catch (error) {
      chReport(error, { surface: 'live.roundShare', severity: 'low' });
      return null;
    }
  },
  setNext: (share, remember) => setNextLiveShare(share, remember),
  setShare: (roundId, share, remember) => setLiveShare(roundId, share, remember),
  setPrefs: (practiceShare) => setLivePrefs({ practiceShare }),
};
