'use client';

import { useMemo } from 'react';
import type { ChRoundsLibrary } from '../data/rounds-shape';
import { RoundsLibrary } from '../screens/rounds/RoundsLibrary';
import type { ChRoundsWrites } from '../screens/rounds/writes';

const wait = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 400));

/** The Rounds library with fake writes for the dev preview (`?state=failwrites` makes them fail). Nothing reaches the server. */
export function PreviewRounds({ data, state }: { data: ChRoundsLibrary; state?: string }) {
  const fail = state === 'failwrites';
  const writes = useMemo<ChRoundsWrites>(() => ({ discard: () => wait(fail ? { success: false, error: 'Preview: this save is set to fail.' } : { success: true }) }), [fail]);
  return <RoundsLibrary data={data} playerId="preview-player" writes={writes} />;
}
