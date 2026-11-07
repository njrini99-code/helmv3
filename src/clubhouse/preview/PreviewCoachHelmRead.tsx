'use client';

import { manyHoles, rewriteDeep } from './stress';
import type { ChViewVoice } from '../data/coachhelm-views-shape';
import { ReadPage, ReadSkeleton } from '../screens/coachhelm/read/ReadPage';
import { previewReadView } from './fixtures-coachhelm-read';

const wait = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 400));

/** One read with fake writes. Nothing reaches the server. */
export function PreviewCoachHelmRead({ state, viewer, q }: { state?: string; viewer?: string; q?: string }) {
  const role = viewer === 'player' ? 'player' : 'coach';
  const built = previewReadView(q, role, state === 'gone', state);
  const stressed = state === 'stress' ? rewriteDeep(built, manyHoles) : built;
  // READ-S2's two states of the rounds card: a failed read, and a read with no rounds to list.
  const view: typeof built =
    state === 'rounds-failed' ? { ...stressed, failed: { ...stressed.failed, rounds: true } } : state === 'no-rounds' && stressed.read ? { ...stressed, read: { ...stressed.read, rounds: { total: 0, list: [] } } } : stressed;
  const voice: ChViewVoice = role === 'coach' ? { role: 'coach', playerId: view.head.playerId ?? '', name: view.head.name, first: view.head.first, line: '' } : { role: 'player' };
  if (state === 'loading') return <ReadSkeleton />;
  const load = state === 'failed' ? ({ status: 'failed' } as const) : state === 'off' ? ({ status: 'off', reason: null } as const) : ({ status: 'ready', data: view } as const);
  const ok = { success: true } as const;
  return <ReadPage load={load} voice={voice} writes={{ assign: () => wait(ok), dismiss: () => wait(ok), undo: () => wait(ok) }} />;
}
