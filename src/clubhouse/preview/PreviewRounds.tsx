'use client';

import { useMemo } from 'react';
import type { ChRoundsLibrary } from '../data/rounds-shape';
import type { LiveShare } from '../live/model';
import type { LiveSharePorts } from '../live/share-ports';
import { RoundsLibrary } from '../screens/rounds/RoundsLibrary';
import type { ChRoundsWrites } from '../screens/rounds/writes';

const wait = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 400));

/**
 * The round in progress's sharing, kept in memory (C4, preview capture 2c). Left to its default the library read
 * golf_round_live from the browser, and the preview has no session: the read failed ("Could not connect to the server")
 * and the console logged it. A signed-in player reads under their own session, and a failed read hides the control.
 */
export function previewSharePorts(start: LiveShare = 'coaches'): LiveSharePorts {
  let level = start;
  const saved = (share: LiveShare) => wait({ success: true as const, data: { share, seq: null, clamped: false } });
  return {
    loadPrefs: () => wait({ practiceShare: level }),
    setNext: (share) => saved((level = share)),
    loadRoundShare: () => wait(level),
    setShare: (_roundId, share) => saved((level = share)),
    setPrefs: (practiceShare) => wait({ success: true as const, data: { practiceShare: (level = practiceShare) } }),
  };
}

/** The Rounds library with fake writes for the dev preview (`?state=failwrites` makes them fail). Nothing reaches the server. */
export function PreviewRounds({ data, state }: { data: ChRoundsLibrary; state?: string }) {
  const fail = state === 'failwrites';
  const writes = useMemo<ChRoundsWrites>(() => ({ discard: () => wait(fail ? { success: false, error: 'Preview: this save is set to fail.' } : { success: true }) }), [fail]);
  const sharePorts = useMemo(() => previewSharePorts(), []);
  return <RoundsLibrary data={data} playerId="preview-player" writes={writes} sharePorts={sharePorts} />;
}
